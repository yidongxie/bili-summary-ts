// Centralised API client. All requests go through `api()` so we never miss
// `credentials: 'include'` (the express-session cookie matters for /api/auth).
//
// Backend routes are documented in UI_FUNCTIONAL_SPEC.md §13 and implemented
// in src/routes/api.ts, src/db/auth.ts, src/db/taskQueue.ts.

export type CurrentUser = {
  id: number;
  email: string;
  display_name?: string;
  created_at?: string;
};

export type AppConfig = {
  api_key_set?: boolean;
  whisper_api_key_set?: boolean;
  yt_dlp_cookies_set?: boolean;
  api_token_set?: boolean;
  deepseek_model?: string;
  deepseek_base_url?: string;
  whisper_base_url?: string;
  whisper_model?: string;
  embedding_model?: string;
  vision_model?: string;
  default_category?: string;
  obsidian_vault_name?: string;
  obsidian_folder?: string;
  // legacy
  api_key?: string;
  whisper_api_key?: string;
  yt_dlp_cookies?: string;
};

export type VideoMeta = {
  title: string;
  author: string;
  duration: number;
  bvid: string;
  link: string;
  pic?: string;
};

export type PodcastMeta = {
  title: string;
  author: string;
  podcastName: string;
  duration: number;
  id: string;
  link: string;
  cover?: string;
  audioUrl?: string;
};

export type SubtitleSegment = {
  from: number;
  to: number;
  content: string;
};

export type Chapter = {
  from: number;
  to: number;
  title: string;
  detail?: string;
};

export type SummaryResult = {
  id?: string;
  type?: 'bilibili' | 'xiaoyuzhou' | 'douyin' | 'xiaohongshu' | 'wechat' | 'youtube' | string;
  video?: VideoMeta;
  podcast?: PodcastMeta;
  summary: string;
  transcript?: string;
  subtitle_count?: number;
  subtitle_segments?: SubtitleSegment[];
  chapters?: Chapter[];
  mode?: string;
  suggested_tags?: string[];
  transcript_source?: 'whisper' | 'subtitle' | string;
};

export type LibraryItem = {
  id: string;
  created_at: string;
  updated_at?: string;
  title: string;
  author: string;
  duration?: number;
  bvid?: string;
  link?: string;
  summary: string;
  transcript?: string;
  subtitle_count?: number;
  subtitle_segments?: SubtitleSegment[];
  chapters?: Chapter[];
  category?: string;
  tags?: string[];
  notes?: string;
  mode?: string;
  pic?: string;
  snippet?: string;
  highlights?: string[];
};

export type TagInfo = {
  name: string;
  count: number;
  color?: string;
  description?: string;
};

export type Snippet = {
  id: string;
  library_item_id: string;
  content: string;
  source_text?: string;
  timestamp_sec?: number | null;
  tags?: string[];
  created_at: string;
  updated_at?: string;
};

export type LearningPath = {
  id: string;
  title: string;
  description?: string;
  items?: Array<{ library_item_id: string; title?: string; author?: string; completed_at?: string | null }>;
  total?: number;
  completed?: number;
};

export type ReviewItem = {
  id: string;
  library_item_id?: string;
  front: string;
  back: string;
  next_review_at?: string;
  item_title?: string;
};


export type Quiz = {
  id: string;
  library_item_id: string;
  questions?: Array<{ type: string; question: string; options?: string[]; answer?: string; explanation?: string }>;
  score?: number;
};

export type BulkResult = { success: boolean; changed?: number; error?: string };

export type AdminStats = {
  users: number;
  tasks_today: number;
  failed_tasks: number;
  usage_calls_7d: number;
  estimated_cost_7d: number;
  library_items: number;
};


export type LibraryListResponse = {
  items: LibraryItem[];
  categories?: string[];
  tags?: string[];
  total?: number;
  page?: number;
  page_size?: number;
};

export class ApiError extends Error {
  status: number;
  constructor(message: string, status: number) {
    super(message);
    this.status = status;
  }
}

async function request<T = any>(path: string, init: RequestInit = {}): Promise<T> {
  const resp = await fetch(path, {
    credentials: 'include',
    ...init,
    headers: {
      ...(init.body ? { 'Content-Type': 'application/json' } : {}),
      ...(init.headers || {}),
    },
  });
  let data: any;
  try {
    data = await resp.json();
  } catch {
    data = { error: await resp.text().catch(() => resp.statusText) };
  }
  if (!resp.ok) {
    throw new ApiError(data?.error || resp.statusText, resp.status);
  }
  return data as T;
}

