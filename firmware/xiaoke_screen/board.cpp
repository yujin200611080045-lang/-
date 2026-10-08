#include "board.h"
#include <Wire.h>
#include "driver/spi_master.h"
#include "esp_heap_caps.h"
#include "esp_lcd_panel_io.h"
#include "esp_lcd_panel_ops.h"
#include "esp_lcd_spd2010.h"

#define EXIO_ADDR     0x24
#define EXIO_REG_MODE 0x02
#define EXIO_REG_OUT  0x03
#define EXIO_REG_PWM  0x05
#define LCD_HOST      SPI2_HOST

static uint8_t exio_out = 0;
static esp_lcd_panel_handle_t panel = NULL;
static uint16_t *strips[2] = {NULL, NULL};  // 两块轮流用：一块在往屏幕送，另一块在画

static bool exio_write(uint8_t reg, uint8_t val) {
  Wire.beginTransmission(EXIO_ADDR);
  Wire.write(reg);
  Wire.write(val);
  return Wire.endTransmission() == 0;
}

// 声音任务在另一个核上也会开关功放，所以加一把锁
static SemaphoreHandle_t exio_lock = NULL;

void exio_set(uint8_t pin, bool high) {
  if (exio_lock) xSemaphoreTake(exio_lock, portMAX_DELAY);
  if (high) exio_out |= (1 << pin);
  else exio_out &= ~(1 << pin);
  exio_write(EXIO_REG_OUT, exio_out);
  if (exio_lock) xSemaphoreGive(exio_lock);
}

bool board_init() {
  exio_lock = xSemaphoreCreateMutex();
  Wire.begin(PIN_I2C_SDA, PIN_I2C_SCL, 400000);
  if (!exio_write(EXIO_REG_MODE, 0xFF)) return false;  // 全部设为输出
  exio_set(EXIO_PWR, true);
  exio_set(EXIO_TP_RST, true);
  exio_set(EXIO_PA_EN, false);
  // 屏幕硬复位
  exio_set(EXIO_LCD_RST, false);
  delay(20);
  exio_set(EXIO_LCD_RST, true);
  delay(120);
  return true;
}

void backlight(uint8_t percent) {
  if (percent > 97) percent = 97;  // 跟官方例程一样封顶 97
  exio_write(EXIO_REG_PWM, (uint8_t)(percent * 255 / 100));
}

bool lcd_init() {
  for (int i = 0; i < 2; i++) {
    strips[i] = (uint16_t *)heap_caps_malloc(LCD_W * STRIP_H * 2, MALLOC_CAP_DMA | MALLOC_CAP_INTERNAL);
    if (!strips[i]) {
      Serial.println("内存不够");
      return false;
    }
  }

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
  panel_cfg.reset_gpio_num = -1;  // 复位走 IO 扩展芯片，已经在 board_init 里做了
  panel_cfg.rgb_ele_order = LCD_RGB_ELEMENT_ORDER_RGB;
  panel_cfg.data_endian = LCD_RGB_DATA_ENDIAN_BIG;
  panel_cfg.bits_per_pixel = 16;
  panel_cfg.vendor_config = &vendor;
  if (esp_lcd_new_panel_spd2010(io, &panel_cfg, &panel) != ESP_OK) {
    Serial.println("SPD2010 驱动安装失败");
    panel = NULL;
    return false;
  }
  esp_lcd_panel_reset(panel);
  esp_lcd_panel_init(panel);
  esp_lcd_panel_disp_on_off(panel, true);
  return true;
}

bool lcd_ready() { return panel != NULL; }

uint16_t *lcd_strip(int i) { return strips[i & 1]; }

// 送屏时，上一块的传输会在发下一条命令前自动等完，所以两块轮流用不会互相踩
void lcd_draw(int y0, int y1, uint16_t *pixels) {
  esp_lcd_panel_draw_bitmap(panel, 0, y0, LCD_W, y1, pixels);
}

void lcd_clear() {
  for (int y0 = 0, i = 0; y0 < LCD_H; y0 += STRIP_H, i++) {
    int rows = min(STRIP_H, LCD_H - y0);
    uint16_t *s = lcd_strip(i);
    memset(s, 0, LCD_W * rows * 2);
    lcd_draw(y0, y0 + rows, s);
  }
}
