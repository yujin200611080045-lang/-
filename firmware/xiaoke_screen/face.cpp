#include "face.h"
#include "board.h"

// 尺寸按她的正面渲染图换算：两眼中心距约 140px，每只约 46×145
#define EYE_GAP   140
#define CX        (LCD_W / 2)
#define CY        (LCD_H / 2)
// 只重画眼睛和腮红会动到的那一条带子
#define BAND_TOP  84
#define BAND_BOT  346

// 腮红：眼睛正下方的粉色椭圆
#define BLUSH_DY  100
#define BLUSH_RX  30
#define BLUSH_RY  13

static Face f;
static Expr cur_expr = EXPR_NORMAL;
static EyeShape tgt_l, tgt_r;

// ---------- 各个表情的形状（左眼；右眼默认是左眼的镜像） ----------
static EyeShape vline(float half, float r) { return {0, -half, 0, 0, 0, half, r}; }

static void shapes_for(Expr e, EyeShape &l, EyeShape &r) {
  switch (e) {
    case EXPR_HAPPY:      // ^ ^
      l = {-30, 17, 0, -15, 30, 17, 10};
      r = l;
      return;
    case EXPR_ANNOYED:    // > <
      l = {-22, -28, 20, 0, -22, 28, 10};
      r = {22, -28, -20, 0, 22, 28, 10};
      return;
    case EXPR_SURPRISED:
      l = vline(58, 29);
      r = l;
      return;
    case EXPR_SLEEPY:
      l = vline(14, 23);
      r = l;
      return;
    case EXPR_CLOSED:
      l = {-18, 0, 0, 0, 18, 0, 5};
      r = l;
      return;
    case EXPR_LISTEN:     // 圆眼睛，像小猫听到动静时瞳孔放圆
      l = {0, 0, 0, 0, 0, 0, 42};
      r = l;
      return;
    case EXPR_NORMAL:
    default:
      l = vline(49.5f, 23);  // 总高 145、宽 46
      r = l;
      return;
  }
}

static inline float mix(float a, float b, float k) { return a + (b - a) * k; }

static void shape_lerp(EyeShape &a, const EyeShape &b, float k) {
  a.x0 = mix(a.x0, b.x0, k); a.y0 = mix(a.y0, b.y0, k);
  a.x1 = mix(a.x1, b.x1, k); a.y1 = mix(a.y1, b.y1, k);
  a.x2 = mix(a.x2, b.x2, k); a.y2 = mix(a.y2, b.y2, k);
  a.r = mix(a.r, b.r, k);
}

void face_init() {
  f.gaze_x = f.gaze_y = 0;
  f.open = 1;
  f.blush = 0;
  f.bright = 1;
  f.lift = 0;
  shapes_for(EXPR_NORMAL, f.left, f.right);
  tgt_l = f.left;
  tgt_r = f.right;
}

void face_set_expr(Expr e) {
  cur_expr = e;
  shapes_for(e, tgt_l, tgt_r);
}

Expr face_expr() { return cur_expr; }

void face_step(float k) {
  shape_lerp(f.left, tgt_l, k);
  shape_lerp(f.right, tgt_r, k);
}

Face &face() { return f; }

// ---------- 画 ----------
// 点到线段的距离
static inline float seg_dist2(float px, float py, float ax, float ay, float bx, float by) {
  float dx = bx - ax, dy = by - ay;
  float len2 = dx * dx + dy * dy;
  float t = len2 > 0.0001f ? ((px - ax) * dx + (py - ay) * dy) / len2 : 0;
  if (t < 0) t = 0;
  if (t > 1) t = 1;
  float qx = ax + t * dx - px, qy = ay + t * dy - py;
  return qx * qx + qy * qy;
}

// 屏幕上的一只眼：已经算好眨眼和位置的绝对坐标
struct EyeDraw {
  float x0, y0, x1, y1, x2, y2, r;
  int bx0, by0, bx1, by1;  // 包围盒
};

static EyeShape closed_shape() { EyeShape c; EyeShape d; shapes_for(EXPR_CLOSED, c, d); return c; }

