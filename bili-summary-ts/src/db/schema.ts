/** Database schema & connection – SQLite via better-sqlite3 */

import Database from "better-sqlite3";
import path from "path";
import fs from "fs";

export interface DbUser {
  id: number;
  github_id: number | null;
  email: string;
  display_name: string;
  avatar_url: string;
  created_at: string;
}

export interface DbSession {
  sid: string;
  user_id: number;
  expires_at: string;
}

export interface DbLibraryItem {
  id: string;
  user_id: number;
  created_at: string;
  updated_at: string;
  title: string;
  author: string;
  duration: number;
  bvid: string;
  link: string;
  summary: string;
  transcript: string;
  subtitle_count: number;
  category: string;
  tags: string;
  notes: string;
  mode: string;
}

   export interface DbUserConfig {
     user_id: number;
     api_key_enc: string;
     password_hash: string;
     bili_sessdata_enc: string;
   whisper_api_key_enc: string;
  whisper_base_url: string;
  whisper_model: string;
  deepseek_base_url: string;
  deepseek_model: string;
  obsidian_vault_path: string;
  obsidian_folder: string;
  obsidian_mode: string;
  obsidian_vault_name: string;
  default_category: string;
}

export interface DbDailyUsage {
  user_id: number;
  date: string;
  summarize_count: number;
}

export function createDb(dataDir: string): Database.Database {
  fs.mkdirSync(dataDir, { recursive: true });
  const dbPath = path.join(dataDir, "bilistudy.sqlite");
  const db = new Database(dbPath);

  db.pragma("journal_mode = WAL");
  db.pragma("foreign_keys = ON");

  db.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      github_id INTEGER UNIQUE,
      email TEXT NOT NULL DEFAULT '',
      display_name TEXT NOT NULL DEFAULT '',
      avatar_url TEXT NOT NULL DEFAULT '',
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS sessions (
      sid TEXT PRIMARY KEY,
      user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      expires_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS library_items (
      id TEXT PRIMARY KEY,
      user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now')),
      title TEXT NOT NULL DEFAULT '',
      author TEXT NOT NULL DEFAULT '',
      duration INTEGER NOT NULL DEFAULT 0,
      bvid TEXT NOT NULL DEFAULT '',
      link TEXT NOT NULL DEFAULT '',
      summary TEXT NOT NULL DEFAULT '',
      transcript TEXT NOT NULL DEFAULT '',
      subtitle_count INTEGER NOT NULL DEFAULT 0,
      category TEXT NOT NULL DEFAULT '',
      tags TEXT NOT NULL DEFAULT '',
      notes TEXT NOT NULL DEFAULT '',
      mode TEXT NOT NULL DEFAULT 'brief'
    );

   CREATE TABLE IF NOT EXISTS user_configs (
     user_id INTEGER PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
     api_key_enc TEXT NOT NULL DEFAULT '',
     password_hash TEXT NOT NULL DEFAULT '',
     bili_sessdata_enc TEXT NOT NULL DEFAULT '',
      whisper_api_key_enc TEXT NOT NULL DEFAULT '',
      whisper_base_url TEXT NOT NULL DEFAULT 'https://api.siliconflow.cn/v1',
      whisper_model TEXT NOT NULL DEFAULT 'FunAudioLLM/SenseVoiceSmall',
      deepseek_base_url TEXT NOT NULL DEFAULT 'https://api.deepseek.com/v1',
      deepseek_model TEXT NOT NULL DEFAULT 'deepseek-chat',
      obsidian_vault_path TEXT NOT NULL DEFAULT '',
      obsidian_folder TEXT NOT NULL DEFAULT 'BiliStudy',
      obsidian_mode TEXT NOT NULL DEFAULT 'local',
      obsidian_vault_name TEXT NOT NULL DEFAULT '',
      default_category TEXT NOT NULL DEFAULT '待整理'
    );

    CREATE TABLE IF NOT EXISTS daily_usage (
      user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      date TEXT NOT NULL,
      summarize_count INTEGER NOT NULL DEFAULT 0,
      PRIMARY KEY (user_id, date)
    );
  `);

  // Lightweight migration for existing databases that pre-date the
  // Web-Clipper-style Obsidian export columns. SQLite has no IF NOT EXISTS
  // for ADD COLUMN, so we inspect the table first.
  const cols = db
    .prepare("PRAGMA table_info(user_configs)")
    .all() as Array<{ name: string }>;
  const have = new Set(cols.map((c) => c.name));
  if (!have.has("obsidian_mode")) {
    db.exec("ALTER TABLE user_configs ADD COLUMN obsidian_mode TEXT NOT NULL DEFAULT 'local'");
  }
  if (!have.has("obsidian_vault_name")) {
    db.exec("ALTER TABLE user_configs ADD COLUMN obsidian_vault_name TEXT NOT NULL DEFAULT ''");
  }

  return db;
}
