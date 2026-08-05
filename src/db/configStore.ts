/** Config store – read/write user configs with encryption */

import Database from "better-sqlite3";
import { encrypt, decrypt } from "./crypto";

export interface PublicConfig {
  default_category: string;
  deepseek_base_url: string;
  deepseek_model: string;
  whisper_base_url: string;
  whisper_model: string;
  obsidian_folder: string;
  obsidian_vault_name: string;
  api_key_set: boolean;
  whisper_api_key_set: boolean;
  yt_dlp_cookies_set: boolean;
}

export interface FullConfig {
  api_key: string;
  whisper_api_key: string;
  yt_dlp_cookies: string;
  whisper_base_url: string;
  whisper_model: string;
  deepseek_base_url: string;
  deepseek_model: string;
  obsidian_folder: string;
  obsidian_vault_name: string;
  default_category: string;
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
      obsidian_folder: "BiliStudy",
      obsidian_vault_name: "",
      api_key_set: false,
      whisper_api_key_set: false,
      yt_dlp_cookies_set: false,
    };
  }
  return {
    default_category: row.default_category || "待整理",
    deepseek_base_url: row.deepseek_base_url || "https://api.deepseek.com/v1",
    deepseek_model: row.deepseek_model || "deepseek-v4-flash",
    whisper_base_url: row.whisper_base_url || "https://api.siliconflow.cn/v1",
    whisper_model: row.whisper_model || "TeleAI/TeleSpeechASR",
    obsidian_folder: row.obsidian_folder || "BiliStudy",
    obsidian_vault_name: row.obsidian_vault_name || "",
    api_key_set: !!row.api_key_enc,
    whisper_api_key_set: !!row.whisper_api_key_enc,
    yt_dlp_cookies_set: !!row.yt_dlp_cookies_enc,
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
      deepseek_base_url: "https://api.deepseek.com/v1",
      deepseek_model: "deepseek-v4-flash",
      obsidian_folder: "BiliStudy",
      obsidian_vault_name: "",
      default_category: "待整理",
    };
  }
  return {
    api_key: decrypt(row.api_key_enc),
    whisper_api_key: decrypt(row.whisper_api_key_enc),
    yt_dlp_cookies: decrypt(row.yt_dlp_cookies_enc),
    whisper_base_url: row.whisper_base_url || "https://api.siliconflow.cn/v1",
    whisper_model: row.whisper_model || "TeleAI/TeleSpeechASR",
    deepseek_base_url: row.deepseek_base_url || "https://api.deepseek.com/v1",
    deepseek_model: row.deepseek_model || "deepseek-v4-flash",
    obsidian_folder: row.obsidian_folder || "BiliStudy",
    obsidian_vault_name: row.obsidian_vault_name || "",
    default_category: row.default_category || "待整理",
  };
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
  if ("deepseek_base_url" in patch) { updates.push("deepseek_base_url = @deepseek_base_url"); params.deepseek_base_url = patch.deepseek_base_url; }
  if ("deepseek_model" in patch) { updates.push("deepseek_model = @deepseek_model"); params.deepseek_model = patch.deepseek_model; }
  if ("obsidian_folder" in patch) { updates.push("obsidian_folder = @obsidian_folder"); params.obsidian_folder = patch.obsidian_folder; }
  if ("obsidian_vault_name" in patch) { updates.push("obsidian_vault_name = @obsidian_vault_name"); params.obsidian_vault_name = patch.obsidian_vault_name; }
  if ("default_category" in patch) { updates.push("default_category = @default_category"); params.default_category = patch.default_category; }

  if (updates.length === 0) return;

  params.user_id = userId;
  db.prepare(`UPDATE user_configs SET ${updates.join(", ")} WHERE user_id = @user_id`).run(params);
}
