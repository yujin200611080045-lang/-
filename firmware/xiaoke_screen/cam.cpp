#include "cam.h"
#include "esp_camera.h"
#include "img_converters.h"

static bool ok = false;
static SemaphoreHandle_t lock = NULL;  // 网页拍照和看动静不能同时取画面

static volatile float mx = 0, my = 0, mamt = 0;
static volatile uint32_t mtime = 0;

// 把画面缩成 40×30 的小格子，每格是亮度平均值，跟上一帧比
#define GW 40
#define GH 30
static uint8_t prev[GW * GH], cur[GW * GH];
static bool have_prev = false;

static void shrink(const camera_fb_t *fb) {
  const uint16_t *px = (const uint16_t *)fb->buf;
  int W = fb->width, H = fb->height;
  for (int gy = 0; gy < GH; gy++)
    for (int gx = 0; gx < GW; gx++) {
      int x0 = gx * W / GW, x1 = (gx + 1) * W / GW, y0 = gy * H / GH, y1 = (gy + 1) * H / GH;
      uint32_t s = 0, n = 0;
      for (int y = y0; y < y1; y += 2)
        for (int x = x0; x < x1; x += 2) {
          uint16_t p = px[y * W + x];
          p = (p >> 8) | (p << 8);  // 摄像头给的 RGB565 是高字节在前
          int r = (p >> 11) << 3, g = ((p >> 5) & 63) << 2, b = (p & 31) << 3;
          s += (r * 3 + g * 6 + b) / 10;
          n++;
        }
      cur[gy * GW + gx] = n ? s / n : 0;
    }
}

static void motion_task(void *) {
  for (;;) {
    if (!ok) {
      vTaskDelay(pdMS_TO_TICKS(500));
      continue;
    }
    xSemaphoreTake(lock, portMAX_DELAY);
    camera_fb_t *fb = esp_camera_fb_get();
    if (fb && fb->format == PIXFORMAT_RGB565) shrink(fb);
    if (fb) esp_camera_fb_return(fb);
    xSemaphoreGive(lock);
    if (!fb) {
      vTaskDelay(pdMS_TO_TICKS(100));
      continue;
    }

    if (have_prev) {
      // 变化超过阈值的格子算"在动"，取它们的重心
      float sx = 0, sy = 0, w = 0;
      int moved = 0;
      for (int i = 0; i < GW * GH; i++) {
        int d = abs((int)cur[i] - (int)prev[i]);
        if (d > 22) {
          moved++;
          sx += (i % GW) * d;
          sy += (i / GW) * d;
          w += d;
        }
      }
      float amount = moved / (float)(GW * GH);
      // 太少是噪点，太多多半是灯开关了或者整个摄像头被晃了
      if (w > 0 && amount > 0.012f && amount < 0.6f) {
        float x = sx / w / (GW - 1) * 2 - 1, y = sy / w / (GH - 1) * 2 - 1;
#if CAM_FLIP_X
        x = -x;
#endif
#if CAM_FLIP_Y
        y = -y;
#endif
        mx = x;
        my = y;
        mamt = amount;
        mtime = millis();
      }
    }
    memcpy(prev, cur, sizeof(prev));
    have_prev = true;
    vTaskDelay(pdMS_TO_TICKS(80));  // 大约 8~10 帧每秒，够用了
  }
}

bool cam_init() {
  camera_config_t c = {};
  c.ledc_channel = LEDC_CHANNEL_0;
  c.ledc_timer = LEDC_TIMER_0;
  c.pin_d0 = 45;
  c.pin_d1 = 47;
  c.pin_d2 = 48;
  c.pin_d3 = 46;
  c.pin_d4 = 42;
  c.pin_d5 = 40;
  c.pin_d6 = 39;
  c.pin_d7 = 21;
  c.pin_xclk = 38;
  c.pin_pclk = 41;
  c.pin_vsync = 17;
  c.pin_href = 18;
  // 摄像头的配置线跟喇叭、触摸、IO 扩展共用同一组 I2C（GPIO8/7）。
  // 直接借用 Wire 已经开好的 0 号总线，不能另开一个控制器去抢同样的两根脚
  c.pin_sccb_sda = -1;
  c.pin_sccb_scl = -1;
  c.sccb_i2c_port = 0;
  c.pin_pwdn = -1;      // 电源脚走 IO 扩展，开机已经是通电状态
  c.pin_reset = -1;
  c.xclk_freq_hz = 20000000;
  c.pixel_format = PIXFORMAT_RGB565;
  c.grab_mode = CAMERA_GRAB_WHEN_EMPTY;
  c.fb_count = 1;
  if (psramFound()) {
    c.frame_size = FRAMESIZE_QVGA;  // 320×240
    c.fb_location = CAMERA_FB_IN_PSRAM;
    c.fb_count = 2;
    c.grab_mode = CAMERA_GRAB_LATEST;
  } else {
    c.frame_size = FRAMESIZE_QQVGA;  // 160×120，没开 PSRAM 时只能用小的
    c.fb_location = CAMERA_FB_IN_DRAM;
    Serial.println("没开 PSRAM，摄像头用小画面（Tools → PSRAM 选 OPI PSRAM 会更清楚）");
  }
  esp_err_t err = esp_camera_init(&c);
  if (err != ESP_OK) {
    Serial.printf("摄像头没应答（0x%x）：没插好，或者排线方向反了\n", err);
    return false;
  }
  sensor_t *s = esp_camera_sensor_get();
  if (s) Serial.printf("摄像头应答了，型号 PID=0x%x\n", s->id.PID);
  lock = xSemaphoreCreateMutex();
  ok = true;
  xTaskCreatePinnedToCore(motion_task, "cam", 4096, NULL, 3, NULL, 0);
  return true;
}

bool cam_ok() { return ok; }

bool cam_motion(float &x, float &y, float &amount) {
  if (!ok || !mtime || millis() - mtime > 300) return false;
  x = mx;
  y = my;
  amount = mamt;
  return true;
}

bool cam_jpg(uint8_t **buf, size_t *len) {
  if (!ok) return false;
  xSemaphoreTake(lock, portMAX_DELAY);
  camera_fb_t *fb = esp_camera_fb_get();
  bool r = false;
  if (fb) {
    r = frame2jpg(fb, 70, buf, len);
    esp_camera_fb_return(fb);
  }
  xSemaphoreGive(lock);
  return r;
}

void cam_free_jpg(uint8_t *buf) { free(buf); }
