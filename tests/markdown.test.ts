import { test } from "node:test";
import assert from "node:assert/strict";
import { escapeHtml, markdownToHtml, contentDisposition } from "../src/routes/utils";

test("escapeHtml escapes script tags", () => {
  assert.equal(
    escapeHtml("<script>alert(1)</script>"),
    "&lt;script&gt;alert(1)&lt;/script&gt;"
  );
});

test("markdownToHtml escapes raw HTML injection", () => {
  const html = markdownToHtml("<img src=x onerror=alert(1)>");
  assert.ok(!html.includes("<img"));
});

test("contentDisposition includes RFC 5987 encoded filename", () => {
  const d = contentDisposition("视频 总结.md");
  assert.ok(d.includes("filename*=UTF-8''"));
});
