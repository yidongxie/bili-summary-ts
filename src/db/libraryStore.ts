/** Library store – CRUD/search/bulk helpers for library_items per user */

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
  pic: string;
  snippet?: string;
  highlights?: string[];
}

export interface TagInfo {
  name: string;
  count: number;
  color: string;
  description: string;
}

export interface Snippet {
  id: string;
  user_id: number;
  library_item_id: string;
  content: string;
  source_text: string;
  timestamp_sec: number | null;
  tags: string[];
  created_at: string;
  updated_at: string;
}

export function loadLibrary(db: Database.Database, userId: number): LibraryItem[] {
  const rows = db.prepare("SELECT * FROM library_items WHERE user_id = ? ORDER BY updated_at DESC").all(userId) as any[];
  return rows.map(rowToItem);
}

export interface LibraryQueryOptions {
  q?: string;
  category?: string;
  tag?: string;
  page?: number;
  pageSize?: number;
  sort?: string;
}

export interface LibraryQueryResult {
  items: LibraryItem[];
  total: number;
  page: number;
  pageSize: number;
  categories: string[];
  tags: string[];
}

export function queryLibrary(db: Database.Database, userId: number, options: LibraryQueryOptions = {}): LibraryQueryResult {
  const page = Math.max(1, Number(options.page || 1));
  const pageSize = Math.min(100, Math.max(1, Number(options.pageSize || 20)));
  const q = String(options.q || "").trim();
  const qLower = q.toLowerCase();
  const category = String(options.category || "").trim();
  const tag = String(options.tag || "").trim().toLowerCase();
  const sort = String(options.sort || "updated_desc");

  const allItems = loadLibrary(db, userId);
  const categories = [...new Set(allItems.map((i) => i.category).filter(Boolean))];
  const tags = [...new Set(allItems.flatMap((i) => i.tags || []))];

  let filtered = q ? searchLibraryItems(db, userId, q, allItems) : allItems;
  if (category) filtered = filtered.filter((i) => i.category === category);
  if (tag) filtered = filtered.filter((i) => (i.tags || []).some((t) => t.toLowerCase() === tag));
  if (q && !filtered.length) {
    filtered = allItems.filter((i) => itemMatches(i, qLower)).map((i) => ({ ...i, snippet: makeSnippet(i, qLower), highlights: [q] }));
  }

  filtered = [...filtered].sort((a, b) => {
    if (sort === "updated_asc") return String(a.updated_at || a.created_at).localeCompare(String(b.updated_at || b.created_at));
    if (sort === "title_asc") return a.title.localeCompare(b.title, "zh-Hans-CN");
    if (sort === "duration_desc") return (b.duration || 0) - (a.duration || 0);
    if (q) return 0;
    return String(b.updated_at || b.created_at).localeCompare(String(a.updated_at || a.created_at));
  });

  const total = filtered.length;
  const start = (page - 1) * pageSize;
  return { items: filtered.slice(start, start + pageSize), total, page, pageSize, categories, tags };
}

function searchLibraryItems(db: Database.Database, userId: number, q: string, allItems: LibraryItem[]): LibraryItem[] {
  const byId = new Map(allItems.map((item) => [item.id, item]));
  try {
    const ftsQuery = toFtsQuery(q);
    if (!ftsQuery) throw new Error("empty fts query");
    const rows = db.prepare(
      `SELECT id, snippet(library_items_fts, 2, '<mark>', '</mark>', '…', 18) AS snippet
       FROM library_items_fts
       WHERE user_id = ? AND library_items_fts MATCH ?
       ORDER BY bm25(library_items_fts)
       LIMIT 500`
    ).all(String(userId), ftsQuery) as Array<{ id: string; snippet?: string }>;
    return rows
      .map((row) => {
        const item = byId.get(row.id);
        return item ? { ...item, snippet: cleanSnippet(row.snippet || makeSnippet(item, q.toLowerCase())), highlights: [q] } : null;
      })
      .filter(Boolean) as LibraryItem[];
  } catch {
    const qLower = q.toLowerCase();
    return allItems.filter((i) => itemMatches(i, qLower)).map((i) => ({ ...i, snippet: makeSnippet(i, qLower), highlights: [q] }));
  }
}

