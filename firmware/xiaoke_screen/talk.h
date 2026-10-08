// 跟我说话：把录好的声音发到 VPS 上的 Bridge（/api/robot/talk），
// 那边听写 → 交给我回答 → 念成声音发回来，这里拿到后放出来
#pragma once
#include <Arduino.h>

#define BRIDGE_URL    "https://139-180-205-20.sslip.io"
#define BRIDGE_SECRET "xiaoke2026"

enum TalkState { TALK_IDLE, TALK_WAITING, TALK_REPLY, TALK_NOTHING, TALK_ERROR };

// 发出去（后台线程跑，不卡眼睛）。buf 前 22 个采样是空着留给 WAV 头的，n 是后面声音的采样数
bool talk_send(int16_t *buf, size_t n);
TalkState talk_state();
// 拿走回答：声音（16kHz 单声道，交给 voice_play_pcm）和表情名（normal/happy/shy/...）
bool talk_take(int16_t **pcm, size_t *n, String &face);
void talk_reset();
