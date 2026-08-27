import { test } from "node:test";
import assert from "node:assert/strict";
import { isSafeUpstreamUrl } from "../src/common/urlSafety";

test("allows normal https and private LAN", () => {
  assert.equal(isSafeUpstreamUrl("https://api.deepseek.com/v1"), true);
  assert.equal(isSafeUpstreamUrl("http://192.168.1.10:8080"), true);
  assert.equal(isSafeUpstreamUrl("http://10.0.0.5:11434"), true);
});

test("blocks loopback and cloud metadata", () => {
  assert.equal(isSafeUpstreamUrl("http://127.0.0.1:8000"), false);
  assert.equal(isSafeUpstreamUrl("http://localhost:8000"), false);
  assert.equal(isSafeUpstreamUrl("http://0.0.0.0:80"), false);
  assert.equal(isSafeUpstreamUrl("http://169.254.169.254/latest/meta-data"), false);
  assert.equal(isSafeUpstreamUrl("http://[::1]:80"), false);
});

test("blocks non-http protocols and garbage", () => {
  assert.equal(isSafeUpstreamUrl("file:///etc/passwd"), false);
  assert.equal(isSafeUpstreamUrl("ftp://example.com"), false);
  assert.equal(isSafeUpstreamUrl("not a url"), false);
});
