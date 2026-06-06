/** Express routes – config, library, summarize, export */

import { Router, Request, Response } from 'express';
import crypto from 'crypto';
import fs from 'fs';
import path from 'path';
import { DataStore, LibraryItem } from '../data/store';
import { extractVideoId, fetchVideoInfo, fetchSubtitles, subtitlesToText, segmentsToParagraphs, parseSessdata, SubtitleSegment, fetchPageList } from '../bilibili/api';
import { summarizeText, summarizeFromMetadata, suggestTags, SummaryMode } from '../llm/summarize';
import { transcribeBilibiliAudio } from '../whisper/transcribe';

function nowIso(): string {
  return new Date().toISOString().slice(0, 19).replace('T', 'T');
}

function parseTags(raw: unknown): string[] {
  if (Array.isArray(raw)) return raw.map(String).filter(Boolean);
  return String(raw ?? '')
    .split(/[,，\s#]+/)
    .map((s) => s.trim())
    .filter(Boolean);
}

function slugify(text: string): string {
  return text.replace(/[\\/:*?"<>|\r\n]+/g, '_').replace(/\s+/g, ' ').trim().slice(0, 80) || 'summary';
}

function yamlString(value: unknown): string {
  return JSON.stringify(String(value ?? ''));
}

function yamlList(values: string[]): string {
  if (!values.length) return '[]';
  return `\n${values.map((value) => `  - ${yamlString(value)}`).join('\n')}`;
}

function formatDuration(seconds: number): string {
  const total = Number(seconds || 0);
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = Math.floor(total % 60);
  return h ? `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}` : `${m}:${String(s).padStart(2, '0')}`;
}

function obsidianTags(tags: string[], category: string): string[] {
  const cleaned = [...tags, category]
    .map((tag) => String(tag || '').trim().replace(/^#/, '').replace(/\s+/g, '-'))
    .filter(Boolean);
  return [...new Set(['bilibili', 'video-summary', ...cleaned])];
}

function itemToMarkdown(item: LibraryItem): string {
  const tags = obsidianTags(item.tags, item.category);
  const parts = [
    '---',
    `title: ${yamlString(item.title)}`,
    `author: ${yamlString(item.author)}`,
    `site: ${yamlString('Bilibili')}`,
    `bvid: ${yamlString(item.bvid)}`,
    `duration: ${yamlString(formatDuration(item.duration))}`,
    `category: ${yamlString(item.category)}`,
    `summary_mode: ${yamlString(item.mode)}`,
    `subtitle_count: ${Number(item.subtitle_count || 0)}`,
    `created: ${yamlString(item.created_at)}`,
    `updated: ${yamlString(item.updated_at)}`,
    `tags: ${yamlList(tags)}`,
    '---',
    '',
    `# ${item.title}`,
    '',
    '## AI 总结',
    '',
    item.summary,
  ];
  if (item.link) parts.push('', '---', '', '视频链接：' + item.link);
  if (item.notes) parts.push('', '## 我的笔记', '', item.notes);

  return parts.filter((part, index, all) => part !== '' || all[index - 1] !== '').join('\n').trim() + '\n';
}

function escapeHtml(text: string): string {
  return String(text ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function markdownToHtml(md: string): string {
  let html = escapeHtml(md || '');
  html = html
    .replace(/^### (.+)$/gm, '<h3>$1</h3>')
    .replace(/^## (.+)$/gm, '<h2>$1</h2>')
    .replace(/^# (.+)$/gm, '<h2>$1</h2>')
    .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
    .replace(/`([^`]+)`/g, '<code>$1</code>')
    .replace(/^- (.+)$/gm, '<li>$1</li>')
    .replace(/((?:<li>.*<\/li>\n?)+)/g, '<ul>$1</ul>')
    .replace(/\n{2,}/g, '</p><p>')
    .replace(/\n/g, '<br>');
  return '<p>' + html + '</p>';
}
function itemToPrintableHtml(item: LibraryItem): string {
  const tagPills = item.tags.map((t) => `<span class="tag">#${escapeHtml(t)}</span>`).join('');
  const meta = [
    item.author ? `UP主: ${escapeHtml(item.author)}` : '',
    item.duration ? `时长: ${escapeHtml(formatDuration(item.duration))}` : '',
    item.category ? `分类: ${escapeHtml(item.category)}` : '',
    item.created_at ? `保存: ${escapeHtml(item.created_at)}` : '',
  ].filter(Boolean).join(' · ');
  const videoLinkBlock = item.link ? '<p style="margin-top:12px"><a href="' + escapeHtml(item.link) + '" target="_blank">🎬 打开原视频 →</a></p>' : '';
  const notesBlock = item.notes ? `<h2>我的笔记</h2>${markdownToHtml(item.notes)}` : '';
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
  .transcript { font-size: 13px; color: #333; background: #fafbfd; border: 1px solid #e5e9f2; padding: 14px 16px; border-radius: 6px; }
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
  ${tagPills ? `<div class="tags">${tagPills}</div>` : ''}
  ${videoLinkBlock}
</header>
<section>
  <h2>AI 总结</h2>
  ${markdownToHtml(item.summary)}
</section>
<script>window.addEventListener('load', () => setTimeout(() => window.print(), 250));</script>
</body>
</html>`;
}

function resolveObsidianTarget(vaultPath: string, folder: string, filename: string): string {
  const root = path.resolve(vaultPath);
  const relativeFolder = String(folder || '')
    .split(/[\\/]+/)
    .map((part) => slugify(part))
    .filter(Boolean)
    .join(path.sep);
  const targetDir = path.resolve(root, relativeFolder);
  const targetFile = path.resolve(targetDir, filename);
  if (targetFile !== root && !targetFile.startsWith(root + path.sep)) {
    throw new Error('Obsidian 导出路径不安全');
  }
  return targetFile;
}

function findVaultRoot(startPath: string): string | null {
  let current = path.resolve(startPath);
  for (let i = 0; i < 16; i++) {
    if (fs.existsSync(path.join(current, '.obsidian'))) return current;
    const parent = path.dirname(current);
    if (!parent || parent === current) return null;
    current = parent;
  }
  return null;
}

export function createApiRouter(store: DataStore): Router {
  const router = Router();

  // ── Health ─────────────────────────────────────────────────────────
  router.get('/health', (_req, res) => res.json({ ok: true }));

  // ── Config ─────────────────────────────────────────────────────────
  router.get('/api/config', (_req, res) => res.json({ success: true, config: store.loadConfig() }));

  router.post('/api/config', (req: Request, res: Response) => {
    const cfg = store.saveConfig(req.body);
    res.json({ success: true, config: cfg });
  });

  // ── Summarize ──────────────────────────────────────────────────────
  router.post('/api/summarize', async (req: Request, res: Response) => {
    try {
      const config = store.loadConfig();
      const url = String(req.body.url ?? '').trim();
      const apiKey = String(req.body.api_key ?? config.api_key).trim();
      const sessdata = String(req.body.bili_sessdata ?? config.bili_sessdata).trim();
      const model = String(req.body.model ?? config.model).trim() || 'deepseek-chat';
      const baseUrl = String(req.body.base_url ?? config.base_url).trim() || 'https://api.deepseek.com/v1';
      const mode = (String(req.body.mode ?? 'brief').trim() || 'brief') as SummaryMode;

      if (!url) { res.json({ success: false, error: '请输入视频链接' }); return; }
      if (!apiKey) { res.json({ success: false, error: '请先在设置里填写 DeepSeek API Key' }); return; }

      const videoId = await extractVideoId(url);
      const cookies = sessdata ? parseSessdata(sessdata) : undefined;
      const info = await fetchVideoInfo(videoId, cookies);
      const bvid = info.bvid;
      const cid = info.cid;
      // Try to get correct CID from page list (Bilibili view API sometimes returns wrong cid)
      const pages = await fetchPageList(bvid, cookies);
      const correctCid = pages.length && pages[0].cid ? pages[0].cid : cid;
      if (correctCid !== cid) console.log('[cid] pagelist cid=%d differs from view cid=%d, using pagelist', correctCid, cid);

      const useWhisper = ['1', 'true', 'yes', 'on'].includes(String(req.body.use_whisper ?? '').toLowerCase());
      const whisperApiKey = String(req.body.whisper_api_key ?? config.whisper_api_key).trim();
      const whisperBaseUrl = String(req.body.whisper_base_url ?? config.whisper_base_url).trim() || 'https://api.siliconflow.cn/v1';
      const whisperModel = String(req.body.whisper_model ?? config.whisper_model).trim() || 'FunAudioLLM/SenseVoiceSmall';

      let subtitles: SubtitleSegment[] | null = correctCid ? await fetchSubtitles(bvid, correctCid, cookies) : null;
      let transcriptSource: 'bilibili' | 'whisper' | 'none' = subtitles && subtitles.length ? 'bilibili' : 'none';

      // When user explicitly enables Whisper, always prefer it over Bilibili subtitles
      // (Bilibili API sometimes returns subtitles from a different video due to wrong cid)
      if (useWhisper && whisperApiKey && correctCid) {
        if (subtitles && subtitles.length) {
          console.log('[whisper] Bilibili subtitles found (%d segs), but use_whisper=true, overriding with Whisper', subtitles.length);
        }
        try {
          const whisperResult = await transcribeBilibiliAudio(bvid, correctCid, cookies, { apiKey: whisperApiKey, baseUrl: whisperBaseUrl, model: whisperModel });
          if (whisperResult.segments.length) {
            subtitles = whisperResult.segments;
          } else if (whisperResult.text) {
            subtitles = [{ from: 0, to: info.duration, content: whisperResult.text }];
          }
          if (subtitles && subtitles.length) transcriptSource = 'whisper';
        } catch (e: any) {
          console.error('[whisper]', e);
          // Whisper failed — keep Bilibili subtitles if we had them
          if (subtitles && subtitles.length) transcriptSource = 'bilibili';
        }
      }

      const transcript = subtitles ? segmentsToParagraphs(subtitles).map(p => p.content).join('\n\n') : '';
      const subtitleSegments = subtitles
        ? subtitles.filter((s) => s.content?.trim()).map((s) => ({ from: s.from, to: s.to, content: s.content.trim() }))
        : [];

      let summary: string;
      const llmConfig = { apiKey, baseUrl, model };

      if (subtitles && transcript) {
        summary = await summarizeText(transcript, llmConfig, mode);
        if (transcriptSource === 'whisper') {
          summary += '\n\n> 本总结基于 Whisper 语音转写生成。';
        }
      } else {
        summary = await summarizeFromMetadata(info.title, info.author, info.desc, llmConfig, mode);
        summary += '\n\n> 未获取到字幕，以上内容基于视频标题、UP主和简介生成，准确度会低一些。';
        if (!cookies) summary += '\n\n> 如果想得到更完整的总结，请在设置中填写 B站 SESSDATA。';
        if (!useWhisper) summary += '\n\n> 点击“开始总结”时勾选“语音转写”可以调用 Whisper 生成完整总结。';
        else if (!whisperApiKey) summary += '\n\n> 请在设置中填写 Whisper API Key。';
      }

      res.json({
        success: true,
        video: { title: info.title, author: info.author, duration: info.duration, bvid, link: `https://www.bilibili.com/video/${bvid}`, pic: info.pic },
        subtitle_count: subtitles?.length ?? 0,
        transcript_source: transcriptSource,
        subtitle_segments: subtitleSegments,
        transcript,
        summary,
        mode,
        suggested_tags: await suggestTags(info.title, info.author, summary, llmConfig),
      });
    } catch (err: any) {
      console.error('[summarize]', err);
      res.json({ success: false, error: err.message || String(err) });
    }
  });

  // ── Library CRUD ───────────────────────────────────────────────────
  router.get('/api/library', (req: Request, res: Response) => {
    const all = store.loadLibrary();
    let items = [...all];
    const keyword = String(req.query.q ?? '').trim().toLowerCase();
    const category = String(req.query.category ?? '').trim();
    const tag = String(req.query.tag ?? '').trim();
    if (keyword) {
      items = items.filter((item) => {
        const blob = [item.title, item.author, item.summary, item.transcript, item.notes, ...item.tags, item.category].join(' ').toLowerCase();
        return blob.includes(keyword);
      });
    }
    if (category) items = items.filter((i) => i.category === category);
    if (tag) items = items.filter((i) => i.tags.includes(tag));
    items.sort((a, b) => b.created_at.localeCompare(a.created_at));
    const categories = [...new Set(all.map((i) => i.category).filter(Boolean))].sort();
    const tags = [...new Set(all.flatMap((i) => i.tags))].sort();
    res.json({ success: true, items, categories, tags });
  });

  router.get('/api/library/:id', (req: Request, res: Response) => {
    const item = store.loadLibrary().find((i) => i.id === req.params.id);
    if (!item) { res.json({ success: false, error: '未找到收藏' }); return; }
    res.json({ success: true, item });
  });

  router.post('/api/library', (req: Request, res: Response) => {
    const video = req.body.video ?? {};
    const summary = String(req.body.summary ?? '').trim();
    if (!video || !summary) { res.json({ success: false, error: '缺少视频信息或总结内容' }); return; }

    const items = store.loadLibrary();
    const itemId = String(req.body.id || crypto.randomUUID());
    const existing = items.find((i) => i.id === itemId);
    const now = nowIso();

    const item: LibraryItem = {
      id: itemId,
      created_at: existing?.created_at ?? now,
      updated_at: now,
      title: video.title ?? '未知',
      author: video.author ?? '未知',
      duration: video.duration ?? 0,
      bvid: video.bvid ?? '',
      link: video.link ?? '',
      summary,
      transcript: String(req.body.transcript ?? '').trim(),
      subtitle_count: Number(req.body.subtitle_count ?? 0) || 0,
      category: String(req.body.category ?? '待整理').trim() || '待整理',
      tags: parseTags(req.body.tags),
      notes: String(req.body.notes ?? '').trim(),
      mode: String(req.body.mode ?? 'brief').trim() || 'brief',
    };

    if (existing) {
      Object.assign(existing, item);
    } else {
      items.push(item);
    }
    store.saveLibrary(items);
    res.json({ success: true, item });
  });

  // ── Check if video is saved ─────────────────────────────────────────
  router.get('/api/library/check/:bvid', (req: Request, res: Response) => {
    const items = store.loadLibrary();
    const found = items.find((i) => i.bvid === req.params.bvid);
    res.json({ success: true, saved: !!found, item: found || undefined });
  });

  router.delete('/api/library/:id', (req: Request, res: Response) => {
    const items = store.loadLibrary();
    const kept = items.filter((i) => i.id !== req.params.id);
    if (kept.length === items.length) { res.json({ success: false, error: '未找到收藏' }); return; }
    store.saveLibrary(kept);
    res.json({ success: true });
  });

  // ── Export PDF (通过浏览器打印另存) ────────────────────
  router.get('/api/export/:id.pdf', (req: Request, res: Response) => {
    const item = store.loadLibrary().find((i) => i.id === req.params.id);
    if (!item) { res.status(404).send('未找到收藏'); return; }
    const html = itemToPrintableHtml(item);
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    res.send(html);
  });

  // ── Export Markdown ────────────────────────────────────────────────
  router.get('/api/export/:id.md', (req: Request, res: Response) => {
    const item = store.loadLibrary().find((i) => i.id === req.params.id);
    if (!item) { res.status(404).json({ success: false, error: '未找到收藏' }); return; }
    const md = itemToMarkdown(item);
    const filename = slugify(item.title) + '.md';
    res.setHeader('Content-Type', 'text/markdown; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.send(md);
  });

  // ── Export to Obsidian vault ───────────────────────────────────────
  router.post('/api/export/:id/obsidian', (req: Request, res: Response) => {
    try {
      const item = store.loadLibrary().find((i) => i.id === req.params.id);
      if (!item) { res.status(404).json({ success: false, error: '未找到收藏' }); return; }
      const config = store.loadConfig();
      const rawPath = String(req.body?.vault_path ?? config.obsidian_vault_path ?? '').trim();
      const rawFolder = String(req.body?.folder ?? config.obsidian_folder ?? '').trim();
      const overwrite = Boolean(req.body?.overwrite);
      if (!rawPath) {
        res.status(400).json({ success: false, error: '请先在设置里填写 Obsidian Vault 路径' });
        return;
      }
      if (!fs.existsSync(rawPath) || !fs.statSync(rawPath).isDirectory()) {
        res.status(400).json({ success: false, error: 'Obsidian Vault 路径不存在或不是文件夹' });
        return;
      }
      const vaultRoot = findVaultRoot(rawPath);
      if (!vaultRoot) {
        res.status(400).json({ success: false, error: '未找到 .obsidian 目录。请确认路径属于一个 Obsidian Vault（向上 16 层内含 .obsidian 文件夹）。' });
        return;
      }
      const resolvedPath = path.resolve(rawPath);
      let relativeFolder: string;
      if (resolvedPath === vaultRoot) {
        relativeFolder = rawFolder.split(/[\\/]+/).map(slugify).filter(Boolean).join('/');
      } else {
        relativeFolder = path.relative(vaultRoot, resolvedPath).split(path.sep).join('/');
      }
      const filename = slugify(item.title) + '.md';
      const fileInVault = relativeFolder ? relativeFolder + '/' + filename : filename;
      const targetFile = path.resolve(vaultRoot, fileInVault);
      if (targetFile !== vaultRoot && !targetFile.startsWith(vaultRoot + path.sep)) {
        res.status(400).json({ success: false, error: 'Obsidian 导出路径不安全' });
        return;
      }
      if (!overwrite && fs.existsSync(targetFile)) {
        res.status(409).json({ success: false, error: 'already_exists', file: targetFile });
        return;
      }
      fs.mkdirSync(path.dirname(targetFile), { recursive: true });
      fs.writeFileSync(targetFile, itemToMarkdown(item), 'utf-8');
      const vaultName = path.basename(vaultRoot);
      const obsidianUri = `obsidian://open?vault=${encodeURIComponent(vaultName)}&file=${encodeURIComponent(fileInVault.replace(/\.md$/i, ''))}`;
      res.json({ success: true, file: targetFile, vault: vaultName, relative: fileInVault, obsidian_uri: obsidianUri });
    } catch (err: any) {
      console.error('[export/obsidian]', err);
      res.status(500).json({ success: false, error: err.message || String(err) });
    }
  });

  return router;
}

