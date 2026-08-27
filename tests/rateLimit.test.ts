import { test } from "node:test";
import assert from "node:assert/strict";
import { getRateLimitKey, consumeRateLimit } from "../src/common/rateLimit";

function req(ip: string) {
  return { ip, socket: { remoteAddress: ip } } as any;
}

test("consumeRateLimit allows up to limit then blocks", () => {
  for (let i = 0; i < 3; i++) {
    assert.equal(consumeRateLimit("k", 3, 60000).allowed, true);
  }
  assert.equal(consumeRateLimit("k", 3, 60000).allowed, false);
});

test("subject-scoped key is independent of caller IP", () => {
  const a = getRateLimitKey(req("1.1.1.1"), "login", "a@b.com");
  const b = getRateLimitKey(req("2.2.2.2"), "login", "a@b.com");
  assert.equal(a, b);
});

test("IP-scoped key differs by IP", () => {
  const a = getRateLimitKey(req("1.1.1.1"), "login-ip");
  const b = getRateLimitKey(req("2.2.2.2"), "login-ip");
  assert.notEqual(a, b);
});
