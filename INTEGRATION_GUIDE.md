# 抖音/小红书集成到你的网站 - 快速开始指南

## 🚀 5 分钟快速集成

### 方式一：独立页面嵌入（最简单）

1. 先下载 `yt-dlp.exe` 放到 `tools/` 目录
2. 启动后端服务：`npm run dev`
3. 复制 `public/embed-demo.html` 到你的网站目录
4. 修改 HTML 中的 `API_BASE` 地址：

```javascript
// 如果前端和后端同域名，自动使用当前域名
const API_BASE = window.location.origin;

// 如果后端在其他地址，改为你的后端域名
// const API_BASE = 'https://your-api-domain.com';
```

完成！访问 embed-demo.html 即可使用 ✅

---

### 方式二：API 接口集成（适合已有后端）

你的网站后端调用 bili-summary 的 API：

```python
# Python 示例
import requests

# 1. 创建总结任务
response = requests.post(
    'http://your-api-domain.com/api/tasks/summarize',
    json={
        'url': 'https://v.douyin.com/xxxxxx/',
        'mode': 'brief'
    }
)
task_id = response.json()['task_id']

# 2. 使用 SSE 监听进度（或轮询）
# 见 API_INTEGRATION.md 完整示例
```

---

## 📦 完整部署步骤

### 第一步：准备环境

```bash
# 1. 安装 Node.js 20+
# 2. 安装 Python 3+ (for yt-dlp)
# 3. 安装 ffmpeg

# Ubuntu/Debian
sudo apt-get install python3 python3-pip ffmpeg

# Windows
# 下载 ffmpeg: https://ffmpeg.org/download.html
```

### 第二步：安装 yt-dlp

```bash
# Python pip 安装（推荐，跨平台）
pip3 install yt-dlp

# 验证
yt-dlp --version
```

### 第三步：启动服务

```bash
# 克隆项目
git clone <your-repo-url> bili-summary-ts
cd bili-summary-ts

# 安装依赖
npm install

# 配置环境变量
cp .env.example .env
# 编辑 .env，设置 ENCRYPTION_KEY 等

# 启动服务
npm run dev
```

服务运行在：http://localhost:8080

### 第四步：集成到你的网站

**选项 A：嵌入 iframe**
```html
<iframe
  src="http://your-api-domain.com/embed-demo.html"
  width="100%"
  height="800"
  frameborder="0"
></iframe>
```

**选项 B：使用独立 HTML**
- 复制 `public/embed-demo.html` 到你的网站
- 修改 `API_BASE` 为你的后端地址

**选项 C：React/Vue 组件集成**
- 参考 `web/src/pages/HomePage.tsx`
- 参考 `web/src/pages/ResultPage.tsx`

---

## 🎯 支持的平台

| 平台 | 状态 | 示例 URL |
|------|------|----------|
| 抖音 | ✅ 支持 | `https://v.douyin.com/xxxxxx/` |
| 小红书 | ✅ 支持 | `https://www.xiaohongshu.com/explore/xxx` |
| B站 | ✅ 支持 | `https://www.bilibili.com/video/BVxxx` |
| 小宇宙播客 | ✅ 支持 | `https://www.xiaoyuzhoufm.com/episode/xxx` |
| YouTube | ✅ 支持 | `https://www.youtube.com/watch?v=xxx` |
| 其他 1000+ 网站 | ✅ 支持 | 详见 yt-dlp 文档 |

---

## 🔧 生产环境配置

### 使用 PM2 管理进程

```bash
npm install -g pm2

# 创建 ecosystem.config.js（已在 deploy/ 目录）
cp deploy/ecosystem.config.js .

# 启动
pm2 start ecosystem.config.js

# 查看日志
pm2 logs bili-summary

# 开机自启
pm2 startup
pm2 save
```

### Nginx 反向代理配置

```nginx
server {
    listen 80;
    server_name your-domain.com;

    # 后端 API
    location /api/ {
        proxy_pass http://localhost:8080;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;

        # SSE 流式支持
        proxy_http_version 1.1;
        proxy_set_header Connection '';
        proxy_buffering off;
        proxy_cache off;
    }

    # 前端静态文件
    location / {
        root /var/www/bili-summary/public;
        try_files $uri $uri/ /index.html;
    }
}
```

---

## 💰 成本估算

以 **每天 100 次总结** 为例：

| 项目 | 费用（月） | 说明 |
|------|-----------|------|
| 服务器 | ¥50-200 | 2核4G 云服务器 |
| OpenAI API | ¥20-100 | GPT-3.5-Turbo |
| Whisper API | ¥10-50 | 语音转写 |
| **总计** | **¥80-350** |  |

> 💡 **优化建议**：
> - 使用 DeepSeek API（更便宜，¥1/百万token）
> - 缓存已总结过的视频，避免重复处理
> - 使用自建 Whisper 服务（如 faster-whisper）

---

## 🚀 一键部署到服务器

在你的 Linux 服务器上运行：

```bash
# 下载部署脚本
wget https://raw.githubusercontent.com/your-repo/bili-summary-ts/main/deploy/deploy-server.sh

# 执行
chmod +x deploy-server.sh
./deploy-server.sh
```

---

## 📞 常见问题

### Q: yt-dlp 下载太慢/失败？
A: 使用国内镜像源，或者手动下载放到 tools/ 目录。

### Q: 抖音视频无法解析？
A: 抖音有反爬机制，确保：
1. 使用最新版本的 yt-dlp
2. 服务器 IP 没有被抖音封禁
3. 可以尝试使用代理

### Q: 如何添加用户认证？
A: 可以在 Nginx 层添加 Basic Auth，或者在项目中集成：
- JWT 认证
- OAuth 登录
- 手机号验证码登录

### Q: 如何限制 API 调用次数？
A: 在 Nginx 配置 rate limit，或在项目中添加 rate limit 中间件。

---

## 📚 更多文档

- **API 完整文档**：查看 `API_INTEGRATION.md`
- **前端组件示例**：查看 `web/src/pages/` 目录
- **后端接口实现**：查看 `src/routes/api.ts`

---

## 🎉 开始使用！

现在你有了一个完整的视频 AI 总结服务，支持：

✅ 抖音视频总结
✅ 小红书视频总结
✅ B站视频总结
✅ 小宇宙播客总结
✅ YouTube 视频总结
✅ 1000+ 其他网站

**开始你的第一个视频总结吧！** 🚀
