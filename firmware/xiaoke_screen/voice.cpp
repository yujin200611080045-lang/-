#include "voice.h"
#include "board.h"
#include <Wire.h>
#include "ESP_I2S.h"
#include "es8311.h"
#include "es7210.h"

#define RATE    16000
#define MCLK    (RATE * 256)
#define BLOCK   256          // 每次处理 256 帧 = 16 毫秒

static I2SClass i2s;
static bool ok = false;
static volatile bool enabled = true;
static volatile int pending = SND_NONE;
static volatile bool purr_on = false;
static volatile float level = 0;
static volatile uint32_t speak_until = 0;

// 录音（给"跟我说话"用）：存在 PSRAM 里，最长 REC_MAX 个采样；最前面空出 22 个采样的位置放 WAV 文件头
#define REC_MAX (RATE * 15)
static int16_t *rec_buf = NULL;
static volatile size_t rec_n = 0;
static volatile bool recording = false;

// 播放一段别人给的声音（我的回答）
static int16_t *pcm = NULL;
static volatile size_t pcm_n = 0, pcm_pos = 0;
static volatile float out_level = 0;

// ---------- 音效：一串"音符"，每个音符是一段滑音 ----------
struct Note {
  uint16_t f0, f1;   // 起止频率（Hz），0 = 停顿
  uint16_t ms;
  uint8_t vol;       // 0~100
  uint8_t vib;       // 颤音速度（Hz），0 = 不颤
};

static const Note S_WAKE[]     = {{520, 700, 90, 55, 0}, {0, 0, 40, 0, 0}, {700, 950, 90, 60, 0}, {0, 0, 40, 0, 0}, {950, 1400, 140, 65, 0}};
static const Note S_CHIRP[]    = {{900, 1600, 60, 60, 0}, {0, 0, 35, 0, 0}, {1100, 1900, 75, 60, 0}};
static const Note S_HAPPY[]    = {{1047, 1047, 90, 55, 0}, {1319, 1319, 90, 55, 0}, {1568, 1568, 160, 60, 6}};
static const Note S_GRUMBLE[]  = {{420, 300, 160, 65, 14}, {0, 0, 50, 0, 0}, {380, 240, 220, 65, 14}};
static const Note S_SURPRISE[] = {{500, 1500, 80, 65, 0}};
static const Note S_YAWN[]     = {{760, 900, 180, 45, 0}, {900, 380, 650, 50, 5}};
static const Note S_OFF[]      = {{800, 400, 140, 50, 0}};
static const Note S_HUH[]      = {{620, 980, 110, 45, 0}};

#define LEN(a) (sizeof(a) / sizeof(a[0]))
static const Note *seq = NULL;
static int seq_len = 0, seq_i = 0;
static uint32_t note_pos = 0;   // 当前音符已经播了多少帧
static float phase = 0, vib_phase = 0, purr_phase = 0, purr_env = 0;

static void start(Sound s) {
  switch (s) {
    case SND_WAKE:     seq = S_WAKE;     seq_len = LEN(S_WAKE); break;
    case SND_CHIRP:    seq = S_CHIRP;    seq_len = LEN(S_CHIRP); break;
    case SND_HAPPY:    seq = S_HAPPY;    seq_len = LEN(S_HAPPY); break;
    case SND_GRUMBLE:  seq = S_GRUMBLE;  seq_len = LEN(S_GRUMBLE); break;
    case SND_SURPRISE: seq = S_SURPRISE; seq_len = LEN(S_SURPRISE); break;
    case SND_YAWN:     seq = S_YAWN;     seq_len = LEN(S_YAWN); break;
    case SND_OFF:      seq = S_OFF;      seq_len = LEN(S_OFF); break;
    case SND_HUH:      seq = S_HUH;      seq_len = LEN(S_HUH); break;
    default: seq = NULL; seq_len = 0; break;
  }
  seq_i = 0;
  note_pos = 0;
}

// 有点圆润的音色：正弦 + 一点二次谐波
static inline float tone(float ph) { return sinf(ph) * 0.8f + sinf(ph * 2) * 0.2f; }

