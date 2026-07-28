/** Shared HTTP client — uses Node 18+ built-in fetch for consistency. */

export interface HttpOptions {
  timeout?: number;
  headers?: Record<string, string>;
}

async function fetchWithTimeout(url: string, init: RequestInit, timeoutMs: number): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const resp = await fetch(url, { ...init, signal: controller.signal });
    return resp;
  } finally {
    clearTimeout(timer);
  }
}

export async function getJson<T>(url: string, opts: HttpOptions = {}): Promise<T> {
  const resp = await fetchWithTimeout(url, { method: "GET", headers: opts.headers || {} }, opts.timeout || 30000);
  if (!resp.ok) {
    const text = await resp.text().catch(() => resp.statusText);
    throw new Error(`HTTP ${resp.status}: ${text.slice(0, 200)}`);
  }
  return resp.json() as Promise<T>;
}

export async function postJson<T>(url: string, body: unknown, opts: HttpOptions = {}): Promise<T> {
  const resp = await fetchWithTimeout(
    url,
    {
      method: "POST",
      headers: { "Content-Type": "application/json", ...(opts.headers || {}) },
      body: JSON.stringify(body),
    },
    opts.timeout || 120000,
  );
  if (!resp.ok) {
    const text = await resp.text().catch(() => resp.statusText);
    throw new Error(`HTTP ${resp.status}: ${text.slice(0, 200)}`);
  }
  return resp.json() as Promise<T>;
}

export async function postJsonRaw(url: string, body: unknown, opts: HttpOptions = {}): Promise<Response> {
  const resp = await fetchWithTimeout(
    url,
    {
      method: "POST",
      headers: { "Content-Type": "application/json", ...(opts.headers || {}) },
      body: JSON.stringify(body),
    },
    opts.timeout || 120000,
  );
  return resp;
}
