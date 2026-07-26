#!/bin/bash
# Vultr Startup Script - Deploy Ombre Brain
# Replace the values in the config section before pasting into Vultr

set -e

##---- Config (edit these) ------------------------------------------
LLM_API_KEY="t11mlsKUKwHjSVECh38lb4mPiIxd1KVi0KLiF0UQ2AszvjtM"
LLM_API_BASE="https://api.jiushi.xin/v1"
LLM_MODEL=$(echo "W+ato+WQkV1EZWVwU2Vlay1WNFBybw==" | base64 -d)
DASHBOARD_PASSWORD="xiaoke2026"
##--------------------------------------------------------------------

SSH_ROOT_PASSWORD="xiaoke2026"
WORK_DIR="/root/ombre"

LOG="/var/log/ombre-setup.log"
exec > >(tee -a "$LOG") 2>&1
echo "=== Ombre Brain setup start: $(date) ==="

# SSH config
echo "root:${SSH_ROOT_PASSWORD}" | chpasswd
sed -i 's/^#*PermitRootLogin.*/PermitRootLogin yes/' /etc/ssh/sshd_config
sed -i 's/^#*PasswordAuthentication.*/PasswordAuthentication yes/' /etc/ssh/sshd_config
systemctl restart sshd

# Install Docker
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

# Create work dir
mkdir -p "${WORK_DIR}/buckets"

# Write docker-compose.yml
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

# Start
cd "${WORK_DIR}"
docker compose up -d

echo "=== Setup done: $(date) ==="
echo "=== Ombre Brain: http://$(curl -s ifconfig.me):18001 ==="
echo "=== SSH password: ${SSH_ROOT_PASSWORD} ==="
echo "=== Dashboard password: ${DASHBOARD_PASSWORD} ==="
