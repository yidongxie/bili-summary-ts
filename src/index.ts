/** BiliStudy V2 �C main server entry point */

import path from "path";
import crypto from "crypto";
import express, { Request, Response, NextFunction } from "express";
import session from "express-session";
import compression from "compression";
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
    const fallback = crypto.randomBytes(32).toString("hex");
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
app.disable("x-powered-by");
// Trust only a loopback reverse proxy (e.g. local nginx). This keeps X-Forwarded-For
// honored when behind same-host nginx while ignoring spoofed XFF from direct clients.
app.set("trust proxy", "loopback");

// gzip responses; never compress SSE event streams.
app.use(
  compression({
    threshold: 1024,
    filter: (req, res) => {
      const ctype = String(res.getHeader("Content-Type") || "");
      if (ctype.startsWith("text/event-stream")) return false;
      return /(json|text|javascript|xml|css|svg)/i.test(ctype);
    },
  })
);

// Security headers
app.use((req: Request, _res: Response, next: NextFunction) => {
  _res.setHeader("X-Content-Type-Options", "nosniff");
  _res.setHeader("X-Frame-Options", "SAMEORIGIN");
  _res.setHeader("Referrer-Policy", "strict-origin-when-cross-origin");
  _res.setHeader("Permissions-Policy", "camera=(), microphone=(), geolocation=()");
  _res.setHeader("X-XSS-Protection", "0");
  _res.setHeader(
    "Content-Security-Policy",
    [
      "default-src 'self'",
      "script-src 'self'",
      "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
      "img-src 'self' data: https:",
      "font-src 'self' data: https://fonts.gstatic.com",
      "frame-src https://player.bilibili.com",
      "connect-src 'self'",
      "object-src 'none'",
      "base-uri 'self'",
      "form-action 'self'",
    ].join("; ")
  );
  if (req.secure) {
    _res.setHeader("Strict-Transport-Security", "max-age=31536000; includeSubDomains");
  }
  next();
});

// JSON body
app.use(express.json({ limit: "2mb" }));

// Session — mounted on /api ONLY so static assets stop receiving
// Set-Cookie: connect.sid on every JS/CSS/SVG request.
app.use(
  "/api",
  session({
    secret: SESSION_SECRET,
    resave: false,
    saveUninitialized: false,
    cookie: {
      maxAge: 7 * 24 * 60 * 60 * 1000, // 7 days
      httpOnly: true,
      secure: BASE_URL.startsWith("https"),
      sameSite: "lax",
    },
  })
);

// CSRF guard: reject cross-origin state-changing requests. sameSite=lax already
// blocks cross-site cookies, but this adds a defense-in-depth Origin check.
app.use("/api", (req: Request, res: Response, next: NextFunction) => {
  if (req.method === "GET" || req.method === "HEAD" || req.method === "OPTIONS") return next();
  const origin = req.headers.origin;
  if (!origin) return next(); // non-browser clients (curl, mini-programs) send no Origin
  try {
    const o = new URL(origin);
    if (o.host !== req.headers.host) {
      res.status(403).json({ success: false, error: "跨站请求被拒绝" });
      return;
    }
  } catch {
    res.status(403).json({ success: false, error: "非法请求来源" });
    return;
  }
  next();
});

// Database
const dataDir = path.resolve(__dirname, "..", "data");
const db = createDb(dataDir);
runStartupMaintenance(db);

