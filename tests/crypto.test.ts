import { test } from "node:test";
import assert from "node:assert/strict";
import { encrypt, decrypt } from "../src/db/crypto";

process.env.ENCRYPTION_KEY = "a".repeat(64);

test("encrypt/decrypt roundtrip", () => {
  const plain = "sk-12345-abcdef";
  const enc = encrypt(plain);
  assert.notEqual(enc, plain);
  assert.equal(decrypt(enc), plain);
});

test("encrypt empty string returns empty", () => {
  assert.equal(encrypt(""), "");
});

test("decrypt empty string returns empty", () => {
  assert.equal(decrypt(""), "");
});

test("decrypt malformed input returns empty", () => {
  assert.equal(decrypt("not-a-valid-cipher"), "");
});

test("decrypt with wrong key returns empty", () => {
  const enc = encrypt("secret-value");
  process.env.ENCRYPTION_KEY = "b".repeat(64);
  assert.equal(decrypt(enc), "");
});
