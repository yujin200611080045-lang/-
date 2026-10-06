// 脸：两只眼睛 + 腮红
// 每只眼睛是一条"三点折线 + 粗细"，竖条、横线、^、>、< 都能用它表示，
// 换表情时把三个点和粗细慢慢挪过去，所以表情之间是连续变形的，不会跳
#pragma once
#include <Arduino.h>

struct EyeShape {
  float x0, y0, x1, y1, x2, y2;  // 三个点（相对眼睛中心）
  float r;                       // 线的半粗
};

enum Expr {
  EXPR_NORMAL,     // 两条竖线
  EXPR_HAPPY,      // ^ ^
  EXPR_ANNOYED,    // > <
  EXPR_SURPRISED,  // 竖线变大变粗
  EXPR_SLEEPY,     // 竖线变短，往下耷拉
  EXPR_CLOSED,     // 一道横线
  EXPR_LISTEN,     // 圆眼睛，认真听
};

struct Face {
  float gaze_x, gaze_y;   // 视线偏移（像素）
  float open;             // 眨眼：1 睁开，0 闭上
  float blush;            // 腮红 0~1
  float bright;           // 眼睛亮度 0~1
  float lift;             // 整体上下（犯困时往下沉）
  EyeShape left, right;   // 当前形状
};

void face_init();
void face_set_expr(Expr e);        // 设定目标表情，之后每帧慢慢变过去
Expr face_expr();
void face_step(float k);           // 往目标表情靠近一步，k 越大越快（0~1）
Face &face();                      // 直接改视线、眨眼、腮红等
void face_render();                // 画到屏幕上（只画眼睛所在的横带）
