// 小克的身体固件
// 主板：微雪 ESP32-S3-CAM-OVxxxx Rev1.1 + 1.46 寸 SPD2010 圆屏（带触摸）
// 开发环境：Arduino IDE + esp32 开发板包 3.2.0（国内用镜像 3.2.0-cn），开发板选 ESP32S3 Dev Module
//
// 会做的事：
//   · 两条竖线眼睛，自己眨眼、看来看去，闲着时轻轻晃
//   · 点一下屏幕：^ ^ 开心，啾一声
//   · 连着戳好几下：> < 生气，哼哼
//   · 按住不放（摸摸）：^ ^ 加腮红，发出呼噜声；手指拖动时眼睛跟着手指走
//   · 突然很大声（拍手）：吓一跳，眼睛变大
//   · 有人在说话：眼睛看向正前方，认真听
//   · 一分半钟没人理：犯困，打哈欠；三分钟：睡着，眼睛变成横线慢慢呼吸；摸一下或拍手叫醒
//   · 板子上的 BOOT 键：开关声音（会记住，下次开机也一样）
//
// 某个部件没接好或者没应答时，那个功能会自己跳过，眼睛照样动。
// 串口监视器（115200）每秒会打印一次麦克风音量，方便调灵敏度。

#include <Preferences.h>
#include "board.h"
#include "face.h"
#include "touch.h"
#include "voice.h"

// ---------- 可以调的数 ----------
#define VOLUME           60      // 喇叭音量 0~100
#define SLEEPY_AFTER_MS  90000   // 多久没人理开始犯困
#define ASLEEP_AFTER_MS  180000  // 多久没人理睡着
#define HOLD_MS          700     // 按住多久算"摸摸"
#define POKES_TO_ANNOY   5       // 几秒内戳几下会生气
#define POKE_WINDOW_MS   3000
#define LOUD_RATIO       5.0f    // 比环境声大多少倍算"吓一跳"
#define LOUD_MIN         1500.0f
#define TALK_RATIO       2.2f    // 比环境声大多少倍算"有人在说话"
#define TALK_MIN         350.0f
#define LOOK_X           44      // 眼睛左右最多挪多少像素
#define LOOK_Y           22
#define FRAME_MS         33      // 约 30 帧

enum Mood { MOOD_AWAKE, MOOD_SLEEPY, MOOD_ASLEEP };

static Preferences prefs;
static bool has_touch = false, has_voice = false;

static Mood mood = MOOD_AWAKE;
static uint32_t last_activity = 0;

// 临时表情（点一下的 ^ ^ 之类），到点自动回到平常
static Expr react_expr = EXPR_NORMAL;
static uint32_t react_until = 0;

// 视线
static float gaze_tx = 0, gaze_ty = 0;
static uint32_t next_look = 0;

// 眨眼
static bool blinking = false, double_blink = false;
static uint32_t blink_start = 0, next_blink = 0, blink_ms = 180;

// 腮红
static float blush_target = 0;

// 触摸
static bool touching = false, holding = false;
static uint32_t touch_start = 0, touch_seen = 0, last_poll = 0;
static int touch_x = 0, touch_y = 0;
static uint32_t pokes[8];
static int poke_n = 0;

// 声音
static float noise_floor = 0;
static uint32_t talk_ms = 0, listening_until = 0, last_startle = 0;
static uint32_t sound_off_at = 0;

// BOOT 键
static bool key_down = false;
static uint32_t key_change = 0;

// ---------- 小工具 ----------
static float rnd(float a, float b) { return a + (b - a) * (random(10000) / 10000.0f); }

static void react(Expr e, uint32_t ms) {
  react_expr = e;
  react_until = millis() + ms;
}

static bool reacting() { return millis() < react_until; }

static void play(Sound s) {
  if (has_voice) voice_play(s);
}

static void wake(bool startled) {
  bool was_asleep = mood != MOOD_AWAKE;
  mood = MOOD_AWAKE;
  last_activity = millis();
  if (startled) {
    react(EXPR_SURPRISED, was_asleep ? 900 : 700);
    play(SND_SURPRISE);
  } else if (was_asleep) {
    react(EXPR_SURPRISED, 500);
    play(SND_WAKE);
  }
}

static void schedule_blink(uint32_t t) {
  switch (mood) {
    case MOOD_SLEEPY: next_blink = t + random(1200, 3000); break;
    case MOOD_ASLEEP: next_blink = t + 1000000; break;
    default: next_blink = t + (t < listening_until ? random(3000, 7000) : random(2200, 6000)); break;
  }
}

