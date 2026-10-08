// 摄像头：OV5640（24 针 DVP），用来"看到动静就转过去看"，也能在网页里看画面
// 引脚来自微雪 ESP32-S3-CAM-OVxxxx 原理图；摄像头电源脚 PWDN 在 IO 扩展 EXIO3，开机默认低电平 = 通电
#pragma once
#include <Arduino.h>

// 摄像头装好以后，如果你在左边晃手、眼睛却往右看，把 CAM_FLIP_X 改成 1；上下反了改 CAM_FLIP_Y
#define CAM_FLIP_X 0
#define CAM_FLIP_Y 0

bool cam_init();
bool cam_ok();
void cam_pause(bool p);  // 睡着时不看了，省电
// 最近一次看到的动静：x、y 在 -1~1（画面中心是 0），amount 是动的面积占比 0~1
// 返回 false 表示最近 300 毫秒里没看到明显的动静
bool cam_motion(float &x, float &y, float &amount);
// 拍一张 JPEG（给网页用），用完要 cam_free_jpg
bool cam_jpg(uint8_t **buf, size_t *len);
void cam_free_jpg(uint8_t *buf);
