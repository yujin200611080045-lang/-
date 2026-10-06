// 小克的脸：1.46 寸 SPD2010 圆屏，黑底 + 两条白色竖线眼睛（按她渲染图的比例）
// 主板：微雪 ESP32-S3-CAM-OVxxxx Rev1.1
// 引脚来自官方原理图（DISPLAY 18 针接口 + GPIO 表），屏幕驱动来自微雪 ESP32-S3-Touch-LCD-1.46 例程
//
// 眼睛会自己眨眼（偶尔连眨两下）、左右上下看、发呆时轻轻晃一点

#include <Wire.h>
#include "driver/spi_master.h"
#include "esp_heap_caps.h"
#include "esp_lcd_panel_io.h"
#include "esp_lcd_panel_ops.h"
#include "esp_lcd_spd2010.h"

struct Eyes {
  float x, y;     // 视线偏移（像素）
  float open;     // 1 = 睁开，0 = 闭上
};


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
static uint16_t *strips[2] = {NULL, NULL};  // 两块轮流用：一块在往屏幕送，另一块在画

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

static inline uint16_t gray(uint8_t v) {
  uint16_t c = ((v & 0xF8) << 8) | ((v & 0xFC) << 3) | (v >> 3);
  return (c >> 8) | (c << 8);  // 屏幕要高字节在前
}

// ---------- 眼睛 ----------
// 尺寸按她的正面渲染图换算：两眼中心距约 140px，每只约 46×145
#define EYE_GAP   140
#define EYE_W     46
#define EYE_H     145
#define LOOK_X    44   // 往左右看最多挪多少
#define LOOK_Y    22   // 往上下看最多挪多少
// 只重画眼睛会动到的那一条带子，省时间
#define BAND_TOP  (LCD_H / 2 - EYE_H / 2 - LOOK_Y - 4)
#define BAND_BOT  (LCD_H / 2 + EYE_H / 2 + LOOK_Y + 4)

static Eyes now = {0, 0, 1};

// 圆角条（竖着是睁眼，压扁后变成横着的一道）到点的有符号距离，带 1 像素抗锯齿
static inline uint8_t pill(float px, float py, float cx, float cy, float w, float h) {
  float r = fminf(w, h) * 0.5f;
  float dx = fabsf(px - cx) - (w * 0.5f - r);
  float dy = fabsf(py - cy) - (h * 0.5f - r);
  if (dx < 0) dx = 0;
  if (dy < 0) dy = 0;
  float d = sqrtf(dx * dx + dy * dy) - r;
  if (d <= -0.5f) return 255;
  if (d >= 0.5f) return 0;
  return (uint8_t)((0.5f - d) * 255);
}

static void render(const Eyes &e) {
  float h = EYE_H * e.open;
  if (h < 10) h = 10;  // 闭眼时压成一道短横线
  float w = EYE_W;
  float cy = LCD_H / 2 + e.y + (EYE_H - h) * 0.15f;  // 眨眼时略往下合，像上眼皮落下来
  float lx = LCD_W / 2 - EYE_GAP / 2 + e.x;
  float rx = LCD_W / 2 + EYE_GAP / 2 + e.x;
  int buf = 0;
  for (int y0 = BAND_TOP; y0 < BAND_BOT; y0 += STRIP_H) {
    int rows = min(STRIP_H, BAND_BOT - y0);
    uint16_t *s = strips[buf];
    for (int dy = 0; dy < rows; dy++) {
      float py = y0 + dy;
      uint16_t *row = s + dy * LCD_W;
      memset(row, 0, LCD_W * 2);
      if (fabsf(py - cy) > h * 0.5f + 1) continue;
      int xa = (int)(lx - w / 2 - 2), xb = (int)(rx + w / 2 + 2);
      for (int x = max(xa, 0); x < min(xb, LCD_W); x++) {
        uint8_t v = max(pill(x, py, lx, cy, w, h), pill(x, py, rx, cy, w, h));
        if (v) row[x] = gray(v);
      }
    }
    // 送屏时，上一块的传输会在发下一条命令前自动等完，所以两块轮流用不会互相踩
    esp_lcd_panel_draw_bitmap(panel, 0, y0, LCD_W, y0 + rows, s);
    buf ^= 1;
  }
}

static void clear_screen() {
  for (int y0 = 0; y0 < LCD_H; y0 += STRIP_H) {
    int rows = min(STRIP_H, LCD_H - y0);
    uint16_t *s = strips[(y0 / STRIP_H) & 1];
    memset(s, 0, LCD_W * rows * 2);
    esp_lcd_panel_draw_bitmap(panel, 0, y0, LCD_W, y0 + rows, s);
  }
}

// ---------- 动作 ----------
static Eyes target = {0, 0, 1};
static uint32_t next_blink = 0, next_look = 0, blink_start = 0;
static bool blinking = false, double_blink = false;
#define BLINK_MS 180

static float ease(float a, float b, float k) { return a + (b - a) * k; }

static void update(uint32_t t) {
  // 眨眼：睁 → 闭 → 睁，偶尔连眨两下
  if (!blinking && t >= next_blink) {
    blinking = true;
    blink_start = t;
  }
  if (blinking) {
    float p = (t - blink_start) / (float)BLINK_MS;
    if (p >= 1) {
      blinking = false;
      now.open = 1;
      if (!double_blink && random(100) < 20) {
        double_blink = true;
        next_blink = t + 120;
      } else {
        double_blink = false;
        next_blink = t + random(2200, 6000);
      }
    } else {
      now.open = p < 0.45f ? 1 - p / 0.45f : (p - 0.45f) / 0.55f;
    }
  }

  // 看来看去：换个方向停一会儿，常常回到正中间
  if (t >= next_look) {
    if (random(100) < 40) {
      target.x = 0;
      target.y = 0;
    } else {
      target.x = random(-LOOK_X, LOOK_X + 1);
      target.y = random(-LOOK_Y, LOOK_Y + 1);
    }
    next_look = t + random(900, 3200);
    // 转眼睛的时候顺便眨一下，看起来更像活的
    if (!blinking && random(100) < 30) next_blink = t;
  }
  now.x = ease(now.x, target.x, 0.22f);
  now.y = ease(now.y, target.y, 0.22f);

  // 发呆时轻轻晃一点点
  now.x += sinf(t * 0.0017f) * 0.15f;
  now.y += sinf(t * 0.0023f) * 0.12f;
}

void setup() {
  Serial.begin(115200);
  delay(300);
  Serial.println("小克醒了");

  if (!exio_init()) Serial.println("IO 扩展芯片没有应答（I2C 0x24）");
  backlight(0);

  for (int i = 0; i < 2; i++) {
    strips[i] = (uint16_t *)heap_caps_malloc(LCD_W * STRIP_H * 2, MALLOC_CAP_DMA | MALLOC_CAP_INTERNAL);
    if (!strips[i]) {
      Serial.println("内存不够");
      return;
    }
  }
  if (!lcd_init()) return;

  clear_screen();
  render(now);
  backlight(80);

  randomSeed(esp_random());
  next_blink = millis() + 1500;
  next_look = millis() + 2500;
}

void loop() {
  if (!panel) {
    delay(1000);
    return;
  }
  uint32_t t = millis();
  update(t);
  render(now);
  // 大约 40 帧每秒
  uint32_t spent = millis() - t;
  if (spent < 25) delay(25 - spent);
}