// ---- auth ----------------------------------------------------------------

export async function getMe(): Promise<CurrentUser | null> {
  try {
    const data = await request<{ authenticated: boolean; user?: CurrentUser }>(
      '/api/auth/me',
    );
    return data.authenticated ? data.user ?? null : null;
  } catch {
    return null;
  }
}

export function login(email: string, password: string) {
  return request<{ success: boolean; error?: string }>('/api/auth/login', {
    method: 'POST',
    body: JSON.stringify({ email, password }),
  });
}

export function register(email: string, password: string, display_name?: string) {
  return request<{ success: boolean; error?: string }>('/api/auth/register', {
    method: 'POST',
    body: JSON.stringify({ email, password, display_name }),
  });
}

export function logout() {
  return request('/api/auth/logout', { method: 'POST' });
}

// ---- config --------------------------------------------------------------

export async function getConfig(): Promise<AppConfig> {
  try {
    const data = await request<{ config?: AppConfig }>('/api/config');
    return data.config || {};
  } catch {
    return {};
  }
}

export function saveConfig(payload: Partial<AppConfig>) {
  return request<{ config: AppConfig }>('/api/config', {
    method: 'POST',
    body: JSON.stringify(payload),
  });
}

export function testDeepSeekConfig(payload: { api_key?: string; base_url?: string; model?: string }) {
  return request<{ success: boolean; error?: string }>('/api/config/test-deepseek', {
    method: 'POST',
    body: JSON.stringify(payload),
  });
}

export function testWhisperConfig(payload: { whisper_api_key?: string; whisper_base_url?: string; whisper_model?: string }) {
  return request<{ success: boolean; error?: string }>('/api/config/test-whisper', {
    method: 'POST',
    body: JSON.stringify(payload),
  });
}

export function getApiTokenStatus() {
  return request<{ success: boolean; has_token: boolean }>('/api/config/api-token');
}

export function generateApiToken() {
  return request<{ success: boolean; token: string }>('/api/config/api-token', { method: 'POST' });
}


export function chatApi(payload: { question: string; summary: string; transcript?: string; segments?: SubtitleSegment[]; history?: Array<{ role: string; content: string }> }) {
  return request<{ success: boolean; answer: string; citations?: Array<{ time: number; text: string }> }>('/api/llm/chat', {
    method: 'POST',
    body: JSON.stringify(payload),
  });
}

export function rewriteApi(payload: { platform: string; summary: string; keyPoints?: string[] }) {
  return request<{ success: boolean; text: string }>('/api/llm/rewrite', {
    method: 'POST',
    body: JSON.stringify(payload),
  });
}

export function translateApi(payload: { text: string; target: string }) {
  return request<{ success: boolean; text: string }>('/api/llm/translate', {
    method: 'POST',
    body: JSON.stringify(payload),
  });
}

export function articleApi(payload: { text: string }) {
  return request<{ success: boolean; article: string }>('/api/llm/article', {
    method: 'POST',
    body: JSON.stringify(payload),
  });
}

export type AskCitation = {
  index: number;
  itemId: string;
  title: string;
  bvid: string;
  link: string;
  time: number;
};

export type AskHistoryItem = {
  id: string;
  question: string;
  answer: string;
  citations: AskCitation[];
  created_at: string;
};

export async function askStream(
  question: string,
  history: Array<{ role: string; content: string }>,
  callbacks: {
    onCitations?: (c: AskCitation[]) => void;
    onDelta?: (t: string) => void;
    onDone?: () => void;
    onError?: (e: string) => void;
  },
): Promise<void> {
  const resp = await fetch('/api/llm/ask', {
    method: 'POST',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ question, history }),
  });
  if (!resp.ok || !resp.body) {
    const text = await resp.text().catch(() => resp.statusText);
    throw new Error(text || resp.statusText);
  }
  const reader = resp.body.getReader();
  const decoder = new TextDecoder();
  let buf = '';
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buf += decoder.decode(value, { stream: true });
    const lines = buf.split('\n');
    buf = lines.pop() || '';
    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed.startsWith('data:')) continue;
      const payload = trimmed.slice(5).trim();
      try {
        const obj = JSON.parse(payload);
        if (obj.type === 'citations') callbacks.onCitations?.(obj.citations || []);
        else if (obj.type === 'delta') callbacks.onDelta?.(obj.text || '');
        else if (obj.type === 'done') callbacks.onDone?.();
        else if (obj.type === 'error') callbacks.onError?.(obj.error || '问答失败');
      } catch {
        // ignore malformed event
      }
    }
  }
}

