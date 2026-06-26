import Database from "better-sqlite3";
import crypto from "crypto";
import { findLibraryItem } from "./libraryStore";

function nowSql(): string {
  return new Date().toISOString().replace("T", " ").slice(0, 19);
}

export function listPaths(db: Database.Database, userId: number) {
  const paths = db.prepare("SELECT * FROM learning_paths WHERE user_id = ? ORDER BY updated_at DESC").all(userId) as any[];
  return paths.map((path) => {
    const items = db.prepare(
      `SELECT lpi.*, li.title, li.author, li.pic, li.summary
       FROM learning_path_items lpi
       JOIN library_items li ON li.id = lpi.library_item_id AND li.user_id = ?
       WHERE lpi.path_id = ?
       ORDER BY lpi.position ASC, lpi.created_at ASC`
    ).all(userId, path.id) as any[];
    return {
      ...path,
      items,
      total: items.length,
      completed: items.filter((item) => !!item.completed_at).length,
    };
  });
}

export function createPath(db: Database.Database, userId: number, input: { title: string; description?: string }) {
  const id = crypto.randomUUID();
  const now = nowSql();
  db.prepare("INSERT INTO learning_paths (id, user_id, title, description, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)")
    .run(id, userId, input.title || "未命名学习路径", input.description || "", now, now);
  return listPaths(db, userId).find((p) => p.id === id);
}

export function updatePath(db: Database.Database, userId: number, id: string, input: { title?: string; description?: string }) {
  db.prepare("UPDATE learning_paths SET title = COALESCE(?, title), description = COALESCE(?, description), updated_at = ? WHERE id = ? AND user_id = ?")
    .run(input.title ?? null, input.description ?? null, nowSql(), id, userId);
  return listPaths(db, userId).find((p) => p.id === id) || null;
}

export function deletePath(db: Database.Database, userId: number, id: string): boolean {
  return db.prepare("DELETE FROM learning_paths WHERE id = ? AND user_id = ?").run(id, userId).changes > 0;
}

export function addPathItem(db: Database.Database, userId: number, pathId: string, libraryItemId: string) {
  const path = db.prepare("SELECT id FROM learning_paths WHERE id = ? AND user_id = ?").get(pathId, userId);
  const item = findLibraryItem(db, userId, libraryItemId);
  if (!path || !item) return false;
  const pos = (db.prepare("SELECT COALESCE(MAX(position), -1) + 1 AS pos FROM learning_path_items WHERE path_id = ?").get(pathId) as any).pos || 0;
  db.prepare("INSERT OR IGNORE INTO learning_path_items (path_id, library_item_id, position, created_at) VALUES (?, ?, ?, ?)").run(pathId, libraryItemId, pos, nowSql());
  db.prepare("UPDATE learning_paths SET updated_at = ? WHERE id = ? AND user_id = ?").run(nowSql(), pathId, userId);
  return true;
}

export function removePathItem(db: Database.Database, userId: number, pathId: string, libraryItemId: string): boolean {
  const path = db.prepare("SELECT id FROM learning_paths WHERE id = ? AND user_id = ?").get(pathId, userId);
  if (!path) return false;
  return db.prepare("DELETE FROM learning_path_items WHERE path_id = ? AND library_item_id = ?").run(pathId, libraryItemId).changes > 0;
}

export function markPathItemComplete(db: Database.Database, userId: number, pathId: string, libraryItemId: string, completed: boolean): boolean {
  const path = db.prepare("SELECT id FROM learning_paths WHERE id = ? AND user_id = ?").get(pathId, userId);
  if (!path) return false;
  const info = db.prepare("UPDATE learning_path_items SET completed_at = ? WHERE path_id = ? AND library_item_id = ?").run(completed ? nowSql() : null, pathId, libraryItemId);
  return info.changes > 0;
}

export function reorderPathItems(db: Database.Database, userId: number, pathId: string, orderedIds: string[]): boolean {
  const path = db.prepare("SELECT id FROM learning_paths WHERE id = ? AND user_id = ?").get(pathId, userId);
  if (!path) return false;
  const tx = db.transaction((ids: string[]) => {
    ids.forEach((id, idx) => db.prepare("UPDATE learning_path_items SET position = ? WHERE path_id = ? AND library_item_id = ?").run(idx, pathId, id));
  });
  tx(orderedIds.map(String));
  return true;
}

