/** Text embedding via an OpenAI-compatible /embeddings endpoint (SiliconFlow bge-m3). */

import Database from "better-sqlite3";
import { postJson } from "../common/http";
import { getDecryptedConfig } from "../db/configStore";
import { saveEmbedding } from "../db/embeddingStore";

const ADMIN_EMAIL = process.env.ADMIN_EMAIL?.trim().toLowerCase() || "";
const EMBEDDING_MODEL = process.env.EMBEDDING_MODEL || "BAAI/bge-m3";
const DEFAULT_BASE_URL = "https://api.siliconflow.cn/v1";

export interface EmbeddingConfig {
  apiKey: string;
  baseUrl: string;
  model: string;
}

/** Resolve the embedding config, falling back to the admin's SiliconFlow key. */
export function getEmbeddingConfig(db: Database.Database, userId: number): EmbeddingConfig | null {
  const config = getDecryptedConfig(db, userId);
  if (config.whisper_api_key) {
    return { apiKey: config.whisper_api_key, baseUrl: config.whisper_base_url || DEFAULT_BASE_URL, model: EMBEDDING_MODEL };
  }
  if (ADMIN_EMAIL) {
    const user = db.prepare("SELECT email FROM users WHERE id = ?").get(userId) as { email?: string } | undefined;
    if (user?.email !== ADMIN_EMAIL) {
      const admin = db.prepare("SELECT id FROM users WHERE email = ?").get(ADMIN_EMAIL) as { id?: number } | undefined;
      if (admin?.id) {
        const ac = getDecryptedConfig(db, admin.id);
        if (ac.whisper_api_key) {
          return { apiKey: ac.whisper_api_key, baseUrl: ac.whisper_base_url || DEFAULT_BASE_URL, model: EMBEDDING_MODEL };
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

/** Best-effort: embed an item's title+summary and store it for semantic search. */
export async function generateEmbeddingForItem(
  db: Database.Database,
  userId: number,
  item: { id: string; title: string; summary: string },
): Promise<void> {
  const config = getEmbeddingConfig(db, userId);
  if (!config) return;
  const text = `${item.title || ""}\n${item.summary || ""}`.trim().slice(0, 4000);
  if (!text) return;
  try {
    const [vec] = await embedTexts([text], config);
    if (vec && vec.length) saveEmbedding(db, item.id, config.model, vec);
  } catch (err: any) {
    console.warn("[embedding] generate failed:", err?.message || err);
  }
}
