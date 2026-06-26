<p align="center">
  <img src="assets/bilistudy-icon.svg" width="96" height="96" alt="BiliStudy icon" />
</p>

<h1 align="center">BiliStudy</h1>

<p align="center"><strong>把每一次观看，沉淀成长期学习。</strong></p>

<p align="center">从视频到知识，从总结到复习。</p>

---

BiliStudy 是一个视频 / 播客总结与学习库。输入 B 站、YouTube、小宇宙等音视频链接后，系统会自动获取字幕或音频内容，并通过 AI 生成学习总结、字幕整理、思维导图、对话问答与复习材料。

## 核心能力

- 视频 / 播客链接总结
- Whisper 音频转写
- AI 结构化总结与改写
- 字幕格式化与 Markdown 导出
- Markmap 图形化思维导图
- 收藏库全文搜索、标签管理和批量操作
- 学习路径、今日复习和 AI 测验
- 管理后台与 API usage 记录

## 品牌图标

项目图标位于：

```text
assets/bilistudy-icon.svg
```

网站 favicon 与品牌图标使用同一视觉系统：白色 canvas、黑色主轮廓、Mintlify mint green 强调色。

## 本地开发

```bash
npm install
npm run build
npm run build:web
```

开发环境启动前需要配置本地环境变量，例如：

```bash
ENCRYPTION_KEY=<32-byte-hex> SESSION_SECRET=local-dev-session-secret npm run dev
```
