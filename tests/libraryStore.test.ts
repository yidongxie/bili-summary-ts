import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "fs";
import os from "os";
import path from "path";
import Database from "better-sqlite3";
import { createDb } from "../src/db/schema";
import {
  saveLibraryItem,
  updateLibraryArticle,
  findLibraryItem,
  queryLibrary,
} from "../src/db/libraryStore";

function makeDb(): { db: Database.Database; dir: string } {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "bilistudy-test-"));
  const db = createDb(dir);
  return { db, dir };
}

function addUser(db: Database.Database): number {
  const info = db.prepare("INSERT INTO users (email, display_name) VALUES (?, ?)").run("a@b.com", "a");
  return Number(info.lastInsertRowid);
}

function sample(article: string) {
  return {
    title: "测试视频",
    author: "up主",
    duration: 120,
    bvid: "BV1xxxx",
    link: "https://www.bilibili.com/video/BV1xxxx",
    summary: "总结",
    transcript: "字幕文本",
    category: "待整理",
    tags: ["ai"],
    notes: "笔记",
    article,
  };
}

test("article round-trips through saveLibraryItem and findLibraryItem", () => {
  const { db, dir } = makeDb();
  try {
    const userId = addUser(db);
    const saved = saveLibraryItem(db, userId, sample("第一版文章"));
    assert.equal(saved.article, "第一版文章");

    const loaded = findLibraryItem(db, userId, saved.id);
    assert.equal(loaded!.article, "第一版文章");
  } finally {
    db.close();
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test("updateLibraryArticle changes only article and preserves the rest of the item", () => {
  const { db, dir } = makeDb();
  try {
    const userId = addUser(db);
    const saved = saveLibraryItem(db, userId, { ...sample("旧文章"), notes: "已编辑笔记", mode: "timeline" });

    const changed = updateLibraryArticle(db, userId, saved.id, "  新文章正文  ");
    assert.equal(changed, true);

    const loaded = findLibraryItem(db, userId, saved.id)!;
    assert.equal(loaded.article, "新文章正文"); // trimmed
    assert.equal(loaded.notes, "已编辑笔记"); // untouched
    assert.equal(loaded.mode, "timeline"); // untouched
    assert.equal(loaded.transcript, "字幕文本"); // untouched
    assert.equal(loaded.tags.join(","), "ai"); // untouched
  } finally {
    db.close();
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test("article text is full-text searchable with a highlighted snippet", () => {
  const { db, dir } = makeDb();
  try {
    const userId = addUser(db);
    const phrase = "甲乙丙丁戊己";
    const saved = saveLibraryItem(db, userId, {
      ...sample("这篇文章里出现了" + phrase + "这样的独特表述"),
      summary: "与关键词无关的总结",
    });
    const res = queryLibrary(db, userId, { q: phrase });
    assert.ok(res.items.some((i) => i.id === saved.id), "search should match text that lives only in the article");
    const hit = res.items.find((i) => i.id === saved.id)!;
    assert.ok((hit.snippet || "").includes("<mark>"), "snippet should highlight where the article hit");
  } finally {
    db.close();
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test("updating an article keeps the search index in sync", () => {
  const { db, dir } = makeDb();
  try {
    const userId = addUser(db);
    const oldPhrase = "甲乙老内容";
    const newPhrase = "丙丁新内容";
    const saved = saveLibraryItem(db, userId, {
      ...sample("旧文章里有" + oldPhrase),
      summary: "无关总结",
    });
    assert.ok(queryLibrary(db, userId, { q: oldPhrase }).items.some((i) => i.id === saved.id));

    updateLibraryArticle(db, userId, saved.id, "新文章讲的是" + newPhrase);

    assert.equal(queryLibrary(db, userId, { q: oldPhrase }).items.length, 0, "old text should no longer match");
    assert.ok(queryLibrary(db, userId, { q: newPhrase }).items.some((i) => i.id === saved.id), "new text should match");
  } finally {
    db.close();
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test("FTS index built before the article column is rebuilt on startup", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "bilistudy-migrate-"));
  const phrase = "独特术语字词串";
  let userId = 0;
  let itemId = "";
  let db: Database.Database = createDb(dir);
  try {
    userId = addUser(db);
    itemId = saveLibraryItem(db, userId, {
      ...sample("含" + phrase + "的迁移文章"),
      summary: "无关总结",
    }).id;

    // Simulate a database created before article was indexed: trigram FTS with
    // the 9 original columns, backfilled from library_items.
    db.exec("DROP TABLE IF EXISTS library_items_fts");
    db.exec(`CREATE VIRTUAL TABLE library_items_fts USING fts5(
      id UNINDEXED,
      user_id UNINDEXED,
      title,
      author,
      summary,
      transcript,
      category,
      tags,
      notes,
      tokenize = 'trigram'
    )`);
    db.prepare(
      `INSERT INTO library_items_fts (id, user_id, title, author, summary, transcript, category, tags, notes)
       SELECT id, user_id, title, author, summary, transcript, category, tags, notes FROM library_items`
    ).run();
    const legacy = db.prepare("SELECT sql FROM sqlite_master WHERE name = 'library_items_fts'").get() as { sql: string };
    assert.ok(!/\barticle\b/i.test(legacy.sql), "sanity: legacy index lacks article");
    db.close();
  } catch (err) {
    db.close();
    fs.rmSync(dir, { recursive: true, force: true });
    throw err;
  }

  // Reopening runs createDb, which must drop and rebuild the stale index.
  db = createDb(dir);
  try {
    const sql = (db.prepare("SELECT sql FROM sqlite_master WHERE name = 'library_items_fts'").get() as { sql: string }).sql;
    assert.ok(/\barticle\b/i.test(sql), "rebuilt index should include an article column");
    const res = queryLibrary(db, userId, { q: phrase });
    assert.ok(res.items.some((i) => i.id === itemId), "article should be searchable after the rebuild");
  } finally {
    db.close();
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test("updateLibraryArticle is scoped to the item owner", () => {
  const { db, dir } = makeDb();
  try {
    const owner = addUser(db);
    const other = db.prepare("INSERT INTO users (email) VALUES (?)").run("other@b.com");
    const otherId = Number(other.lastInsertRowid);
    const saved = saveLibraryItem(db, owner, sample("owner 文章"));

    const changed = updateLibraryArticle(db, otherId, saved.id, "越权改写");
    assert.equal(changed, false);

    const loaded = findLibraryItem(db, owner, saved.id)!;
    assert.equal(loaded.article, "owner 文章");
  } finally {
    db.close();
    fs.rmSync(dir, { recursive: true, force: true });
  }
});
