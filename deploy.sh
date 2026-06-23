#!/bin/bash
# BiliStudy V2 - 一键部署脚本（GitHub Actions + 阿里云）
set -e

echo "===== BiliStudy V2 部署脚本 ====="

# 1. 安装 Node.js
if ! command -v node &> /dev/null; then
  echo ">>> 安装 Node.js..."
  curl -fsSL https://deb.nodesource.com/setup_22.x | bash -
  apt-get install -y nodejs
fi

echo "Node.js: $(node -v)"

# 2. 安装 git
if ! command -v git &> /dev/null; then
  echo ">>> 安装 git..."
  apt-get install -y git
fi

# 3. 拉取代码
REPO_DIR="/opt/bili-summary"
if [ -d "$REPO_DIR" ]; then
  echo ">>> 更新代码..."
  cd "$REPO_DIR"
  git fetch origin
  git checkout v2
  git pull origin v2
else
  echo ">>> 克隆代码..."
  git clone -b v2 https://github.com/yidongxie/bili-summary-ts.git "$REPO_DIR"
  cd "$REPO_DIR"
fi

# 4. 安装依赖
# 使用 npm ci 严格按照 package-lock.json 安装，保证服务器和本地构建产物一致。
# 如果仓库里没有 lockfile（首次升级时），fall back 到 npm install。
echo ">>> 安装 npm 依赖..."
if [ -f package-lock.json ]; then
  npm ci
else
  npm install
fi

# 5. 编译后端 TypeScript
echo ">>> 编译 TypeScript (后端)..."
npx tsc

# 5b. 构建前端 (Vite -> public/dist/)
echo ">>> 构建前端 (vite build)..."
npm run build:web

# 6. 生成 ENCRYPTION_KEY
ENV_FILE="$REPO_DIR/.env"
if [ ! -f "$ENV_FILE" ]; then
  KEY=$(node -e "console.log(require('crypto').randomBytes(32).toString('hex'))")
  echo "ENCRYPTION_KEY=$KEY" > "$ENV_FILE"
  echo "PORT=8080" >> "$ENV_FILE"
  echo ">>> 已生成 ENCRYPTION_KEY"
fi

source "$ENV_FILE"

# 7. 使用 PM2 保活
if ! command -v pm2 &> /dev/null; then
  echo ">>> 安装 pm2..."
  npm install -g pm2
fi

echo ">>> 启动服务..."
pm2 delete bilistudy 2>/dev/null || true
ENCRYPTION_KEY=$ENCRYPTION_KEY pm2 start dist/index.js --name bilistudy

# 8. 保存 PM2 配置，开机自启
pm2 save
pm2 startup

echo ""
echo "===== 部署完成 ====="
echo "访问地址: http://$(curl -s ifconfig.me):8080"
echo "管理命令: pm2 logs bilistudy  (查看日志)"
echo "          pm2 restart bilistudy (重启)"
echo "          pm2 stop bilistudy    (停止)"
