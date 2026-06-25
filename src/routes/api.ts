/** Express routes – config, library, export */

import { Router, Request, Response } from "express";
import crypto from "crypto";
import https from "https";
import http from "http";
import { URL } from "url";
import Database from "better-sqlite3";
import { isYtDlpAvailable, getYtDlpVersion } from "../common/YtDlpExtractor";
import {
  getPublicConfig,
  getDecryptedConfig,
  saveConfig as saveUserConfig,
} from "../db/configStore";
import {
  queryLibrary,
  findLibraryItem,
  findLibraryItemByBvid,
  saveLibraryItem,
  deleteLibraryItem,
} from "../db/libraryStore";
import { chatCompletion, suggestTags } from "../llm/summarize";
import { enforceRateLimit } from "../common/rateLimit";

function nowIso(): string {
  return new Date().toISOString().slice(0, 19).replace("T", "T");
}

function slugify(text: string): string {
  return text.replace(/[\\/:*?"<>|\r\n]+/g, "_").replace(/\s+/g, " ").trim().slice(0, 80) || "summary";
}

// RFC 5987-compliant Content-Disposition value. Node refuses non latin-1 in
// header values, so we keep a plain ASCII fallback in `filename=` and put the
// real (possibly non-ASCII) name in `filename*=UTF-8''<percent-encoded>`.
function contentDisposition(name: string): string {
  const asciiFallback = name.replace(/[^\x20-\x7e]+/g, "_") || "download";
  const encoded = encodeURIComponent(name).replace(/['()]/g, escape).replace(/\*/g, "%2A");
  return `attachment; filename="${asciiFallback}"; filename*=UTF-8''${encoded}`;
}

function escapeHtml(text: string): string {
  return String(text ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function markdownToHtml(md: string): string {
  let html = escapeHtml(md || "");
  html = html
    .replace(/^### (.+)$/gm, "<h3>$1</h3>")
    .replace(/^## (.+)$/gm, "<h2>$1</h2>")
    .replace(/^# (.+)$/gm, "<h2>$1</h2>")
    .replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>")
    .replace(/`([^`]+)`/g, "<code>$1</code>")
    .replace(/^- (.+)$/gm, "<li>$1</li>")
    .replace(/((?:<li>.*<\/li>\n?)+)/g, "<ul>$1</ul>")
    .replace(/\n{2,}/g, "</p><p>")
    .replace(/\n/g, "<br>");
  return "<p>" + html + "</p>";
}

function formatDuration(seconds: number): string {
  seconds = Number(seconds || 0);
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = seconds % 60;
  return h ? `${h}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}` : `${m}:${String(s).padStart(2, "0")}`;
}

function formatDate(value: string): string {
  if (!value) return "";
  return String(value).replace("T", " ").slice(0, 16);
}

function isAllowedAudioProxyUrl(rawUrl: string): boolean {
  let parsed: URL;
  try {
    parsed = new URL(rawUrl);
  } catch {
    return false;
  }

  if (parsed.protocol !== "https:") return false;
  const host = parsed.hostname.toLowerCase();
  return host === "media.xyzcdn.net" || host.endsWith(".media.xyzcdn.net");
}

function yamlString(value: unknown): string {
  const s = String(value ?? "");
  if (typeof value === "number" || (typeof value === "string" && /^\-?\d+(\.\d+)?$/.test(s))) return s;
  if (typeof value === "boolean") return s;
 let escaped = s.replace(/\\/g, "\\\\").replace(/"/g, '\\"');
 // Replace control characters that would break YAML double-quoted strings
 escaped = escaped.replace(/[\x00-\x08\x0b\x0c\x0e-\x1f\x7f]/g, "");
 return '"' + escaped + '"';
}

   function yamlList(items: string[]): string {
     return "\n" + items.filter(Boolean).map((i) => `  - ${yamlString(i)}`).join("\n");
   }

function obsidianTags(tags: string[], category: string): string[] {
  const cleaned = [...tags, category]
    .map((tag) => String(tag || "").trim().replace(/^#/, "").replace(/\s+/g, "-"))
    .filter(Boolean);
  return [...new Set(["bilibili", "video-summary", ...cleaned])];
}

function itemToMarkdown(item: any): string {
  const tags = obsidianTags(item.tags || [], item.category || "");
   const parts = [
     "---",
     `title: ${yamlString(item.title)}`,
     `source: ${yamlString(item.link || "")}`,
     `author: ${yamlString(item.author)}`,
    `site: ${yamlString("Bilibili")}`,
    `bvid: ${yamlString(item.bvid)}`,
    `duration: ${yamlString(formatDuration(item.duration))}`,
    `category: ${yamlString(item.category)}`,
    `summary_mode: ${yamlString(item.mode)}`,
    `subtitle_count: ${Number(item.subtitle_count || 0)}`,
    `created: ${yamlString(item.created_at)}`,
    `updated: ${yamlString(item.updated_at)}`,
     `tags:${yamlList(tags)}`,
    "---",
   "",
   `# ${item.title}`,
   "",
  "> [!info] Source",
  `> - UP主: ${item.author || ""}`,
  `> - 原视频: ${item.link || ""}`,
  `> - 时长: ${formatDuration(item.duration)}`,
  `> - 分类: ${item.category || ""}`,
  `> - 字幕条数: ${item.subtitle_count || 0}`,
   "",
   `![](https://player.bilibili.com/player.html?bvid=${item.bvid}&autoplay=0)`,
   "",
  "## AI 总结",
    "",
    item.summary,
  ];
  if (item.notes) parts.push("", "## 我的笔记", "", item.notes);
  return parts.filter((part, index, all) => part !== "" || all[index - 1] !== "").join("\n").trim() + "\n";
}

function itemToPrintableHtml(item: any): string {
  const tagPills = (item.tags || []).map((t: string) => `<span class="tag">#${escapeHtml(t)}</span>`).join("");
  const meta = [
    item.author ? `UP主: ${escapeHtml(item.author)}` : "",
    item.duration ? `时长: ${escapeHtml(formatDuration(item.duration))}` : "",
    item.category ? `分类: ${escapeHtml(item.category)}` : "",
    item.created_at ? `保存: ${escapeHtml(item.created_at)}` : "",
  ].filter(Boolean).join(" · ");
  const notesBlock = item.notes ? `<h2>我的笔记</h2>${markdownToHtml(item.notes)}` : "";
  const videoLinkBlock = item.link ? `<p style="margin-top:12px"><a href="${escapeHtml(item.link)}" target="_blank">?? 打开原视频 →</a></p>` : "";
  return `<!DOCTYPE html>
<html lang="zh-CN">
<head>
<meta charset="UTF-8">
<title>${escapeHtml(item.title)}</title>
<style>
  @page { size: A4; margin: 18mm 16mm; }
  * { box-sizing: border-box; }
  body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", "PingFang SC", "Microsoft YaHei", sans-serif; color: #1a2030; line-height: 1.75; margin: 24px auto; max-width: 760px; padding: 0 24px; }
  header { border-bottom: 2px solid #111; padding-bottom: 16px; margin-bottom: 24px; }
  h1 { font-size: 26px; margin: 0 0 10px; line-height: 1.35; }
  .meta { color: #555; font-size: 13px; }
  .tags { margin-top: 10px; }
  .tag { display: inline-block; font-size: 12px; padding: 2px 8px; border-radius: 999px; background: #f0f3f9; color: #1d4ed8; margin-right: 6px; }
  h2 { font-size: 18px; margin: 28px 0 10px; border-left: 4px solid #fb7299; padding-left: 10px; }
  h3 { font-size: 15px; margin: 18px 0 8px; }
  p { margin: 8px 0; }
  ul { padding-left: 22px; }
  code { background: #f1f5f9; padding: 1px 5px; border-radius: 4px; font-size: 90%; }
  .toolbar { position: fixed; top: 14px; right: 14px; display: flex; gap: 8px; }
  .toolbar button { padding: 8px 14px; border: 0; border-radius: 6px; background: #fb7299; color: #fff; font-weight: 600; cursor: pointer; box-shadow: 0 6px 16px rgba(251,114,153,.3); }
  @media print { .toolbar { display: none; } body { margin: 0; padding: 0; max-width: none; } }
</style>
</head>
<body>
<div class="toolbar"><button onclick="window.print()">另存为 PDF</button></div>
<header>
  <h1>${escapeHtml(item.title)}</h1>
  <div class="meta">${meta}</div>
  ${tagPills ? `<div class="tags">${tagPills}</div>` : ""}
  ${videoLinkBlock}
</header>
<section>
  <h2>AI 总结</h2>
  ${markdownToHtml(item.summary)}
</section>
${notesBlock ? `<section>${notesBlock}</section>` : ""}
<script>window.addEventListener("load", () => setTimeout(() => window.print(), 250));</script>
</body>
</html>`;
}

export function createApiRouter(db: Database.Database): Router {
  const router = Router();

  // ── Health ──────────────────────────────────────────────────────────
  router.get("/health", (_req, res) => res.json({ ok: true }));

  // ── Auth check (provides user info) ─────────────────────────────────
  function requireUser(req: Request, res: Response): number | null {
    const user = (req as any).user;
    if (!user) {
      res.status(401).json({ success: false, error: "请先登录" });
      return null;
    }
    return user.id;
  }

  // ── Config (public only) ────────────────────────────────────────────
  router.get("/api/config", (req: Request, res: Response) => {
    const userId = (req as any).user?.id;
    if (!userId) {
      // Return defaults for unauthenticated users
      res.json({
        success: true,
        config: {
          default_category: "待整理",
          deepseek_base_url: "https://api.deepseek.com/v1",
          deepseek_model: "deepseek-chat",
          whisper_base_url: "https://api.siliconflow.cn/v1",
          whisper_model: "FunAudioLLM/SenseVoiceSmall",
          obsidian_folder: "BiliStudy",
          obsidian_vault_name: "",
          api_key_set: false,
          whisper_api_key_set: false,
        },
      });
      return;
    }
    const pub = getPublicConfig(db, userId);
    res.json({ success: true, config: pub });
  });

  router.post("/api/config", (req: Request, res: Response) => {
    const userId = (req as any).user?.id;
    if (!userId) {
      res.status(401).json({ success: false, error: "请先登录" });
      return;
    }
    saveUserConfig(db, userId, req.body);
    const pub = getPublicConfig(db, userId);
    res.json({ success: true, config: pub });
  });

  router.post("/api/config/test-deepseek", async (req: Request, res: Response) => {
    const userId = requireUser(req, res);
    if (!userId) return;
    if (!enforceRateLimit(req, res, "test-deepseek", 10, 10 * 60 * 1000, String(userId))) return;

    const config = getDecryptedConfig(db, userId);
    const apiKey = String(req.body.api_key || config.api_key || "").trim();
    const baseUrl = String(req.body.base_url || config.deepseek_base_url || "https://api.deepseek.com/v1").replace(/\/+$/, "");
    const model = String(req.body.model || config.deepseek_model || "deepseek-chat").trim();
    if (!apiKey) { res.status(400).json({ success: false, error: "请先填写 DeepSeek API Key" }); return; }

    try {
      const r = await fetch(baseUrl + "/chat/completions", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
        body: JSON.stringify({ model, messages: [{ role: "user", content: "ping" }], max_tokens: 8 }),
      });
      if (!r.ok) {
        const text = await r.text().catch(() => r.statusText);
        res.status(400).json({ success: false, error: `连接失败 (${r.status}): ${text.slice(0, 200)}` });
        return;
      }
      res.json({ success: true });
    } catch (err: any) {
      res.status(400).json({ success: false, error: err.message || "连接失败" });
    }
  });

  router.post("/api/config/test-whisper", async (req: Request, res: Response) => {
    const userId = requireUser(req, res);
    if (!userId) return;
    if (!enforceRateLimit(req, res, "test-whisper", 10, 10 * 60 * 1000, String(userId))) return;

    const config = getDecryptedConfig(db, userId);
    const apiKey = String(req.body.whisper_api_key || config.whisper_api_key || "").trim();
    const baseUrl = String(req.body.whisper_base_url || config.whisper_base_url || "https://api.siliconflow.cn/v1").replace(/\/+$/, "");
    if (!apiKey) { res.status(400).json({ success: false, error: "请先填写 Whisper API Key" }); return; }

    try {
      const r = await fetch(baseUrl + "/models", { headers: { Authorization: `Bearer ${apiKey}` } });
      if (!r.ok) {
        const text = await r.text().catch(() => r.statusText);
        res.status(400).json({ success: false, error: `连接失败 (${r.status}): ${text.slice(0, 200)}` });
        return;
      }
      res.json({ success: true });
    } catch (err: any) {
      res.status(400).json({ success: false, error: err.message || "连接失败" });
    }
  });


  router.post("/api/llm/chat", async (req: Request, res: Response) => {
    const userId = requireUser(req, res);
    if (!userId) return;
    if (!enforceRateLimit(req, res, "llm-chat", 40, 60 * 60 * 1000, String(userId))) return;
    const question = String(req.body.question || "").trim().slice(0, 800);
    const summary = String(req.body.summary || "").slice(0, 6000);
    const transcript = String(req.body.transcript || "").slice(0, 8000);
    const segments = Array.isArray(req.body.segments) ? req.body.segments : [];
    if (!question) { res.status(400).json({ success: false, error: "缺少问题" }); return; }
    const config = getDecryptedConfig(db, userId);
    if (!config.api_key) { res.status(400).json({ success: false, error: "请先在设置中填写 API Key" }); return; }
    const qWords = question.toLowerCase().split(/\s+|，|。|、|？|！|,|\./).filter(Boolean);
    const citations = segments
      .map((seg: any) => {
        const text = String(seg.content || "");
        const score = qWords.reduce((n, w) => n + (text.toLowerCase().includes(w) ? 1 : 0), 0);
        return { time: Number(seg.from || 0), text: text.slice(0, 120), score };
      })
      .filter((x: any) => x.text)
      .sort((a: any, b: any) => b.score - a.score || a.time - b.time)
      .slice(0, 3)
      .map(({ time, text }: any) => ({ time, text }));
    try {
      const answer = await chatCompletion(
        { apiKey: config.api_key, baseUrl: config.deepseek_base_url, model: config.deepseek_model },
        [
          { role: "system", content: "你是视频学习助手。只能基于用户提供的视频总结、字幕和引用回答；如果信息不足，请明确说明。回答中文，结构清晰，必要时引用时间戳。" },
          { role: "user", content: `问题：${question}\n\n视频总结：\n${summary}\n\n相关字幕引用：\n${citations.map((c: any) => `[${Math.floor(c.time)}s] ${c.text}`).join("\n")}\n\n完整文本摘录：\n${transcript.slice(0, 4000)}` },
        ],
        900,
      );
      res.json({ success: true, answer, citations });
    } catch (err: any) {
      res.status(500).json({ success: false, error: err.message || "问答失败" });
    }
  });

  router.post("/api/llm/rewrite", async (req: Request, res: Response) => {
    const userId = requireUser(req, res);
    if (!userId) return;
    if (!enforceRateLimit(req, res, "llm-rewrite", 30, 60 * 60 * 1000, String(userId))) return;
    const platform = String(req.body.platform || "小红书").trim().slice(0, 20);
    const summary = String(req.body.summary || "").trim().slice(0, 8000);
    const keyPoints = Array.isArray(req.body.keyPoints) ? req.body.keyPoints.map(String).slice(0, 8) : [];
    if (!summary) { res.status(400).json({ success: false, error: "缺少总结内容" }); return; }
    const config = getDecryptedConfig(db, userId);
    if (!config.api_key) { res.status(400).json({ success: false, error: "请先在设置中填写 API Key" }); return; }
    const styleMap: Record<string, string> = {
      "公众号": "写成公众号文章，标题吸引人，结构完整，分节清晰。",
      "小红书": "写成小红书笔记，口语化，emoji 适量，标题吸睛，要点短。",
      "微博": "写成微博长文，观点鲜明，适合转发，尽量精炼。",
      "博客": "写成博客文章，逻辑严谨，适合知识沉淀。",
    };
    try {
      const text = await chatCompletion(
        { apiKey: config.api_key, baseUrl: config.deepseek_base_url, model: config.deepseek_model },
        [
          { role: "system", content: "你是内容改写助手。只基于提供的视频总结改写，不编造事实。" },
          { role: "user", content: `目标平台：${platform}\n风格要求：${styleMap[platform] || styleMap["小红书"]}\n\n核心要点：\n${keyPoints.map((p: string, i: number) => `${i + 1}. ${p}`).join("\n")}\n\n原始总结：\n${summary}` },
        ],
        1600,
      );
      res.json({ success: true, text });
    } catch (err: any) {
      res.status(500).json({ success: false, error: err.message || "改写失败" });
    }
  });

  // Check yt-dlp availability
  router.get("/api/yt-dlp/status", async (req: Request, res: Response) => {
    try {
      const available = await isYtDlpAvailable();
      const version = await getYtDlpVersion();
      res.json({
        success: true,
        available,
        version,
        supports: ["抖音", "小红书", "B站", "YouTube", "小宇宙", "1000+ 其他网站"],
      });
    } catch (error: any) {
      res.json({
        success: false,
        error: error.message,
      });
    }
  });

  router.post("/api/suggest-tags", async (req: Request, res: Response) => {
    const userId = requireUser(req, res);
    if (!userId) return;

    if (!enforceRateLimit(req, res, "suggest-tags", 30, 60 * 60 * 1000, String(userId))) return;

    const title = String(req.body.title ?? "").trim().slice(0, 200);
    const author = String(req.body.author ?? "").trim().slice(0, 100);
    const summary = String(req.body.summary ?? "").trim().slice(0, 8000);
    if (!title && !summary) {
      res.status(400).json({ success: false, error: "缺少标题或总结内容" });
      return;
    }

    const config = getDecryptedConfig(db, userId);
    if (!config.api_key) {
      res.status(400).json({ success: false, error: "请先在设置中填写 API Key" });
      return;
    }

    try {
      const tags = await suggestTags(title, author, summary, {
        apiKey: config.api_key,
        baseUrl: config.deepseek_base_url,
        model: config.deepseek_model,
      });
      res.json({ success: true, tags });
    } catch (err: any) {
      res.status(500).json({ success: false, error: err.message || String(err) });
    }
  });

  // ── Library ─────────────────────────────────────────────────────────
  router.get("/api/library", (req: Request, res: Response) => {
    const userId = (req as any).user?.id;
    if (!userId) {
      res.json({ success: true, items: [], categories: [], tags: [], total: 0, page: 1, page_size: 20 });
      return;
    }

    const page = Math.max(1, parseInt(String(req.query.page || "1"), 10) || 1);
    const pageSize = Math.min(100, Math.max(1, parseInt(String(req.query.page_size || "20"), 10) || 20));
    const result = queryLibrary(db, userId, {
      q: String(req.query.q || "").trim(),
      category: String(req.query.category || "").trim(),
      tag: String(req.query.tag || "").trim(),
      sort: String(req.query.sort || "updated_desc"),
      page,
      pageSize,
    });

    res.json({
      success: true,
      items: result.items,
      categories: result.categories,
      tags: result.tags,
      total: result.total,
      page: result.page,
      page_size: result.pageSize,
    });
  });

  router.get("/api/library/check/:bvid", (req: Request, res: Response) => {
    const userId = (req as any).user?.id;
    if (!userId) {
      res.json({ success: true, saved: false });
      return;
    }
    const found = findLibraryItemByBvid(db, userId, req.params.bvid);
    res.json({ success: true, saved: !!found, item: found || undefined });
  });

  router.get("/api/library/:id", (req: Request, res: Response) => {
    const userId = (req as any).user?.id;
    if (!userId) { res.status(401).json({ success: false, error: "请先登录" }); return; }
    const item = findLibraryItem(db, userId, req.params.id);
    if (!item) { res.json({ success: false, error: "未找到收藏" }); return; }
    res.json({ success: true, item });
  });

  router.post("/api/library", (req: Request, res: Response) => {
    const userId = (req as any).user?.id;
    if (!userId) { res.status(401).json({ success: false, error: "请先登录" }); return; }

    const video = req.body.video ?? {};
    const summary = String(req.body.summary ?? "").trim();
    if (!video || !summary) { res.json({ success: false, error: "缺少视频信息或总结内容" }); return; }

    const item = saveLibraryItem(db, userId, {
      id: req.body.id,
      title: video.title,
      author: video.author,
      duration: video.duration,
      bvid: video.bvid,
      link: video.link,
      pic: video.pic,
      summary,
      transcript: String(req.body.transcript ?? "").trim(),
      subtitle_count: Number(req.body.subtitle_count ?? 0) || 0,
      category: String(req.body.category ?? "待整理").trim() || "待整理",
      tags: Array.isArray(req.body.tags) ? req.body.tags : [],
      notes: String(req.body.notes ?? "").trim(),
      mode: String(req.body.mode ?? "brief").trim() || "brief",
    });

    res.json({ success: true, item });
  });

  router.delete("/api/library/:id", (req: Request, res: Response) => {
    const userId = (req as any).user?.id;
    if (!userId) { res.status(401).json({ success: false, error: "请先登录" }); return; }
    const ok = deleteLibraryItem(db, userId, req.params.id);
    res.json({ success: ok, error: ok ? undefined : "未找到收藏" });
  });

  // ── Export ───────────────────────────────────────────────────────────
  router.get("/api/export/:id.pdf", (req: Request, res: Response) => {
    const userId = (req as any).user?.id;
    if (!userId) { res.status(401).send("请先登录"); return; }
    const item = findLibraryItem(db, userId, req.params.id);
    if (!item) { res.status(404).send("未找到收藏"); return; }
    const html = itemToPrintableHtml(item);
    res.setHeader("Content-Type", "text/html; charset=utf-8");
    res.send(html);
  });

  router.get("/api/export/:id.md", (req: Request, res: Response) => {
    const userId = (req as any).user?.id;
    if (!userId) { res.status(401).json({ success: false, error: "请先登录" }); return; }
    const item = findLibraryItem(db, userId, req.params.id);
    if (!item) { res.status(404).json({ success: false, error: "未找到收藏" }); return; }
    const md = itemToMarkdown(item);
    const filename = slugify(item.title) + ".md";
    res.setHeader("Content-Type", "text/markdown; charset=utf-8");
    res.setHeader("Content-Disposition", contentDisposition(filename));
    res.send(md);
  });

  // ── Obsidian payload (browser-side URI launch / Web Clipper style) ─
  router.get("/api/export/:id/obsidian-payload", (req: Request, res: Response) => {
    const userId = (req as any).user?.id;
    if (!userId) { res.status(401).json({ success: false, error: "请先登录" }); return; }
    const item = findLibraryItem(db, userId, req.params.id);
    if (!item) { res.status(404).json({ success: false, error: "未找到收藏" }); return; }
    const md = itemToMarkdown(item);
    const config = getDecryptedConfig(db, userId);
    const folder = String(config.obsidian_folder ?? "BiliStudy").trim();
    const name = slugify(item.title);
    const relativePath = (folder ? folder.replace(/[\\/]+$/, "") + "/" : "") + name;
    res.json({
      success: true,
      title: item.title,
      name,
      folder,
      relative_path: relativePath,
      vault_name: config.obsidian_vault_name || "",
      markdown: md,
    });
  });

  // ── Audio proxy for Xiaoyuzhou podcast (bypasses CORS / Referer restriction) ─
  router.get("/api/proxy/audio", async (req: Request, res: Response) => {
    const userId = requireUser(req, res);
    if (!userId) return;
    if (!enforceRateLimit(req, res, "proxy-audio", 120, 10 * 60 * 1000, String(userId))) return;

    const url = String(req.query.url || "").trim();
    if (!url) {
      res.status(400).json({ success: false, error: "缺少音频URL" });
      return;
    }
    if (!isAllowedAudioProxyUrl(url)) {
      res.status(400).json({ success: false, error: "不支持的音频来源" });
      return;
    }

    try {
      const audioRes = await fetch(url, {
        headers: {
          "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
          "Referer": "https://www.xiaoyuzhoufm.com/",
          "Range": req.headers.range || "bytes=0-",
        },
      });

      if (!audioRes.ok) {
        console.error("[Audio proxy] Failed to fetch audio:", audioRes.status, url);
        res.status(audioRes.status).json({ success: false, error: "音频获取失败: " + audioRes.statusText });
        return;
      }

      // Set response headers
      res.status(audioRes.status === 206 ? 206 : 200);

      const forwardHeaders = [
        "content-type",
        "content-length",
        "content-range",
        "accept-ranges",
        "cache-control",
        "etag",
        "last-modified",
      ];
      forwardHeaders.forEach((h) => {
        const val = audioRes.headers.get(h);
        if (val) res.setHeader(h, val);
      });

      // CORS headers
      res.setHeader("Access-Control-Allow-Origin", "*");
      res.setHeader("Access-Control-Allow-Methods", "GET, HEAD, OPTIONS");
      res.setHeader("Access-Control-Allow-Headers", "Range");

      // Stream the audio
      const reader = audioRes.body?.getReader();
      if (reader) {
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          res.write(value);
        }
      }
      res.end();
    } catch (err: any) {
      console.error("[Audio proxy error]", err.message, url);
      if (!res.headersSent) {
        res.status(500).json({ success: false, error: "音频代理失败: " + err.message });
      }
    }
  });

  return router;
}
