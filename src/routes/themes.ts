/** Theme routes — group scattered library items into topics + cross-video synthesis. */

import { Router, Request, Response } from "express";
import Database from "better-sqlite3";
import { getLlmConfigWithFallback } from "../db/configStore";
import { findLibraryItem } from "../db/libraryStore";
import {
  listThemes,
  getTheme,
  findThemeByName,
  createTheme,
  renameTheme,
  deleteTheme,
  addThemeItems,
  removeThemeItem,
  getThemeItems,
} from "../db/themeStore";
import { chatCompletion } from "../llm/summarize";
import {
  CLASSIFY_SYSTEM_PROMPT,
  buildClassifyUserPrompt,
  THEME_SYNTHESIS_SYSTEM_PROMPT,
  buildThemeSynthesisUserPrompt,
} from "../llm/prompts";
import { recordApiUsage } from "../db/usageStore";
import { enforceRateLimit } from "../common/rateLimit";

function requireUser(req: Request, res: Response): number | null {
  const user = (req as any).user;
  if (!user) { res.status(401).json({ success: false, error: "请先登录" }); return null; }
  return user.id;
}

function cleanThemeName(raw: string): string {
  let name = String(raw || "").trim();
  name = name.replace(/^["'「『`]+|["'」』`]+$/g, "").trim();
  name = name.split(/[\n，,。.!！]/)[0].trim();
  return name.slice(0, 16);
}

export function createThemesRouter(db: Database.Database): Router {
  const router = Router();

  // ── CRUD ───────────────────────────────────────────────────────────
  router.get("/api/themes", (req: Request, res: Response) => {
    const userId = requireUser(req, res);
    if (!userId) return;
    res.json({ success: true, themes: listThemes(db, userId) });
  });

  router.post("/api/themes", (req: Request, res: Response) => {
    const userId = requireUser(req, res);
    if (!userId) return;
    const name = String(req.body.name || "").trim();
    if (!name) { res.status(400).json({ success: false, error: "缺少主题名称" }); return; }
    const theme = createTheme(db, userId, name, String(req.body.description || ""));
    res.json({ success: true, theme });
  });

  router.post("/api/themes/:id/rename", (req: Request, res: Response) => {
    const userId = requireUser(req, res);
    if (!userId) return;
    const theme = renameTheme(db, userId, req.params.id, String(req.body.name || ""));
    if (!theme) { res.status(404).json({ success: false, error: "未找到主题" }); return; }
    res.json({ success: true, theme });
  });

  router.delete("/api/themes/:id", (req: Request, res: Response) => {
    const userId = requireUser(req, res);
    if (!userId) return;
    const ok = deleteTheme(db, userId, req.params.id);
    res.json({ success: ok, error: ok ? undefined : "未找到主题" });
  });

  // ── Items ──────────────────────────────────────────────────────────
  router.get("/api/themes/:id/items", (req: Request, res: Response) => {
    const userId = requireUser(req, res);
    if (!userId) return;
    const theme = getTheme(db, userId, req.params.id);
    if (!theme) { res.status(404).json({ success: false, error: "未找到主题" }); return; }
    res.json({ success: true, theme, items: getThemeItems(db, userId, req.params.id) });
  });

  router.post("/api/themes/:id/items", (req: Request, res: Response) => {
    const userId = requireUser(req, res);
    if (!userId) return;
    const ids = Array.isArray(req.body.ids) ? req.body.ids.map(String).slice(0, 100) : [];
    const added = addThemeItems(db, userId, req.params.id, ids);
    res.json({ success: true, added, theme: getTheme(db, userId, req.params.id) });
  });

  router.delete("/api/themes/:id/items/:itemId", (req: Request, res: Response) => {
    const userId = requireUser(req, res);
    if (!userId) return;
    const ok = removeThemeItem(db, userId, req.params.id, req.params.itemId);
    res.json({ success: ok, error: ok ? undefined : "未找到该条目" });
  });

  // ── Auto-classify an item into a theme (LLM) ───────────────────────
  router.post("/api/themes/classify", async (req: Request, res: Response) => {
    const userId = requireUser(req, res);
    if (!userId) return;
    if (!enforceRateLimit(req, res, "theme-classify", 60, 60 * 60 * 1000, String(userId))) return;

    const itemId = String(req.body.itemId || "").trim();
    const item = itemId ? findLibraryItem(db, userId, itemId) : null;
    if (!item) { res.status(404).json({ success: false, error: "未找到收藏" }); return; }

    const llm = getLlmConfigWithFallback(db, userId);
    if (!llm.apiKey) { res.status(400).json({ success: false, error: "请先在设置中填写 API Key" }); return; }

    const existing = listThemes(db, userId).map((t) => t.name);
    try {
      const raw = await chatCompletion(
        { apiKey: llm.apiKey, baseUrl: llm.baseUrl, model: llm.model },
        [
          { role: "system", content: CLASSIFY_SYSTEM_PROMPT },
          { role: "user", content: buildClassifyUserPrompt(item.title, item.summary || "", existing) },
        ],
        30,
      );
      const name = cleanThemeName(raw);
      if (!name) throw new Error("未能识别主题");

      let theme = findThemeByName(db, userId, name);
      let created = false;
      if (!theme) {
        theme = createTheme(db, userId, name);
        created = true;
      }
      addThemeItems(db, userId, theme.id, [item.id]);
      recordApiUsage(db, userId, { provider: "deepseek", model: llm.model, endpoint: "/api/themes/classify", tokens_input: Math.ceil((item.summary || "").length / 4), tokens_output: Math.ceil(name.length / 4) });
      res.json({ success: true, themeId: theme.id, themeName: theme.name, created });
    } catch (err: any) {
      res.status(500).json({ success: false, error: err.message || "归类失败" });
    }
  });

  // ── Cross-video theme synthesis (LLM) ──────────────────────────────
  router.post("/api/themes/:id/summarize", async (req: Request, res: Response) => {
    const userId = requireUser(req, res);
    if (!userId) return;
    if (!enforceRateLimit(req, res, "theme-synthesize", 20, 60 * 60 * 1000, String(userId))) return;

    const theme = getTheme(db, userId, req.params.id);
    if (!theme) { res.status(404).json({ success: false, error: "未找到主题" }); return; }
    const items = getThemeItems(db, userId, req.params.id);
    if (!items.length) { res.status(400).json({ success: false, error: "该主题下还没有视频" }); return; }

    const llm = getLlmConfigWithFallback(db, userId);
    if (!llm.apiKey) { res.status(400).json({ success: false, error: "请先在设置中填写 API Key" }); return; }

    const blocks = items.map((it) => ({ title: it.title, summary: it.summary || "" }));
    try {
      const markdown = await chatCompletion(
        { apiKey: llm.apiKey, baseUrl: llm.baseUrl, model: llm.model },
        [
          { role: "system", content: THEME_SYNTHESIS_SYSTEM_PROMPT },
          { role: "user", content: buildThemeSynthesisUserPrompt(theme.name, blocks) },
        ],
        2400,
      );
      const totalChars = blocks.reduce((n, b) => n + b.summary.length, 0);
      recordApiUsage(db, userId, { provider: "deepseek", model: llm.model, endpoint: "/api/themes/summarize", tokens_input: Math.ceil(totalChars / 4), tokens_output: Math.ceil(markdown.length / 4) });
      res.json({ success: true, markdown });
    } catch (err: any) {
      res.status(500).json({ success: false, error: err.message || "生成综合总结失败" });
    }
  });

  return router;
}
