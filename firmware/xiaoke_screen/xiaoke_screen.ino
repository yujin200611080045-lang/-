// 小克的第一张脸：1.46 寸 SPD2010 圆屏点亮测试
// 主板：微雪 ESP32-S3-CAM-OVxxxx Rev1.1
// 引脚来自官方原理图（DISPLAY 18 针接口 + GPIO 表），屏幕驱动来自微雪 ESP32-S3-Touch-LCD-1.46 例程
//
// 开机顺序：红 → 绿 → 蓝 各 1 秒（检查颜色对不对），然后画一张脸

#include <Wire.h>
#include "driver/spi_master.h"
#include "esp_heap_caps.h"
#include "esp_lcd_panel_io.h"
#include "esp_lcd_panel_ops.h"
#include "esp_lcd_spd2010.h"

// ---------- 引脚 ----------
#define PIN_I2C_SDA 8
#define PIN_I2C_SCL 7
#define PIN_LCD_SCK 5
#define PIN_LCD_D0  1
#define PIN_LCD_D1  2
#define PIN_LCD_D2  3
#define PIN_LCD_D3  4
#define PIN_LCD_CS  6

// ---------- IO 扩展芯片（CH32V003，I2C 地址 0x24）----------
#define EXIO_ADDR     0x24
#define EXIO_REG_MODE 0x02
#define EXIO_REG_OUT  0x03
#define EXIO_REG_PWM  0x05
#define EXIO_TP_RST   0   // 触摸复位
#define EXIO_LCD_RST  1   // 屏幕复位
#define EXIO_PWR      6   // 官方例程开机时拉高

// ---------- 屏幕 ----------
#define LCD_W    412
#define LCD_H    412
#define STRIP_H  20       // 每次往屏幕送 20 行
#define LCD_HOST SPI2_HOST

static uint8_t exio_out = 0;
static esp_lcd_panel_handle_t panel = NULL;
static uint16_t *strip = NULL;

static bool exio_write(uint8_t reg, uint8_t val) {
  Wire.beginTransmission(EXIO_ADDR);
  Wire.write(reg);
  Wire.write(val);
  return Wire.endTransmission() == 0;
}

static void exio_set(uint8_t pin, bool high) {
  if (high) exio_out |= (1 << pin);
  else exio_out &= ~(1 << pin);
  exio_write(EXIO_REG_OUT, exio_out);
}

static bool exio_init() {
  Wire.begin(PIN_I2C_SDA, PIN_I2C_SCL, 400000);
  if (!exio_write(EXIO_REG_MODE, 0xFF)) return false;  // 全部设为输出
  exio_set(EXIO_PWR, true);
  exio_set(EXIO_TP_RST, true);
  // 屏幕硬复位
  exio_set(EXIO_LCD_RST, false);
  delay(20);
  exio_set(EXIO_LCD_RST, true);
  delay(120);
  return true;
}

static void backlight(uint8_t percent) {
  if (percent > 97) percent = 97;  // 跟官方例程一样封顶 97
  exio_write(EXIO_REG_PWM, (uint8_t)(percent * 255 / 100));
}

static bool lcd_init() {
  spi_bus_config_t bus = {};
  bus.data0_io_num = PIN_LCD_D0;
  bus.data1_io_num = PIN_LCD_D1;
  bus.sclk_io_num = PIN_LCD_SCK;
  bus.data2_io_num = PIN_LCD_D2;
  bus.data3_io_num = PIN_LCD_D3;
  bus.data4_io_num = -1;
  bus.data5_io_num = -1;
  bus.data6_io_num = -1;
  bus.data7_io_num = -1;
  bus.max_transfer_sz = LCD_W * STRIP_H * 2;
  bus.flags = SPICOMMON_BUSFLAG_MASTER;
  if (spi_bus_initialize(LCD_HOST, &bus, SPI_DMA_CH_AUTO) != ESP_OK) {
    Serial.println("SPI 总线初始化失败");
    return false;
  }

  esp_lcd_panel_io_spi_config_t io_cfg = {};
  io_cfg.cs_gpio_num = PIN_LCD_CS;
  io_cfg.dc_gpio_num = -1;
  io_cfg.spi_mode = 3;
  io_cfg.pclk_hz = 40 * 1000 * 1000;
  io_cfg.trans_queue_depth = 10;
  io_cfg.lcd_cmd_bits = 32;
  io_cfg.lcd_param_bits = 8;
  io_cfg.flags.quad_mode = 1;
  esp_lcd_panel_io_handle_t io = NULL;
  if (esp_lcd_new_panel_io_spi((esp_lcd_spi_bus_handle_t)LCD_HOST, &io_cfg, &io) != ESP_OK) {
    Serial.println("屏幕通信参数设置失败");
    return false;
  }

  static spd2010_vendor_config_t vendor = {};
  vendor.flags.use_qspi_interface = 1;
  esp_lcd_panel_dev_config_t panel_cfg = {};
  panel_cfg.reset_gpio_num = -1;  // 复位走 IO 扩展芯片，已经在 exio_init 里做了
  panel_cfg.rgb_ele_order = LCD_RGB_ELEMENT_ORDER_RGB;
  panel_cfg.data_endian = LCD_RGB_DATA_ENDIAN_BIG;
  panel_cfg.bits_per_pixel = 16;
  panel_cfg.vendor_config = &vendor;
  if (esp_lcd_new_panel_spd2010(io, &panel_cfg, &panel) != ESP_OK) {
    Serial.println("SPD2010 驱动安装失败");
    return false;
  }
  esp_lcd_panel_reset(panel);
  esp_lcd_panel_init(panel);
  esp_lcd_panel_disp_on_off(panel, true);
  return true;
}

