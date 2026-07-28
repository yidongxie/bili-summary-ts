/** BiliStudy V2 �C main server entry point */

import path from "path";
import express, { Request, Response, NextFunction } from "express";
import session from "express-session";
import { createDb } from "./db/schema";
import { createAuthRouter } from "./db/auth";
import { createTaskRouter } from "./db/taskQueue";
import { runStartupMaintenance } from "./db/maintenance";
import { createApiRouter } from "./routes/api";

const HOST = process.env.HOST || "0.0.0.0";
const PORT = parseInt(process.env.PORT || "8080", 10);
const BASE_URL = process.env.BASE_URL || `http://127.0.0.1:${PORT}`;

function getSessionSecret(): string {
  const envSecret = process.env.SESSION_SECRET;
  if (envSecret) return envSecret;
  if (process.env.NODE_ENV !== "production") {
    // Dev fallback: generate a random secret each time (launcher.ts sets a stable one)
    const fallback = require("crypto").randomBytes(32).toString("hex");
    process.env.SESSION_SECRET = fallback;
    console.warn("[startup] Using auto-generated SESSION_SECRET — sessions will reset on restart.");
    return fallback;
  }
  console.error("ERROR: SESSION_SECRET environment variable is required in production");
  console.error('Generate one: node -e "console.log(require(\'crypto\').randomBytes(32).toString(\'hex\'))"');
  process.exit(1);
}

const SESSION_SECRET = getSessionSecret();

const app = express();
app.set("trust proxy", 1);

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
runStartupMaintenance(db);

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

// Static files (frontend)
//
// The frontend is built by Vite into public/dist/ (see vite.config.ts).
// We serve that directory at the root. The legacy public/index.legacy.html
// is intentionally kept around but NOT served by default — it lives at the
// project root only for emergency rollback.
const distDir = path.resolve(__dirname, "..", "public", "dist");
const legacyDir = path.resolve(__dirname, "..", "public");
app.use(express.static(distDir));
// Fall back to public/ for any plain assets that may live alongside the
// built bundle (e.g. legacy uploads or favicons added later).
app.use(express.static(legacyDir));

// SPA fallback — serve the Vite-built index.html for any non-API GET.
app.use((_req: any, res: any, next: any) => {
  if (_req.method === "GET" && !_req.path.startsWith("/api/")) {
    res.sendFile(path.join(distDir, "index.html"), (err: any) => {
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
  if (process.env.NODE_ENV === "production" && !process.env.SESSION_SECRET) {
    console.error("ERROR: SESSION_SECRET environment variable is required in production");
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