function toFtsQuery(q: string): string {
  return q
    .split(/\s+/)
    .map((part) => part.replace(/["'`*:\-^~()]/g, "").trim())
    .filter(Boolean)
    .map((part) => `${part}*`)
    .join(" OR ");
}

function cleanSnippet(snippet: string): string {
  return snippet.replace(/\s+/g, " ").trim();
}

function itemMatches(item: LibraryItem, q: string): boolean {
  return [item.title, item.author, item.summary, item.transcript, item.category, item.notes, ...(item.tags || [])]
    .join("\n")
    .toLowerCase()
    .includes(q);
}

function makeSnippet(item: LibraryItem, q: string): string {
  const haystack = [item.summary, item.transcript, item.notes, item.title].filter(Boolean).join("\n");
  const lower = haystack.toLowerCase();
  const idx = q ? lower.indexOf(q) : -1;
  if (idx < 0) return haystack.replace(/\s+/g, " ").slice(0, 180);
  const start = Math.max(0, idx - 70);
  const end = Math.min(haystack.length, idx + q.length + 110);
  return (start > 0 ? "…" : "") + haystack.slice(start, end).replace(/\s+/g, " ") + (end < haystack.length ? "…" : "");
}

export function findLibraryItem(db: Database.Database, userId: number, id: string): LibraryItem | null {
  const row = db.prepare("SELECT * FROM library_items WHERE id = ? AND user_id = ?").get(id, userId) as any;
  return row ? rowToItem(row) : null;
}

export function findLibraryItemByBvid(db: Database.Database, userId: number, bvid: string): LibraryItem | null {
  const row = db.prepare("SELECT * FROM library_items WHERE bvid = ? AND user_id = ?").get(bvid, userId) as any;
  return row ? rowToItem(row) : null;
}

export function saveLibraryItem(db: Database.Database, userId: number, data: Partial<LibraryItem> & { id?: string }): LibraryItem {
  const now = nowSql();
  const id = data.id || crypto.randomUUID();
  const existing = db.prepare("SELECT * FROM library_items WHERE id = ? AND user_id = ?").get(id, userId) as any;
  const tags = normalizeTags(data.tags || (existing ? parseTags(existing.tags || "[]") : []));

  if (existing) {
    db.prepare(
      `UPDATE library_items SET
        updated_at = ?, title = ?, author = ?, duration = ?, bvid = ?, link = ?,
        summary = ?, transcript = ?, subtitle_count = ?, category = ?, tags = ?,
        notes = ?, mode = ?, pic = ?
       WHERE id = ? AND user_id = ?`
    ).run(
      now,
      data.title ?? existing.title ?? "",
      data.author ?? existing.author ?? "",
      data.duration ?? existing.duration ?? 0,
      data.bvid ?? existing.bvid ?? "",
      data.link ?? existing.link ?? "",
      data.summary ?? existing.summary ?? "",
      data.transcript ?? existing.transcript ?? "",
      data.subtitle_count ?? existing.subtitle_count ?? 0,
      data.category ?? existing.category ?? "待整理",
      JSON.stringify(tags),
      data.notes ?? existing.notes ?? "",
      data.mode ?? existing.mode ?? "brief",
      data.pic ?? existing.pic ?? "",
      id,
      userId
    );
  } else {
    db.prepare(
      `INSERT INTO library_items
        (id, user_id, created_at, updated_at, title, author, duration, bvid, link,
         summary, transcript, subtitle_count, category, tags, notes, mode, pic)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
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
      JSON.stringify(tags),
      data.notes || "",
      data.mode || "brief",
      data.pic || ""
    );
  }

  const item = findLibraryItem(db, userId, id)!;
  syncLibraryFtsItem(db, userId, item);
  return item;
}

export function deleteLibraryItem(db: Database.Database, userId: number, id: string): boolean {
  const info = db.prepare("DELETE FROM library_items WHERE id = ? AND user_id = ?").run(id, userId);
  if (info.changes > 0) deleteLibraryFtsItem(db, userId, id);
  return info.changes > 0;
}

export function reindexLibraryFts(db: Database.Database, userId: number): number {
  const items = loadLibrary(db, userId);
  try {
    db.prepare("DELETE FROM library_items_fts WHERE user_id = ?").run(String(userId));
    const tx = db.transaction((rows: LibraryItem[]) => rows.forEach((item) => syncLibraryFtsItem(db, userId, item)));
    tx(items);
  } catch {
    return 0;
  }
  return items.length;
}

export function syncLibraryFtsItem(db: Database.Database, userId: number, item: LibraryItem): void {
  try {
    db.prepare("DELETE FROM library_items_fts WHERE id = ? AND user_id = ?").run(item.id, String(userId));
    db.prepare(
      `INSERT INTO library_items_fts (id, user_id, title, author, summary, transcript, category, tags, notes)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
    ).run(item.id, String(userId), item.title || "", item.author || "", item.summary || "", item.transcript || "", item.category || "", (item.tags || []).join(" "), item.notes || "");
  } catch { /* FTS5 unavailable */ }
}

export function deleteLibraryFtsItem(db: Database.Database, userId: number, id: string): void {
  try { db.prepare("DELETE FROM library_items_fts WHERE id = ? AND user_id = ?").run(id, String(userId)); } catch { /* ignore */ }
}

export function listTags(db: Database.Database, userId: number): TagInfo[] {
  const counts = new Map<string, number>();
  for (const item of loadLibrary(db, userId)) {
    for (const tag of item.tags || []) counts.set(tag, (counts.get(tag) || 0) + 1);
  }
  const metaRows = db.prepare("SELECT tag_name, color, description FROM tag_metadata WHERE user_id = ?").all(userId) as any[];
  const meta = new Map(metaRows.map((r) => [r.tag_name, r]));
  return [...counts.entries()]
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0], "zh-Hans-CN"))
    .map(([name, count]) => ({ name, count, color: meta.get(name)?.color || "#0ea5e9", description: meta.get(name)?.description || "" }));
}

