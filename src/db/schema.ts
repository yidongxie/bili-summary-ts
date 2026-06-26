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
  is_admin?: number;
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
  pic: string;
}

export interface DbUserConfig {
  user_id: number;
  api_key_enc: string;
  password_hash: string;
  whisper_api_key_enc: string;
  yt_dlp_cookies_enc: string;
  whisper_base_url: string;
  whisper_model: string;
  deepseek_base_url: string;
  deepseek_model: string;
  obsidian_folder: string;
  obsidian_vault_name: string;
  default_category: string;
}

export interface DbDailyUsage {
  user_id: number;
  date: string;
  summarize_count: number;
}

export interface DbSummaryTask {
  id: string;
  user_id: number;
  user_email: string;
  status: string;
  progress: string;
  result_json: string;
  error: string;
  created_at: number;
  updated_at: number;
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
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      is_admin INTEGER NOT NULL DEFAULT 0
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
      mode TEXT NOT NULL DEFAULT 'brief',
      pic TEXT NOT NULL DEFAULT ''
    );

    CREATE TABLE IF NOT EXISTS user_configs (
      user_id INTEGER PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
      api_key_enc TEXT NOT NULL DEFAULT '',
      password_hash TEXT NOT NULL DEFAULT '',
      whisper_api_key_enc TEXT NOT NULL DEFAULT '',
      yt_dlp_cookies_enc TEXT NOT NULL DEFAULT '',
      whisper_base_url TEXT NOT NULL DEFAULT 'https://api.siliconflow.cn/v1',
      whisper_model TEXT NOT NULL DEFAULT 'FunAudioLLM/SenseVoiceSmall',
      deepseek_base_url TEXT NOT NULL DEFAULT 'https://api.deepseek.com/v1',
      deepseek_model TEXT NOT NULL DEFAULT 'deepseek-chat',
      obsidian_folder TEXT NOT NULL DEFAULT 'BiliStudy',
      obsidian_vault_name TEXT NOT NULL DEFAULT '',
      default_category TEXT NOT NULL DEFAULT '待整理'
    );

    CREATE TABLE IF NOT EXISTS daily_usage (
      user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      date TEXT NOT NULL,
      summarize_count INTEGER NOT NULL DEFAULT 0,
      PRIMARY KEY (user_id, date)
    );

    CREATE TABLE IF NOT EXISTS summary_tasks (
      id TEXT PRIMARY KEY,
      user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      user_email TEXT NOT NULL DEFAULT '',
      status TEXT NOT NULL DEFAULT 'pending',
      progress TEXT NOT NULL DEFAULT '',
      result_json TEXT NOT NULL DEFAULT '',
      error TEXT NOT NULL DEFAULT '',
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS tag_metadata (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      tag_name TEXT NOT NULL,
      color TEXT NOT NULL DEFAULT '#0ea5e9',
      description TEXT NOT NULL DEFAULT '',
      updated_at TEXT NOT NULL DEFAULT (datetime('now')),
      UNIQUE(user_id, tag_name)
    );

    CREATE TABLE IF NOT EXISTS snippets (
      id TEXT PRIMARY KEY,
      user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      library_item_id TEXT NOT NULL REFERENCES library_items(id) ON DELETE CASCADE,
      content TEXT NOT NULL DEFAULT '',
      source_text TEXT NOT NULL DEFAULT '',
      timestamp_sec INTEGER,
      tags TEXT NOT NULL DEFAULT '[]',
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS learning_paths (
      id TEXT PRIMARY KEY,
      user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      title TEXT NOT NULL DEFAULT '',
      description TEXT NOT NULL DEFAULT '',
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS learning_path_items (
      path_id TEXT NOT NULL REFERENCES learning_paths(id) ON DELETE CASCADE,
      library_item_id TEXT NOT NULL REFERENCES library_items(id) ON DELETE CASCADE,
      position INTEGER NOT NULL DEFAULT 0,
      completed_at TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      PRIMARY KEY (path_id, library_item_id)
    );

    CREATE TABLE IF NOT EXISTS review_items (
      id TEXT PRIMARY KEY,
      user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      library_item_id TEXT REFERENCES library_items(id) ON DELETE CASCADE,
      snippet_id TEXT REFERENCES snippets(id) ON DELETE CASCADE,
      front TEXT NOT NULL DEFAULT '',
      back TEXT NOT NULL DEFAULT '',
      next_review_at TEXT NOT NULL DEFAULT (datetime('now')),
      interval_days INTEGER NOT NULL DEFAULT 1,
      ease_factor REAL NOT NULL DEFAULT 2.5,
      repetitions INTEGER NOT NULL DEFAULT 0,
      last_reviewed_at TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS quizzes (
      id TEXT PRIMARY KEY,
      user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      library_item_id TEXT NOT NULL REFERENCES library_items(id) ON DELETE CASCADE,
      questions_json TEXT NOT NULL DEFAULT '[]',
      answers_json TEXT NOT NULL DEFAULT '{}',
      score REAL,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      completed_at TEXT
    );

    CREATE TABLE IF NOT EXISTS api_usage_logs (
      id TEXT PRIMARY KEY,
      user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      provider TEXT NOT NULL DEFAULT '',
      model TEXT NOT NULL DEFAULT '',
      endpoint TEXT NOT NULL DEFAULT '',
      tokens_input INTEGER NOT NULL DEFAULT 0,
      tokens_output INTEGER NOT NULL DEFAULT 0,
      duration_ms INTEGER NOT NULL DEFAULT 0,
      estimated_cost_usd REAL NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS chat_threads (
      id TEXT PRIMARY KEY,
      user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      library_item_id TEXT REFERENCES library_items(id) ON DELETE CASCADE,
      target_key TEXT NOT NULL DEFAULT '',
      title TEXT NOT NULL DEFAULT '',
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS chat_messages (
      id TEXT PRIMARY KEY,
      thread_id TEXT NOT NULL REFERENCES chat_threads(id) ON DELETE CASCADE,
      user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      role TEXT NOT NULL DEFAULT 'user',
      content TEXT NOT NULL DEFAULT '',
      citations_json TEXT NOT NULL DEFAULT '[]',
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
  `);

  // Migration: add indexes for hot lookups and cleanup jobs.
  try {
    db.exec(`
      CREATE INDEX IF NOT EXISTS idx_summary_tasks_user ON summary_tasks(user_id, updated_at);
      CREATE INDEX IF NOT EXISTS idx_summary_tasks_updated ON summary_tasks(updated_at);
      CREATE INDEX IF NOT EXISTS idx_sessions_expires ON sessions(expires_at);
      CREATE INDEX IF NOT EXISTS idx_library_user_updated ON library_items(user_id, updated_at);
      CREATE INDEX IF NOT EXISTS idx_library_user_bvid ON library_items(user_id, bvid);
      CREATE INDEX IF NOT EXISTS idx_snippets_user_item ON snippets(user_id, library_item_id);
      CREATE INDEX IF NOT EXISTS idx_learning_paths_user ON learning_paths(user_id, updated_at);
      CREATE INDEX IF NOT EXISTS idx_review_due ON review_items(user_id, next_review_at);
      CREATE INDEX IF NOT EXISTS idx_quizzes_user_item ON quizzes(user_id, library_item_id, created_at);
      CREATE INDEX IF NOT EXISTS idx_usage_user_time ON api_usage_logs(user_id, created_at);
      CREATE INDEX IF NOT EXISTS idx_chat_threads_user_target ON chat_threads(user_id, target_key);
      CREATE INDEX IF NOT EXISTS idx_chat_messages_thread ON chat_messages(thread_id, created_at);
    `);
  } catch { /* ignore */ }

  const userCols = db.prepare("PRAGMA table_info(users)").all() as Array<{ name: string }>;
  const haveUsers = new Set(userCols.map((c) => c.name));
  if (!haveUsers.has("is_admin")) {
    db.exec("ALTER TABLE users ADD COLUMN is_admin INTEGER NOT NULL DEFAULT 0");
  }

  const cols = db.prepare("PRAGMA table_info(user_configs)").all() as Array<{ name: string }>;
  const have = new Set(cols.map((c) => c.name));
  if (!have.has("obsidian_vault_name")) {
    db.exec("ALTER TABLE user_configs ADD COLUMN obsidian_vault_name TEXT NOT NULL DEFAULT ''");
  }
  if (!have.has("yt_dlp_cookies_enc")) {
    db.exec("ALTER TABLE user_configs ADD COLUMN yt_dlp_cookies_enc TEXT NOT NULL DEFAULT ''");
  }

  // Migration: add pic column for cover image
  const libCols = db.prepare("PRAGMA table_info(library_items)").all() as Array<{ name: string }>;
  const haveLib = new Set(libCols.map((c) => c.name));
  if (!haveLib.has("pic")) {
    db.exec("ALTER TABLE library_items ADD COLUMN pic TEXT NOT NULL DEFAULT ''");
  }

  // Optional FTS5 index. Some SQLite builds may not include FTS5, so startup must remain safe.
  try {
    db.exec(`
      CREATE VIRTUAL TABLE IF NOT EXISTS library_items_fts USING fts5(
        id UNINDEXED,
        user_id UNINDEXED,
        title,
        author,
        summary,
        transcript,
        category,
        tags,
        notes
      );
    `);
    const count = db.prepare("SELECT COUNT(*) AS count FROM library_items_fts").get() as { count: number };
    if (!count.count) {
      const rows = db.prepare("SELECT id, user_id, title, author, summary, transcript, category, tags, notes FROM library_items").all() as any[];
      const insert = db.prepare(`INSERT INTO library_items_fts (id, user_id, title, author, summary, transcript, category, tags, notes) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`);
      const tx = db.transaction((items: any[]) => {
        for (const item of items) {
          insert.run(item.id, String(item.user_id), item.title || "", item.author || "", item.summary || "", item.transcript || "", item.category || "", item.tags || "", item.notes || "");
        }
      });
      tx(rows);
    }
  } catch (err: any) {
    console.warn("[db] SQLite FTS5 unavailable; library search will use fallback:", err?.message || err);
  }

  return db;
}