// Attach the authenticated user (if any) to req.user for downstream routes.
// All API handlers read `req.user`, so this middleware must run before any
// router that depends on it.
app.use("/api", (req: Request, _res: Response, next: NextFunction) => {
  try {
    const sid = req.sessionID;
    if (sid) {
      // Single joined query instead of two round-trips; datetime() coerces the
      // ISO-8601 expires_at into SQLite's canonical format before comparison.
      const user = db
        .prepare(
          "SELECT u.id, u.email, u.display_name, u.created_at, u.is_admin FROM sessions s JOIN users u ON u.id = s.user_id WHERE s.sid = ? AND datetime(s.expires_at) > datetime('now')"
        )
        .get(sid) as { id: number; email: string; display_name: string; created_at: string; is_admin: number } | undefined;
      if (user) req.user = user;
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

// ── SEO files (robots.txt / sitemap.xml previously 404) ─────────────
function siteOrigin(req: Request): string {
  const base = BASE_URL.replace(/\/+$/, "");
  if (base.startsWith("http")) return base;
  const proto = req.secure ? "https" : "http";
  const host = (req.headers.host as string) || `127.0.0.1:${PORT}`;
  return `${proto}://${host}`;
}

app.get("/robots.txt", (req: Request, res: Response) => {
  const origin = siteOrigin(req);
  res.setHeader("Cache-Control", "public, max-age=3600");
  res.type("text/plain; charset=utf-8").send(
    `User-agent: *\nAllow: /\nDisallow: /api/\n\nSitemap: ${origin}/sitemap.xml\n`
  );
});

app.get("/sitemap.xml", (req: Request, res: Response) => {
  const origin = siteOrigin(req);
  const today = new Date().toISOString().slice(0, 10);
  res.setHeader("Cache-Control", "public, max-age=3600");
  res.type("application/xml; charset=utf-8").send(
    '<?xml version="1.0" encoding="UTF-8"?>\n' +
      '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n' +
      `  <url><loc>${origin}/</loc><lastmod>${today}</lastmod><changefreq>daily</changefreq><priority>1.0</priority></url>\n` +
      "</urlset>\n"
  );
});

// MCP server discovery (agents can read this to auto-configure the server URL).
app.get("/.well-known/mcp.json", (req: Request, res: Response) => {
  const origin = siteOrigin(req);
  res.setHeader("Cache-Control", "public, max-age=3600");
  res.json({
    mcpServers: {
      bilistudy: {
        name: "BiliStudy",
        url: `${origin}/api/mcp`,
        transport: "streamable-http",
        auth: "Bearer <API token>",
      },
    },
  });
});

// Static files (frontend)
//
// The frontend is built by Vite into public/dist/ (see vite.config.ts).
// We serve that directory at the root; public/ is a fallback for the static
// assets (favicon, brand-icon) that live alongside the built bundle.
const distDir = path.resolve(__dirname, "..", "public", "dist");
const legacyDir = path.resolve(__dirname, "..", "public");
// Immutable long-term cache for hashed Vite build artifacts and anything under
// /assets/; everything else (index.html etc.) stays fresh.
const HASHED_FILE =
  /\.([a-f0-9]{6,32}|[A-Za-z0-9_-]{7,32})\.(js|css|png|jpe?g|webp|avif|gif|svg|ico|woff2?|ttf|otf|eot|map)$/i;
app.use(
  express.static(distDir, {
    etag: true,
    lastModified: true,
    setHeaders(res, filePath) {
      if (filePath.includes(`${path.sep}assets${path.sep}`) || HASHED_FILE.test(path.basename(filePath))) {
        res.setHeader("Cache-Control", "public, max-age=31536000, immutable");
      } else {
        res.setHeader("Cache-Control", "no-cache");
      }
    },
  })
);
// Fall back to public/ for any plain assets that may live alongside the
// built bundle (e.g. legacy uploads or favicons added later).
app.use(
  express.static(legacyDir, {
    etag: true,
    lastModified: true,
    setHeaders(res, filePath) {
      if (filePath.includes(`${path.sep}assets${path.sep}`) || HASHED_FILE.test(path.basename(filePath))) {
        res.setHeader("Cache-Control", "public, max-age=31536000, immutable");
      } else {
        res.setHeader("Cache-Control", "no-cache");
      }
    },
  })
);

// SPA fallback — serve the Vite-built index.html for any non-API GET.
app.use((_req: any, res: any, next: any) => {
  if (_req.method === "GET" && !_req.path.startsWith("/api/")) {
    res.setHeader("Cache-Control", "no-cache");
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
