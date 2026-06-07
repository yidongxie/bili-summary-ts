/** BiliStudy V2 ¨C main server entry point */

import path from "path";
import express from "express";
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
  if (!process.env.GITHUB_CLIENT_ID || !process.env.GITHUB_CLIENT_SECRET) {
    console.warn("WARNING: GITHUB_CLIENT_ID / GITHUB_CLIENT_SECRET not set. GitHub OAuth login will be disabled.");
  }
  startServer().then((url) => {
    console.log(`Open: ${url}`);
    console.log("Press Ctrl+C to stop");
  }).catch((err) => {
    console.error("Failed to start:", err);
    process.exit(1);
  });
}
