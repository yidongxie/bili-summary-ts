import { test } from "node:test";
import assert from "node:assert/strict";
import { isSafeUpstreamUrl, isPrivateEndpoint, isSafePublicHttpUrl, assertSafePublicUrl } from "../src/common/urlSafety";

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

test("isPrivateEndpoint detects self-hosted hosts", () => {
  assert.equal(isPrivateEndpoint("http://localhost:8000/v1"), true);
  assert.equal(isPrivateEndpoint("http://127.0.0.1:8000"), true);
  assert.equal(isPrivateEndpoint("http://192.168.1.10:8000"), true);
  assert.equal(isPrivateEndpoint("http://10.0.0.5:8000"), true);
  assert.equal(isPrivateEndpoint("http://172.16.0.2:8000"), true);
  assert.equal(isPrivateEndpoint("https://api.siliconflow.cn/v1"), false);
});

test("isSafePublicHttpUrl rejects private/LAN/loopback/metadata literals", () => {
  assert.equal(isSafePublicHttpUrl("https://www.bilibili.com/video/BV1x"), true);
  assert.equal(isSafePublicHttpUrl("https://www.youtube.com/watch?v=x"), true);
  assert.equal(isSafePublicHttpUrl("http://127.0.0.1:8080"), false);
  assert.equal(isSafePublicHttpUrl("http://localhost:8080"), false);
  assert.equal(isSafePublicHttpUrl("http://10.0.0.5:80"), false);
  assert.equal(isSafePublicHttpUrl("http://192.168.1.1:80"), false);
  assert.equal(isSafePublicHttpUrl("http://172.16.0.1:80"), false);
  assert.equal(isSafePublicHttpUrl("http://169.254.169.254/latest/meta-data"), false);
  assert.equal(isSafePublicHttpUrl("http://[::1]:80"), false);
  assert.equal(isSafePublicHttpUrl("file:///etc/passwd"), false);
});

test("assertSafePublicUrl rejects internal hosts and bad schemes", async () => {
  await assertSafePublicUrl("https://www.bilibili.com/video/BV1x");
  await assert.rejects(() => assertSafePublicUrl("http://127.0.0.1:8080/x"));
  await assert.rejects(() => assertSafePublicUrl("http://169.254.169.254/latest/meta-data"));
  await assert.rejects(() => assertSafePublicUrl("file:///etc/passwd"));
});
