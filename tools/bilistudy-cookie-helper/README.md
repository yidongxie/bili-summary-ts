# BiliStudy Cookie Helper

Chrome / Edge 本地扩展，用于把抖音/小红书 Cookies 导出为 yt-dlp 可用的 `cookies.txt`，并保存到 BiliStudy 设置。

## 安装

1. 打开 Chrome/Edge 扩展管理页：
   - Chrome: `chrome://extensions/`
   - Edge: `edge://extensions/`
2. 开启“开发者模式”。
3. 点击“加载已解压的扩展”。
4. 选择本目录：
   `tools/bilistudy-cookie-helper`

## 使用

1. 在同一个浏览器里打开并登录：
   - `https://www.douyin.com/`
   - 或 `https://www.xiaohongshu.com/`
2. 打开并登录你的 BiliStudy：
   - `https://xydong.site/`
3. 点击浏览器右上角的 BiliStudy Cookie Helper 图标。
4. 选择平台。
5. 点击“读取 Cookies”。
6. 点击“保存到 BiliStudy”。

扩展会调用 `https://xydong.site/api/config`，把 cookies 内容保存到你的账号配置。服务端会加密保存，并且只在调用 yt-dlp 时临时写入文件。

## 注意

- Cookies 等同于网页登录凭证，请勿分享给他人。
- 如果平台提示 Cookies 过期，重新读取并保存一次。
- 建议使用专门的小号浏览器账号导出平台 Cookies。