static int16_t next_sample() {
  float out = 0;
  if (pcm) {
    if (pcm_pos < pcm_n) {
      // 回答的声音：音量压到六成，跟音效差不多响
      int16_t v = pcm[pcm_pos++];
      return (int16_t)(v * 0.6f);
    }
  }
  if (seq) {
    const Note &n = seq[seq_i];
    uint32_t total = (uint32_t)n.ms * RATE / 1000;
    float t = (float)note_pos / total;
    if (n.f0) {
      float f = n.f0 + (n.f1 - n.f0) * t;
      if (n.vib) {
        vib_phase += 2 * PI * n.vib / RATE;
        f *= 1 + 0.035f * sinf(vib_phase);
      }
      phase += 2 * PI * f / RATE;
      if (phase > 2 * PI) phase -= 2 * PI;
      // 包络：5ms 起，尾巴 25% 渐弱，不会咔哒
      float env = min(1.0f, note_pos / (RATE * 0.005f));
      if (t > 0.75f) env *= (1 - t) / 0.25f;
      out = tone(phase) * env * n.vol / 100.0f;
    }
    if (++note_pos >= total) {
      note_pos = 0;
      if (++seq_i >= seq_len) seq = NULL;
    }
  }
  // 呼噜：低一点的声音，一抖一抖的，淡入淡出
  purr_env += ((purr_on ? 1.0f : 0.0f) - purr_env) * 0.0008f;
  if (purr_env > 0.001f) {
    purr_phase += 2 * PI * 260 / RATE;
    if (purr_phase > 2 * PI) purr_phase -= 2 * PI;
    vib_phase += 2 * PI * 22 / RATE;
    float am = 0.55f + 0.45f * sinf(vib_phase);
    out += tone(purr_phase) * am * purr_env * 0.35f;
  }
  return (int16_t)(constrain(out, -1.0f, 1.0f) * 9000);
}

static void task(void *) {
  static int16_t in[BLOCK * 2], outb[BLOCK * 2];
  bool pa = false;
  uint32_t quiet_since = 0;
  for (;;) {
    // 听
    size_t got = i2s.readBytes((char *)in, sizeof(in));
    if (got >= sizeof(in)) {
      // 两个声道各算一个音量，取大的（不用管麦克风接在左还是右）
      double l = 0, r = 0;
      for (int i = 0; i < BLOCK; i++) {
        l += (double)in[i * 2] * in[i * 2];
        r += (double)in[i * 2 + 1] * in[i * 2 + 1];
      }
      level = sqrt(max(l, r) / BLOCK);
      if (recording && rec_buf) {
        for (int i = 0; i < BLOCK && rec_n < REC_MAX; i++)
          rec_buf[22 + rec_n++] = (int16_t)(((int32_t)in[i * 2] + in[i * 2 + 1]) / 2);
      }
    }

    // 说
    int p = pending;
    if (p != SND_NONE) {
      pending = SND_NONE;
      if (enabled) start((Sound)p);
    }
    bool pcm_active = pcm && pcm_pos < pcm_n;
    bool active = enabled && (seq != NULL || purr_on || purr_env > 0.001f || pcm_active);
    if (active) {
      if (!pa) {
        exio_set(EXIO_PA_EN, true);  // 这里是另一个核碰 I2C，只在开关功放时碰一下
        pa = true;
      }
      double acc = 0;
      for (int i = 0; i < BLOCK; i++) {
        int16_t s = next_sample();
        outb[i * 2] = s;
        outb[i * 2 + 1] = s;
        acc += (double)s * s;
      }
      out_level = sqrt(acc / BLOCK);
      speak_until = millis() + 250;
      quiet_since = millis();
    } else {
      memset(outb, 0, sizeof(outb));
      out_level = 0;
      // 安静两秒以后关功放，省电也没有底噪
      if (pa && millis() - quiet_since > 2000) {
        exio_set(EXIO_PA_EN, false);
        pa = false;
      }
    }
    i2s.write((uint8_t *)outb, sizeof(outb));
  }
}

