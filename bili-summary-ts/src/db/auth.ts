/** Auth routes – email/password registration & login */

import { Router, Request, Response } from "express";
import Database from "better-sqlite3";
import crypto from "crypto";

function hashPassword(password: string): string {
  const salt = crypto.randomBytes(16).toString("hex");
  const hash = crypto.pbkdf2Sync(password, salt, 100000, 64, "sha512").toString("hex");
  return salt + ":" + hash;
}

function verifyPassword(password: string, stored: string): boolean {
  const [salt, hash] = stored.split(":");
  const computed = crypto.pbkdf2Sync(password, salt, 100000, 64, "sha512").toString("hex");
  return hash === computed;
}

export function createAuthRouter(db: Database.Database): Router {
  const router = Router();

  // ── Register ─────────────────────────────────────────────────────
  router.post("/api/auth/register", (req: Request, res: Response) => {
    try {
      const email = String(req.body.email || "").trim().toLowerCase();
      const password = String(req.body.password || "");
      const displayName = String(req.body.display_name || email.split("@")[0]).trim();

      if (!email || !password) {
        res.status(400).json({ success: false, error: "邮箱和密码不能为空" });
        return;
      }
      if (password.length < 6) {
        res.status(400).json({ success: false, error: "密码至少 6 位" });
        return;
      }
      if (!email.includes("@")) {
        res.status(400).json({ success: false, error: "邮箱格式不正确" });
        return;
      }

      const existing = db.prepare("SELECT id FROM users WHERE email = ?").get(email);
      if (existing) {
        res.status(409).json({ success: false, error: "该邮箱已注册" });
        return;
      }

      const info = db.prepare("INSERT INTO users (email, display_name) VALUES (?, ?)").run(email, displayName);
      const userId = info.lastInsertRowid as number;

      // Use negative hash of email as github_id placeholder for email users
      const buf = crypto.createHash("md5").update(email).digest();
      const negId = -Math.abs(buf.readInt32BE(0));
      db.prepare("UPDATE users SET github_id = ? WHERE id = ?").run(negId, userId);
      db.prepare("INSERT OR IGNORE INTO user_configs (user_id) VALUES (?)").run(userId);
      db.prepare("UPDATE user_configs SET api_key_enc = ? WHERE user_id = ?").run(
        "email_pwd:" + hashPassword(password),
        userId
      );

      // Create session
      const sid = req.sessionID;
      if (!sid) {
        res.status(500).json({ success: false, error: "Session 初始化失败" });
        return;
      }
      const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();
      db.prepare("INSERT OR REPLACE INTO sessions (sid, user_id, expires_at) VALUES (?, ?, ?)").run(sid, userId, expiresAt);

      const user = db.prepare("SELECT id, email, display_name, created_at FROM users WHERE id = ?").get(userId) as any;
      res.json({ success: true, user: { id: user.id, email: user.email, display_name: user.display_name } });
    } catch (err: any) {
      console.error("[register]", err);
      res.status(500).json({ success: false, error: err.message || "注册失败" });
    }
  });

  // ── Login ────────────────────────────────────────────────────────
  router.post("/api/auth/login", (req: Request, res: Response) => {
    try {
      const email = String(req.body.email || "").trim().toLowerCase();
      const password = String(req.body.password || "");

      if (!email || !password) {
        res.status(400).json({ success: false, error: "邮箱和密码不能为空" });
        return;
      }

      const user = db.prepare("SELECT id, email, display_name, created_at FROM users WHERE email = ?").get(email) as any;
      if (!user) {
        res.status(401).json({ success: false, error: "邮箱或密码错误" });
        return;
      }

      const config = db.prepare("SELECT api_key_enc FROM user_configs WHERE user_id = ?").get(user.id) as any;
      const stored = config?.api_key_enc || "";

      if (!stored.startsWith("email_pwd:")) {
        res.status(401).json({ success: false, error: "该账号没有设置密码，请使用 GitHub 登录。" });
        return;
      }

      if (!verifyPassword(password, stored.replace("email_pwd:", ""))) {
        res.status(401).json({ success: false, error: "邮箱或密码错误" });
        return;
      }

      const sid = req.sessionID;
      if (!sid) {
        res.status(500).json({ success: false, error: "Session 初始化失败" });
        return;
      }
      const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();
      db.prepare("INSERT OR REPLACE INTO sessions (sid, user_id, expires_at) VALUES (?, ?, ?)").run(sid, user.id, expiresAt);

      res.json({
        success: true,
        user: { id: user.id, email: user.email, display_name: user.display_name },
      });
    } catch (err: any) {
      console.error("[login]", err);
      res.status(500).json({ success: false, error: err.message || "登录失败" });
    }
  });

  router.get("/api/auth/me", (req: Request, res: Response) => {
    const sid = req.sessionID;
    if (!sid) {
      res.json({ success: true, authenticated: false });
      return;
    }
    const sessionRow = db
      .prepare("SELECT * FROM sessions WHERE sid = ? AND expires_at > datetime('now')")
      .get(sid) as any;
    if (!sessionRow) {
      res.json({ success: true, authenticated: false });
      return;
    }
    const user = db
      .prepare("SELECT id, email, display_name, created_at FROM users WHERE id = ?")
      .get(sessionRow.user_id) as any;
    if (!user) {
      res.json({ success: true, authenticated: false });
      return;
    }
    res.json({ success: true, authenticated: true, user });
  });

  router.post("/api/auth/logout", (req: Request, res: Response) => {
    if (req.sessionID) {
      db.prepare("DELETE FROM sessions WHERE sid = ?").run(req.sessionID);
    }
    req.session?.destroy?.(() => {});
    res.json({ success: true });
  });

  return router;
}
