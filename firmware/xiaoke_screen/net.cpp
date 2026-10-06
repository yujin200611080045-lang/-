#include "net.h"
#include <WiFi.h>
#include <WebServer.h>
#include <DNSServer.h>
#include <Preferences.h>
#include <time.h>

#define MAX_NETS       3
#define TRY_MS         12000     // 每个 WiFi 试多久
#define RETRY_GAP_MS   30000     // 全都连不上时，隔多久再从头试
#define PORTAL_MS      600000    // 设置热点最多开 10 分钟

static Preferences store;
static String ssids[MAX_NETS], passes[MAX_NETS];
static int net_count = 0;

static WebServer web(80);
static DNSServer dns;
static bool portal = false, web_started = false;
static uint32_t portal_until = 0;

enum { ST_IDLE, ST_TRYING, ST_UP, ST_WAIT };
static int state = ST_IDLE;
static int try_i = 0;
static uint32_t state_ms = 0;
static bool time_started = false;

// ---------- 存取 ----------
static void load() {
  store.begin("net", true);
  net_count = 0;
  for (int i = 0; i < MAX_NETS; i++) {
    String s = store.getString(("s" + String(i)).c_str(), "");
    if (s.length()) {
      ssids[net_count] = s;
      passes[net_count] = store.getString(("p" + String(i)).c_str(), "");
      net_count++;
    }
  }
  store.end();
}

static void save() {
  store.begin("net", false);
  for (int i = 0; i < MAX_NETS; i++) {
    if (i < net_count) {
      store.putString(("s" + String(i)).c_str(), ssids[i]);
      store.putString(("p" + String(i)).c_str(), passes[i]);
    } else {
      store.remove(("s" + String(i)).c_str());
      store.remove(("p" + String(i)).c_str());
    }
  }
  store.end();
}

// 新加的放最前面（最先试），同名的覆盖，超过 3 个挤掉最旧的
static void add_net(const String &s, const String &p) {
  for (int i = 0; i < net_count; i++)
    if (ssids[i] == s) {
      for (int j = i; j > 0; j--) { ssids[j] = ssids[j - 1]; passes[j] = passes[j - 1]; }
      ssids[0] = s;
      passes[0] = p;
      save();
      return;
    }
  if (net_count < MAX_NETS) net_count++;
  for (int j = net_count - 1; j > 0; j--) { ssids[j] = ssids[j - 1]; passes[j] = passes[j - 1]; }
  ssids[0] = s;
  passes[0] = p;
  save();
}

static void del_net(int i) {
  if (i < 0 || i >= net_count) return;
  for (int j = i; j < net_count - 1; j++) { ssids[j] = ssids[j + 1]; passes[j] = passes[j + 1]; }
  net_count--;
  save();
}

// ---------- 设置页面 ----------
static String esc(const String &s) {
  String o;
  for (char c : s) {
    if (c == '<') o += "&lt;";
    else if (c == '>') o += "&gt;";
    else if (c == '&') o += "&amp;";
    else if (c == '"') o += "&quot;";
    else o += c;
  }
  return o;
}

