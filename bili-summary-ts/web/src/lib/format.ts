// Tiny formatting / markdown helpers ported from public/index.html so the
// new React UI renders summaries, durations, dates, etc. exactly the same
// way the legacy frontend did.

export function escapeHtml(text: unknown): string {
  const div = document.createElement('div');
  div.textContent = text == null ? '' : String(text);
  return div.innerHTML;
}

export function formatDuration(seconds: number | string | undefined): string {
  const total = Number(seconds || 0);
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  return h
    ? `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`
    : `${m}:${String(s).padStart(2, '0')}`;
}

export function formatTimelineTime(seconds: number | string | undefined): string {
  let total = Math.max(0, Math.floor(Number(seconds || 0)));
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  return h
    ? `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`
    : `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

export function formatDate(value?: string): string {
  if (!value) return '';
  return String(value).replace('T', ' ').slice(0, 16);
}

export function relativeTime(value?: string): string {
  if (!value) return '';
  const t = new Date(value).getTime();
  if (Number.isNaN(t)) return formatDate(value);
  const diff = Date.now() - t;
  if (diff < 60_000) return '刚刚';
  if (diff < 3600_000) return Math.floor(diff / 60_000) + ' 分钟前';
  if (diff < 86400_000) return Math.floor(diff / 3600_000) + ' 小时前';
  if (diff < 7 * 86400_000) return Math.floor(diff / 86400_000) + ' 天前';
  return formatDate(value);
}

// Same lightweight markdown -> HTML used in the legacy frontend.
// We intentionally keep it small: AI summaries only use #/##/###, **bold**,
// `code`, "- list" and paragraph breaks.
export function markdownToHtml(md: string | undefined | null): string {
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

// Split tag input on common separators (commas, semicolons, whitespace,
// CJK variants) and strip leading "#". Mirrors collectTags() in the legacy
// public/index.html so user expectations carry over.
export function parseTagInput(input: string): string[] {
  return (input || '')
    .split(/[,，;；\s]+/)
    .map((s) => s.trim().replace(/^#+/, ''))
    .filter(Boolean);
}
