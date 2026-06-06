/** GitHub OAuth + session management */

import { Router, Request, Response } from "express";
import passport from "passport";
import { Strategy as GitHubStrategy } from "passport-github2";
import Database from "better-sqlite3";
import crypto from "crypto";

const SESSION_MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000; // 7 days

export function createAuthRouter(db: Database.Database): Router {
  const router = Router();

  // GitHub OAuth config
  const GITHUB_CLIENT_ID = process.env.GITHUB_CLIENT_ID || "";
  const GITHUB_CLIENT_SECRET = process.env.GITHUB_CLIENT_SECRET || "";
  const BASE_URL = process.env.BASE_URL || "http://127.0.0.1:8080";

  if (GITHUB_CLIENT_ID && GITHUB_CLIENT_SECRET) {
    passport.use(
      new GitHubStrategy(
        {
          clientID: GITHUB_CLIENT_ID,
          clientSecret: GITHUB_CLIENT_SECRET,
          callbackURL: `${BASE_URL}/api/auth/github/callback`,
        },
        (
          _accessToken: string,
          _refreshToken: string,
          profile: any,
          done: (err: any, user?: any) => void
        ) => {
          try {
            const githubId = profile.id;
            let user = db
              .prepare("SELECT * FROM users WHERE github_id = ?")
              .get(githubId) as any;

            if (user) {
              // Update profile
              db.prepare(
                "UPDATE users SET display_name = ?, avatar_url = ? WHERE id = ?"
              ).run(profile.displayName || profile.username, profile.photos?.[0]?.value || "", user.id);
            } else {
              const info = db
                .prepare(
                  "INSERT INTO users (github_id, email, display_name, avatar_url) VALUES (?, ?, ?, ?)"
                )
                .run(
                  githubId,
                  profile.emails?.[0]?.value || "",
                  profile.displayName || profile.username || "",
                  profile.photos?.[0]?.value || ""
                );
              user = db.prepare("SELECT * FROM users WHERE id = ?").get(info.lastInsertRowid);

              // Create default config row
              db.prepare("INSERT OR IGNORE INTO user_configs (user_id) VALUES (?)").run(
                info.lastInsertRowid
              );
            }
            done(null, user);
          } catch (err) {
            done(err as Error);
          }
        }
      )
    );
  }

  passport.serializeUser((user: any, done) => done(null, user.id));
  passport.deserializeUser((id: number, done) => {
    const user = db.prepare("SELECT * FROM users WHERE id = ?").get(id);
    done(null, user || null);
  });

  router.use(passport.initialize());
  router.use(passport.session());

  // Create session row after passport login
  router.use((req: Request, _res: Response, next) => {
    if (req.user && req.sessionID) {
      const userId = (req.user as any).id;
      const expiresAt = new Date(Date.now() + SESSION_MAX_AGE_MS).toISOString();
      db.prepare(
        "INSERT OR REPLACE INTO sessions (sid, user_id, expires_at) VALUES (?, ?, ?)"
      ).run(req.sessionID, userId, expiresAt);
    }
    next();
  });

  // Routes
  router.get("/api/auth/github", (req: Request, res: Response, next) => {
    const authenticator = passport.authenticate("github", { scope: ["user:email"] });
    authenticator(req, res, next);
  });

  router.get(
    "/api/auth/github/callback",
    (req: Request, res: Response, next) => {
      const authenticator = passport.authenticate("github", {
        failureRedirect: "/login",
      });
      authenticator(req, res, next);
    },
    (_req: Request, res: Response) => {
      res.redirect("/");
    }
  );

  // Session check endpoint
  router.get("/api/auth/me", (req: Request, res: Response) => {
    if (!req.user) {
      res.json({ success: true, authenticated: false });
      return;
    }
    const user = req.user as any;
    res.json({
      success: true,
      authenticated: true,
      user: {
        id: user.id,
        display_name: user.display_name,
        avatar_url: user.avatar_url,
        created_at: user.created_at,
      },
    });
  });

  // Logout
  router.post("/api/auth/logout", (req: Request, res: Response) => {
    if (req.sessionID) {
      db.prepare("DELETE FROM sessions WHERE sid = ?").run(req.sessionID);
    }
    req.logout(() => {
      res.json({ success: true });
    });
  });

  return router;
}
