#include "touch.h"
#include "board.h"
#include <Wire.h>

#define SPD2010_ADDR 0x53

static bool ok = false;

static bool rd(uint16_t reg, uint8_t *buf, uint16_t len) {
  Wire.beginTransmission(SPD2010_ADDR);
  Wire.write((uint8_t)(reg >> 8));
  Wire.write((uint8_t)reg);
  if (Wire.endTransmission(true)) return false;
  if (len == 0) return true;
  if (Wire.requestFrom((uint8_t)SPD2010_ADDR, (size_t)len) != len) return false;
  for (uint16_t i = 0; i < len; i++) buf[i] = Wire.read();
  return true;
}

static bool wr(uint16_t reg, uint8_t a, uint8_t b) {
  Wire.beginTransmission(SPD2010_ADDR);
  Wire.write((uint8_t)(reg >> 8));
  Wire.write((uint8_t)reg);
  Wire.write(a);
  Wire.write(b);
  bool r = Wire.endTransmission(true) == 0;
  delayMicroseconds(200);
  return r;
}

static void cmd_point_mode() { wr(0x5000, 0x00, 0x00); }
static void cmd_start()      { wr(0x4600, 0x00, 0x00); }
static void cmd_cpu_start()  { wr(0x0400, 0x01, 0x00); }
static void cmd_clear_int()  { wr(0x0200, 0x01, 0x00); }

bool touch_init() {
  exio_set(EXIO_TP_RST, false);
  delay(50);
  exio_set(EXIO_TP_RST, true);
  delay(50);
  pinMode(PIN_TP_INT, INPUT_PULLUP);
  uint8_t ver[18];
  ok = rd(0x2600, ver, sizeof(ver));
  if (ok) Serial.printf("触摸芯片应答了：%c%c%c%c\n", ver[13], ver[12], ver[11], ver[10]);
  else Serial.println("触摸芯片没有应答（I2C 0x53）");
  return ok;
}

bool touch_read(int &x, int &y) {
  if (!ok) return false;
  uint8_t st[4];
  if (!rd(0x2000, st, 4)) return false;
  bool pt_exist = st[0] & 0x01;
  bool gesture = st[0] & 0x02;
  bool aux = st[0] & 0x08;
  bool in_bios = st[1] & 0x40;
  bool in_cpu = st[1] & 0x20;
  bool cpu_run = st[1] & 0x08;
  uint16_t len = st[3] << 8 | st[2];

  if (in_bios) {
    cmd_clear_int();
    cmd_cpu_start();
    return false;
  }
  if (in_cpu) {
    cmd_point_mode();
    cmd_start();
    cmd_clear_int();
    return false;
  }
  if (cpu_run && len == 0) {
    cmd_clear_int();
    return false;
  }
  if (!(pt_exist || gesture)) {
    if (cpu_run && aux) cmd_clear_int();
    return false;
  }

  bool got = false;
  uint8_t d[4 + 10 * 6];
  if (len > sizeof(d)) len = sizeof(d);
  if (len >= 10 && rd(0x0003, d, len)) {
    uint8_t id = d[4];
    if (id <= 0x0A && pt_exist) {
      int px = ((d[7] & 0xF0) << 4) | d[5];
      int py = ((d[7] & 0x0F) << 8) | d[6];
      uint8_t weight = d[8];
      if (weight) {
#if TOUCH_SWAP_XY
        int t = px; px = py; py = t;
#endif
#if TOUCH_FLIP_X
        px = LCD_W - 1 - px;
#endif
#if TOUCH_FLIP_Y
        py = LCD_H - 1 - py;
#endif
        x = constrain(px, 0, LCD_W - 1);
        y = constrain(py, 0, LCD_H - 1);
        got = true;
      }
    }
  }

  // 把这一包剩下的读完，再清中断
  for (int guard = 0; guard < 8; guard++) {
    uint8_t hs[8];
    if (!rd(0xFC02, hs, 8)) break;
    uint8_t status = hs[5];
    uint16_t next = hs[2] | hs[3] << 8;
    if (status == 0x82) {
      cmd_clear_int();
      break;
    }
    if (status == 0x00 && next > 0) {
      uint8_t rest[32];
      rd(0x0003, rest, min<uint16_t>(next, sizeof(rest)));
      continue;
    }
    break;
  }
  return got;
}
