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
