# 视频解析工具安装指南

## yt-dlp 下载方式

### 📦 方式一：手动下载（推荐）

由于网络原因，自动下载可能失败，请手动下载：

1. 访问 **yt-dlp 国内镜像下载站**：
   - https://mirror.ghproxy.com/https://github.com/yt-dlp/yt-dlp/releases/latest/download/yt-dlp.exe
   - https://gh.api.99988866.xyz/https://github.com/yt-dlp/yt-dlp/releases/latest/download/yt-dlp.exe

2. 将下载的 `yt-dlp.exe` 放到本目录（`tools/`）

### 📦 方式二：npm 全局安装

```bash
npm install -g yt-dlp
```

---

## lux 下载方式

1. 访问：https://github.com/iawia002/lux/releases
2. 下载 `lux_Windows_x86_64.zip`
3. 解压得到 `lux.exe` 放到本目录

---

## 验证安装

将 exe 文件放到 `tools/` 目录后，重启后端服务，然后访问：
```
http://localhost:8080/api/tools/status
```

如果显示 `"ytDlp": true` 说明安装成功！

---

## 支持的平台

| 平台 | yt-dlp | lux |
|------|--------|-----|
| Bilibili | ✅ | ✅ |
| 抖音 | ✅ | ✅ |
| 小红书 | ✅ | ✅ |
| 微信视频号 | ⚠️ | ❌ |
| YouTube | ✅ | ✅ |
| 其他 1000+ 网站 | ✅ | ❌ |