static void place(const EyeShape &s, float cx, float cy, EyeDraw &o) {
  // 眨眼 = 往"闭眼横线"变形
  static const EyeShape cl = closed_shape();
  EyeShape e = s;
  shape_lerp(e, cl, 1 - f.open);
  o.x0 = cx + e.x0; o.y0 = cy + e.y0;
  o.x1 = cx + e.x1; o.y1 = cy + e.y1;
  o.x2 = cx + e.x2; o.y2 = cy + e.y2;
  o.r = e.r;
  float pad = e.r + 2;
  o.bx0 = (int)(min(o.x0, min(o.x1, o.x2)) - pad);
  o.bx1 = (int)(max(o.x0, max(o.x1, o.x2)) + pad);
  o.by0 = (int)(min(o.y0, min(o.y1, o.y2)) - pad);
  o.by1 = (int)(max(o.y0, max(o.y1, o.y2)) + pad);
}

// 覆盖率 0~255，带 1 像素抗锯齿
static inline uint8_t eye_cover(const EyeDraw &e, float px, float py) {
  float d2 = min(seg_dist2(px, py, e.x0, e.y0, e.x1, e.y1), seg_dist2(px, py, e.x1, e.y1, e.x2, e.y2));
  float lo = e.r - 0.5f, hi = e.r + 0.5f;
  if (d2 <= lo * lo) return 255;
  if (d2 >= hi * hi) return 0;
  return (uint8_t)((hi - sqrtf(d2)) * 255);
}

static inline uint8_t blush_cover(float px, float py, float cx, float cy) {
  float dx = (px - cx) / BLUSH_RX, dy = (py - cy) / BLUSH_RY;
  float d = dx * dx + dy * dy;
  if (d >= 1) return 0;
  // 边缘软一点，像晕开的
  float v = 1 - d;
  return (uint8_t)(min(1.0f, v * 2.2f) * 255);
}

// ---------- 时间：七段数码管样式，笔画和眼睛一样是圆头粗线 ----------
static bool clock_on = false;
static int clock_h = -1, clock_m = -1;

void face_show_clock(bool on, int hh, int mm) {
  clock_on = on;
  clock_h = hh;
  clock_m = mm;
}

#define DIG_W   44
#define DIG_H   96
#define DIG_R   7
//            a     b     c     d     e     f     g
static const uint8_t SEGS[10] = {0x3F, 0x06, 0x5B, 0x4F, 0x66, 0x6D, 0x7D, 0x07, 0x7F, 0x6F};
#define SEG_DASH 0x40

static void seg_end(int s, float &ax, float &ay, float &bx, float &by) {
  const float w = DIG_W / 2.0f, h = DIG_H / 2.0f;
  switch (s) {
    case 0: ax = -w; ay = -h; bx = w;  by = -h; break;  // a 上
    case 1: ax = w;  ay = -h; bx = w;  by = 0;  break;  // b 右上
    case 2: ax = w;  ay = 0;  bx = w;  by = h;  break;  // c 右下
    case 3: ax = -w; ay = h;  bx = w;  by = h;  break;  // d 下
    case 4: ax = -w; ay = 0;  bx = -w; by = h;  break;  // e 左下
    case 5: ax = -w; ay = -h; bx = -w; by = 0;  break;  // f 左上
    default: ax = -w; ay = 0; bx = w;  by = 0;  break;  // g 中
  }
}