export function getAskHistory() {
  return request<{ success: boolean; history: AskHistoryItem[] }>('/api/llm/ask/history');
}

export function clearAskHistory() {
  return request<{ success: boolean }>('/api/llm/ask/history', { method: 'DELETE' });
}

// ---- summarize task ------------------------------------------------------

export type SummarizePayload = {
  url: string;
  mode: string;
  api_key?: string;
  model?: string;
  base_url?: string;
  whisper_api_key?: string;
  whisper_base_url?: string;
  whisper_model?: string;
};

export function createSummarizeTask(payload: SummarizePayload) {
  return request<{ success: boolean; task_id?: string; error?: string }>(
    '/api/tasks/summarize',
    { method: 'POST', body: JSON.stringify(payload) },
  );
}

export type TaskProgressEvent = {
  type: 'status' | 'complete' | 'error' | 'network-error';
  data: any;
};

export function subscribeTask(
  taskId: string,
  onEvent: (e: TaskProgressEvent) => void,
): () => void {
  const src = new EventSource('/api/tasks/' + taskId + '/events');
  let closed = false;
  let terminal = false;
  const onStatus = (e: MessageEvent) =>
    onEvent({ type: 'status', data: safeParse(e.data) });
  const onComplete = (e: MessageEvent) => {
    terminal = true;
    onEvent({ type: 'complete', data: safeParse(e.data) });
  };
  const onError = (e: MessageEvent | Event) => {
    const data = (e as MessageEvent).data ? safeParse((e as MessageEvent).data) : {};
    terminal = true;
    onEvent({ type: 'error', data });
  };
  src.addEventListener('status', onStatus);
  src.addEventListener('complete', onComplete);
  src.addEventListener('error', onError as EventListener);
  src.onerror = () => {
    if (!closed && !terminal) onEvent({ type: 'network-error', data: { error: '连接中断，正在等待重连…' } });
  };
  return () => {
    closed = true;
    src.close();
  };
}

function safeParse(s: any) {
  try {
    return typeof s === 'string' ? JSON.parse(s) : s;
  } catch {
    return {};
  }
}

// ---- library -------------------------------------------------------------

export function getLibrary(params: { q?: string; category?: string; tag?: string; page?: number; page_size?: number; sort?: string } = {}) {
  const q = new URLSearchParams();
  if (params.q) q.set('q', params.q);
  if (params.category) q.set('category', params.category);
  if (params.tag) q.set('tag', params.tag);
  if (params.page) q.set('page', String(params.page));
  if (params.page_size) q.set('page_size', String(params.page_size));
  if (params.sort) q.set('sort', params.sort);
  const qs = q.toString();
  return request<LibraryListResponse>('/api/library' + (qs ? '?' + qs : ''));
}

export function checkLibraryByBvid(bvid: string) {
  return request<{ saved: boolean; item?: LibraryItem }>('/api/library/check/' + encodeURIComponent(bvid));
}

export function semanticSearch(q: string) {
  return request<{ success: boolean; items: LibraryItem[] }>('/api/library/semantic-search?q=' + encodeURIComponent(q));
}

export function reindexEmbeddings() {
  return request<{ success: boolean; total: number; error?: string }>('/api/library/reindex-embeddings', { method: 'POST' });
}

export function getLibraryItem(id: string) {
  return request<{ item: LibraryItem }>('/api/library/' + encodeURIComponent(id));
}

export function saveLibrary(payload: {
  id?: string;
  video: VideoMeta;
  summary: string;
  transcript?: string;
  subtitle_count?: number;
  subtitle_segments?: SubtitleSegment[];
  chapters?: Chapter[];
  mode?: string;
  category?: string;
  tags?: string[];
  notes?: string;
}) {
  return request<{ item: LibraryItem; duplicates?: Array<{ id: string; title: string }> }>('/api/library', {
    method: 'POST',
    body: JSON.stringify(payload),
  });
}

export function deleteLibrary(id: string) {
  return request('/api/library/' + encodeURIComponent(id), { method: 'DELETE' });
}

export function reindexLibrary() {
  return request<{ success: boolean; indexed: number }>('/api/library/reindex', { method: 'POST' });
}

