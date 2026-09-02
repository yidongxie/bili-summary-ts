import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "fs";
import os from "os";
import path from "path";
import type { AddressInfo } from "net";
import express from "express";
import type Database from "better-sqlite3";
import { createDb } from "../src/db/schema";
import { createLibraryRouter } from "../src/routes/library";

function basePayload(id?: string) {
  return {
    ...(id ? { id } : {}),
    video: {
      title: "标题",
      author: "作者",
      duration: 60,
      bvid: "BV1" + (id || "create"),
      link: "https://www.bilibili.com/video/BV1" + (id || "create"),
      pic: "",
    },
    summary: "一句话总结",
  };
}

async function run(cb: (ctx: {
  req: (method: string, p: string, body?: unknown, asUser?: number) => Promise<{ status: number; json: any }>;
  db: Database.Database;
  dir: string;
  userA: number;
  userB: number;
}) => Promise<void>) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "bilistudy-routes-"));
  const db = createDb(dir);
  let current = 0;
  const a = db.prepare("INSERT INTO users (email) VALUES ('a@x.com')").run();
  const b = db.prepare("INSERT INTO users (email) VALUES ('b@x.com')").run();
  const userA = Number(a.lastInsertRowid);
  const userB = Number(b.lastInsertRowid);
  const app = express();
  app.use(express.json());
  app.use((req: any, _res: any, next: any) => {
    req.user = current
      ? { id: current, email: current === userA ? "a@x.com" : "b@x.com", display_name: "", created_at: "", is_admin: 0 }
      : undefined;
    next();
  });
  app.use(createLibraryRouter(db));
  const server = app.listen(0);
  await new Promise((r) => server.once("listening", r));
  const port = (server.address() as AddressInfo).port;
  const url = (p: string) => `http://127.0.0.1:${port}${p}`;
  const req = async (method: string, p: string, body?: unknown, asUser = userA) => {
    current = asUser;
    const resp = await fetch(url(p), {
      method,
      headers: body !== undefined ? { "Content-Type": "application/json" } : undefined,
      body: body !== undefined ? JSON.stringify(body) : undefined,
    });
    let json: any;
    try { json = await resp.json(); } catch { json = null; }
    return { status: resp.status, json };
  };
  try {
    await cb({ req, db, dir, userA, userB });
  } finally {
    server.close();
    db.close();
    fs.rmSync(dir, { recursive: true, force: true });
  }
}

test("article is persisted on create and updatable via /api/library/:id/article", async () => {
  await run(async ({ req, db, userA }) => {
    // Create with an article (e.g. user saved after generating).
    const created = await req("POST", "/api/library", { ...basePayload(), article: "首版文章", transcript: "字幕", notes: "我的笔记" });
    assert.equal(created.status, 200);
    const id = created.json.item.id;
    assert.equal(created.json.item.article, "首版文章");

    // (Re)generate → update only the article through the new endpoint.
    const upd = await req("POST", `/api/library/${id}/article`, { article: "  二版文章  " });
    assert.equal(upd.status, 200);
    assert.equal(upd.json.success, true);

    const got = await req("GET", `/api/library/${id}`);
    assert.equal(got.json.item.article, "二版文章");
    assert.equal(got.json.item.notes, "我的笔记"); // untouched
    assert.equal(got.json.item.transcript, "字幕"); // untouched

    // Unknown id → 404.
    const missing = await req("POST", "/api/library/nope/article", { article: "x" });
    assert.equal(missing.status, 404);

    // Direct DB read matches the HTTP layer.
    const row = db.prepare("SELECT article FROM library_items WHERE id = ? AND user_id = ?").get(id, userA) as { article: string };
    assert.equal(row.article, "二版文章");
  });
});

test("article update is scoped to the owner", async () => {
  await run(async ({ req, userA, userB }) => {
    const created = await req("POST", "/api/library", { ...basePayload(), article: "A 的文章" });
    const id = created.json.item.id;

    const stolen = await req("POST", `/api/library/${id}/article`, { article: "越权改写" }, userB);
    assert.equal(stolen.status, 404); // not visible to user B

    const owner = await req("GET", `/api/library/${id}`, undefined, userA);
    assert.equal(owner.json.item.article, "A 的文章");
  });
});

test("full update without an article field preserves the stored article", async () => {
  await run(async ({ req, db }) => {
    const created = await req("POST", "/api/library", { ...basePayload(), article: "保留我", notes: "已编辑", category: "已整理" });
    const id = created.json.item.id;

    // Emulates handleSave's update branch: id + summary/video, no article/notes.
    const upd = await req("POST", "/api/library", { ...basePayload(id), category: "已整理" });
    assert.equal(upd.status, 200);

    const row = db.prepare("SELECT article, notes, category FROM library_items WHERE id = ?").get(id) as { article: string; notes: string; category: string };
    assert.equal(row.article, "保留我");
    assert.equal(row.notes, "已编辑");
    assert.equal(row.category, "已整理");
  });
});
