/** Shared utilities used across route modules. */

import { formatDuration } from "../common/date";

// Re-export so existing callers of routes/utils keep working.
export { formatDuration };
export { isSafeUpstreamUrl } from "../common/urlSafety";

/** e.g. "2026-07-28 15:55:47" */
export function nowSql(): string {
  return new Date().toISOString().replace("T", " ").slice(0, 19);
}

export function slugify(text: string): string {
  return text.replace(/[\\/:*?"<>|\r\n]+/g, "_").replace(/\s+/g, " ").trim().slice(0, 80) || "summary";
}

/** RFC 5987-compliant Content-Disposition value. */
export function contentDisposition(name: string): string {
  const asciiFallback = name.replace(/[^\x20-\x7e]+/g, "_") || "download";
  const encoded = encodeURIComponent(name).replace(/['()]/g, escape).replace(/\*/g, "%2A");
  return `attachment; filename="${asciiFallback}"; filename*=UTF-8''${encoded}`;
}

export function escapeHtml(text: string): string {
  return String(text ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

export function markdownToHtml(md: string): string {
  let html = escapeHtml(md || "");
  // GFM tables — emit <table> directly with no inner newlines, so the
  // \n -> <br> pass below leaves the rows intact.
  html = html.replace(/(?:^|\n)(?:\|.*\|[^\n]*)(?:\n\|.*\|[^\n]*)*/g, (block) => {
    const lines = block.trim().split("\n").map((l) => l.trim());
    if (lines.length < 2) return block;
    if (!/^\|?[\s:|-]+\|[\s:|-]*$/.test(lines[1])) return block; // no delimiter row -> not a table
    const cells = (l: string) => l.replace(/^\|/, "").replace(/\|$/, "").split("|").map((c) => c.trim());
    const row = (r: string[], tag: string) => `<tr>${r.map((c) => `<${tag}>${c || "&nbsp;"}</${tag}>`).join("")}</tr>`;
    return `<table>${row(cells(lines[0]), "th")}${lines.slice(2).map((l) => row(cells(l), "td")).join("")}</table>`;
  });
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

export function formatDate(value: string): string {
  if (!value) return "";
  return String(value).replace("T", " ").slice(0, 16);
}

export function isAllowedAudioProxyUrl(rawUrl: string): boolean {
  let parsed: URL;
  try { parsed = new URL(rawUrl); } catch { return false; }
  if (parsed.protocol !== "https:") return false;
  const host = parsed.hostname.toLowerCase();
  return host === "media.xyzcdn.net" || host.endsWith(".media.xyzcdn.net");
}

function yamlString(value: unknown): string {
  const s = String(value ?? "");
  if (typeof value === "number" || (typeof value === "string" && /^-?\d+(\.\d+)?$/.test(s))) return s;
  if (typeof value === "boolean") return s;
  let escaped = s.replace(/\\/g, "\\\\").replace(/"/g, '\\"');
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

export function itemToMarkdown(item: any): string {
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
    item.summary,
  ];
  if (item.notes) parts.push("", "## 我的笔记", "", item.notes);
  return parts.filter((part, index, all) => part !== "" || all[index - 1] !== "").join("\n").trim() + "\n";
}

export function itemToPrintableHtml(item: any): string {
  const tagPills = (item.tags || []).map((t: string) => `<span class="tag">#${escapeHtml(t)}</span>`).join("");
  const meta = [
    item.author ? `UP主: ${escapeHtml(item.author)}` : "",
    item.duration ? `时长: ${escapeHtml(formatDuration(item.duration))}` : "",
    item.category ? `分类: ${escapeHtml(item.category)}` : "",
    item.created_at ? `保存: ${escapeHtml(item.created_at)}` : "",
  ].filter(Boolean).join(" · ");
  const notesBlock = item.notes ? `<h2>我的笔记</h2>${markdownToHtml(item.notes)}` : "";
  const videoLinkBlock = item.link ? `<p style="margin-top:12px"><a href="${escapeHtml(item.link)}" target="_blank">📺 打开原视频 →</a></p>` : "";
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
  table { width: 100%; border-collapse: collapse; margin: 12px 0; font-size: 14px; }
  th, td { border: 1px solid #d8dee9; padding: 6px 10px; text-align: left; vertical-align: top; }
  th { background: #f4f6fa; font-weight: 600; }
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