export function getTags() {
  return request<{ success: boolean; tags: TagInfo[] }>('/api/tags');
}

export function updateTagMetadata(payload: { name: string; color?: string; description?: string }) {
  return request<{ success: boolean; tags: TagInfo[] }>('/api/tags/metadata', { method: 'POST', body: JSON.stringify(payload) });
}

export function renameTag(payload: { from: string; to: string }) {
  return request<{ success: boolean; changed: number; tags: TagInfo[] }>('/api/tags/rename', { method: 'POST', body: JSON.stringify(payload) });
}

export function mergeTag(payload: { from: string; to: string }) {
  return request<{ success: boolean; changed: number; tags: TagInfo[] }>('/api/tags/merge', { method: 'POST', body: JSON.stringify(payload) });
}

export function deleteTag(payload: { name: string }) {
  return request<{ success: boolean; changed: number; tags: TagInfo[] }>('/api/tags/delete', { method: 'POST', body: JSON.stringify(payload) });
}

export function bulkAddTags(payload: { ids: string[]; tags: string[] }) {
  return request<BulkResult>('/api/library/bulk/tags/add', { method: 'POST', body: JSON.stringify(payload) });
}

export function bulkRemoveTags(payload: { ids: string[]; tags: string[] }) {
  return request<BulkResult>('/api/library/bulk/tags/remove', { method: 'POST', body: JSON.stringify(payload) });
}

export function bulkSetCategory(payload: { ids: string[]; category: string }) {
  return request<BulkResult>('/api/library/bulk/category', { method: 'POST', body: JSON.stringify(payload) });
}

export function bulkDeleteLibrary(payload: { ids: string[] }) {
  return request<BulkResult>('/api/library/bulk/delete', { method: 'POST', body: JSON.stringify(payload) });
}

export function getSnippets(libraryItemId?: string) {
  const q = new URLSearchParams();
  if (libraryItemId) q.set('library_item_id', libraryItemId);
  const qs = q.toString();
  return request<{ success: boolean; snippets: Snippet[] }>('/api/snippets' + (qs ? '?' + qs : ''));
}

export function createSnippet(payload: { library_item_id: string; content: string; source_text?: string; timestamp_sec?: number | null; tags?: string[] }) {
  return request<{ success: boolean; snippet: Snippet }>('/api/snippets', { method: 'POST', body: JSON.stringify(payload) });
}

export function updateSnippet(id: string, payload: { content: string; source_text?: string; timestamp_sec?: number | null; tags?: string[] }) {
  return request<{ success: boolean; snippet: Snippet }>('/api/snippets/' + encodeURIComponent(id), { method: 'POST', body: JSON.stringify(payload) });
}

export function deleteSnippetApi(id: string) {
  return request<BulkResult>('/api/snippets/' + encodeURIComponent(id), { method: 'DELETE' });
}

export function downloadBulkExport(kind: 'markdown' | 'json', ids: string[]) {
  return fetchAndDownloadPost('/api/export/bulk/' + kind, { ids });
}

export function getPaths() {
  return request<{ success: boolean; paths: LearningPath[] }>('/api/paths');
}

export function createPathApi(payload: { title: string; description?: string }) {
  return request<{ success: boolean; path: LearningPath }>('/api/paths', { method: 'POST', body: JSON.stringify(payload) });
}

export function addPathItem(pathId: string, libraryItemId: string) {
  return request<{ success: boolean; paths: LearningPath[] }>('/api/paths/' + encodeURIComponent(pathId) + '/items', { method: 'POST', body: JSON.stringify({ library_item_id: libraryItemId }) });
}

export function completePathItem(pathId: string, itemId: string, completed: boolean) {
  return request<{ success: boolean; paths: LearningPath[] }>('/api/paths/' + encodeURIComponent(pathId) + '/items/' + encodeURIComponent(itemId) + '/complete', { method: 'POST', body: JSON.stringify({ completed }) });
}

export function getDueReviews() {
  return request<{ success: boolean; items: ReviewItem[] }>('/api/review/due');
}

export function createReview(payload: { library_item_id?: string; front: string; back: string }) {
  return request<{ success: boolean; item: ReviewItem }>('/api/review/items', { method: 'POST', body: JSON.stringify(payload) });
}

export function answerReview(id: string, quality: number) {
  return request<{ success: boolean; item: ReviewItem }>('/api/review/' + encodeURIComponent(id) + '/answer', { method: 'POST', body: JSON.stringify({ quality }) });
}

