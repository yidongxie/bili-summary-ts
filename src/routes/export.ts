import { Router, Request, Response } from "express";
import Database from "better-sqlite3";
import { getDecryptedConfig } from "../db/configStore";
import { findLibraryItem } from "../db/libraryStore";
import { contentDisposition, slugify, itemToMarkdown, itemToPrintableHtml } from "./utils";

function requireUser(req: Request, res: Response): number | null {
  const user = req.user;
  if (!user) { res.status(401).json({ success: false, error: "请先登录" }); return null; }
  return user.id;
}

export function createExportRouter(db: Database.Database): Router {
  const router = Router();

  // ── Single-item exports ─────────────────────────────────────────────
  router.get("/api/export/:id.pdf", (req: Request, res: Response) => {
    const userId = req.user?.id;
    if (!userId) { res.status(401).send("请先登录"); return; }
    const item = findLibraryItem(db, userId, req.params.id);
    if (!item) { res.status(404).send("未找到收藏"); return; }
    const html = itemToPrintableHtml(item);
    res.setHeader("Content-Type", "text/html; charset=utf-8");
    // This printable page is fully self-contained and every interpolated field
    // is HTML-escaped, so allowing inline script for the print button/auto-print
    // is safe and keeps the global CSP strict everywhere else.
    res.setHeader(
      "Content-Security-Policy",
      "default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; img-src data: https:; base-uri 'none'; form-action 'none'"
    );
    res.send(html);
  });

  router.get("/api/export/:id.md", (req: Request, res: Response) => {
    const userId = req.user?.id;
    if (!userId) { res.status(401).json({ success: false, error: "请先登录" }); return; }
    const item = findLibraryItem(db, userId, req.params.id);
    if (!item) { res.status(404).json({ success: false, error: "未找到收藏" }); return; }
    const md = itemToMarkdown(item);
    const filename = slugify(item.title) + ".md";
    res.setHeader("Content-Type", "text/markdown; charset=utf-8");
    res.setHeader("Content-Disposition", contentDisposition(filename));
    res.send(md);
  });

  router.get("/api/export/:id/obsidian-payload", (req: Request, res: Response) => {
    const userId = req.user?.id;
    if (!userId) { res.status(401).json({ success: false, error: "请先登录" }); return; }
    const item = findLibraryItem(db, userId, req.params.id);
    if (!item) { res.status(404).json({ success: false, error: "未找到收藏" }); return; }
    const md = itemToMarkdown(item);
    const config = getDecryptedConfig(db, userId);
    const folder = String(config.obsidian_folder ?? "BiliStudy").trim();
    const name = slugify(item.title);
    const relativePath = (folder ? folder.replace(/[\\/]+$/, "") + "/" : "") + name;
    res.json({
      success: true,
      title: item.title,
      name,
      folder,
      relative_path: relativePath,
      vault_name: config.obsidian_vault_name || "",
      markdown: md,
    });
  });

  // ── Bulk exports ────────────────────────────────────────────────────
  router.post("/api/export/bulk/markdown", (req: Request, res: Response) => {
    const userId = requireUser(req, res);
    if (!userId) return;
    const ids = Array.isArray(req.body.ids) ? req.body.ids.map(String).slice(0, 100) : [];
    const items = ids.map((id: string) => findLibraryItem(db, userId, id)).filter(Boolean) as any[];
    const md = items.map(itemToMarkdown).join("\n\n---\n\n");
    res.setHeader("Content-Type", "text/markdown; charset=utf-8");
    res.setHeader("Content-Disposition", contentDisposition(`bilistudy-export-${new Date().toISOString().slice(0, 10)}.md`));
    res.send(md || "# BiliStudy Export\n\n没有选中的条目。\n");
  });

  router.post("/api/export/bulk/json", (req: Request, res: Response) => {
    const userId = requireUser(req, res);
    if (!userId) return;
    const ids = Array.isArray(req.body.ids) ? req.body.ids.map(String).slice(0, 100) : [];
    const items = ids.map((id: string) => findLibraryItem(db, userId, id)).filter(Boolean);
    res.setHeader("Content-Type", "application/json; charset=utf-8");
    res.setHeader("Content-Disposition", contentDisposition(`bilistudy-export-${new Date().toISOString().slice(0, 10)}.json`));
    res.send(JSON.stringify({ exported_at: new Date().toISOString(), items }, null, 2));
  });

  return router;
}
