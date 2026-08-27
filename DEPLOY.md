# BiliStudy 服务器部署指南

本文记录 BiliStudy 的服务器部署流程与踩坑经验（2026-08 实际部署总结）。

## 架构

- 应用：Node.js 22 + Express + better-sqlite3，PM2 保活，Nginx 反代 + HTTPS
- 转写：可选自建 FunASR（Docker，OpenAI 兼容 `/v1/audio/transcriptions`），替代硅基流动云端 ASR
- 外部依赖：ffmpeg（转码/下载/抽帧）、yt-dlp（下载/通用平台解析）

## 一、裸机部署

```bash
# 1. 系统依赖（better-sqlite3 编译 + ffmpeg + yt-dlp）
apt-get update
apt-get install -y build-essential python3 git curl ffmpeg ca-certificates

# 2. yt-dlp 独立二进制（避免 pip 的 externally-managed 问题）
curl -L https://github.com/yt-dlp/yt-dlp/releases/latest/download/yt-dlp -o /usr/local/bin/yt-dlp
chmod +x /usr/local/bin/yt-dlp

# 3. 拉代码（仓库地址/域名按需替换）
git clone -b v2 https://github.com/yidongxie/bili-summary-ts.git /opt/bili-summary
cd /opt/bili-summary

# 4. 构建
npm ci
npx tsc
npm run build:web

# 5. 生成 .env（ENCRYPTION_KEY / SESSION_SECRET 一旦生成不要改，否则已加密的 API Key/cookies 无法解密）
cp .env.example .env
# 编辑 .env 填入 ENCRYPTION_KEY、SESSION_SECRET、NODE_ENV=production、BASE_URL=https://你的域名

# 6. 启动（加载 .env 环境变量）
set -a; source .env; set +a
pm2 start dist/index.js --name bilistudy --max-memory-restart 1G
pm2 save && pm2 startup
```

## 二、Nginx + HTTPS

```bash
bash nginx-setup.sh "你的域名.com"
apt install -y certbot python3-certbot-nginx
certbot --nginx -d 你的域名.com
```

## 三、自建 FunASR（可选，替代云端转写）

> ⚠️ 内存要求：`paraformer`（中文最稳）约 1.5~2GB，`sensevoice`（最轻）约 1GB。
> **1.6GB 内存的服务器跑不动**（available 常不足 600MB，会 OOM 或拖垮 MySQL/Node）。
> 建议至少 4GB 内存再自建。

```bash
cd deploy/funasr
docker compose up -d --build
# 首次启动自动从 ModelScope 下载模型（几百 MB）
```

pip 方式（不用 Docker，服务器已有 Python3 + PM2 时更省事）：

```bash
python3 -m venv /opt/funasr
source /opt/funasr/bin/activate
pip install --upgrade pip
pip install torch torchaudio --index-url https://mirrors.aliyun.com/pytorch-wheels/cpu/ --extra-index-url https://mirrors.aliyun.com/pypi/simple/
pip install "funasr>=1.3.30" fastapi uvicorn python-multipart modelscope -i https://mirrors.aliyun.com/pypi/simple/

# 前台测试（看到 Uvicorn running 即成功，Ctrl+C 退出）
funasr-server --model paraformer --device cpu --host 0.0.0.0 --port 8000

# PM2 托管
pm2 start "/opt/funasr/bin/funasr-server --model paraformer --device cpu --host 0.0.0.0 --port 8000" --name funasr
pm2 save
```

验证：
```bash
curl http://127.0.0.1:8000/health                 # {"status":"ok"}
curl http://127.0.0.1:8000/v1/audio/transcriptions -F file=@sample.mp3 -F model=paraformer -F response_format=verbose_json
```

接入 BiliStudy：设置页 → Whisper → API 地址 `http://127.0.0.1:8000/v1`、模型 `paraformer`、Key 留空（私有端点自动跳过 key 校验）。

---

## 踩坑记录

### 1. npm 源错配（`cdn.npmmirror.com` 404）
**现象**：`npm ci` 报 `404 Not Found - GET https://cdn.npmmirror.com/binaries/npm/depd`，继而 `npx tsc`、`vite` 都 `command not found`。
**原因**：npm registry 被配成了「二进制镜像」`https://cdn.npmmirror.com/binaries/npm/`（那是给 node-sass 之类用的），不是包源。
**修复**：
```bash
npm config set registry https://registry.npmmirror.com
npm config get registry   # 确认是 registry.npmmirror.com
```

### 2. 仓库布局重构导致 `git pull` 无法快进
**现象**：`git pull` 报 `Your local changes to the following files would be overwritten by merge`，列出一堆 `bili-summary-ts/*` 路径。
**原因**：仓库历史上做过一次「项目从 `bili-summary-ts/` 子目录上移到根目录」的重构。老服务器停在旧 commit（嵌套布局），GitHub 已是新布局，二者树结构不同，无法快进；且服务器上还有本地改动 + 未跟踪的 `package-lock.json`。
**修复**：备份数据后原地硬切到已下载的远程引用（**无需联网**，对象已在本地 `.git` 里）：
```bash
rm -f package-lock.json          # 删掉挡路的未跟踪 root lockfile
git reset --hard origin/v2       # 切到新布局
# 把 data 从旧嵌套位置迁到新根目录
mkdir -p data && cp -a bili-summary-ts/data/. data/
```

### 3. 国内服务器 `git clone` GitHub 被墙
**现象**：`fatal: unable to access ...: GnuTLS recv error (-110): The TLS connection was non-properly terminated.`
**原因**：国内服务器直连 GitHub 被重置，且不稳定（`git fetch` 有时能过、`git clone` 常挂）。
**对策**：
- 优先用「已缓存的 objects 原地 `git reset --hard origin/v2`」（见坑 2），完全不走网络；
- 或挂代理 / 用 GitHub 镜像加速（如 `gitclone.com`、`ghproxy`，镜像地址时常变动）。

### 4. 数据迁移要「先停应用再备份」
**现象/风险**：better-sqlite3 用 WAL 模式，运行中 `bilistudy.sqlite-wal` 可能达数 MB，直接单拷 `.sqlite` 会丢最近写入。
**正确做法**：
```bash
pm2 stop bilistudy          # 停应用，让 WAL 合并进主库
tar czf data.tar.gz data    # 三件套一起备（.sqlite + -wal + -shm）
```
迁移后新代码启动会自动恢复/校验 WAL。

### 5. 加密密钥必须跨重启稳定
`ENCRYPTION_KEY` 一旦生成就固定，用于 AES-256-GCM 加解密 `user_configs` 里的 API Key / cookies。换 key = 所有已存密钥读不出来（静默变空）。所以 `.env` 要持久保存，部署升级时**不要重新生成**。

### 6. FunASR 国内镜像
FunASR 的 Docker 构建在海外源会卡：PyTorch CPU 轮子用 `https://mirrors.aliyun.com/pytorch-wheels/cpu/`，pip 用 `https://mirrors.aliyun.com/pypi/simple/`；模型下载默认走 ModelScope（国内友好），无需翻墙。

---

## 升级（日常更新）

```bash
cd /opt/bili-summary
git pull origin v2        # 国内服务器若失败，见「踩坑 3」
npm ci
npx tsc
npm run build:web
pm2 restart bilistudy
```

数据库迁移会在应用启动时自动执行（`src/db/schema.ts` 的 `IF NOT EXISTS` / `ALTER TABLE` 防御式迁移），无需手动操作。