export function updateTagMetadata(db: Database.Database, userId: number, tagName: string, color = "#0ea5e9", description = ""): void {
  const name = cleanTag(tagName);
  if (!name) return;
  db.prepare(
    `INSERT INTO tag_metadata (user_id, tag_name, color, description, updated_at)
     VALUES (?, ?, ?, ?, ?)
     ON CONFLICT(user_id, tag_name) DO UPDATE SET color = excluded.color, description = excluded.description, updated_at = excluded.updated_at`
  ).run(userId, name, color || "#0ea5e9", description || "", nowSql());
}

export function renameTag(db: Database.Database, userId: number, from: string, to: string): number {
  const fromTag = cleanTag(from).toLowerCase();
  const toTag = cleanTag(to);
  if (!fromTag || !toTag) return 0;
  return mutateItems(db, userId, (item) => {
    if (!item.tags.some((t) => t.toLowerCase() === fromTag)) return null;
    return { tags: normalizeTags(item.tags.map((t) => (t.toLowerCase() === fromTag ? toTag : t))) };
  });
}

export function mergeTags(db: Database.Database, userId: number, from: string, to: string): number {
  return renameTag(db, userId, from, to);
}

export function deleteTag(db: Database.Database, userId: number, tag: string): number {
  const target = cleanTag(tag).toLowerCase();
  if (!target) return 0;
  return mutateItems(db, userId, (item) => {
    if (!item.tags.some((t) => t.toLowerCase() === target)) return null;
    return { tags: item.tags.filter((t) => t.toLowerCase() !== target) };
  });
}

export function bulkAddTags(db: Database.Database, userId: number, ids: string[], tags: string[]): number {
  const add = normalizeTags(tags);
  if (!add.length) return 0;
  return mutateSelectedItems(db, userId, ids, (item) => ({ tags: normalizeTags([...item.tags, ...add]) }));
}

export function bulkRemoveTags(db: Database.Database, userId: number, ids: string[], tags: string[]): number {
  const remove = new Set(normalizeTags(tags).map((t) => t.toLowerCase()));
  if (!remove.size) return 0;
  return mutateSelectedItems(db, userId, ids, (item) => ({ tags: item.tags.filter((t) => !remove.has(t.toLowerCase())) }));
}

export function bulkSetCategory(db: Database.Database, userId: number, ids: string[], category: string): number {
  const cat = String(category || "待整理").trim() || "待整理";
  return mutateSelectedItems(db, userId, ids, () => ({ category: cat }));
}

export function bulkDeleteItems(db: Database.Database, userId: number, ids: string[]): number {
  const cleanIds = safeIds(ids);
  if (!cleanIds.length) return 0;
  const tx = db.transaction((values: string[]) => {
    let changes = 0;
    for (const id of values) {
      changes += db.prepare("DELETE FROM library_items WHERE id = ? AND user_id = ?").run(id, userId).changes;
      deleteLibraryFtsItem(db, userId, id);
    }
    return changes;
  });
  return tx(cleanIds) as number;
}

