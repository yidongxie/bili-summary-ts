/** Bilibili API – video info, WBI signing, subtitle fetching */

import crypto from 'crypto';
import http from 'http';
import https from 'https';
import { URL } from 'url';

// ── Types ───────────────────────────────────────────────────────────

export interface VideoInfo {
  bvid: string;
  aid: number;
  title: string;
  author: string;
  duration: number;
  cid: number;
  pic: string;
  desc: string;
}

export interface SubtitleSegment {
  from: number;
  to: number;
  content: string;
}

export interface BiliCookies {
  SESSDATA?: string;
  [key: string]: string | undefined;
}

// ── Constants ───────────────────────────────────────────────────────

const BILI_HEADERS: Record<string, string> = {
  'User-Agent':
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
  Referer: 'https://www.bilibili.com',
};

const WBI_TABLE = [
  46, 47, 18, 2, 53, 8, 23, 32, 15, 50, 10, 31, 58, 3, 45, 35,
  27, 43, 5, 49, 33, 9, 42, 19, 29, 28, 14, 37, 12, 44, 56, 7,
  60, 1, 24, 54, 51, 6, 4, 41, 34, 21, 17, 11, 16, 20, 26, 22,
  48, 13, 25, 52, 55, 61, 38, 36, 30, 39, 57, 59, 40,
];

// ── HTTP helper (zero-dependency) ──────────────────────────────────

function requestJson<T>(url: string, headers?: Record<string, string>, timeout = 15000): Promise<T> {
  return new Promise((resolve, reject) => {
    const parsed = new URL(url);
    const mod = parsed.protocol === 'https:' ? https : http;
    const req = mod.get(url, { headers, timeout }, (res) => {
      const chunks: Buffer[] = [];
      res.on('data', (c) => chunks.push(c));
      res.on('end', () => {
        try {
          resolve(JSON.parse(Buffer.concat(chunks).toString('utf-8')));
        } catch (e) {
          reject(new Error(`JSON parse error: ${e}`));
        }
      });
    });
    req.on('error', reject);
    req.on('timeout', () => { req.destroy(); reject(new Error('Request timeout')); });
  });
}

function postJson<T>(url: string, body: unknown, headers?: Record<string, string>, timeout = 120000): Promise<T> {
  return new Promise((resolve, reject) => {
    const parsed = new URL(url);
    const mod = parsed.protocol === 'https:' ? https : http;
    const payload = Buffer.from(JSON.stringify(body), 'utf-8');
    const req = mod.request(
      parsed,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Content-Length': payload.length, ...headers },
        timeout,
      },
      (res) => {
        const chunks: Buffer[] = [];
        res.on('data', (c) => chunks.push(c));
        res.on('end', () => {
          try {
            resolve(JSON.parse(Buffer.concat(chunks).toString('utf-8')));
          } catch (e) {
            reject(new Error(`JSON parse error: ${e}`));
          }
        });
      },
    );
    req.on('error', reject);
    req.on('timeout', () => { req.destroy(); reject(new Error('Request timeout')); });
    req.write(payload);
    req.end();
  });
}

// ── Cookie helpers ──────────────────────────────────────────────────

export function parseSessdata(raw: string): BiliCookies {
  const cookies: BiliCookies = {};
  for (const part of raw.split(';')) {
    const trimmed = part.trim();
    const idx = trimmed.indexOf('=');
    if (idx > 0) {
      cookies[trimmed.slice(0, idx).trim()] = trimmed.slice(idx + 1).trim();
    }
  }
  if (!cookies.SESSDATA && raw.trim()) {
    cookies.SESSDATA = raw.trim();
  }
  return cookies;
}

function cookieHeader(cookies?: BiliCookies): Record<string, string> {
  const h = { ...BILI_HEADERS };
  if (cookies && Object.keys(cookies).length) {
    h.Cookie = Object.entries(cookies)
      .filter(([, v]) => v)
      .map(([k, v]) => `${k}=${v}`)
      .join('; ');
  }
  return h;
}

// ── URL parsing ─────────────────────────────────────────────────────

export async function extractVideoId(url: string): Promise<string> {
  if (url.includes('b23.tv')) {
    // follow redirect
    const info = await new Promise<string>((resolve, reject) => {
      const mod = url.startsWith('https') ? https : http;
      const req = mod.get(url, { headers: BILI_HEADERS, timeout: 10000 }, (res) => {
        if (res.headers.location) {
          resolve(res.headers.location);
        } else {
          reject(new Error('b23.tv redirect failed'));
        }
      });
      req.on('error', reject);
    });
    url = info;
  }
  const bvMatch = url.match(/BV[a-zA-Z0-9]{10,}/);
  if (bvMatch) return bvMatch[0];
  const avMatch = url.match(/av(\d+)/i);
  if (avMatch) return `av${avMatch[1]}`;
  throw new Error(`无法识别视频链接: ${url}`);
}

// ── Video info ──────────────────────────────────────────────────────

interface BiliViewResponse {
  code: number;
  message: string;
  data: {
    bvid: string;
    aid: number;
    title: string;
    owner: { name: string };
    duration: number;
    cid: number;
    pic: string;
    desc: string;
  };
}

export async function fetchVideoInfo(videoId: string, cookies?: BiliCookies): Promise<VideoInfo> {
  const params = videoId.startsWith('BV') ? `bvid=${videoId}` : `aid=${videoId.slice(2)}`;
  const url = `https://api.bilibili.com/x/web-interface/view?${params}`;
  const res = await requestJson<BiliViewResponse>(url, cookieHeader(cookies));
  if (res.code !== 0) throw new Error(`Bilibili API 错误: ${res.message}`);
  const d = res.data;
  return {
    bvid: d.bvid,
    aid: d.aid,
    title: d.title,
    author: d.owner.name,
    duration: d.duration,
    cid: d.cid,
    pic: d.pic,
    desc: d.desc,
  };
}

