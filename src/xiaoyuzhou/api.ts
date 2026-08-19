/** Xiaoyuzhou (小宇宙) Podcast API – episode info and audio extraction */

import http from 'http';
import https from 'https';
import { URL } from 'url';

// ── Types ───────────────────────────────────────────────────────────

export interface EpisodeInfo {
  id: string;
  title: string;
  author: string;
  podcastName: string;
  duration: number;
  audioUrl: string;
  coverUrl: string;
  description: string;
  episodeUrl: string;
}

// ── Constants ───────────────────────────────────────────────────────

const XIAOYUZHOU_HEADERS: Record<string, string> = {
  'User-Agent':
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
  Referer: 'https://www.xiaoyuzhou.fm/',
  Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8',
  'Accept-Language': 'zh-CN,zh;q=0.9,en;q=0.8',
};

// ── HTTP helpers ────────────────────────────────────────────────────

function requestHtml(url: string, headers?: Record<string, string>, timeout = 15000): Promise<string> {
  return new Promise((resolve, reject) => {
    const parsed = new URL(url);
    const mod = parsed.protocol === 'https:' ? https : http;
    const req = mod.get(url, { headers, timeout }, (res) => {
      const chunks: Buffer[] = [];
      res.on('data', (c) => chunks.push(c));
      res.on('end', () => {
        resolve(Buffer.concat(chunks).toString('utf-8'));
      });
    });
    req.on('error', reject);
    req.on('timeout', () => {
      req.destroy();
      reject(new Error('Request timeout'));
    });
  });
}

// ── URL parsing ─────────────────────────────────────────────────────

export function isXiaoyuzhouUrl(url: string): boolean {
  return /xiaoyuzhoufm\.com|xiaoyuzhou\.fm|xyz\.fm/.test(url);
}

export async function extractEpisodeId(url: string): Promise<string> {
  // Handle direct episode IDs
  if (/^[a-zA-Z0-9_-]{8,}$/.test(url) && !url.includes('.')) {
    return url;
  }

  // Follow redirects for short links
  if (isXiaoyuzhouUrl(url)) {
    if (url.startsWith('http://') || url.startsWith('https://')) {
      const finalUrl = await followRedirect(url);
      url = finalUrl;
    }
  }

  // Extract from URL patterns:
  // - https://www.xiaoyuzhou.fm/episode/abc123xyz
  // - https://www.xiaoyuzhoufm.com/episode/abc123xyz
  // - https://xyz.fm/episode/abc123xyz
  // - https://www.xiaoyuzhou.fm/podcasts/podcast-id/episodes/episode-id
  const episodeMatch = url.match(/\/episode\/([a-zA-Z0-9_-]+)/i);
  if (episodeMatch) return episodeMatch[1];

  const episodesMatch = url.match(/\/episodes\/([a-zA-Z0-9_-]+)/i);
  if (episodesMatch) return episodesMatch[1];

  throw new Error(`无法识别小宇宙播客链接: ${url}`);
}

async function followRedirect(url: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const parsed = new URL(url);
    const mod = parsed.protocol === 'https:' ? https : http;
    const req = mod.get(
      url,
      { headers: XIAOYUZHOU_HEADERS, timeout: 10000 },
      (res) => {
        if (res.statusCode && res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
          let redirect = res.headers.location;
          if (redirect.startsWith('/')) {
            redirect = `${parsed.protocol}//${parsed.host}${redirect}`;
          }
          resolve(redirect);
        } else {
          resolve(url);
        }
        req.destroy();
      }
    );
    req.on('error', () => resolve(url));
  });
}

// ── Episode info ─────────────────────────────────────────────────────

/**
 * Fetch episode info by scraping the webpage and extracting JSON-LD or embedded data.
 * Xiaoyuzhou embeds podcast metadata in the page as JSON-LD script tags.
 */
