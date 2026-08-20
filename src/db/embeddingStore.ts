/** Embedding storage + brute-force cosine search (fine for personal libraries). */

import Database from "better-sqlite3";
import { nowSql } from "../common/date";
import { findLibraryItem, type LibraryItem } from "./libraryStore";

export function saveEmbedding(db: Database.Database, itemId: string, model: string, vector: number[]): void {
  db.prepare(
    `INSERT INTO item_embeddings (library_item_id, model, vector, updated_at) VALUES (?, ?, ?, ?)
     ON CONFLICT(library_item_id) DO UPDATE SET model = excluded.model, vector = excluded.vector, updated_at = excluded.updated_at`
  ).run(itemId, model, JSON.stringify(vector), nowSql());
}

export function deleteEmbedding(db: Database.Database, itemId: string): void {
  db.prepare("DELETE FROM item_embeddings WHERE library_item_id = ?").run(itemId);
}

function normalize(v: number[]): number[] {
  const norm = Math.sqrt(v.reduce((s, x) => s + x * x, 0)) || 1;
  return v.map((x) => x / norm);
}

function dot(a: number[], b: number[]): number {
  let s = 0;
  const n = Math.min(a.length, b.length);
  for (let i = 0; i < n; i++) s += a[i] * b[i];
  return s;
}

export interface SemanticHit {
  item: LibraryItem;
  score: number;
}

export function searchLibrarySemantic(db: Database.Database, userId: number, queryVector: number[], limit = 10): SemanticHit[] {
  const rows = db
    .prepare(
      `SELECT e.library_item_id, e.vector FROM item_embeddings e
       JOIN library_items li ON li.id = e.library_item_id
       WHERE li.user_id = ?`
    )
    .all(userId) as Array<{ library_item_id: string; vector: string }>;

  const q = normalize(queryVector);
  const scored: Array<{ id: string; score: number }> = [];
  for (const row of rows) {
    try {
      const v = normalize(JSON.parse(row.vector));
      if (!v.length) continue;
      scored.push({ id: row.library_item_id, score: dot(q, v) });
    } catch {
      // skip malformed vector
    }
  }
  scored.sort((a, b) => b.score - a.score);

  const out: SemanticHit[] = [];
  const seen = new Set<string>();
  for (const s of scored) {
    if (seen.has(s.id)) continue;
    seen.add(s.id);
    const item = findLibraryItem(db, userId, s.id);
    if (item) out.push({ item, score: s.score });
    if (out.length >= limit) break;
  }
  return out;
}
