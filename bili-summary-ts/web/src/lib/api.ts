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
  deepseek_model?: string;
  deepseek_base_url?: string;
  whisper_base_url?: string;
  whisper_model?: string;
  default_category?: string;
  obsidian_vault_name?: string;
  obsidian_folder?: string;
  // legacy
  api_key?: string;
  whisper_api_key?: string;
};

export type VideoMeta = {
  title: string;
  author: string;
  duration: number;
  bvid: string;
  link: string;
  pic?: string;
};

export type SubtitleSegment = {
  from: number;
  to: number;
  content: string;
};

export type SummaryResult = {
  video: VideoMeta;
  summary: string;
  transcript?: string;
  subtitle_count?: number;
  subtitle_segments?: SubtitleSegment[];
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
  category?: string;
  tags?: string[];
  notes?: string;
  mode?: string;
};

export type LibraryListResponse = {
  items: LibraryItem[];
  categories?: string[];
  tags?: string[];
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
  type: 'status' | 'complete' | 'error';
  data: any;
};

export function subscribeTask(
  taskId: string,
  onEvent: (e: TaskProgressEvent) => void,
): () => void {
  const src = new EventSource('/api/tasks/' + taskId + '/events');
  const onStatus = (e: MessageEvent) =>
    onEvent({ type: 'status', data: safeParse(e.data) });
  const onComplete = (e: MessageEvent) =>
    onEvent({ type: 'complete', data: safeParse(e.data) });
  const onError = (e: MessageEvent | Event) => {
    const data = (e as MessageEvent).data ? safeParse((e as MessageEvent).data) : {};
    onEvent({ type: 'error', data });
  };
  src.addEventListener('status', onStatus);
  src.addEventListener('complete', onComplete);
  src.addEventListener('error', onError as EventListener);
  src.onerror = () => onEvent({ type: 'error', data: { error: '连接中断' } });
  return () => src.close();
}

function safeParse(s: any) {
  try {
    return typeof s === 'string' ? JSON.parse(s) : s;
  } catch {
    return {};
  }
}

// ---- library -------------------------------------------------------------

export function getLibrary(params: { q?: string; category?: string; tag?: string } = {}) {
  const q = new URLSearchParams();
  if (params.q) q.set('q', params.q);
  if (params.category) q.set('category', params.category);
  if (params.tag) q.set('tag', params.tag);
  const qs = q.toString();
  return request<LibraryListResponse>('/api/library' + (qs ? '?' + qs : ''));
}

export function checkLibraryByBvid(bvid: string) {
  return request<{ saved: boolean }>('/api/library/check/' + encodeURIComponent(bvid));
}

export function getLibraryItem(id: string) {
  return request<{ item: LibraryItem }>('/api/library/' + encodeURIComponent(id));
}

export function saveLibrary(payload: {
  video: VideoMeta;
  summary: string;
  transcript?: string;
  subtitle_count?: number;
  mode?: string;
  category: string;
  tags: string[];
  notes?: string;
}) {
  return request<{ item: LibraryItem }>('/api/library', {
    method: 'POST',
    body: JSON.stringify(payload),
  });
}

export function deleteLibrary(id: string) {
  return request('/api/library/' + encodeURIComponent(id), { method: 'DELETE' });
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

// ---- helpers -------------------------------------------------------------

export async function fetchAndDownload(url: string) {
  const r = await fetch(url, { credentials: 'include' });
  if (!r.ok) {
    const t = await r.text().catch(() => r.statusText);
    throw new Error(t || r.statusText);
  }
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