export async function fetchEpisodeInfo(episodeId: string, originalUrl?: string): Promise<EpisodeInfo> {
  // Try to use the original URL if provided, otherwise try both possible domains
  let urls: string[] = [];
  if (originalUrl && isXiaoyuzhouUrl(originalUrl)) {
    urls = [originalUrl];
  } else {
    urls = [
      `https://www.xiaoyuzhoufm.com/episode/${episodeId}`,
      `https://www.xiaoyuzhou.fm/episode/${episodeId}`,
    ];
  }

  let html = '';
  let usedUrl = urls[0];
  for (const url of urls) {
    try {
      html = await requestHtml(url, XIAOYUZHOU_HEADERS);
      usedUrl = url;
      break;
    } catch (e) {
      console.warn(`Failed to fetch from ${url}, trying next...`);
      continue;
    }
  }

  if (!html) {
    throw new Error('无法获取播客页面内容，请检查链接是否正确');
  }

  // Try to extract JSON-LD structured data
  const jsonLdMatch = html.match(/<script[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/i);
  if (jsonLdMatch) {
    try {
      const data = JSON.parse(jsonLdMatch[1].trim());
      if (data['@type'] === 'PodcastEpisode' || data['@type'] === 'AudioObject') {
        return parseJsonLdEpisode(data, episodeId, usedUrl, html);
      }
      // Sometimes it's an array
      if (Array.isArray(data)) {
        const episode = data.find(
          (d: any) => d['@type'] === 'PodcastEpisode' || d['@type'] === 'AudioObject'
        );
        if (episode) return parseJsonLdEpisode(episode, episodeId, usedUrl, html);
      }
    } catch (e) {
      console.warn('JSON-LD parse failed, trying other methods');
    }
  }

  // Fallback: Try to extract meta tags
  const title = extractMetaTag(html, 'title') || extractMetaTag(html, 'description')?.substring(0, 100) || '未知标题';
  const description = extractMetaTag(html, 'description') || '';
  const audioUrl = extractMetaTag(html, 'audio') || '';
  const coverUrl = extractMetaTag(html, 'image') || '';
  const author = '小宇宙播客';

  // Try to extract duration from page content
  const duration = extractDuration(html) || 0;

  // Try to extract podcast name
  const podcastName = extractPodcastName(html) || author;

  if (!audioUrl) {
    throw new Error('无法获取音频链接，请检查播客链接是否正确');
  }

  return {
    id: episodeId,
    title,
    author,
    podcastName,
    duration,
    audioUrl,
    coverUrl,
    description,
    episodeUrl: usedUrl,
  };
}

function parseJsonLdEpisode(data: any, episodeId: string, url: string, html?: string): EpisodeInfo {
  const title = data.name || data.headline || '未知标题';
  const description = data.description || data.summary || '';
  const audioUrl = data.associatedMedia?.contentUrl || data.audio?.contentUrl || data.audioUrl || '';
  // Cover image is usually in meta tags, not JSON-LD
  let coverUrl = data.image?.contentUrl || data.thumbnailUrl || data.image || '';
  if (!coverUrl && html) {
    coverUrl = extractMetaTag(html, 'image') || '';
  }
  const author = data.author?.name || data.creator || data.publisher?.name || '小宇宙播客';
  const podcastName = data.partOfSeries?.name || author;

  // Parse duration - ISO 8601 format like PT1H30M15S
  let duration = 0;
  if (data.duration || data.timeRequired) {
    duration = parseIsoDuration(data.duration || data.timeRequired);
  }

  return {
    id: episodeId,
    title,
    author,
    podcastName,
    duration,
    audioUrl,
    coverUrl,
    description,
    episodeUrl: url,
  };
}

function extractMetaTag(html: string, name: string): string {
  const ogMatch = html.match(new RegExp(`<meta[^>]*property=["']og:${name}["'][^>]*content=["']([^"']*)["']`, 'i'));
  if (ogMatch) return ogMatch[1];

  const metaMatch = html.match(new RegExp(`<meta[^>]*name=["']${name}["'][^>]*content=["']([^"']*)["']`, 'i'));
  if (metaMatch) return metaMatch[1];

  return '';
}

function extractDuration(html: string): number {
  // Look for duration patterns like "1:30:45" or "45:30"
  const durationMatch = html.match(/\b(\d{1,2}):(\d{2}):(\d{2})\b/);
  if (durationMatch) {
    const h = parseInt(durationMatch[1], 10);
    const m = parseInt(durationMatch[2], 10);
    const s = parseInt(durationMatch[3], 10);
    return h * 3600 + m * 60 + s;
  }

  const shortMatch = html.match(/\b(\d{1,2}):(\d{2})\b/);
  if (shortMatch) {
    const m = parseInt(shortMatch[1], 10);
    const s = parseInt(shortMatch[2], 10);
    return m * 60 + s;
  }

  return 0;
}

function extractPodcastName(html: string): string {
  // Look for podcast name in various places
  const podcastMatch = html.match(/podcast[^>]*>[\s\S]*?<[^>]*title[^>]*>([^<]+)</i);
  if (podcastMatch) return podcastMatch[1].trim();

  const bylineMatch = html.match(/class=["'][^"']*byline[^"']*["'][^>]*>([^<]+)</i);
  if (bylineMatch) return bylineMatch[1].trim();

  return '';
}

function parseIsoDuration(duration: string): number {
  // Parse ISO 8601 duration format: PT1H30M15S
  const match = duration.match(/PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?/);
  if (!match) return 0;

  const h = parseInt(match[1] || '0', 10);
  const m = parseInt(match[2] || '0', 10);
  const s = parseInt(match[3] || '0', 10);

  return h * 3600 + m * 60 + s;
}

/**
 * Get direct audio URL (may need to handle redirects)
 */
export async function getDirectAudioUrl(audioUrl: string): Promise<string> {
  try {
    const finalUrl = await followRedirect(audioUrl);
    return finalUrl || audioUrl;
  } catch {
    return audioUrl;
  }
}