static inline uint16_t rgb(uint8_t r, uint8_t g, uint8_t b) {
  uint16_t c = ((r & 0xF8) << 8) | ((g & 0xFC) << 3) | (b >> 3);
  return (c >> 8) | (c << 8);  // 屏幕要高字节在前
}

// 逐像素决定颜色，按条带送屏
typedef uint16_t (*pixel_fn)(int x, int y);

static void draw(pixel_fn fn) {
  for (int y0 = 0; y0 < LCD_H; y0 += STRIP_H) {
    int rows = min(STRIP_H, LCD_H - y0);
    for (int dy = 0; dy < rows; dy++)
      for (int x = 0; x < LCD_W; x++)
        strip[dy * LCD_W + x] = fn(x, y0 + dy);
    esp_lcd_panel_draw_bitmap(panel, 0, y0, LCD_W, y0 + rows, strip);
  }
}

static uint16_t fill_color;
static uint16_t solid(int, int) { return fill_color; }

static void fill(uint8_t r, uint8_t g, uint8_t b) {
  fill_color = rgb(r, g, b);
  draw(solid);
}

static inline bool in_ellipse(int x, int y, int cx, int cy, int rx, int ry) {
  long dx = x - cx, dy = y - cy;
  return dx * dx * ry * ry + dy * dy * rx * rx <= (long)rx * rx * ry * ry;
}

static uint16_t face(int x, int y) {
  const uint16_t bg = rgb(255, 214, 196);
  const uint16_t ink = rgb(40, 28, 30);
  const uint16_t blush = rgb(255, 150, 160);
  const uint16_t shine = rgb(255, 255, 255);
  // 眼睛
  if (in_ellipse(x, y, 150, 185, 26, 34) || in_ellipse(x, y, 262, 185, 26, 34)) {
    if (in_ellipse(x, y, 160, 172, 8, 10) || in_ellipse(x, y, 272, 172, 8, 10)) return shine;
    return ink;
  }
  // 腮红
  if (in_ellipse(x, y, 110, 245, 26, 14) || in_ellipse(x, y, 302, 245, 26, 14)) return blush;
  // 微笑：一段圆环的下半部分
  long dx = x - 206, dy = y - 222;
  long d2 = dx * dx + dy * dy;
  if (dy > 20 && d2 >= 46L * 46 && d2 <= 54L * 54) return ink;
  return bg;
}

void setup() {
  Serial.begin(115200);
  delay(300);
  Serial.println("小克醒了，开始点亮屏幕");

  if (!exio_init()) Serial.println("IO 扩展芯片没有应答（I2C 0x24）");
  backlight(0);

  strip = (uint16_t *)heap_caps_malloc(LCD_W * STRIP_H * 2, MALLOC_CAP_DMA | MALLOC_CAP_INTERNAL);
  if (!strip) {
    Serial.println("内存不够");
    return;
  }
  if (!lcd_init()) return;

  fill(0, 0, 0);
  backlight(80);

  fill(255, 0, 0);   delay(1000);
  fill(0, 255, 0);   delay(1000);
  fill(0, 0, 255);   delay(1000);
  draw(face);
  Serial.println("脸画好了");
}

void loop() {
  delay(1000);
}