function mutateItems(db: Database.Database, userId: number, mutate: (item: LibraryItem) => Partial<LibraryItem> | null): number {
  const ids = loadLibrary(db, userId).map((i) => i.id);
  return mutateSelectedItems(db, userId, ids, mutate);
}

function mutateSelectedItems(db: Database.Database, userId: number, ids: string[], mutate: (item: LibraryItem) => Partial<LibraryItem> | null): number {
  const cleanIds = safeIds(ids);
  if (!cleanIds.length) return 0;
  let changed = 0;
  const tx = db.transaction(() => {
    for (const id of cleanIds) {
      const item = findLibraryItem(db, userId, id);
      if (!item) continue;
      const patch = mutate(item);
      if (!patch) continue;
      saveLibraryItem(db, userId, { ...item, ...patch, id });
      changed += 1;
    }
  });
  tx();
  return changed;
}

export function listSnippets(db: Database.Database, userId: number, libraryItemId?: string): Snippet[] {
  const rows = libraryItemId
    ? db.prepare("SELECT * FROM snippets WHERE user_id = ? AND library_item_id = ? ORDER BY updated_at DESC").all(userId, libraryItemId)
    : db.prepare("SELECT * FROM snippets WHERE user_id = ? ORDER BY updated_at DESC").all(userId);
  return (rows as any[]).map(rowToSnippet);
}

export function createSnippet(db: Database.Database, userId: number, data: Partial<Snippet>): Snippet {
  const id = data.id || crypto.randomUUID();
  const now = nowSql();
  db.prepare(
    `INSERT INTO snippets (id, user_id, library_item_id, content, source_text, timestamp_sec, tags, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
  ).run(id, userId, data.library_item_id || "", data.content || "", data.source_text || "", data.timestamp_sec ?? null, JSON.stringify(normalizeTags(data.tags || [])), now, now);
  return listSnippets(db, userId).find((s) => s.id === id)!;
}

export function updateSnippet(db: Database.Database, userId: number, id: string, data: Partial<Snippet>): Snippet | null {
  const existing = db.prepare("SELECT * FROM snippets WHERE id = ? AND user_id = ?").get(id, userId) as any;
  if (!existing) return null;
  db.prepare(
    `UPDATE snippets SET content = ?, source_text = ?, timestamp_sec = ?, tags = ?, updated_at = ? WHERE id = ? AND user_id = ?`
  ).run(
    data.content ?? existing.content ?? "",
    data.source_text ?? existing.source_text ?? "",
    data.timestamp_sec ?? existing.timestamp_sec ?? null,
    JSON.stringify(normalizeTags(data.tags || parseTags(existing.tags || "[]"))),
    nowSql(),
    id,
    userId
  );
  return rowToSnippet(db.prepare("SELECT * FROM snippets WHERE id = ? AND user_id = ?").get(id, userId));
}

export function deleteSnippet(db: Database.Database, userId: number, id: string): boolean {
  return db.prepare("DELETE FROM snippets WHERE id = ? AND user_id = ?").run(id, userId).changes > 0;
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
    pic: row.pic || "",
  };
}

function rowToSnippet(row: any): Snippet {
  return {
    id: row.id,
    user_id: row.user_id,
    library_item_id: row.library_item_id,
    content: row.content,
    source_text: row.source_text,
    timestamp_sec: row.timestamp_sec ?? null,
    tags: parseTags(row.tags || "[]"),
    created_at: row.created_at,
    updated_at: row.updated_at,
  };
}

function parseTags(raw: string): string[] {
  try {
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed)) return normalizeTags(parsed);
  } catch { /* fallback */ }
  return normalizeTags(String(raw || "").split(/[,，\s#]+/));
}

function normalizeTags(tags: unknown[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const tag of tags) {
    const cleaned = cleanTag(String(tag || ""));
    if (!cleaned) continue;
    const key = cleaned.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(cleaned);
  }
  return out.slice(0, 30);
}

function cleanTag(tag: string): string {
  return tag.trim().replace(/^#+/, "").replace(/[\r\n\t]/g, " ").replace(/\s+/g, " ").slice(0, 32);
}

function safeIds(ids: string[]): string[] {
  return [...new Set((Array.isArray(ids) ? ids : []).map(String).map((s) => s.trim()).filter(Boolean))].slice(0, 100);
}

function nowSql(): string {
  return new Date().toISOString().replace("T", " ").slice(0, 19);
}
