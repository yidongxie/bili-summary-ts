import { test } from "node:test";
import assert from "node:assert/strict";
import Database from "better-sqlite3";

test("datetime() coerces ISO-8601 expires_at to canonical format", () => {
  const db = new Database(":memory:");
  const d = (db.prepare("SELECT datetime(?) AS d").get("2026-09-03T12:00:00.000Z") as { d: string }).d;
  assert.equal(d, "2026-09-03 12:00:00");
});

test("same-day ISO timestamps compare correctly via datetime()", () => {
  const db = new Database(":memory:");
  db.exec("CREATE TABLE sessions (sid TEXT PRIMARY KEY, expires_at TEXT NOT NULL)");
  db.prepare("INSERT INTO sessions (sid, expires_at) VALUES (?, ?)").run("a", "2026-09-03T12:00:00.000Z");
  db.prepare("INSERT INTO sessions (sid, expires_at) VALUES (?, ?)").run("b", "2026-09-03T13:00:00.000Z");
  const earlier = db
    .prepare("SELECT sid FROM sessions WHERE datetime(expires_at) < datetime('2026-09-03T12:30:00.000Z')")
    .all() as Array<{ sid: string }>;
  assert.deepEqual(earlier.map((r) => r.sid), ["a"]);
});
