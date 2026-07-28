#!/bin/bash
# 一键部署：拉代码 → 重建前端 → 重启 bridge
# 用法：bash /root/repo/deploy.sh
set -e

REPO=/root/repo
cd "$REPO"

echo "==> 拉取 main"
git fetch origin main
git reset --hard origin/main

echo "==> 重建前端"
cd "$REPO/app"
npm install --silent
npm run build

echo "==> 重启 bridge"
pm2 restart bridge --update-env

echo "==> 完成"
pm2 list