// ---------- 触摸 ----------
static void on_tap() {
  uint32_t t = millis();
  int n = 0;
  pokes[poke_n++ % 8] = t;
  for (int i = 0; i < 8; i++)
    if (pokes[i] && t - pokes[i] < POKE_WINDOW_MS) n++;
  if (n >= POKES_TO_ANNOY) {
    react(EXPR_ANNOYED, 1800);
    play(SND_GRUMBLE);
    memset(pokes, 0, sizeof(pokes));
  } else {
    react(EXPR_HAPPY, 1200);
    play(random(100) < 60 ? SND_CHIRP : SND_HAPPY);
  }
}

static void handle_touch(uint32_t t) {
  if (!has_touch) return;
  // 有中断就读；没有中断也隔一会儿读一下，让触摸芯片走完它的开机流程
  if (digitalRead(PIN_TP_INT) == LOW || t - last_poll > 60) {
    last_poll = t;
    int x, y;
    if (touch_read(x, y)) {
      if (!touching) {
        touching = true;
        holding = false;
        touch_start = t;
        if (mood != MOOD_AWAKE) wake(false);
      }
      touch_seen = t;
      touch_x = x;
      touch_y = y;
      last_activity = t;
    }
  }
  if (!touching) return;

  // 手指松开（一段时间没再报点）
  if (t - touch_seen > 120) {
    touching = false;
    if (holding) {
      holding = false;
      voice_purr(false);
      react(EXPR_HAPPY, 1500);  // 摸完还开心一会儿
    } else if (touch_seen - touch_start < 450) {
      on_tap();
    }
    return;
  }

  // 按住 = 摸摸
  if (!holding && t - touch_start > HOLD_MS) {
    holding = true;
    if (has_voice) voice_purr(true);
  }
  if (holding) {
    react(EXPR_HAPPY, 300);
    blush_target = 1;
  }

  // 眼睛跟着手指
  gaze_tx = constrain((touch_x - LCD_W / 2) / (float)(LCD_W / 2) * LOOK_X * 1.3f, -LOOK_X, LOOK_X);
  gaze_ty = constrain((touch_y - LCD_H / 2) / (float)(LCD_H / 2) * LOOK_Y * 1.3f, -LOOK_Y, LOOK_Y);
  next_look = t + 1500;
}

// ---------- 声音 ----------
static void handle_sound(uint32_t t) {
  if (!has_voice || voice_speaking()) return;
  float lv = voice_level();
  if (noise_floor <= 0) {
    noise_floor = max(lv, 50.0f);
    return;
  }
  // 环境声慢慢跟着走（只在不吵的时候更新）
  if (lv < noise_floor * 1.5f) noise_floor = noise_floor * 0.995f + lv * 0.005f;
  noise_floor = max(noise_floor, 30.0f);

  if (lv > max(noise_floor * LOUD_RATIO, LOUD_MIN) && t - last_startle > 1500) {
    last_startle = t;
    if (mood != MOOD_AWAKE) wake(true);
    else {
      react(EXPR_SURPRISED, 700);
      play(SND_SURPRISE);
    }
    last_activity = t;
    return;
  }

  if (lv > max(noise_floor * TALK_RATIO, TALK_MIN)) {
    talk_ms += FRAME_MS;
    if (talk_ms > 300) {
      if (mood == MOOD_SLEEPY) wake(false);  // 睡着了只有大声或者摸才叫得醒
      if (mood == MOOD_AWAKE) {
        listening_until = t + 1200;
        last_activity = t;
      }
    }
  } else {
    talk_ms = 0;
  }
}

// ---------- BOOT 键：开关声音 ----------
static void handle_key(uint32_t t) {
  bool down = digitalRead(PIN_BOOT_KEY) == LOW;
  if (down == key_down || t - key_change < 40) return;
  key_down = down;
  key_change = t;
  if (!down || !has_voice) return;
  last_activity = t;
  if (mood != MOOD_AWAKE) wake(false);
  bool on = !voice_enabled();
  prefs.putBool("sound", on);
  if (on) {
    voice_enable(true);
    react(EXPR_HAPPY, 1000);
    play(SND_CHIRP);
  } else {
    play(SND_OFF);
    sound_off_at = t + 250;  // 让"关了"的提示音放完再关
    react(EXPR_CLOSED, 700);
  }
}

