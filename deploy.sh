#!/bin/bash
# BiliStudy V2 - 一键部署脚本
# 用法（在服务器上，root 或 sudo）:
#   REPO_URL=https://github.com/你的仓库.git DOMAIN=你的域名.com bash deploy.sh
# 说明:
#   - REPO_URL: 你的 git 仓库地址（默认当前 origin）
#   - DOMAIN:   你的域名（留空则用服务器公网 IP 访问）
set -e

echo "===== BiliStudy V2 部署脚本 ====="

REPO_URL="${REPO_URL:-https://github.com/yidongxie/bili-summary-ts.git}"
DOMAIN="${DOMAIN:-}"

# 1. 系统依赖（better-sqlite3 编译 + ffmpeg 转码/下载/抽帧 + yt-dlp 解析）
echo ">>> 安装系统依赖..."
apt-get update
apt-get install -y build-essential python3 git curl ffmpeg ca-certificates

# 2. 安装 Node.js 22
if ! command -v node &> /dev/null; then
  echo ">>> 安装 Node.js 22..."
  curl -fsSL https://deb.nodesource.com/setup_22.x | bash -
  apt-get install -y nodejs
fi
echo "Node.js: $(node -v)"

# 3. 安装 yt-dlp（独立二进制，避免 pip 的 externally-managed 问题）
if ! command -v yt-dlp &> /dev/null; then
  echo ">>> 安装 yt-dlp..."
  curl -L https://github.com/yt-dlp/yt-dlp/releases/latest/download/yt-dlp -o /usr/local/bin/yt-dlp
  chmod +x /usr/local/bin/yt-dlp
fi
echo "yt-dlp: $(yt-dlp --version 2>/dev/null || echo '已安装')"

# 4. 拉取代码
REPO_DIR="/opt/bili-summary"
if [ -d "$REPO_DIR/.git" ]; then
  echo ">>> 更新代码..."
  cd "$REPO_DIR"
  git fetch origin
  git checkout main
  git pull origin main
else
  echo ">>> 克隆代码..."
  git clone -b main "$REPO_URL" "$REPO_DIR"
  cd "$REPO_DIR"
fi

# 5. 安装依赖
echo ">>> 安装 npm 依赖..."
if [ -f package-lock.json ]; then
  npm ci
else
  npm install
fi

# 6. 构建（后端 tsc + 前端 vite）
echo ">>> 编译后端 TypeScript..."
npx tsc
echo ">>> 构建前端..."
npm run build:web

# 7. 生成 .env
ENV_FILE="$REPO_DIR/.env"
gen() { node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"; }
if [ ! -f "$ENV_FILE" ]; then
  cat > "$ENV_FILE" <<EOF
ENCRYPTION_KEY=$(gen)
SESSION_SECRET=$(gen)
PORT=8080
NODE_ENV=production
BASE_URL=https://${DOMAIN}
EOF
  echo ">>> 已生成 .env（含 ENCRYPTION_KEY / SESSION_SECRET）"
fi
# 幂等补齐缺失字段
grep -q '^ENCRYPTION_KEY=' "$ENV_FILE" || echo "ENCRYPTION_KEY=$(gen)" >> "$ENV_FILE"
grep -q '^SESSION_SECRET=' "$ENV_FILE" || echo "SESSION_SECRET=$(gen)" >> "$ENV_FILE"
grep -q '^NODE_ENV=' "$ENV_FILE" || echo "NODE_ENV=production" >> "$ENV_FILE"
grep -q '^PORT=' "$ENV_FILE" || echo "PORT=8080" >> "$ENV_FILE"
if [ -n "$DOMAIN" ] && ! grep -q '^BASE_URL=' "$ENV_FILE"; then
  echo "BASE_URL=https://${DOMAIN}" >> "$ENV_FILE"
fi

set -a; source "$ENV_FILE"; set +a

# 8. 用 PM2 保活
if ! command -v pm2 &> /dev/null; then
  echo ">>> 安装 pm2..."
  npm install -g pm2
fi

echo ">>> 启动服务..."
pm2 delete bilistudy 2>/dev/null || true
pm2 start dist/index.js --name bilistudy --max-memory-restart 1G
pm2 status bilistudy

# 9. 开机自启
pm2 save
pm2 startup | tail -n 1 | bash

echo ""
echo "===== 部署完成 ====="
if [ -n "$DOMAIN" ]; then
  echo "访问: https://${DOMAIN}（需再配 Nginx + HTTPS，见 ./nginx-setup.sh）"
else
  echo "访问: http://$(curl -s ifconfig.me):8080"
fi
echo "日志: pm2 logs bilistudy"
echo "重启: pm2 restart bilistudy"