// ?? Page list (get correct CID) ??????????????????????????????????????????????

interface PageListResponse {
  code: number;
  message: string;
  data: { cid: number; page: number; part: string; duration: number }[];
}

export async function fetchPageList(bvid: string, cookies?: BiliCookies): Promise<{ cid: number; page: number }[]> {
  try {
    const res = await requestJson<PageListResponse>(
      `https://api.bilibili.com/x/player/pagelist?bvid=${bvid}`,
      cookieHeader(cookies),
    );
    if (res.code === 0 && Array.isArray(res.data) && res.data.length) {
      return res.data.map((p) => ({ cid: p.cid, page: p.page }));
    }
  } catch { /* fallback */ }
  return [];
}

// ── WBI signing ─────────────────────────────────────────────────────

interface WbiKeysResponse {
  data: { wbi_img: { img_url: string; sub_url: string } };
}

async function getWbiKeys(cookies?: BiliCookies): Promise<[string, string]> {
  const res = await requestJson<WbiKeysResponse>(
    'https://api.bilibili.com/x/web-interface/nav',
    cookieHeader(cookies),
  );
  const imgKey = res.data.wbi_img.img_url.split('/').pop()!.split('.')[0];
  const subKey = res.data.wbi_img.sub_url.split('/').pop()!.split('.')[0];
  return [imgKey, subKey];
}

function signWbi(params: Record<string, string>, imgKey: string, subKey: string): Record<string, string> {
  const combined = imgKey + subKey;
  const mixKey = Array.from({ length: 32 }, (_, i) => combined[Math.min(WBI_TABLE[i], combined.length - 1)]).join('');
  const p: Record<string, string> = { ...params, wts: String(Math.floor(Date.now() / 1000)) };
  const query = Object.entries(p)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(v)}`)
    .join('&');
  p.w_rid = crypto.createHash('md5').update(query + mixKey).digest('hex');
  return p;
}

// ── Subtitle fetching ──────────────────────────────────────────────

interface SubtitleMeta {
  lang: string;
  subtitle_url: string;
}

interface PlayerV2Response {
  code: number;
  data?: { subtitle?: { subtitles?: SubtitleMeta[] } };
}

interface SubtitleBody {
  body?: { from: number; to: number; content: string }[];
}

async function downloadSubtitle(subtitles: SubtitleMeta[], cookies?: BiliCookies): Promise<SubtitleSegment[] | null> {
  let target = subtitles.find((s) => /zh|chi/i.test(s.lang));
  if (!target) target = subtitles[0];
  let subUrl: string = target.subtitle_url;
  if (!subUrl) return null;
  if (subUrl.startsWith('//')) subUrl = 'https:' + subUrl;
  else if (subUrl.startsWith('/')) subUrl = 'https://www.bilibili.com' + subUrl;

  const data = await requestJson<SubtitleBody>(subUrl, cookieHeader(cookies));
  return data.body ?? null;
}

export async function fetchSubtitles(bvid: string, cid: number, cookies?: BiliCookies): Promise<SubtitleSegment[] | null> {
  const h = cookieHeader(cookies);
  // Try player/v2 first
  try {
    const res = await requestJson<PlayerV2Response>(
      `https://api.bilibili.com/x/player/v2?bvid=${bvid}&cid=${cid}`,
      h,
    );
    if (res.code === 0) {
      const subs = res.data?.subtitle?.subtitles;
      if (subs?.length) return await downloadSubtitle(subs, cookies);
    }
  } catch { /* fallback */ }
  // WBI-signed fallback
  try {
    const [imgKey, subKey] = await getWbiKeys(cookies);
    const params = signWbi({ bvid: bvid, cid: String(cid) }, imgKey, subKey);
    const qs = Object.entries(params)
      .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(v)}`)
      .join('&');
    const res = await requestJson<PlayerV2Response>(
      `https://api.bilibili.com/x/player/wbi/v2?${qs}`,
      h,
    );
    if (res.code === 0) {
      const subs = res.data?.subtitle?.subtitles;
      if (subs?.length) return await downloadSubtitle(subs, cookies);
    }
  } catch { /* no subtitles */ }
  return null;
}

export function subtitlesToText(items: SubtitleSegment[]): string {
  return items.map((s) => s.content.trim()).filter(Boolean).join('\n');
}

export interface Paragraph {
  from: number;
  to: number;
  content: string;
}

/** Group subtitle segments into paragraphs based on time gaps (>3s gap = new paragraph). */
export function segmentsToParagraphs(segments: SubtitleSegment[], maxGap = 3): Paragraph[] {
  const active = segments.map((s) => ({ from: s.from, to: s.to, content: s.content.trim() })).filter((s) => s.content);
  if (!active.length) return [];
  const groups: { from: number; to: number; texts: string[] }[] = [{ from: active[0].from, to: active[0].to, texts: [active[0].content] }];
  for (let i = 1; i < active.length; i++) {
    const cur = active[i];
    const prev = active[i - 1];
    if (cur.from - prev.to >= maxGap || cur.from - prev.from >= maxGap * 3) {
      groups.push({ from: cur.from, to: cur.to, texts: [cur.content] });
    } else {
      const g = groups[groups.length - 1];
      g.to = cur.to;
      g.texts.push(cur.content);
    }
  }
  return groups.map((g) => ({ from: g.from, to: g.to, content: g.texts.join('\uff0c') }));
}

