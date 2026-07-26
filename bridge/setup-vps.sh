#!/bin/bash
# Vultr Startup Script — 自动部署 Ombre Brain
# 用法：在 Vultr 创建实例时粘贴到 User Data / Startup Script
# 创建前把下面配置区的三个值换掉

set -e

##──── 配置区（修改这三行）────────────────────────────────────
LLM_API_KEY="你的中转站API_KEY"
LLM_API_BASE="https://你的中转站域名/v1"   # OpenAI兼容格式，末尾加/v1
LLM_MODEL="deepseek-chat"                  # 换成你中转站支持的模型名
DASHBOARD_PASSWORD="xiaoke2026"
##────────────────────────────────────────────────────────────

SSH_ROOT_PASSWORD="xiaoke2026"
WORK_DIR="/root/ombre"

LOG="/var/log/ombre-setup.log"
exec > >(tee -a "$LOG") 2>&1
echo "=== Ombre Brain setup start: $(date) ==="

# 设置 root SSH 密码
echo "root:${SSH_ROOT_PASSWORD}" | chpasswd
sed -i 's/^#*PermitRootLogin.*/PermitRootLogin yes/' /etc/ssh/sshd_config
sed -i 's/^#*PasswordAuthentication.*/PasswordAuthentication yes/' /etc/ssh/sshd_config
systemctl restart sshd

# 安装 Docker
apt-get update -qq
apt-get install -y -qq ca-certificates curl gnupg lsb-release
install -m 0755 -d /etc/apt/keyrings
curl -fsSL https://download.docker.com/linux/ubuntu/gpg \
  | gpg --dearmor -o /etc/apt/keyrings/docker.gpg
chmod a+r /etc/apt/keyrings/docker.gpg
echo "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.gpg] \
  https://download.docker.com/linux/ubuntu $(lsb_release -cs) stable" \
  | tee /etc/apt/sources.list.d/docker.list > /dev/null
apt-get update -qq
apt-get install -y -qq docker-ce docker-ce-cli containerd.io docker-compose-plugin
systemctl enable docker
systemctl start docker

# 创建工作目录
mkdir -p "${WORK_DIR}/buckets"

# 写 docker-compose.yml
cat > "${WORK_DIR}/docker-compose.yml" << COMPOSE
services:
  ombre-brain:
    image: p0luz/ombre-brain:latest
    restart: unless-stopped
    ports:
      - "0.0.0.0:18001:8000"
    environment:
      OMBRE_TRANSPORT: streamable-http
      OMBRE_CONFIG_PATH: /app/buckets/config.yaml
      OMBRE_COMPRESS_API_KEY: "${LLM_API_KEY}"
      OMBRE_COMPRESS_BASE_URL: "${LLM_API_BASE}"
      OMBRE_COMPRESS_MODEL: "${LLM_MODEL}"
      OMBRE_DASHBOARD_PASSWORD: "${DASHBOARD_PASSWORD}"
    volumes:
      - ./buckets:/app/buckets
COMPOSE

# 启动
cd "${WORK_DIR}"
docker compose up -d

echo "=== Setup done: $(date) ==="
echo "=== Ombre Brain: http://$(curl -s ifconfig.me):18001 ==="
echo "=== SSH password: ${SSH_ROOT_PASSWORD} ==="
echo "=== Dashboard password: ${DASHBOARD_PASSWORD} ==="
