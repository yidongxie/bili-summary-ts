import { Request, Response } from "express";

interface Bucket {
  count: number;
  resetAt: number;
}

const buckets = new Map<string, Bucket>();

function now() {
  return Date.now();
}

function cleanupExpiredBuckets(current = now()) {
  for (const [key, bucket] of buckets) {
    if (bucket.resetAt <= current) buckets.delete(key);
  }
}

setInterval(() => cleanupExpiredBuckets(), 10 * 60 * 1000).unref?.();

export function getRateLimitKey(req: Request, scope: string, subject = ""): string {
  const ip = req.ip || req.socket.remoteAddress || "unknown";
  // Subject-scoped buckets (e.g. email) must NOT be tied to the caller's IP,
  // otherwise the limit silently resets per-IP and is trivially bypassed.
  // IP-only buckets keep the ip component so per-IP limits still apply.
  return subject ? `${scope}:${subject}` : `${scope}:${ip}`;
}

export function consumeRateLimit(key: string, limit: number, windowMs: number) {
  const current = now();
  const existing = buckets.get(key);
  if (!existing || existing.resetAt <= current) {
    buckets.set(key, { count: 1, resetAt: current + windowMs });
    return { allowed: true, remaining: Math.max(0, limit - 1), resetAt: current + windowMs };
  }

  if (existing.count >= limit) {
    return { allowed: false, remaining: 0, resetAt: existing.resetAt };
  }

  existing.count += 1;
  return { allowed: true, remaining: Math.max(0, limit - existing.count), resetAt: existing.resetAt };
}

export function enforceRateLimit(
  req: Request,
  res: Response,
  scope: string,
  limit: number,
  windowMs: number,
  subject = ""
): boolean {
  const result = consumeRateLimit(getRateLimitKey(req, scope, subject), limit, windowMs);
  res.setHeader("X-RateLimit-Limit", String(limit));
  res.setHeader("X-RateLimit-Remaining", String(result.remaining));
  res.setHeader("X-RateLimit-Reset", String(Math.ceil(result.resetAt / 1000)));
  if (result.allowed) return true;

  res.setHeader("Retry-After", String(Math.ceil((result.resetAt - Date.now()) / 1000)));
  res.status(429).json({ success: false, error: "请求过于频繁，请稍后再试" });
  return false;
}