export function generateQuiz(libraryItemId: string) {
  return request<{ success: boolean; quiz: Quiz }>('/api/quizzes/generate', { method: 'POST', body: JSON.stringify({ library_item_id: libraryItemId }) });
}

export function submitQuiz(id: string, answers: Record<string, unknown>) {
  return request<{ success: boolean; quiz: Quiz }>('/api/quizzes/' + encodeURIComponent(id) + '/submit', { method: 'POST', body: JSON.stringify({ answers }) });
}

export function getAdminStats() {
  return request<{ success: boolean; stats: AdminStats }>('/api/admin/stats');
}

export function getAdminUsers() {
  return request<{ success: boolean; users: any[] }>('/api/admin/users');
}

export function getAdminTasks() {
  return request<{ success: boolean; tasks: any[] }>('/api/admin/tasks');
}

export function getAdminUsage() {
  return request<{ success: boolean; usage: any[] }>('/api/admin/usage');
}

// ---- export --------------------------------------------------------------

export function getObsidianPayload(id: string) {
  return request<{
    success: boolean;
    error?: string;
    markdown?: string;
    vault_name?: string;
    name?: string;
    relative_path?: string;
  }>('/api/export/' + encodeURIComponent(id) + '/obsidian-payload');
}

// ---- tags ----------------------------------------------------------------

export function suggestTags(payload: { title: string; author: string; summary: string }) {
  return request<{ tags: string[] }>('/api/suggest-tags', {
    method: 'POST',
    body: JSON.stringify(payload),
  });
}

// ---- themes ---------------------------------------------------------------

export type Theme = {
  id: string;
  name: string;
  description: string;
  synthesis: string;
  created_at: string;
  updated_at: string;
  item_count: number;
};

export function getThemes() {
  return request<{ success: boolean; themes: Theme[] }>('/api/themes');
}

export function createThemeApi(name: string) {
  return request<{ success: boolean; theme: Theme }>('/api/themes', {
    method: 'POST',
    body: JSON.stringify({ name }),
  });
}

export function renameThemeApi(id: string, name: string) {
  return request<{ success: boolean; theme: Theme }>('/api/themes/' + encodeURIComponent(id) + '/rename', {
    method: 'POST',
    body: JSON.stringify({ name }),
  });
}

export function deleteThemeApi(id: string) {
  return request<{ success: boolean }>('/api/themes/' + encodeURIComponent(id), { method: 'DELETE' });
}

export function getThemeItemsApi(id: string) {
  return request<{ success: boolean; theme: Theme; items: LibraryItem[] }>('/api/themes/' + encodeURIComponent(id) + '/items');
}

export function addThemeItemsApi(id: string, ids: string[]) {
  return request<{ success: boolean; added: number; theme: Theme }>('/api/themes/' + encodeURIComponent(id) + '/items', {
    method: 'POST',
    body: JSON.stringify({ ids }),
  });
}

export function removeThemeItemApi(id: string, itemId: string) {
  return request<{ success: boolean }>('/api/themes/' + encodeURIComponent(id) + '/items/' + encodeURIComponent(itemId), { method: 'DELETE' });
}

export function classifyItemApi(itemId: string) {
  return request<{ success: boolean; themeId: string; themeName: string; created: boolean }>('/api/themes/classify', {
    method: 'POST',
    body: JSON.stringify({ itemId }),
  });
}

export function synthesizeThemeApi(id: string) {
  return request<{ success: boolean; markdown: string }>('/api/themes/' + encodeURIComponent(id) + '/summarize', { method: 'POST' });
}

export function getSimilarItems(id: string) {
  return request<{ success: boolean; items: Array<LibraryItem & { score: number }> }>('/api/library/' + encodeURIComponent(id) + '/similar');
}

