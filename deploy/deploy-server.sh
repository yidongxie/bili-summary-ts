#!/bin/bash
# 一键部署 bili-summary-ts 到服务器
# 支持: Ubuntu/Debian/CentOS

set -e

echo "========================================"
echo "  bili-summary-ts 一键部署脚本"
echo "========================================"
echo ""

# 检查 Node.js
if ! command -v node &> /dev/null; then
    echo "📦 安装 Node.js 20.x..."
    curl -fsSL https://deb.nodesource.com/setup_20.x | bash -
    apt-get install -y nodejs
fi

# 检查 ffmpeg
if ! command -v ffmpeg &> /dev/null; then
    echo "📦 安装 ffmpeg..."
    apt-get update && apt-get install -y ffmpeg
fi

# 检查 Python（yt-dlp 依赖）
if ! command -v python3 &> /dev/null; then
    echo "📦 安装 Python3..."
    apt-get install -y python3 python3-pip
fi

# 安装 yt-dlp
echo "📦 安装 yt-dlp..."
pip3 install yt-dlp

# 创建项目目录
PROJECT_DIR="/opt/bili-summary-ts"
mkdir -p $PROJECT_DIR
cd $PROJECT_DIR

# 克隆或更新代码
if [ -d ".git" ]; then
    echo "🔄 更新代码..."
    git pull
else
    echo "📥 克隆代码..."
    git clone https://github.com/your-repo/bili-summary-ts.git .
fi

# 安装依赖
echo "📦 安装 npm 依赖..."
npm ci --only=production

# 生成加密密钥
if [ ! -f ".env" ]; then
    echo "🔑 生成配置文件..."
    ENCRYPTION_KEY=$(node -e "console.log(require('crypto').randomBytes(32).toString('hex'))")
    cat > .env << EOF
PORT=8080
ENCRYPTION_KEY=$ENCRYPTION_KEY
NODE_ENV=production
EOF
fi

# 安装 PM2
if ! command -v pm2 &> /dev/null; then
    echo "📦 安装 PM2..."
    npm install -g pm2
fi

# 创建 PM2 配置
cat > ecosystem.config.js << EOF
module.exports = {
  apps: [{
    name: 'bili-summary',
    script: 'src/index.ts',
    interpreter: 'ts-node',
    instances: 1,
    autorestart: true,
    watch: false,
    max_memory_restart: '1G',
    env: {
      NODE_ENV: 'production',
      PORT: 8080
    }
  }]
};
EOF

# 启动服务
echo "🚀 启动服务..."
pm2 reload ecosystem.config.js || pm2 start ecosystem.config.js
pm2 save

# 配置开机自启
echo "🔧 配置开机自启..."
pm2 startup | tail -n 1 | bash

echo ""
echo "========================================"
echo "  ✅ 部署完成！"
echo "========================================"
echo ""
echo "服务地址: http://$(curl -s ifconfig.me):8080"
echo "管理面板: pm2 monit"
echo "查看日志: pm2 logs bili-summary"
echo ""
echo "记得配置 Nginx 反向代理和 HTTPS！"
echo ""
