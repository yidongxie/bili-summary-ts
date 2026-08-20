/** Theme store — group scattered library items into topics. */

import Database from "better-sqlite3";
import crypto from "crypto";
import { nowSql } from "../common/date";
import { findLibraryItem, type LibraryItem } from "./libraryStore";

export interface Theme {
  id: string;
  user_id: number;
  name: string;
  description: string;
  created_at: string;
  updated_at: string;
  item_count: number;
}

function rowToTheme(row: any): Theme {
  return {
    id: row.id,
    user_id: row.user_id,
    name: row.name,
    description: row.description || "",
    created_at: row.created_at,
    updated_at: row.updated_at,
    item_count: Number(row.item_count || 0),
  };
}

export function listThemes(db: Database.Database, userId: number): Theme[] {
  const rows = db
    .prepare(
      `SELECT t.*, (SELECT COUNT(*) FROM theme_items ti WHERE ti.theme_id = t.id) AS item_count
       FROM themes t WHERE t.user_id = ? ORDER BY t.updated_at DESC`
    )
    .all(userId) as any[];
  return rows.map(rowToTheme);
}

export function getTheme(db: Database.Database, userId: number, themeId: string): Theme | null {
  const row = db
    .prepare(
      `SELECT t.*, (SELECT COUNT(*) FROM theme_items ti WHERE ti.theme_id = t.id) AS item_count
       FROM themes t WHERE t.id = ? AND t.user_id = ?`
    )
    .get(themeId, userId) as any;
  return row ? rowToTheme(row) : null;
}

export function findThemeByName(db: Database.Database, userId: number, name: string): Theme | null {
  const row = db
    .prepare(
      `SELECT t.*, (SELECT COUNT(*) FROM theme_items ti WHERE ti.theme_id = t.id) AS item_count
       FROM themes t WHERE t.user_id = ? AND lower(t.name) = lower(?)`
    )
    .get(userId, String(name || "").trim()) as any;
  return row ? rowToTheme(row) : null;
}

export function createTheme(db: Database.Database, userId: number, name: string, description = ""): Theme {
  const cleanName = String(name || "").trim();
  const id = crypto.randomUUID();
  const now = nowSql();
  db.prepare("INSERT INTO themes (id, user_id, name, description, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)").run(id, userId, cleanName, description || "", now, now);
  return getTheme(db, userId, id)!;
}

export function renameTheme(db: Database.Database, userId: number, themeId: string, name: string): Theme | null {
  const cleanName = String(name || "").trim();
  if (!cleanName) return null;
  db.prepare("UPDATE themes SET name = ?, updated_at = ? WHERE id = ? AND user_id = ?").run(cleanName, nowSql(), themeId, userId);
  return getTheme(db, userId, themeId);
}

export function deleteTheme(db: Database.Database, userId: number, themeId: string): boolean {
  return db.prepare("DELETE FROM themes WHERE id = ? AND user_id = ?").run(themeId, userId).changes > 0;
}

export function addThemeItems(db: Database.Database, userId: number, themeId: string, itemIds: string[]): number {
  const theme = getTheme(db, userId, themeId);
  if (!theme) return 0;
  const insert = db.prepare("INSERT OR IGNORE INTO theme_items (theme_id, library_item_id) VALUES (?, ?)");
  let added = 0;
  const tx = db.transaction((ids: string[]) => {
    for (const itemId of ids) {
      const item = findLibraryItem(db, userId, itemId);
      if (!item) continue;
      added += insert.run(themeId, itemId).changes;
    }
  });
  tx(itemIds);
  db.prepare("UPDATE themes SET updated_at = ? WHERE id = ?").run(nowSql(), themeId);
  return added;
}

export function removeThemeItem(db: Database.Database, userId: number, themeId: string, itemId: string): boolean {
  const theme = getTheme(db, userId, themeId);
  if (!theme) return false;
  return db.prepare("DELETE FROM theme_items WHERE theme_id = ? AND library_item_id = ?").run(themeId, itemId).changes > 0;
}

export function getThemeItems(db: Database.Database, userId: number, themeId: string): LibraryItem[] {
  const theme = getTheme(db, userId, themeId);
  if (!theme) return [];
  const rows = db.prepare("SELECT library_item_id FROM theme_items WHERE theme_id = ? ORDER BY created_at DESC").all(themeId) as Array<{ library_item_id: string }>;
  return rows.map((r) => findLibraryItem(db, userId, r.library_item_id)).filter(Boolean) as LibraryItem[];
}

export function isItemThemed(db: Database.Database, userId: number, itemId: string): boolean {
  const row = db
    .prepare("SELECT 1 FROM theme_items ti JOIN themes t ON t.id = ti.theme_id WHERE ti.library_item_id = ? AND t.user_id = ?")
    .get(itemId, userId);
  return !!row;
}
