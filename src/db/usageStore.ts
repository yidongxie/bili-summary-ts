import Database from "better-sqlite3";
import crypto from "crypto";

function nowSql(): string {
  return new Date().toISOString().replace("T", " ").slice(0, 19);
}

export function recordApiUsage(db: Database.Database, userId: number, usage: {
  provider?: string;
  model?: string;
  endpoint?: string;
  tokens_input?: number;
  tokens_output?: number;
  duration_ms?: number;
  estimated_cost_usd?: number;
}) {
  try {
    db.prepare(
      `INSERT INTO api_usage_logs (id, user_id, provider, model, endpoint, tokens_input, tokens_output, duration_ms, estimated_cost_usd, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    ).run(
      crypto.randomUUID(),
      userId,
      usage.provider || "llm",
      usage.model || "",
      usage.endpoint || "",
      Math.max(0, Number(usage.tokens_input || 0)),
      Math.max(0, Number(usage.tokens_output || 0)),
      Math.max(0, Number(usage.duration_ms || 0)),
      Math.max(0, Number(usage.estimated_cost_usd || 0)),
      nowSql(),
    );
  } catch (err) {
    console.warn("[usage] failed to record", err);
  }
}

export function getAdminStats(db: Database.Database) {
  const users = db.prepare("SELECT COUNT(*) AS count FROM users").get() as any;
  const tasksToday = db.prepare("SELECT COUNT(*) AS count FROM summary_tasks WHERE created_at >= ?").get(Date.now() - 24 * 60 * 60 * 1000) as any;
  const failedTasks = db.prepare("SELECT COUNT(*) AS count FROM summary_tasks WHERE status = 'error'").get() as any;
  const usage = db.prepare("SELECT COUNT(*) AS calls, COALESCE(SUM(estimated_cost_usd), 0) AS cost FROM api_usage_logs WHERE created_at >= datetime('now', '-7 days')").get() as any;
  const library = db.prepare("SELECT COUNT(*) AS count FROM library_items").get() as any;
  return {
    users: users.count || 0,
    tasks_today: tasksToday.count || 0,
    failed_tasks: failedTasks.count || 0,
    usage_calls_7d: usage.calls || 0,
    estimated_cost_7d: usage.cost || 0,
    library_items: library.count || 0,
  };
}

export function listAdminUsers(db: Database.Database) {
  return db.prepare(
    `SELECT u.id, u.email, u.display_name, u.created_at,
      (SELECT COUNT(*) FROM library_items li WHERE li.user_id = u.id) AS library_count,
      (SELECT COALESCE(SUM(summarize_count), 0) FROM daily_usage du WHERE du.user_id = u.id) AS summarize_count
     FROM users u
     ORDER BY u.created_at DESC
     LIMIT 200`
  ).all();
}

export function listAdminTasks(db: Database.Database) {
  return db.prepare(
    `SELECT id, user_id, user_email, status, error, created_at, updated_at
     FROM summary_tasks
     ORDER BY updated_at DESC
     LIMIT 100`
  ).all();
}

export function listAdminUsage(db: Database.Database) {
  return db.prepare(
    `SELECT provider, model, endpoint, COUNT(*) AS calls,
      SUM(tokens_input) AS tokens_input,
      SUM(tokens_output) AS tokens_output,
      SUM(estimated_cost_usd) AS estimated_cost_usd
     FROM api_usage_logs
     WHERE created_at >= datetime('now', '-30 days')
     GROUP BY provider, model, endpoint
     ORDER BY calls DESC
     LIMIT 100`
  ).all();
}

export function getOrCreateChatThread(db: Database.Database, userId: number, input: { library_item_id?: string; target_key?: string; title?: string }) {
  const targetKey = input.target_key || input.library_item_id || "default";
  const existing = db.prepare("SELECT * FROM chat_threads WHERE user_id = ? AND target_key = ?").get(userId, targetKey) as any;
  if (existing) return existing;
  const id = crypto.randomUUID();
  const now = nowSql();
  db.prepare("INSERT INTO chat_threads (id, user_id, library_item_id, target_key, title, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)")
    .run(id, userId, input.library_item_id || null, targetKey, input.title || "学习对话", now, now);
  return db.prepare("SELECT * FROM chat_threads WHERE id = ?").get(id);
}

export function listChatMessages(db: Database.Database, userId: number, threadId: string) {
  return db.prepare("SELECT * FROM chat_messages WHERE user_id = ? AND thread_id = ? ORDER BY created_at ASC").all(userId, threadId).map((row: any) => ({ ...row, citations: safeJson(row.citations_json, []) }));
}

export function appendChatMessage(db: Database.Database, userId: number, threadId: string, message: { role: string; content: string; citations?: any[] }) {
  const thread = db.prepare("SELECT id FROM chat_threads WHERE id = ? AND user_id = ?").get(threadId, userId);
  if (!thread) return null;
  const id = crypto.randomUUID();
  db.prepare("INSERT INTO chat_messages (id, thread_id, user_id, role, content, citations_json, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)")
    .run(id, threadId, userId, message.role || "user", message.content || "", JSON.stringify(message.citations || []), nowSql());
  db.prepare("UPDATE chat_threads SET updated_at = ? WHERE id = ? AND user_id = ?").run(nowSql(), threadId, userId);
  return db.prepare("SELECT * FROM chat_messages WHERE id = ?").get(id);
}

function safeJson(raw: string, fallback: any) {
  try { return JSON.parse(raw); } catch { return fallback; }
}
