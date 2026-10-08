#include "talk.h"
#include <WiFi.h>
#include <WiFiClientSecure.h>
#include <HTTPClient.h>

static volatile TalkState state = TALK_IDLE;
static int16_t *send_buf = NULL;
static size_t send_n = 0;
static int16_t *reply = NULL;
static size_t reply_n = 0;
static String reply_face;

static void put32(uint8_t *p, uint32_t v) { p[0] = v; p[1] = v >> 8; p[2] = v >> 16; p[3] = v >> 24; }
static void put16(uint8_t *p, uint16_t v) { p[0] = v; p[1] = v >> 8; }

static void wav_header(uint8_t *h, size_t samples) {
  uint32_t data = samples * 2;
  memcpy(h, "RIFF", 4); put32(h + 4, 36 + data); memcpy(h + 8, "WAVEfmt ", 8);
  put32(h + 16, 16); put16(h + 20, 1); put16(h + 22, 1);  // PCM，单声道
  put32(h + 24, 16000); put32(h + 28, 32000); put16(h + 32, 2); put16(h + 34, 16);
  memcpy(h + 36, "data", 4); put32(h + 40, data);
}

static void worker(void *) {
  WiFiClientSecure tls;
  tls.setInsecure();  // 不校验证书（省内存、省得证书过期就连不上）；数据本身有密码保护
  HTTPClient http;
  TalkState result = TALK_ERROR;

  if (http.begin(tls, String(BRIDGE_URL) + "/api/robot/talk")) {
    http.setConnectTimeout(10000);
    http.setTimeout(65000);  // 等我想好再念出来，可能要几十秒
    http.addHeader("Content-Type", "audio/wav");
    http.addHeader("x-bridge-secret", BRIDGE_SECRET);
    const char *keys[] = {"X-Face"};
    http.collectHeaders(keys, 1);
    uint32_t t0 = millis();
    int code = http.POST((uint8_t *)send_buf, 44 + send_n * 2);
    Serial.printf("[说话] 服务器回 %d（%lu 毫秒）\n", code, millis() - t0);
    reply_face = http.header("X-Face");
    if (code == 200) {
      int len = http.getSize();
      if (len > 0 && len < 4 * 1024 * 1024) {
        int16_t *buf = (int16_t *)ps_malloc(len);
        if (buf) {
          WiFiClient *s = http.getStreamPtr();
          int got = 0;
          uint32_t last = millis();
          while (got < len && millis() - last < 15000) {
            int a = s->available();
            if (a > 0) {
              int r = s->readBytes((uint8_t *)buf + got, min(a, len - got));
              got += r;
              last = millis();
            } else {
              delay(5);
            }
          }
          if (got >= len - 1) {
            reply = buf;
            reply_n = got / 2;
            result = TALK_REPLY;
          } else {
            free(buf);
          }
        }
      }
    } else if (code == 204) {
      result = TALK_NOTHING;  // 没听清
    }
    http.end();
  }
  state = result;
  vTaskDelete(NULL);
}

bool talk_send(int16_t *buf, size_t n) {
  if (state == TALK_WAITING || WiFi.status() != WL_CONNECTED) return false;
  wav_header((uint8_t *)buf, n);
  send_buf = buf;
  send_n = n;
  state = TALK_WAITING;
  if (xTaskCreatePinnedToCore(worker, "talk", 12288, NULL, 2, NULL, 0) != pdPASS) {
    state = TALK_ERROR;
    return false;
  }
  return true;
}

TalkState talk_state() { return state; }

bool talk_take(int16_t **pcm, size_t *n, String &face) {
  if (state != TALK_REPLY) return false;
  *pcm = reply;
  *n = reply_n;
  face = reply_face;
  reply = NULL;
  state = TALK_IDLE;
  return true;
}

void talk_reset() {
  if (state != TALK_WAITING) state = TALK_IDLE;
}
