// 声音：喇叭（ES8311 + NS4150B 功放）和麦克风（ES7210）
// 两颗芯片共用一组 I2S，16kHz 双声道 16 位；在另一个核上单独跑一个任务，不卡眼睛
// 声音全部是程序现场合成的小音效，不需要音频文件
#pragma once
#include <Arduino.h>

enum Sound {
  SND_NONE,
  SND_WAKE,      // 醒来：三声往上扬
  SND_CHIRP,     // 被点一下：啾啾
  SND_HAPPY,     // 开心：哆咪嗦
  SND_GRUMBLE,   // 被戳烦了：往下哼哼
  SND_SURPRISE,  // 吓一跳：往上蹿一下
  SND_YAWN,      // 打哈欠：慢慢往下
  SND_OFF,       // 关声音时的提示
  SND_HUH,       // 听到有人叫：嗯？
};

bool voice_init(int volume);   // 0~100
void voice_play(Sound s);
void voice_purr(bool on);      // 被一直摸着时的呼噜声
void voice_enable(bool on);    // 总开关（关了以后不出声，但还在听）
bool voice_enabled();
float voice_level();           // 麦克风当前音量（均方根）
bool voice_speaking();         // 自己正在出声（这时候不算听到的声音）
