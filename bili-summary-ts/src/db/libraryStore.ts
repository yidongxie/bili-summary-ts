/** Library store – CRUD for library_items per user */

import Database from "better-sqlite3";
import crypto from "crypto";

export interface LibraryItem {
  id: string;
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
  tags: string[];
  notes: string;
  mode: string;
}

export function loadLibrary(db: Database.Database, userId: number): LibraryItem[] {
  const rows = db
    .prepare("SELECT * FROM library_items WHERE user_id = ? ORDER BY updated_at DESC")
    .all(userId) as any[];
  return rows.map(rowToItem);
}

export function findLibraryItem(db: Database.Database, userId: number, id: string): LibraryItem | null {
  const row = db
    .prepare("SELECT * FROM library_items WHERE id = ? AND user_id = ?")
    .get(id, userId) as any;
  return row ? rowToItem(row) : null;
}

export function findLibraryItemByBvid(db: Database.Database, userId: number, bvid: string): LibraryItem | null {
  const row = db
    .prepare("SELECT * FROM library_items WHERE bvid = ? AND user_id = ?")
    .get(bvid, userId) as any;
  return row ? rowToItem(row) : null;
}

export function saveLibraryItem(
  db: Database.Database,
  userId: number,
  data: Partial<LibraryItem> & { id?: string }
): LibraryItem {
  const now = new Date().toISOString().replace("T", " ").slice(0, 19);
  const id = data.id || crypto.randomUUID();
  const existing = db.prepare("SELECT * FROM library_items WHERE id = ? AND user_id = ?").get(id, userId) as any;

  if (existing) {
    db.prepare(
      `UPDATE library_items SET
        updated_at = ?, title = ?, author = ?, duration = ?, bvid = ?, link = ?,
        summary = ?, transcript = ?, subtitle_count = ?, category = ?, tags = ?,
        notes = ?, mode = ?
       WHERE id = ? AND user_id = ?`
    ).run(
      now,
      data.title || existing.title || "",
      data.author || existing.author || "",
      data.duration ?? existing.duration ?? 0,
      data.bvid || existing.bvid || "",
      data.link || existing.link || "",
      data.summary || existing.summary || "",
      data.transcript || existing.transcript || "",
      data.subtitle_count ?? existing.subtitle_count ?? 0,
      data.category || existing.category || "待整理",
      JSON.stringify(data.tags || JSON.parse(existing.tags || "[]")),
      data.notes || existing.notes || "",
      data.mode || existing.mode || "brief",
      id,
      userId
    );
  } else {
    db.prepare(
      `INSERT INTO library_items
        (id, user_id, created_at, updated_at, title, author, duration, bvid, link,
         summary, transcript, subtitle_count, category, tags, notes, mode)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    ).run(
      id,
      userId,
      now,
      now,
      data.title || "",
      data.author || "",
      data.duration ?? 0,
      data.bvid || "",
      data.link || "",
      data.summary || "",
      data.transcript || "",
      data.subtitle_count ?? 0,
      data.category || "待整理",
      JSON.stringify(data.tags || []),
      data.notes || "",
      data.mode || "brief"
    );
  }

  return findLibraryItem(db, userId, id)!;
}

export function deleteLibraryItem(db: Database.Database, userId: number, id: string): boolean {
  const info = db.prepare("DELETE FROM library_items WHERE id = ? AND user_id = ?").run(id, userId);
  return info.changes > 0;
}

function rowToItem(row: any): LibraryItem {
  return {
    id: row.id,
    created_at: row.created_at,
    updated_at: row.updated_at,
    title: row.title,
    author: row.author,
    duration: row.duration,
    bvid: row.bvid,
    link: row.link,
    summary: row.summary,
    transcript: row.transcript,
    subtitle_count: row.subtitle_count,
    category: row.category,
    tags: parseTags(row.tags),
    notes: row.notes,
    mode: row.mode,
  };
}

function parseTags(raw: string): string[] {
  try {
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed)) return parsed.map(String).filter(Boolean);
  } catch {
    // fallback
  }
  return raw
    .split(/[,，\s#]+/)
    .map((s) => s.trim())
    .filter(Boolean);
}
