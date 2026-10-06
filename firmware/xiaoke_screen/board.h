// 主板相关：引脚、IO 扩展芯片、背光、屏幕初始化和送屏
// 主板：微雪 ESP32-S3-CAM-OVxxxx Rev1.1，引脚全部来自官方原理图
#pragma once
#include <Arduino.h>

// ---------- 引脚 ----------
#define PIN_I2C_SDA   8
#define PIN_I2C_SCL   7
#define PIN_LCD_SCK   5
#define PIN_LCD_D0    1
#define PIN_LCD_D1    2
#define PIN_LCD_D2    3
#define PIN_LCD_D3    4
#define PIN_LCD_CS    6
#define PIN_TP_INT    9
#define PIN_BOOT_KEY  0
#define PIN_I2S_MCLK  10
#define PIN_I2S_BCLK  11
#define PIN_I2S_LRCK  12
#define PIN_I2S_DIN   13   // 麦克风（ES7210）→ ESP
#define PIN_I2S_DOUT  14   // ESP → 喇叭（ES8311）

// ---------- IO 扩展芯片（CH32V003，I2C 地址 0x24）上的脚 ----------
#define EXIO_TP_RST   0    // 触摸复位
#define EXIO_LCD_RST  1    // 屏幕复位
#define EXIO_PA_EN    4    // 喇叭功放开关
#define EXIO_PWR      6    // 官方例程开机时拉高

// ---------- 屏幕 ----------
#define LCD_W    412
#define LCD_H    412
#define STRIP_H  20        // 每次往屏幕送 20 行

bool board_init();                      // I2C + IO 扩展芯片 + 屏幕复位
void exio_set(uint8_t pin, bool high);
void backlight(uint8_t percent);        // 0~100
bool lcd_init();
bool lcd_ready();
uint16_t *lcd_strip(int i);             // 两块送屏缓冲，各 LCD_W*STRIP_H 个像素
void lcd_draw(int y0, int y1, uint16_t *pixels);  // 画整行宽的一条，y1 不含
void lcd_clear();

static inline uint16_t rgb565(uint8_t r, uint8_t g, uint8_t b) {
  uint16_t c = ((r & 0xF8) << 8) | ((g & 0xFC) << 3) | (b >> 3);
  return (c >> 8) | (c << 8);  // 屏幕要高字节在前
}
