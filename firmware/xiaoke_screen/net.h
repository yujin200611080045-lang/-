// 联网：连 WiFi（家里的或手机热点都行，最多记 3 个），对时
// 还没设置过 WiFi，或者长按 BOOT 键 3 秒，会开一个叫 XiaoKe 的热点，
// 手机连上去会自动弹出设置页面（没弹就用浏览器打开 192.168.4.1）
#pragma once
#include <Arduino.h>

#define NET_AP_NAME  "XiaoKe"
#define NET_AP_PASS  "cendres615"   // 连 XiaoKe 热点的密码

void net_init();
void net_loop();                 // 每帧调一次，不会卡
void net_start_portal();         // 打开设置热点
bool net_portal_on();
bool net_connected();
bool net_time_ok();              // 已经对上时间
bool net_now(struct tm &t);      // 取本地时间（北京时间）
