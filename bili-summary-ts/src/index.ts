/** BiliStudy V2 ¨C main server entry point */

import path from "path";
import express, { Request, Response, NextFunction } from "express";
import session from "express-session";
import { createDb } from "./db/schema";
import { createAuthRouter } from "./db/auth";
import { createTaskRouter } from "./db/taskQueue";
import { createApiRouter } from "./routes/api";
import { createLarkExportRouter } from "./routes/lark-export";

const HOST = process.env.HOST || "0.0.0.0";
const PORT = parseInt(process.env.PORT || "8080", 10);
const BASE_URL = process.env.BASE_URL || `http://127.0.0.1:${PORT}`;
const SESSION_SECRET = process.env.SESSION_SECRET || "bilistudy-dev-secret-change-in-production";

const app = express();

// JSON body
app.use(express.json({ limit: "2mb" }));

// Session
app.use(
  session({
    secret: SESSION_SECRET,
    resave: false,
    saveUninitialized: true,
    cookie: {
      maxAge: 7 * 24 * 60 * 60 * 1000, // 7 days
      httpOnly: true,
      secure: BASE_URL.startsWith("https"),
      sameSite: "lax",
    },
  })
);

// Database
const dataDir = path.resolve(__dirname, "..", "data");
const db = createDb(dataDir);

// Attach the authenticated user (if any) to req.user for downstream routes.
// All API handlers read `(req as any).user`, so this middleware must run
// before any router that depends on it.
app.use((req: Request, _res: Response, next: NextFunction) => {
  try {
    const sid = req.sessionID;
    if (sid) {
      const sessionRow = db
        .prepare("SELECT user_id FROM sessions WHERE sid = ? AND expires_at > datetime('now')")
        .get(sid) as { user_id: number } | undefined;
      if (sessionRow) {
        const user = db
          .prepare("SELECT id, email, display_name, created_at FROM users WHERE id = ?")
          .get(sessionRow.user_id);
        if (user) {
          (req as any).user = user;
        }
      }
    }
  } catch (err) {
    console.error("[auth-middleware]", err);
  }
  next();
});
// Auth routes (must be before static files so /api/auth/* are not caught by SPA fallback)
app.use(createAuthRouter(db));

// API routes
app.use(createApiRouter(db));
app.use(createTaskRouter(db));
app.use(createLarkExportRouter(db));

// Static files (frontend)
const publicDir = path.resolve(__dirname, "..", "public");
app.use(express.static(publicDir));

// SPA fallback
app.use((_req: any, res: any, next: any) => {
  if (_req.method === "GET" && !_req.path.startsWith("/api/")) {
    res.sendFile(path.join(publicDir, "index.html"), (err: any) => {
      if (err) next();
    });
  } else {
    next();
  }
});

export function startServer(host?: string, port?: number): Promise<string> {
  const h = host || HOST;
  const p = port || PORT;
  return new Promise((resolve, reject) => {
    const server = app.listen(p, h, () => {
      const url = `http://${h}:${p}/`;
      console.log(`BiliStudy V2 started: ${url}`);
      resolve(url);
    });
    server.on("error", reject);
  });
}

if (require.main === module) {
  if (!process.env.ENCRYPTION_KEY) {
    console.error("ERROR: ENCRYPTION_KEY environment variable is required");
    console.error("Generate one: node -e \"console.log(require('crypto').randomBytes(32).toString('hex'))\"");
    process.exit(1);
  }
  startServer().then((url) => {
    console.log(`Open: ${url}`);
    console.log("Press Ctrl+C to stop");
  }).catch((err) => {
    console.error("Failed to start:", err);
    process.exit(1);
  });
}
