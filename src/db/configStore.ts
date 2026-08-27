/** Config store – read/write user configs with encryption */

import Database from "better-sqlite3";
import crypto from "crypto";
import { encrypt, decrypt } from "./crypto";

export interface PublicConfig {
  default_category: string;
  deepseek_base_url: string;
  deepseek_model: string;
  whisper_base_url: string;
  whisper_model: string;
  embedding_model: string;
  vision_model: string;
  obsidian_folder: string;
  obsidian_vault_name: string;
  api_key_set: boolean;
  whisper_api_key_set: boolean;
  yt_dlp_cookies_set: boolean;
  api_token_set: boolean;
}

export interface FullConfig {
  api_key: string;
  whisper_api_key: string;
  yt_dlp_cookies: string;
  whisper_base_url: string;
  whisper_model: string;
  embedding_model: string;
  vision_model: string;
  deepseek_base_url: string;
  deepseek_model: string;
  obsidian_folder: string;
  obsidian_vault_name: string;
  default_category: string;
  api_token: string;
}

export function getPublicConfig(db: Database.Database, userId: number): PublicConfig {
  const row = db.prepare("SELECT * FROM user_configs WHERE user_id = ?").get(userId) as any;
  if (!row) {
    return {
      default_category: "待整理",
      deepseek_base_url: "https://api.deepseek.com/v1",
      deepseek_model: "deepseek-v4-flash",
      whisper_base_url: "https://api.siliconflow.cn/v1",
      whisper_model: "TeleAI/TeleSpeechASR",
      embedding_model: "BAAI/bge-m3",
      vision_model: "",
      obsidian_folder: "BiliStudy",
      obsidian_vault_name: "",
      api_key_set: false,
      whisper_api_key_set: false,
      yt_dlp_cookies_set: false,
      api_token_set: false,
    };
  }
  return {
    default_category: row.default_category || "待整理",
    deepseek_base_url: row.deepseek_base_url || "https://api.deepseek.com/v1",
    deepseek_model: row.deepseek_model || "deepseek-v4-flash",
    whisper_base_url: row.whisper_base_url || "https://api.siliconflow.cn/v1",
    whisper_model: row.whisper_model || "TeleAI/TeleSpeechASR",
    embedding_model: row.embedding_model || "BAAI/bge-m3",
    vision_model: row.vision_model || "",
    obsidian_folder: row.obsidian_folder || "BiliStudy",
    obsidian_vault_name: row.obsidian_vault_name || "",
    api_key_set: !!row.api_key_enc,
    whisper_api_key_set: !!row.whisper_api_key_enc,
    yt_dlp_cookies_set: !!row.yt_dlp_cookies_enc,
    api_token_set: !!row.api_token,
  };
}

export function getDecryptedConfig(db: Database.Database, userId: number): FullConfig {
  const row = db.prepare("SELECT * FROM user_configs WHERE user_id = ?").get(userId) as any;
  if (!row) {
    return {
      api_key: "",
      whisper_api_key: "",
      yt_dlp_cookies: "",
      whisper_base_url: "https://api.siliconflow.cn/v1",
      whisper_model: "TeleAI/TeleSpeechASR",
      embedding_model: "BAAI/bge-m3",
      vision_model: "",
      deepseek_base_url: "https://api.deepseek.com/v1",
      deepseek_model: "deepseek-v4-flash",
      obsidian_folder: "BiliStudy",
      obsidian_vault_name: "",
      default_category: "待整理",
      api_token: "",
    };
  }
  return {
    api_key: decrypt(row.api_key_enc),
    whisper_api_key: decrypt(row.whisper_api_key_enc),
    yt_dlp_cookies: decrypt(row.yt_dlp_cookies_enc),
    whisper_base_url: row.whisper_base_url || "https://api.siliconflow.cn/v1",
    whisper_model: row.whisper_model || "TeleAI/TeleSpeechASR",
    embedding_model: row.embedding_model || "BAAI/bge-m3",
    vision_model: row.vision_model || "",
    deepseek_base_url: row.deepseek_base_url || "https://api.deepseek.com/v1",
    deepseek_model: row.deepseek_model || "deepseek-v4-flash",
    obsidian_folder: row.obsidian_folder || "BiliStudy",
    obsidian_vault_name: row.obsidian_vault_name || "",
    default_category: row.default_category || "待整理",
    api_token: row.api_token || "",
  };
}

const ADMIN_EMAIL = process.env.ADMIN_EMAIL?.trim().toLowerCase() || "";

export interface LlmRuntimeConfig {
  apiKey: string;
  baseUrl: string;
  model: string;
}