bool voice_init(int volume) {
  // 喇叭
  es8311_handle_t es = es8311_create(I2C_NUM_0, ES8311_ADDRRES_0);
  if (!es) {
    Serial.println("ES8311 创建失败");
    return false;
  }
  es8311_clock_config_t clk = {};
  clk.mclk_inverted = false;
  clk.sclk_inverted = false;
  clk.mclk_from_mclk_pin = true;
  clk.mclk_frequency = MCLK;
  clk.sample_frequency = RATE;
  if (es8311_init(es, &clk, ES8311_RESOLUTION_16, ES8311_RESOLUTION_16) != ESP_OK) {
    Serial.println("喇叭芯片 ES8311 没有应答");
    return false;
  }
  es8311_voice_volume_set(es, volume, NULL);
  es8311_microphone_config(es, false);

  // 麦克风
  bool mic_ok = false;
  es7210_dev_handle_t mic = NULL;
  es7210_i2c_config_t mic_i2c = {};
  mic_i2c.i2c_addr = 0x40;
  if (es7210_new_codec(&mic_i2c, &mic) == ESP_OK) {
    es7210_codec_config_t cc = {};
    cc.i2s_format = ES7210_I2S_FMT_I2S;
    cc.mclk_ratio = 256;
    cc.sample_rate_hz = RATE;
    cc.bit_width = ES7210_I2S_BITS_16B;
    cc.mic_bias = ES7210_MIC_BIAS_2V87;
    cc.mic_gain = ES7210_MIC_GAIN_30DB;
    cc.flags.tdm_enable = false;
    // 音量比默认再大 6dB，喊一声也听得见
    mic_ok = es7210_config_codec(mic, &cc) == ESP_OK && es7210_config_volume(mic, 6) == ESP_OK;
  }
  if (!mic_ok) Serial.println("麦克风芯片 ES7210 没有应答，只出声不听");

  i2s.setPins(PIN_I2S_BCLK, PIN_I2S_LRCK, PIN_I2S_DOUT, PIN_I2S_DIN, PIN_I2S_MCLK);
  i2s.setTimeout(100);
  if (!i2s.begin(I2S_MODE_STD, RATE, I2S_DATA_BIT_WIDTH_16BIT, I2S_SLOT_MODE_STEREO)) {
    Serial.println("I2S 初始化失败");
    return false;
  }
  ok = true;
  xTaskCreatePinnedToCore(task, "voice", 4096, NULL, 5, NULL, 0);
  return true;
}

void voice_play(Sound s) { if (ok) pending = s; }
void voice_purr(bool on) { purr_on = on; }
void voice_enable(bool on) {
  enabled = on;
  if (!on) purr_on = false;
}
bool voice_enabled() { return enabled; }
float voice_level() { return level; }
bool voice_speaking() { return millis() < speak_until; }

// ---------- 录音 / 播放回答 ----------
bool voice_rec_start() {
  if (!ok) return false;
  if (!rec_buf) {
    if (!psramFound()) return false;  // 15 秒录音要 480KB，只能放 PSRAM
    rec_buf = (int16_t *)ps_malloc((REC_MAX + 22) * sizeof(int16_t));
    if (!rec_buf) return false;
  }
  rec_n = 0;
  recording = true;
  return true;
}

void voice_rec_cancel() { recording = false; }

int16_t *voice_rec_stop(size_t *samples) {
  recording = false;
  *samples = rec_n;
  return rec_buf;  // rec_buf[0..21] 留给 WAV 头，声音从 rec_buf[22] 开始
}

bool voice_recording() { return recording; }

void voice_play_pcm(int16_t *data, size_t n) {
  int16_t *old = pcm;
  pcm = NULL;
  pcm_n = n;
  pcm_pos = 0;
  pcm = data;
  if (old && old != data) {
    delay(20);
    free(old);
  }
}

bool voice_pcm_playing() { return pcm && pcm_pos < pcm_n; }
float voice_out_level() { return out_level; }
