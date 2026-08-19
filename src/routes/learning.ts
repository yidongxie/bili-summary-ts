import { Router, Request, Response } from "express";
import Database from "better-sqlite3";
import { getLlmConfigWithFallback } from "../db/configStore";
import { findLibraryItem } from "../db/libraryStore";
import { chatCompletion } from "../llm/summarize";
import { recordApiUsage } from "../db/usageStore";
import {
  listPaths, createPath, updatePath, deletePath,
  addPathItem, removePathItem, markPathItemComplete, reorderPathItems,
  listDueReviews, createReviewItem, answerReviewItem, deleteReviewItem,
  saveQuiz, getQuiz, submitQuiz,
} from "../db/learningStore";
import { QUIZ_SYSTEM_PROMPT, buildQuizUserPrompt } from "../llm/prompts";

function requireUser(req: Request, res: Response): number | null {
  const user = (req as any).user;
  if (!user) { res.status(401).json({ success: false, error: "请先登录" }); return null; }
  return user.id;
}

export function createLearningRouter(db: Database.Database): Router {
  const router = Router();

  // ── Learning paths ──────────────────────────────────────────────────
  router.get("/api/paths", (req: Request, res: Response) => {
    const userId = requireUser(req, res);
    if (!userId) return;
    res.json({ success: true, paths: listPaths(db, userId) });
  });

  router.post("/api/paths", (req: Request, res: Response) => {
    const userId = requireUser(req, res);
    if (!userId) return;
    const path = createPath(db, userId, { title: String(req.body.title || "未命名学习路径"), description: String(req.body.description || "") });
    res.json({ success: true, path });
  });

  router.post("/api/paths/:id", (req: Request, res: Response) => {
    const userId = requireUser(req, res);
    if (!userId) return;
    const path = updatePath(db, userId, req.params.id, { title: req.body.title, description: req.body.description });
    if (!path) { res.status(404).json({ success: false, error: "未找到学习路径" }); return; }
    res.json({ success: true, path });
  });

  router.delete("/api/paths/:id", (req: Request, res: Response) => {
    const userId = requireUser(req, res);
    if (!userId) return;
    const ok = deletePath(db, userId, req.params.id);
    res.json({ success: ok, error: ok ? undefined : "未找到学习路径" });
  });

  router.post("/api/paths/:id/items", (req: Request, res: Response) => {
    const userId = requireUser(req, res);
    if (!userId) return;
    const ok = addPathItem(db, userId, req.params.id, String(req.body.library_item_id || ""));
    res.json({ success: ok, paths: listPaths(db, userId), error: ok ? undefined : "添加失败" });
  });

  router.post("/api/paths/:id/items/reorder", (req: Request, res: Response) => {
    const userId = requireUser(req, res);
    if (!userId) return;
    const ok = reorderPathItems(db, userId, req.params.id, Array.isArray(req.body.ordered_ids) ? req.body.ordered_ids : []);
    res.json({ success: ok, paths: listPaths(db, userId) });
  });

  router.post("/api/paths/:id/items/:itemId/complete", (req: Request, res: Response) => {
    const userId = requireUser(req, res);
    if (!userId) return;
    const ok = markPathItemComplete(db, userId, req.params.id, req.params.itemId, !!req.body.completed);
    res.json({ success: ok, paths: listPaths(db, userId) });
  });

  router.delete("/api/paths/:id/items/:itemId", (req: Request, res: Response) => {
    const userId = requireUser(req, res);
    if (!userId) return;
    const ok = removePathItem(db, userId, req.params.id, req.params.itemId);
    res.json({ success: ok, paths: listPaths(db, userId) });
  });

  // ── Spaced repetition ───────────────────────────────────────────────
  router.get("/api/review/due", (req: Request, res: Response) => {
    const userId = requireUser(req, res);
    if (!userId) return;
    res.json({ success: true, items: listDueReviews(db, userId) });
  });

  router.post("/api/review/items", (req: Request, res: Response) => {
    const userId = requireUser(req, res);
    if (!userId) return;
    const item = createReviewItem(db, userId, req.body || {});
    res.json({ success: true, item });
  });

  router.post("/api/review/:id/answer", (req: Request, res: Response) => {
    const userId = requireUser(req, res);
    if (!userId) return;
    const item = answerReviewItem(db, userId, req.params.id, Number(req.body.quality || 0));
    if (!item) { res.status(404).json({ success: false, error: "未找到复习卡" }); return; }
    res.json({ success: true, item });
  });

  router.delete("/api/review/:id", (req: Request, res: Response) => {
    const userId = requireUser(req, res);
    if (!userId) return;
    const ok = deleteReviewItem(db, userId, req.params.id);
    res.json({ success: ok });
  });

  // ── Quizzes ─────────────────────────────────────────────────────────
  router.post("/api/quizzes/generate", async (req: Request, res: Response) => {
    const userId = requireUser(req, res);
    if (!userId) return;
    const item = findLibraryItem(db, userId, String(req.body.library_item_id || ""));
    if (!item) { res.status(404).json({ success: false, error: "未找到收藏" }); return; }
    const llm = getLlmConfigWithFallback(db, userId);
    if (!llm.apiKey) { res.status(400).json({ success: false, error: "请先在设置中填写 API Key" }); return; }
    try {
      const raw = await chatCompletion(
        { apiKey: llm.apiKey, baseUrl: llm.baseUrl, model: llm.model },
        [
          { role: "system", content: QUIZ_SYSTEM_PROMPT },
          { role: "user", content: buildQuizUserPrompt(item.title, item.summary, item.transcript || "") },
        ],
        1400,
      );
      const jsonText = raw.replace(/^```json\s*/i, "").replace(/^```\s*/i, "").replace(/```$/i, "").trim();
      let questions: any[] = [];
      try { questions = JSON.parse(jsonText); } catch { questions = [{ type: "short", question: "请概括这条内容的核心观点", options: [], answer: "参考原总结", explanation: item.summary.slice(0, 300) }]; }
      recordApiUsage(db, userId, { provider: "deepseek", model: llm.model, endpoint: "/api/quizzes/generate", tokens_input: Math.ceil((item.summary.length + (item.transcript || "").slice(0, 4000).length) / 4), tokens_output: Math.ceil(raw.length / 4) });
      const quiz = saveQuiz(db, userId, item.id, Array.isArray(questions) ? questions.slice(0, 8) : []);
      res.json({ success: true, quiz });
    } catch (err: any) {
      res.status(500).json({ success: false, error: err.message || "生成测验失败" });
    }
  });

  router.get("/api/quizzes/:id", (req: Request, res: Response) => {
    const userId = requireUser(req, res);
    if (!userId) return;
    const quiz = getQuiz(db, userId, req.params.id);
    if (!quiz) { res.status(404).json({ success: false, error: "未找到测验" }); return; }
    res.json({ success: true, quiz });
  });

  router.post("/api/quizzes/:id/submit", (req: Request, res: Response) => {
    const userId = requireUser(req, res);
    if (!userId) return;
    const quiz = submitQuiz(db, userId, req.params.id, req.body.answers || {});
    if (!quiz) { res.status(404).json({ success: false, error: "未找到测验" }); return; }
    res.json({ success: true, quiz });
  });

  return router;
}
