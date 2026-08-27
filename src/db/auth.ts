/** Auth routes – email/password registration & login */

import { Router, Request, Response } from "express";
import Database from "better-sqlite3";
import crypto from "crypto";
import { enforceRateLimit } from "../common/rateLimit";

function hashPassword(password: string): string {
  const salt = crypto.randomBytes(16).toString("hex");
  const hash = crypto.pbkdf2Sync(password, salt, 100000, 64, "sha512").toString("hex");
  return salt + ":" + hash;
}

function verifyPassword(password: string, stored: string): boolean {
  const [salt, hash] = stored.split(":");
  const computed = crypto.pbkdf2Sync(password, salt, 100000, 64, "sha512").toString("hex");
  const a = Buffer.from(hash, "hex");
  const b = Buffer.from(computed, "hex");
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

function createSession(
  db: Database.Database,
  req: Request,
  res: Response,
  userId: number,
  onSuccess: () => void
): void {
  const oldSid = req.sessionID;
  req.session.regenerate((err) => {
    if (err) {
      res.status(500).json({ success: false, error: "Session 初始化失败" });
      return;
    }

    try {
      const sid = req.sessionID;
      if (!sid) {
        res.status(500).json({ success: false, error: "Session 初始化失败" });
        return;
      }
      if (oldSid && oldSid !== sid) {
        db.prepare("DELETE FROM sessions WHERE sid = ?").run(oldSid);
      }
      const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();
      db.prepare("INSERT OR REPLACE INTO sessions (sid, user_id, expires_at) VALUES (?, ?, ?)").run(sid, userId, expiresAt);
      onSuccess();
    } catch (err: any) {
      console.error("[session]", err);
      res.status(500).json({ success: false, error: err.message || "Session 初始化失败" });
    }
  });
}

export function createAuthRouter(db: Database.Database): Router {
  const router = Router();

  // ── Register ─────────────────────────────────────────────────────
  router.post("/api/auth/register", (req: Request, res: Response) => {
    try {
      if (!enforceRateLimit(req, res, "register", 5, 60 * 60 * 1000)) return;
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
       db.prepare("UPDATE user_configs SET password_hash = ? WHERE user_id = ?").run(
         hashPassword(password),
         userId
       );

      createSession(db, req, res, userId, () => {
        const user = db.prepare("SELECT id, email, display_name, created_at FROM users WHERE id = ?").get(userId) as any;
        res.json({ success: true, user: { id: user.id, email: user.email, display_name: user.display_name, created_at: user.created_at } });
      });
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
      if (!enforceRateLimit(req, res, "login", 10, 10 * 60 * 1000, email || "unknown")) return;
      if (!enforceRateLimit(req, res, "login-ip", 30, 10 * 60 * 1000)) return;

      if (!email || !password) {
        res.status(400).json({ success: false, error: "邮箱和密码不能为空" });
        return;
      }

      const user = db.prepare("SELECT id, email, display_name, created_at FROM users WHERE email = ?").get(email) as any;
      if (!user) {
        res.status(401).json({ success: false, error: "邮箱或密码错误" });
        return;
      }

      let stored = "";
      const pwdConfig = db.prepare("SELECT * FROM user_configs WHERE user_id = ?").get(user.id) as any;
      if (pwdConfig?.password_hash) {
        stored = pwdConfig.password_hash;
      } else if (pwdConfig?.api_key_enc?.startsWith("email_pwd:")) {
        stored = pwdConfig.api_key_enc.substring(10);
      }

       if (!stored) {
         res.status(401).json({ success: false, error: "该账号没有设置密码" });
         return;
       }

       if (!verifyPassword(password, stored)) {
        res.status(401).json({ success: false, error: "邮箱或密码错误" });
        return;
      }

      createSession(db, req, res, user.id, () => {
        res.json({
          success: true,
          user: { id: user.id, email: user.email, display_name: user.display_name, created_at: user.created_at },
        });
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
        .prepare("SELECT * FROM sessions WHERE sid = ? AND datetime(expires_at) > datetime('now')")
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

  // ── WeChat mini-program login ──────────────────────────────────────
  router.post("/api/auth/wechat", (req: Request, res: Response) => {
    try {
      const code = String(req.body.code || "").trim();
      const displayName = String(req.body.display_name || "").trim() || undefined;

      if (!code) {
        res.status(400).json({ success: false, error: "缺少微信授权 code" });
        return;
      }

      const appId = process.env.WECHAT_APPID;
      const appSecret = process.env.WECHAT_APPSECRET;
      if (!appId || !appSecret) {
        console.error("[wechat] WECHAT_APPID or WECHAT_APPSECRET not configured");
        res.status(500).json({ success: false, error: "微信登录暂未配置，请使用邮箱登录" });
        return;
      }

      // Exchange code for openId via WeChat API
      const wxUrl = `https://api.weixin.qq.com/sns/jscode2session?appid=${appId}&secret=${appSecret}&js_code=${encodeURIComponent(code)}&grant_type=authorization_code`;

      fetch(wxUrl)
        .then((r) => r.json())
        .then(async (wxData: any) => {
          if (wxData.errcode || !wxData.openid) {
            console.error("[wechat] jscode2session failed:", wxData);
            res.status(400).json({ success: false, error: `微信授权失败: ${wxData.errmsg || "未知错误"}` });
            return;
          }

          const openId = wxData.openid;
          // Check for existing user bound to this openId (stored in its own column).
          let user = db.prepare("SELECT id, email, display_name, created_at FROM users WHERE wechat_openid = ?").get(openId) as any;

          if (!user) {
            // Only link an openId to an already-authenticated account (the user
            // explicitly linking their own WeChat). Never auto-bind by email —
            // that would let any WeChat user take over the admin account.
            const authedUser = req.user;
            if (authedUser) {
              db.prepare("UPDATE users SET wechat_openid = ? WHERE id = ?").run(openId, authedUser.id);
              user = db.prepare("SELECT id, email, display_name, created_at FROM users WHERE id = ?").get(authedUser.id) as any;
              console.log(`[wechat] Linked WeChat openId to authenticated user (id=${authedUser.id})`);
            }
          }

          if (!user) {
            // Create new user bound to this WeChat openId
            const info = db.prepare("INSERT INTO users (wechat_openid, email, display_name) VALUES (?, ?, ?)").run(
              openId,
              `wechat_${openId.slice(0, 8)}@bilistudy.local`,
              displayName || `微信用户${openId.slice(-4)}`,
            );
            const userId = info.lastInsertRowid as number;
            db.prepare("INSERT OR IGNORE INTO user_configs (user_id) VALUES (?)").run(userId);
            user = db.prepare("SELECT id, email, display_name, created_at FROM users WHERE id = ?").get(userId) as any;
          }

          createSession(db, req, res, user.id, () => {
            res.json({ success: true, user: { id: user.id, email: user.email, display_name: user.display_name, created_at: user.created_at } });
          });
        })
        .catch((err: any) => {
          console.error("[wechat]", err);
          res.status(500).json({ success: false, error: "微信登录失败，请稍后重试" });
        });
    } catch (err: any) {
      console.error("[wechat]", err);
      res.status(500).json({ success: false, error: err.message || "登录失败" });
    }
  });

  return router;
}
