# 抖音/小红书 API 集成指南

## 服务部署

### 1. 启动后端服务

```bash
# 安装依赖
npm install

# 配置环境变量（复制 .env.example）
cp .env.example .env

# 启动服务
npm run dev
```

服务默认运行在：`http://localhost:8080`

---

## API 接口列表

### 1. 检查可用工具
```http
GET /api/tools/status
```

**响应：**
```json
{
  "success": true,
  "tools": {
    "ytDlp": true,
    "lux": false
  },
  "installInstructions": "..."
}
```

---

### 2. 提交总结任务
```http
POST /api/tasks/summarize
Content-Type: application/json

{
  "url": "https://v.douyin.com/xxxxxx/",  // 抖音/小红书/B站链接
  "mode": "brief",                         // 总结模式
  "api_key": "your-openai-key",            // 可选
  "base_url": "https://api.openai.com/v1", // 可选
  "whisper_api_key": "your-whisper-key",   // 可选
  "whisper_base_url": "...",               // 可选
  "whisper_model": "FunAudioLLM/SenseVoiceSmall"
}
```

**响应：**
```json
{
  "success": true,
  "task_id": "uuid-string"
}
```

---

### 3. 查询任务进度（SSE 流式）
```http
GET /api/tasks/{task_id}/events
```

**事件类型：**
- `status` - 进度更新
- `complete` - 任务完成
- `error` - 任务失败

**前端使用示例：**
```javascript
const eventSource = new EventSource(`/api/tasks/${taskId}/events`);

eventSource.addEventListener('status', (e) => {
  const data = JSON.parse(e.data);
  console.log('进度:', data.progress);
});

eventSource.addEventListener('complete', (e) => {
  const result = JSON.parse(e.data);
  console.log('总结结果:', result);
  eventSource.close();
});

eventSource.addEventListener('error', (e) => {
  const error = JSON.parse(e.data);
  console.error('错误:', error);
  eventSource.close();
});
```

---

### 4. 保存到收藏库
```http
POST /api/library
Content-Type: application/json

{
  "video": {
    "title": "视频标题",
    "author": "作者",
    "duration": 120,
    "bvid": "视频URL或ID",
    "link": "原始链接",
    "pic": "封面图片URL"
  },
  "summary": "AI总结内容",
  "transcript": "完整转写文本",
  "mode": "brief",
  "category": "待整理",
  "tags": ["标签1", "标签2"],
  "notes": "我的笔记"
}
```

---

## 前端集成示例

### React 组件

```tsx
import { useState } from 'react';

interface SummarizeResult {
  type: 'bilibili' | 'douyin' | 'xiaohongshu' | 'xiaoyuzhou';
  video?: {
    title: string;
    author: string;
    duration: number;
    pic: string;
    link: string;
  };
  summary: string;
  transcript: string;
  subtitle_count: number;
}

export function VideoSummarizer() {
  const [url, setUrl] = useState('');
  const [loading, setLoading] = useState(false);
  const [progress, setProgress] = useState('');
  const [result, setResult] = useState<SummarizeResult | null>(null);

  async function handleSummarize() {
    setLoading(true);
    setProgress('提交中...');

    try {
      // 1. 创建任务
      const res = await fetch('/api/tasks/summarize', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url, mode: 'brief' }),
      });
      const data = await res.json();

      if (!data.success) {
        throw new Error(data.error || '提交失败');
      }

      // 2. 监听进度
      const eventSource = new EventSource(`/api/tasks/${data.task_id}/events`);

      eventSource.addEventListener('status', (e) => {
        const data = JSON.parse(e.data);
        setProgress(data.progress);
      });

      eventSource.addEventListener('complete', (e) => {
        const result = JSON.parse(e.data);
        setResult(result);
        setLoading(false);
        eventSource.close();
      });

      eventSource.addEventListener('error', (e) => {
        const error = JSON.parse(e.data);
        alert(error.error || '总结失败');
        setLoading(false);
        eventSource.close();
      });

    } catch (err: any) {
      alert(err.message);
      setLoading(false);
    }
  }

  return (
    <div className="max-w-4xl mx-auto p-6">
      <h1>视频/播客总结</h1>

      {/* 输入框 */}
      <div className="flex gap-3 mb-6">
        <input
          type="text"
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          placeholder="粘贴抖音/小红书/B站链接..."
          className="flex-1 px-4 py-2 border rounded"
        />
        <button
          onClick={handleSummarize}
          disabled={loading || !url}
          className="px-6 py-2 bg-blue-500 text-white rounded disabled:opacity-50"
        >
          {loading ? '总结中...' : '开始总结'}
        </button>
      </div>

      {/* 进度显示 */}
      {loading && (
        <div className="p-4 bg-blue-50 rounded mb-4">
          <p>{progress}</p>
        </div>
      )}

      {/* 结果展示 */}
      {result && (
        <div className="border rounded-lg overflow-hidden">
          {/* 视频信息 */}
          {result.video && (
            <div className="p-4 bg-gray-50 border-b">
              <img
                src={result.video.pic}
                alt="封面"
                className="w-full h-48 object-cover rounded mb-3"
              />
              <h2 className="text-xl font-bold">{result.video.title}</h2>
              <p className="text-gray-600">
                {result.video.author} · {Math.floor(result.video.duration / 60)}分钟
              </p>
            </div>
          )}

          {/* 总结内容 */}
          <div className="p-4">
            <h3 className="font-bold mb-2">AI 总结</h3>
            <div className="prose">{result.summary}</div>
          </div>

          {/* 转写文本 */}
          {result.transcript && (
            <div className="p-4 border-t">
              <h3 className="font-bold mb-2">完整转写</h3>
              <p className="text-gray-600 whitespace-pre-wrap">
                {result.transcript}
              </p>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
```