export async function fetchAndDownloadPost(url: string, payload: any) {
  const r = await fetch(url, {
    method: 'POST',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  if (!r.ok) {
    const t = await r.text().catch(() => r.statusText);
    throw new Error(t || r.statusText);
  }
  await downloadResponse(r);
}

async function downloadResponse(r: Response) {
  const cd = r.headers.get('Content-Disposition');
  let name = 'download';
  if (cd) {
    const starMatch = cd.match(/filename\*\s*=\s*([^;]+)/i);
    if (starMatch) {
      let v = starMatch[1].trim();
      const idx = v.indexOf("''");
      if (idx >= 0) v = v.slice(idx + 2);
      try {
        name = decodeURIComponent(v);
      } catch {
        name = v;
      }
    } else {
      const plainMatch = cd.match(/filename\s*=\s*"?([^";]+)"?/i);
      if (plainMatch) name = plainMatch[1].trim();
    }
  }
  const blob = await r.blob();
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = name;
  document.body.appendChild(a);
  a.click();
  setTimeout(() => {
    URL.revokeObjectURL(a.href);
    a.remove();
  }, 100);
}

export async function fetchAndDownload(url: string) {
  const r = await fetch(url, { credentials: 'include' });
  if (!r.ok) {
    const t = await r.text().catch(() => '');
    let msg = t || r.statusText;
    try {
      const j = JSON.parse(t);
      if (j?.error) msg = j.error;
    } catch { /* not JSON — keep raw body */ }
    throw new Error(msg);
  }
  await downloadResponse(r);
}

export type BiliPage = { cid: number; page: number; part?: string; duration?: number };

export function listBiliPages(bvid: string) {
  return request<{ success: boolean; title?: string; author?: string; pic?: string; pages?: BiliPage[] }>(
    '/api/download/bilibili/pages?bvid=' + encodeURIComponent(bvid),
  );
}

function filenameFromDisposition(cd: string | null): string {
  if (!cd) return 'download';
  const starMatch = cd.match(/filename\*\s*=\s*([^;]+)/i);
  if (starMatch) {
    let v = starMatch[1].trim();
    const idx = v.indexOf("''");
    if (idx >= 0) v = v.slice(idx + 2);
    try { return decodeURIComponent(v); } catch { return v; }
  }
  const plainMatch = cd.match(/filename\s*=\s*"?([^";]+)"?/i);
  if (plainMatch) return plainMatch[1].trim();
  return 'download';
}

function triggerDownload(blob: Blob, name: string): void {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = name;
  document.body.appendChild(a);
  a.click();
  setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 100);
}

/**
 * Fetch a streamed download and save it to disk, surfacing JSON errors and
 * reporting progress (0-100) when the server sends Content-Length.
 */
export async function streamDownload(url: string, onProgress?: (pct: number) => void): Promise<void> {
  const r = await fetch(url, { credentials: 'include' });
  const ctype = (r.headers.get('content-type') || '').toLowerCase();
  if (!r.ok || ctype.includes('application/json')) {
    const text = await r.text().catch(() => r.statusText);
    let msg = text || r.statusText;
    try { const j = JSON.parse(text); if (j?.error) msg = j.error; } catch { /* keep raw */ }
    throw new Error(msg);
  }
  const total = Number(r.headers.get('content-length') || 0);
  const reader = r.body?.getReader();
  const chunks: BlobPart[] = [];
  let received = 0;
  if (reader) {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      if (value) { chunks.push(value); received += value.length; }
      if (onProgress && total > 0) onProgress(Math.min(100, Math.round((received / total) * 100)));
    }
  }
  onProgress?.(100);
  const blob = new Blob(chunks, { type: r.headers.get('content-type') || 'application/octet-stream' });
  triggerDownload(blob, filenameFromDisposition(r.headers.get('content-disposition')));
}

export function downloadXiaoyuzhou(urlOrId: string, opts: { onProgress?: (pct: number) => void } = {}) {
  return streamDownload('/api/download/xiaoyuzhou?url=' + encodeURIComponent(urlOrId), opts.onProgress);
}

export function downloadBiliVideo(
  bvidOrUrl: string,
  opts: { cid?: number; qn?: number; audio?: boolean; onProgress?: (pct: number) => void } = {},
) {
  const q = new URLSearchParams();
  if (/BV[a-zA-Z0-9]{10,}/.test(bvidOrUrl)) q.set('bvid', bvidOrUrl);
  else q.set('url', bvidOrUrl);
  if (opts.cid) q.set('cid', String(opts.cid));
  if (opts.qn) q.set('qn', String(opts.qn));
  if (opts.audio) q.set('audio', '1');
  return streamDownload('/api/download/bilibili?' + q.toString(), opts.onProgress);
}

export function listUploaderVideos(url: string) {
  return request<{ success: boolean; uploader?: string; total?: number; videos?: Array<{ title: string; bvid: string; duration?: number }>; error?: string }>(
    '/api/download/uploader?url=' + encodeURIComponent(url),
  );
}