static void render_clock() {
  uint8_t masks[4];
  if (clock_h < 0) {
    for (int i = 0; i < 4; i++) masks[i] = SEG_DASH;
  } else {
    masks[0] = SEGS[clock_h / 10];
    masks[1] = SEGS[clock_h % 10];
    masks[2] = SEGS[clock_m / 10];
    masks[3] = SEGS[clock_m % 10];
  }
  const float xs[4] = {CX - 128, CX - 58, CX + 58, CX + 128};
  const float cy = CY + f.lift;
  uint8_t ew = (uint8_t)(255 * f.bright);
  int si = 0;
  for (int y0 = BAND_TOP; y0 < BAND_BOT; y0 += STRIP_H, si++) {
    int rows = min(STRIP_H, BAND_BOT - y0);
    uint16_t *s = lcd_strip(si);
    memset(s, 0, LCD_W * rows * 2);
    for (int dy = 0; dy < rows; dy++) {
      float py = y0 + dy;
      if (fabsf(py - cy) > DIG_H / 2 + DIG_R + 2) continue;
      uint16_t *row = s + dy * LCD_W;
      for (int x = (int)(xs[0] - DIG_W / 2 - DIG_R - 2); x <= (int)(xs[3] + DIG_W / 2 + DIG_R + 2); x++) {
        float best = 1e9f;
        // 中间的两个点
        for (int k = -1; k <= 1; k += 2) {
          float dx = x - CX, dyy = py - (cy + k * 22);
          best = min(best, dx * dx + dyy * dyy);
        }
        for (int d = 0; d < 4; d++) {
          float lx = x - xs[d], ly = py - cy;
          if (fabsf(lx) > DIG_W / 2 + DIG_R + 2) continue;
          for (int sg = 0; sg < 7; sg++) {
            if (!(masks[d] >> sg & 1)) continue;
            float ax, ay, bx, by;
            seg_end(sg, ax, ay, bx, by);
            best = min(best, seg_dist2(lx, ly, ax, ay, bx, by));
          }
        }
        float lo = DIG_R - 0.5f, hi = DIG_R + 0.5f;
        uint8_t c = best <= lo * lo ? 255 : best >= hi * hi ? 0 : (uint8_t)((hi - sqrtf(best)) * 255);
        if (c) {
          uint8_t v = c * ew / 255;
          row[x] = rgb565(v, v, v);
        }
      }
    }
    lcd_draw(y0, y0 + rows, s);
  }
}

void face_render() {
  if (!lcd_ready()) return;
  if (clock_on) {
    render_clock();
    return;
  }
  float gx = f.gaze_x, gy = f.gaze_y + f.lift;
  float lcx = CX - EYE_GAP / 2 + gx, rcx = CX + EYE_GAP / 2 + gx;
  float ecy = CY + gy;
  // 眨眼时略往下合，像上眼皮落下来
  float blink_drop = (1 - f.open) * 12;
  EyeDraw L, R;
  place(f.left, lcx, ecy + blink_drop, L);
  place(f.right, rcx, ecy + blink_drop, R);

  uint8_t ew = (uint8_t)(255 * f.bright);
  uint8_t ba = (uint8_t)(255 * f.blush);
  float bly = ecy + BLUSH_DY;

  int si = 0;
  for (int y0 = BAND_TOP; y0 < BAND_BOT; y0 += STRIP_H, si++) {
    int rows = min(STRIP_H, BAND_BOT - y0);
    uint16_t *s = lcd_strip(si);
    memset(s, 0, LCD_W * rows * 2);
    for (int dy = 0; dy < rows; dy++) {
      int y = y0 + dy;
      float py = y;
      uint16_t *row = s + dy * LCD_W;

      // 腮红
      if (ba && fabsf(py - bly) < BLUSH_RY + 1) {
        for (int k = 0; k < 2; k++) {
          float bcx = k ? rcx + 8 : lcx - 8;
          int xa = max(0, (int)(bcx - BLUSH_RX - 1)), xb = min(LCD_W, (int)(bcx + BLUSH_RX + 2));
          for (int x = xa; x < xb; x++) {
            uint8_t c = blush_cover(x, py, bcx, bly);
            if (!c) continue;
            uint16_t a = c * ba / 255;
            row[x] = rgb565(255 * a / 255, 110 * a / 255, 150 * a / 255);
          }
        }
      }

      // 眼睛（盖在腮红上面）
      for (int k = 0; k < 2; k++) {
        const EyeDraw &e = k ? R : L;
        if (y < e.by0 || y > e.by1) continue;
        int xa = max(0, e.bx0), xb = min(LCD_W, e.bx1 + 1);
        for (int x = xa; x < xb; x++) {
          uint8_t c = eye_cover(e, x, py);
          if (!c) continue;
          uint8_t v = c * ew / 255;
          row[x] = rgb565(v, v, v);
        }
      }
    }
    lcd_draw(y0, y0 + rows, s);
  }
}