static const char HEAD[] PROGMEM = R"(<!doctype html><html><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>小克的 WiFi</title><style>
body{margin:0;padding:20px;background:#111;color:#eee;font:16px -apple-system,sans-serif}
h1{font-size:22px;margin:0 0 4px}p{color:#999;margin:0 0 18px;font-size:14px}
.card{background:#1d1d1d;border-radius:14px;padding:14px;margin-bottom:14px}
.net{display:flex;justify-content:space-between;align-items:center;padding:10px 0;border-bottom:1px solid #2a2a2a}
.net:last-child{border:0}button,input{font:inherit}
.pick{background:none;border:0;color:#eee;text-align:left;flex:1;padding:0}
.sig{color:#777;font-size:13px}
input{width:100%;box-sizing:border-box;padding:12px;border-radius:10px;border:1px solid #333;background:#111;color:#eee;margin:6px 0 12px}
.go{width:100%;padding:13px;border:0;border-radius:10px;background:#fff;color:#111;font-weight:600}
.del{background:none;border:1px solid #444;color:#aaa;border-radius:8px;padding:4px 10px}
.eyes{font-size:30px;letter-spacing:10px;text-align:center;margin:6px 0 14px}
</style></head><body><div class="eyes">❘ ❘</div>)";

static void page_root() {
  String h = FPSTR(HEAD);
  h += "<h1>给小克连 WiFi</h1><p>家里的 WiFi 或手机热点都可以（只能用 2.4G；iPhone 热点要打开「最大兼容性」）。最多记 3 个，会挨个试。</p>";

  h += "<div class='card'><b>附近的网络</b>";
  int n = WiFi.scanComplete();
  if (n == WIFI_SCAN_FAILED) {
    WiFi.scanNetworks(true);
    h += "<div class='net sig'>正在找……几秒后刷新页面</div>";
  } else if (n == WIFI_SCAN_RUNNING) {
    h += "<div class='net sig'>正在找……几秒后刷新页面</div>";
  } else {
    for (int i = 0; i < n && i < 15; i++) {
      String s = WiFi.SSID(i);
      if (!s.length()) continue;
      h += "<div class='net'><button class='pick' onclick=\"document.getElementById('s').value=this.dataset.s;document.getElementById('p').focus()\" data-s=\"" + esc(s) + "\">" + esc(s) + "</button><span class='sig'>" + String(WiFi.RSSI(i)) + "</span></div>";
    }
    if (n == 0) h += "<div class='net sig'>一个都没找到</div>";
    WiFi.scanDelete();
    WiFi.scanNetworks(true);  // 下次刷新时就是新的列表
  }
  h += "</div>";

  h += "<div class='card'><form method='post' action='/save'>名字<input id='s' name='s' autocomplete='off'>密码<input id='p' name='p' type='password'>"
       "<button class='go'>保存并连接</button></form></div>";

  if (net_count) {
    h += "<div class='card'><b>已经记住的</b>";
    for (int i = 0; i < net_count; i++)
      h += "<div class='net'><span>" + esc(ssids[i]) + "</span><form method='post' action='/del' style='margin:0'><input type='hidden' name='i' value='" + String(i) +
           "'><button class='del'>删掉</button></form></div>";
    h += "</div>";
  }
  if (WiFi.status() == WL_CONNECTED) h += "<p>现在连着：" + esc(WiFi.SSID()) + "</p>";
  h += "</body></html>";
  web.send(200, "text/html; charset=utf-8", h);
}

static void page_save() {
  String s = web.arg("s"), p = web.arg("p");
  s.trim();
  if (!s.length()) {
    web.sendHeader("Location", "/");
    web.send(303);
    return;
  }
  add_net(s, p);
  String h = FPSTR(HEAD);
  h += "<h1>记住了</h1><p>正在连「" + esc(s) + "」。连上以后它会开心一下，这个热点过一会儿会自己关掉。</p></body></html>";
  web.send(200, "text/html; charset=utf-8", h);
  // 马上从新加的这个开始试
  WiFi.disconnect();
  state = ST_TRYING;
  try_i = 0;
  state_ms = millis();
  WiFi.begin(ssids[0].c_str(), passes[0].c_str());
}

static void page_del() {
  del_net(web.arg("i").toInt());
  web.sendHeader("Location", "/");
  web.send(303);
}

static void redirect() {
  web.sendHeader("Location", "http://192.168.4.1/");
  web.send(302);
}

// ---------- 对外 ----------
void net_start_portal() {
  if (portal) {
    portal_until = millis() + PORTAL_MS;
    return;
  }
  WiFi.mode(WIFI_AP_STA);
  WiFi.softAP(NET_AP_NAME, NET_AP_PASS);
  dns.start(53, "*", WiFi.softAPIP());
  if (!web_started) {
    web.on("/", page_root);
    web.on("/save", HTTP_POST, page_save);
    web.on("/del", HTTP_POST, page_del);
    web.onNotFound(redirect);  // 手机检测上网的请求都转到设置页，好自动弹出来
    web_started = true;
  }
  web.begin();
  WiFi.scanNetworks(true);
  portal = true;
  portal_until = millis() + PORTAL_MS;
  Serial.printf("设置热点已打开：%s，密码 %s\n", NET_AP_NAME, NET_AP_PASS);
}

static void stop_portal() {
  if (!portal) return;
  dns.stop();
  web.stop();
  WiFi.softAPdisconnect(true);
  WiFi.mode(WIFI_STA);
  portal = false;
  Serial.println("设置热点已关闭");
}

void net_init() {
  WiFi.persistent(false);
  WiFi.setAutoReconnect(true);
  WiFi.mode(WIFI_STA);
  load();
  Serial.printf("记住的 WiFi：%d 个\n", net_count);
  if (net_count == 0) {
    net_start_portal();
    return;
  }
  state = ST_TRYING;
  try_i = 0;
  state_ms = millis();
  WiFi.begin(ssids[0].c_str(), passes[0].c_str());
}

void net_loop() {
  uint32_t t = millis();
  if (portal) {
    dns.processNextRequest();
    web.handleClient();
    // 连上了就过一分钟关热点；一直没人设置，十分钟后也关
    if (state == ST_UP && (int32_t)(portal_until - t) > 60000) portal_until = t + 60000;
    if ((int32_t)(t - portal_until) > 0 && net_count > 0) stop_portal();
  }

  switch (state) {
    case ST_TRYING:
      if (WiFi.status() == WL_CONNECTED) {
        state = ST_UP;
        Serial.printf("WiFi 连上了：%s  %s\n", WiFi.SSID().c_str(), WiFi.localIP().toString().c_str());
        if (!time_started) {
          // 北京时间，国内的对时服务器优先
          configTzTime("CST-8", "ntp.aliyun.com", "ntp.tencent.com", "pool.ntp.org");
          time_started = true;
        }
      } else if (t - state_ms > TRY_MS) {
        if (++try_i < net_count) {
          state_ms = t;
          WiFi.disconnect();
          WiFi.begin(ssids[try_i].c_str(), passes[try_i].c_str());
          Serial.printf("换一个试：%s\n", ssids[try_i].c_str());
        } else {
          state = ST_WAIT;
          state_ms = t;
          Serial.println("记住的 WiFi 都没连上，过一会儿再试（长按 BOOT 3 秒可以重新设置）");
        }
      }
      break;
    case ST_UP:
      if (WiFi.status() != WL_CONNECTED) {
        // 断了：先让它自己重连一会儿，不行再从头挨个试
        state = ST_WAIT;
        state_ms = t - RETRY_GAP_MS + 15000;
        Serial.println("WiFi 断了");
      }
      break;
    case ST_WAIT:
      if (WiFi.status() == WL_CONNECTED) {
        state = ST_UP;
      } else if (t - state_ms > RETRY_GAP_MS && net_count > 0) {
        state = ST_TRYING;
        try_i = 0;
        state_ms = t;
        WiFi.disconnect();
        WiFi.begin(ssids[0].c_str(), passes[0].c_str());
      }
      break;
  }
}

bool net_portal_on() { return portal; }
bool net_connected() { return state == ST_UP; }

bool net_time_ok() {
  return time(nullptr) > 1700000000;
}

bool net_now(struct tm &out) {
  if (!net_time_ok()) return false;
  time_t now = time(nullptr);
  localtime_r(&now, &out);
  return true;
}