// ---------- 每一帧 ----------
static void update(uint32_t t) {
  Face &f = face();

  if (sound_off_at && t >= sound_off_at) {
    voice_enable(false);
    sound_off_at = 0;
  }

  // 没人理就犯困、睡着
  uint32_t idle = t - last_activity;
  if (mood == MOOD_AWAKE && idle > SLEEPY_AFTER_MS) {
    mood = MOOD_SLEEPY;
    play(SND_YAWN);
    schedule_blink(t);
  }
  if (mood == MOOD_SLEEPY && idle > ASLEEP_AFTER_MS) mood = MOOD_ASLEEP;

  bool listening = t < listening_until;

  // 表情：临时反应优先，其次是状态
  Expr e;
  if (reacting()) e = react_expr;
  else if (mood == MOOD_ASLEEP) e = EXPR_CLOSED;
  else if (mood == MOOD_SLEEPY) e = EXPR_SLEEPY;
  else if (listening) e = EXPR_LISTEN;
  else e = EXPR_NORMAL;
  if (e != face_expr()) face_set_expr(e);
  face_step(0.25f);

  // 眨眼（^ ^、> <、闭眼的时候不眨）
  bool can_blink = e == EXPR_NORMAL || e == EXPR_LISTEN || e == EXPR_SLEEPY || e == EXPR_SURPRISED;
  if (!blinking && can_blink && t >= next_blink) {
    blinking = true;
    blink_start = t;
    blink_ms = mood == MOOD_SLEEPY ? 420 : 180;
  }
  if (blinking) {
    float p = (t - blink_start) / (float)blink_ms;
    if (p >= 1) {
      blinking = false;
      f.open = 1;
      if (!double_blink && mood == MOOD_AWAKE && random(100) < 20) {
        double_blink = true;
        next_blink = t + 120;
      } else {
        double_blink = false;
        schedule_blink(t);
      }
    } else {
      f.open = p < 0.45f ? 1 - p / 0.45f : (p - 0.45f) / 0.55f;
    }
  } else {
    f.open = 1;
  }

  // 看来看去
  if (!touching && t >= next_look) {
    if (mood == MOOD_ASLEEP || listening || random(100) < 40) {
      gaze_tx = 0;
      gaze_ty = 0;
    } else {
      float s = mood == MOOD_SLEEPY ? 0.4f : 1.0f;
      gaze_tx = rnd(-LOOK_X, LOOK_X) * s;
      gaze_ty = rnd(-LOOK_Y, LOOK_Y) * s;
      if (!blinking && can_blink && random(100) < 30) next_blink = t;  // 转眼睛时顺便眨一下
    }
    next_look = t + (mood == MOOD_SLEEPY ? random(2500, 5000) : random(900, 3200));
  }
  float k = touching ? 0.35f : (mood == MOOD_SLEEPY ? 0.08f : 0.22f);
  f.gaze_x += (gaze_tx - f.gaze_x) * k + sinf(t * 0.0017f) * 0.15f;
  f.gaze_y += (gaze_ty - f.gaze_y) * k + sinf(t * 0.0023f) * 0.12f;

  // 犯困往下沉，睡着了一明一暗地呼吸
  float lift_t = mood == MOOD_AWAKE ? 0 : (mood == MOOD_SLEEPY ? 14 : 10);
  f.lift += (lift_t - f.lift) * 0.06f;
  float bright_t = mood == MOOD_ASLEEP ? 0.35f + 0.15f * sinf(t * 2 * PI / 4000) : 1.0f;
  f.bright += (bright_t - f.bright) * 0.1f;

  if (!holding) blush_target = 0;
  f.blush += (blush_target - f.blush) * 0.08f;
}

void setup() {
  Serial.begin(115200);
  delay(300);
  Serial.println("小克醒了");

  if (!board_init()) Serial.println("IO 扩展芯片没有应答（I2C 0x24）");
  backlight(0);
  if (!lcd_init()) return;
  lcd_clear();

  face_init();
  face().open = 0;  // 从闭着眼开始，开机就是睁眼
  face_render();
  backlight(80);

  pinMode(PIN_BOOT_KEY, INPUT_PULLUP);
  prefs.begin("xiaoke", false);

  has_touch = touch_init();
  has_voice = voice_init(VOLUME);
  if (has_voice) voice_enable(prefs.getBool("sound", true));

  randomSeed(esp_random());
  uint32_t t = millis();
  last_activity = t;
  next_look = t + 2500;
  react(EXPR_SURPRISED, 500);
  play(SND_WAKE);
  blinking = true;  // 用一次"睁眼"的后半段当开机动作：从闭眼慢慢睁开
  blink_ms = 500;
  blink_start = t - blink_ms * 45 / 100;
}

void loop() {
  if (!lcd_ready()) {
    delay(1000);
    return;
  }
  uint32_t t = millis();
  handle_key(t);
  handle_touch(t);
  handle_sound(t);
  update(t);
  face_render();

  static uint32_t last_log = 0;
  if (t - last_log > 1000) {
    last_log = t;
    if (has_voice) Serial.printf("麦克风 %.0f（环境 %.0f）%s\n", voice_level(), noise_floor, touching ? "  被摸着" : "");
  }

  uint32_t spent = millis() - t;
  if (spent < FRAME_MS) delay(FRAME_MS - spent);
}