---

## 支持的 URL 格式

### 抖音
```
https://v.douyin.com/xxxxxx/       # 短链接
https://www.douyin.com/video/1234567890123456789  # 长链接
```

### 小红书
```
https://www.xiaohongshu.com/explore/xxxxxxxxxx  # 视频笔记
https://www.xiaohongshu.com/discovery/item/xxxxxx
```

### B站
```
https://www.bilibili.com/video/BVxxxxxx/
https://b23.tv/xxxxxx
```

### 小宇宙
```
https://www.xiaoyuzhoufm.com/episode/xxxxxx
```

---

## 生产环境部署

### 使用 Docker
```dockerfile
FROM node:20-alpine
WORKDIR /app
COPY package*.json ./
RUN npm ci --only=production
COPY . .
EXPOSE 8080
CMD ["npm", "start"]
```

### 使用 PM2
```bash
npm install -g pm2
pm2 start ecosystem.config.js
```

### Nginx 反向代理
```nginx
server {
    listen 80;
    server_name your-domain.com;

    location /api/ {
        proxy_pass http://localhost:8080;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;

        # SSE 支持
        proxy_http_version 1.1;
        proxy_set_header Connection '';
        proxy_buffering off;
        proxy_cache off;
    }

    # 前端静态文件
    location / {
        root /path/to/frontend/dist;
        try_files $uri $uri/ /index.html;
    }
}
```

---

## 环境变量配置

```env
# 服务端口
PORT=8080

# 加密密钥（重要！生产环境必须修改）
ENCRYPTION_KEY=your-secret-key-here

# 数据库路径
DATABASE_PATH=./data/bilistudy.db

# 默认 API 配置（可选，用户也可以在前端自行配置）
DEFAULT_API_KEY=
DEFAULT_BASE_URL=https://api.deepseek.com/v1
DEFAULT_MODEL=deepseek-chat

# Whisper 配置
WHISPER_API_KEY=
WHISPER_BASE_URL=https://api.siliconflow.cn/v1
WHISPER_MODEL=FunAudioLLM/SenseVoiceSmall
```

---

## 注意事项

1. **yt-dlp 依赖**：确保服务器上已安装 yt-dlp，否则抖音/小红书无法解析
2. **ffmpeg 依赖**：部分音频处理需要 ffmpeg
3. **代理配置**：如果服务器在国内，可能需要配置 GitHub 镜像来下载 yt-dlp
4. **并发限制**：建议配置任务队列并发数，避免资源耗尽
5. **缓存策略**：建议对已解析的视频进行缓存，避免重复请求

---

## 联系支持

如有问题，请查看：
- GitHub Issues
- 项目 README.md
