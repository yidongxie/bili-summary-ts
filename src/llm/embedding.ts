/** Text embedding via an OpenAI-compatible /embeddings endpoint (SiliconFlow bge-m3). */

import Database from "better-sqlite3";
import { postJson } from "../common/http";
import { getDecryptedConfig } from "../db/configStore";
import { saveEmbedding, saveSegmentEmbeddings } from "../db/embeddingStore";

const ADMIN_EMAIL = process.env.ADMIN_EMAIL?.trim().toLowerCase() || "";
const DEFAULT_BASE_URL = "https://api.siliconflow.cn/v1";
const DEFAULT_EMBEDDING_MODEL = "BAAI/bge-m3";

export interface EmbeddingConfig {
  apiKey: string;
  baseUrl: string;
  model: string;
}

/** Resolve the embedding config, falling back to the admin's SiliconFlow key. */
export function getEmbeddingConfig(db: Database.Database, userId: number): EmbeddingConfig | null {
  const config = getDecryptedConfig(db, userId);
  if (config.whisper_api_key) {
    return { apiKey: config.whisper_api_key, baseUrl: config.whisper_base_url || DEFAULT_BASE_URL, model: config.embedding_model || DEFAULT_EMBEDDING_MODEL };
  }
  if (ADMIN_EMAIL) {
    const user = db.prepare("SELECT email FROM users WHERE id = ?").get(userId) as { email?: string } | undefined;
    if (user?.email !== ADMIN_EMAIL) {
      const admin = db.prepare("SELECT id FROM users WHERE email = ?").get(ADMIN_EMAIL) as { id?: number } | undefined;
      if (admin?.id) {
        const ac = getDecryptedConfig(db, admin.id);
        if (ac.whisper_api_key) {
          return { apiKey: ac.whisper_api_key, baseUrl: ac.whisper_base_url || DEFAULT_BASE_URL, model: ac.embedding_model || DEFAULT_EMBEDDING_MODEL };
        }
      }
    }
  }
  return null;
}

interface EmbeddingResponse {
  data: Array<{ embedding: number[] }>;
}

export async function embedTexts(texts: string[], config: EmbeddingConfig): Promise<number[][]> {
  const url = config.baseUrl.replace(/\/+$/, "") + "/embeddings";
  const cleanKey = (config.apiKey || "").replace(/[\r\n\s]+/g, "").trim();
  const res = await postJson<EmbeddingResponse>(
    url,
    { model: config.model, input: texts },
    { headers: { Authorization: `Bearer ${cleanKey}` }, timeout: 60000 },
  );
  return (res.data || []).map((d) => d.embedding || []);
}

interface SubtitleSeg { from: number; to: number; content: string; }

function buildChunks(segments?: SubtitleSeg[]): Array<{ startSec: number; text: string }> {
  if (!segments?.length) return [];
  const chunks: Array<{ startSec: number; text: string }> = [];
  let cur: { startSec: number; parts: string[] } = { startSec: Number(segments[0].from) || 0, parts: [] };
  let len = 0;
  for (const s of segments) {
    const content = String(s.content || "").trim();
    if (!content) continue;
    if (len > 0 && len + content.length > 600) {
      chunks.push({ startSec: cur.startSec, text: cur.parts.join("，") });
      cur = { startSec: Number(s.from) || 0, parts: [] };
      len = 0;
    }
    cur.parts.push(content);
    len += content.length;
  }
  if (cur.parts.length) chunks.push({ startSec: cur.startSec, text: cur.parts.join("，") });
  return chunks;
}

/**
 * Best-effort: embed an item's title+summary (item-level) plus its subtitle
 * chunks (segment-level) in a single batched call, for semantic search,
 * similar-video recommendations and duplicate detection.
 */
export async function generateEmbeddingForItem(
  db: Database.Database,
  userId: number,
  item: { id: string; title: string; summary: string; subtitle_segments?: SubtitleSeg[] },
): Promise<void> {
  const config = getEmbeddingConfig(db, userId);
  if (!config) return;
  const itemText = `${item.title || ""}\n${item.summary || ""}`.trim().slice(0, 4000);
  const chunks = buildChunks(item.subtitle_segments);
  const texts = [itemText, ...chunks.map((c) => c.text)].filter((t) => t.trim());
  if (!texts.length) return;
  try {
    const vecs = await embedTexts(texts, config);
    if (vecs[0]?.length) saveEmbedding(db, item.id, config.model, vecs[0]);
    const segChunks = chunks
      .map((c, i) => ({ startSec: c.startSec, text: c.text, vector: vecs[i + 1] }))
      .filter((x) => x.vector?.length);
    if (segChunks.length) saveSegmentEmbeddings(db, item.id, config.model, segChunks);
  } catch (err: any) {
    console.warn("[embedding] generate failed:", err?.message || err);
  }
}