export function listDueReviews(db: Database.Database, userId: number) {
  return db.prepare(
    `SELECT ri.*, li.title AS item_title, li.summary AS item_summary
     FROM review_items ri
     LEFT JOIN library_items li ON li.id = ri.library_item_id AND li.user_id = ri.user_id
     WHERE ri.user_id = ? AND ri.next_review_at <= datetime('now')
     ORDER BY ri.next_review_at ASC`
  ).all(userId);
}

export function createReviewItem(db: Database.Database, userId: number, input: any) {
  const id = crypto.randomUUID();
  const now = nowSql();
  db.prepare(
    `INSERT INTO review_items (id, user_id, library_item_id, snippet_id, front, back, next_review_at, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, datetime('now'), ?, ?)`
  ).run(id, userId, input.library_item_id || null, input.snippet_id || null, input.front || "", input.back || "", now, now);
  return db.prepare("SELECT * FROM review_items WHERE id = ? AND user_id = ?").get(id, userId);
}

export function answerReviewItem(db: Database.Database, userId: number, id: string, quality: number) {
  const row = db.prepare("SELECT * FROM review_items WHERE id = ? AND user_id = ?").get(id, userId) as any;
  if (!row) return null;
  const q = Math.max(0, Math.min(5, Number(quality) || 0));
  let ease = Number(row.ease_factor || 2.5) + (0.1 - (5 - q) * (0.08 + (5 - q) * 0.02));
  ease = Math.max(1.3, ease);
  let reps = Number(row.repetitions || 0);
  let interval = Number(row.interval_days || 1);
  if (q < 3) {
    reps = 0;
    interval = 1;
  } else {
    reps += 1;
    if (reps === 1) interval = 1;
    else if (reps === 2) interval = 6;
    else interval = Math.round(interval * ease);
  }
  db.prepare(
    `UPDATE review_items SET next_review_at = datetime('now', ?), interval_days = ?, ease_factor = ?, repetitions = ?, last_reviewed_at = datetime('now'), updated_at = ? WHERE id = ? AND user_id = ?`
  ).run(`+${interval} days`, interval, ease, reps, nowSql(), id, userId);
  return db.prepare("SELECT * FROM review_items WHERE id = ? AND user_id = ?").get(id, userId);
}

export function deleteReviewItem(db: Database.Database, userId: number, id: string): boolean {
  return db.prepare("DELETE FROM review_items WHERE id = ? AND user_id = ?").run(id, userId).changes > 0;
}

export function saveQuiz(db: Database.Database, userId: number, libraryItemId: string, questions: any[]) {
  const id = crypto.randomUUID();
  db.prepare("INSERT INTO quizzes (id, user_id, library_item_id, questions_json, created_at) VALUES (?, ?, ?, ?, ?)")
    .run(id, userId, libraryItemId, JSON.stringify(questions || []), nowSql());
  return getQuiz(db, userId, id);
}

export function getQuiz(db: Database.Database, userId: number, id: string) {
  const row = db.prepare("SELECT * FROM quizzes WHERE id = ? AND user_id = ?").get(id, userId) as any;
  if (!row) return null;
  return { ...row, questions: safeJson(row.questions_json, []), answers: safeJson(row.answers_json, {}) };
}

export function submitQuiz(db: Database.Database, userId: number, id: string, answers: Record<string, unknown>) {
  const quiz = getQuiz(db, userId, id);
  if (!quiz) return null;
  const questions = quiz.questions || [];
  let correct = 0;
  questions.forEach((q: any, idx: number) => {
    if (String(answers[String(idx)] ?? "").trim() === String(q.answer ?? "").trim()) correct += 1;
  });
  const score = questions.length ? Math.round((correct / questions.length) * 100) : 0;
  db.prepare("UPDATE quizzes SET answers_json = ?, score = ?, completed_at = datetime('now') WHERE id = ? AND user_id = ?")
    .run(JSON.stringify(answers || {}), score, id, userId);
  return getQuiz(db, userId, id);
}

function safeJson(raw: string, fallback: any) {
  try { return JSON.parse(raw); } catch { return fallback; }
}