/**
 * Resolve a user's LLM runtime config. When the user has not set their own
 * API key, fall back to the admin's key AND the admin's baseUrl/model — never
 * the user's — so an admin key can never be sent to a user-controlled endpoint.
 */
export function getLlmConfigWithFallback(db: Database.Database, userId: number): LlmRuntimeConfig {
  const config = getDecryptedConfig(db, userId);
  if (config.api_key) {
    return { apiKey: config.api_key, baseUrl: config.deepseek_base_url, model: config.deepseek_model };
  }
  if (ADMIN_EMAIL) {
    const adminRow = db.prepare("SELECT id FROM users WHERE email = ?").get(ADMIN_EMAIL) as { id?: number } | undefined;
    if (adminRow?.id) {
      const adminConfig = getDecryptedConfig(db, adminRow.id);
      if (adminConfig.api_key) {
        return { apiKey: adminConfig.api_key, baseUrl: adminConfig.deepseek_base_url, model: adminConfig.deepseek_model };
      }
    }
  }
  return { apiKey: "", baseUrl: config.deepseek_base_url, model: config.deepseek_model };
}

export function saveConfig(
  db: Database.Database,
  userId: number,
  patch: Record<string, string>
): void {
  // Ensure row exists
  db.prepare("INSERT OR IGNORE INTO user_configs (user_id) VALUES (?)").run(userId);

  const updates: string[] = [];
  const params: Record<string, any> = {};

  if ("api_key" in patch && patch.api_key) { updates.push("api_key_enc = @api_key_enc"); params.api_key_enc = encrypt(patch.api_key); }
 if ("whisper_api_key" in patch && patch.whisper_api_key) { updates.push("whisper_api_key_enc = @whisper_api_key_enc"); params.whisper_api_key_enc = encrypt(patch.whisper_api_key); }
  if ("yt_dlp_cookies" in patch && patch.yt_dlp_cookies) { updates.push("yt_dlp_cookies_enc = @yt_dlp_cookies_enc"); params.yt_dlp_cookies_enc = encrypt(patch.yt_dlp_cookies); }
  if ("clear_yt_dlp_cookies" in patch && patch.clear_yt_dlp_cookies) { updates.push("yt_dlp_cookies_enc = ''"); }
  if ("whisper_base_url" in patch) { updates.push("whisper_base_url = @whisper_base_url"); params.whisper_base_url = patch.whisper_base_url; }
  if ("whisper_model" in patch) { updates.push("whisper_model = @whisper_model"); params.whisper_model = patch.whisper_model; }
  if ("embedding_model" in patch) { updates.push("embedding_model = @embedding_model"); params.embedding_model = patch.embedding_model; }
  if ("vision_model" in patch) { updates.push("vision_model = @vision_model"); params.vision_model = patch.vision_model; }
  if ("deepseek_base_url" in patch) { updates.push("deepseek_base_url = @deepseek_base_url"); params.deepseek_base_url = patch.deepseek_base_url; }
  if ("deepseek_model" in patch) { updates.push("deepseek_model = @deepseek_model"); params.deepseek_model = patch.deepseek_model; }
  if ("obsidian_folder" in patch) { updates.push("obsidian_folder = @obsidian_folder"); params.obsidian_folder = patch.obsidian_folder; }
  if ("obsidian_vault_name" in patch) { updates.push("obsidian_vault_name = @obsidian_vault_name"); params.obsidian_vault_name = patch.obsidian_vault_name; }
  if ("default_category" in patch) { updates.push("default_category = @default_category"); params.default_category = patch.default_category; }

  if (updates.length === 0) return;

  params.user_id = userId;
  db.prepare(`UPDATE user_configs SET ${updates.join(", ")} WHERE user_id = @user_id`).run(params);
}

// ── API token (MCP / OpenAPI / agent access) ─────────────────────────

export function generateApiToken(db: Database.Database, userId: number): string {
  const token = "bs_" + crypto.randomBytes(24).toString("hex");
  db.prepare("INSERT OR IGNORE INTO user_configs (user_id) VALUES (?)").run(userId);
  db.prepare("UPDATE user_configs SET api_token = ? WHERE user_id = ?").run(token, userId);
  return token;
}

export function getApiToken(db: Database.Database, userId: number): string {
  const row = db.prepare("SELECT api_token FROM user_configs WHERE user_id = ?").get(userId) as { api_token?: string } | undefined;
  return row?.api_token || "";
}

export function verifyApiToken(db: Database.Database, token: string): number | null {
  const clean = String(token || "").trim();
  if (!clean) return null;
  const row = db.prepare("SELECT user_id FROM user_configs WHERE api_token = ?").get(clean) as { user_id: number } | undefined;
  return row?.user_id ?? null;
}
