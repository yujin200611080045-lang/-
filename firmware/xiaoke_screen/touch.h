// 触摸：1.46 寸屏自带的 SPD2010 触摸（I2C 0x53，中断脚 GPIO9，复位走 IO 扩展 EXIO0）
// 协议照搬微雪 ESP32-S3-Touch-LCD-1.46 例程
#pragma once
#include <Arduino.h>

// 如果之后发现手指往左、眼睛往右，改这里
#define TOUCH_SWAP_XY  0
#define TOUCH_FLIP_X   0
#define TOUCH_FLIP_Y   0

bool touch_init();
// 读一次；有手指按着返回 true 并给出坐标（0~411）
bool touch_read(int &x, int &y);
