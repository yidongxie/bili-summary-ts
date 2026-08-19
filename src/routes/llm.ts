import { Router, Request, Response } from "express";
import Database from "better-sqlite3";
import { getLlmConfigWithFallback } from "../db/configStore";
import { enforceRateLimit } from "../common/rateLimit";
import { chatCompletion, suggestTags } from "../llm/summarize";
import { recordApiUsage } from "../db/usageStore";
import {
  CHAT_SYSTEM_PROMPT,
  buildChatUserPrompt,
  REWRITE_SYSTEM_PROMPT,
  REWRITE_STYLE_MAP,
  buildRewriteUserPrompt,
  TRANSLATE_SYSTEM_PROMPT,
} from "../llm/prompts";

function requireUser(req: Request, res: Response): number | null {
  const user = (req as any).user;
  if (!user) { res.status(401).json({ success: false, error: "请先登录" }); return null; }
  return user.id;
}



export function createLlmRouter(db: Database.Database): Router {
  const router = Router();

  // ── Chat ───────────────────────────────────────────────────────────
  router.post("/api/llm/chat", async (req: Request, res: Response) => {
    const userId = requireUser(req, res);
    if (!userId) return;
    if (!enforceRateLimit(req, res, "llm-chat", 40, 60 * 60 * 1000, String(userId))) return;
    const question = String(req.body.question || "").trim().slice(0, 800);
    const summary = String(req.body.summary || "").slice(0, 6000);
    const transcript = String(req.body.transcript || "").slice(0, 8000);
    const segments = Array.isArray(req.body.segments) ? req.body.segments : [];
    if (!question) { res.status(400).json({ success: false, error: "缺少问题" }); return; }
    const llm = getLlmConfigWithFallback(db, userId);
    if (!llm.apiKey) { res.status(400).json({ success: false, error: "请先在设置中填写 API Key" }); return; }
    const qWords = question.toLowerCase().split(/\s+|，|。|、|？|！|,|\./).filter(Boolean);
    const citations = segments
      .map((seg: any) => {
        const text = String(seg.content || "");
        const score = qWords.reduce((n, w) => n + (text.toLowerCase().includes(w) ? 1 : 0), 0);
        return { time: Number(seg.from || 0), text: text.slice(0, 120), score };
      })
      .filter((x: any) => x.text)
      .sort((a: any, b: any) => b.score - a.score || a.time - b.time)
      .slice(0, 3)
      .map(({ time, text }: any) => ({ time, text }));
    try {
      const answer = await chatCompletion(
        { apiKey: llm.apiKey, baseUrl: llm.baseUrl, model: llm.model },
        [
          { role: "system", content: CHAT_SYSTEM_PROMPT },
          { role: "user", content: buildChatUserPrompt(question, summary, citations.map((c: any) => `[${Math.floor(c.time)}s] ${c.text}`), transcript) },
        ],
        900,
      );
      recordApiUsage(db, userId, { provider: "deepseek", model: llm.model, endpoint: "/api/llm/chat", tokens_input: Math.ceil((summary.length + transcript.length + question.length) / 4), tokens_output: Math.ceil(answer.length / 4) });
      res.json({ success: true, answer, citations });
    } catch (err: any) {
      res.status(500).json({ success: false, error: err.message || "问答失败" });
    }
  });

  // ── Rewrite ────────────────────────────────────────────────────────
  router.post("/api/llm/rewrite", async (req: Request, res: Response) => {
    const userId = requireUser(req, res);
    if (!userId) return;
    if (!enforceRateLimit(req, res, "llm-rewrite", 30, 60 * 60 * 1000, String(userId))) return;
    const platform = String(req.body.platform || "小红书").trim().slice(0, 20);
    const summary = String(req.body.summary || "").trim().slice(0, 8000);
    const keyPoints = Array.isArray(req.body.keyPoints) ? req.body.keyPoints.map(String).slice(0, 8) : [];
    if (!summary) { res.status(400).json({ success: false, error: "缺少总结内容" }); return; }
    const llm = getLlmConfigWithFallback(db, userId);
    if (!llm.apiKey) { res.status(400).json({ success: false, error: "请先在设置中填写 API Key" }); return; }
    const style = REWRITE_STYLE_MAP[platform] || REWRITE_STYLE_MAP["小红书"];
    try {
      const text = await chatCompletion(
        { apiKey: llm.apiKey, baseUrl: llm.baseUrl, model: llm.model },
        [
          { role: "system", content: REWRITE_SYSTEM_PROMPT },
          { role: "user", content: buildRewriteUserPrompt(platform, style, keyPoints, summary) },
        ],
        1600,
      );
      recordApiUsage(db, userId, { provider: "deepseek", model: llm.model, endpoint: "/api/llm/rewrite", tokens_input: Math.ceil(summary.length / 4), tokens_output: Math.ceil(text.length / 4) });
      res.json({ success: true, text });
    } catch (err: any) {
      res.status(500).json({ success: false, error: err.message || "改写失败" });
    }
  });

  // ── Translate ──────────────────────────────────────────────────────
  router.post("/api/llm/translate", async (req: Request, res: Response) => {
    const userId = requireUser(req, res);
    if (!userId) return;
    if (!enforceRateLimit(req, res, "llm-translate", 40, 60 * 60 * 1000, String(userId))) return;

    const text = String(req.body.text || "").trim().slice(0, 12000);
    const target = String(req.body.target || "English").trim().slice(0, 20);
    if (!text) { res.status(400).json({ success: false, error: "缺少待翻译内容" }); return; }

    const llm = getLlmConfigWithFallback(db, userId);
    if (!llm.apiKey) { res.status(400).json({ success: false, error: "请先在设置中填写 API Key" }); return; }

    try {
      const translated = await chatCompletion(
        { apiKey: llm.apiKey, baseUrl: llm.baseUrl, model: llm.model },
        [
          { role: "system", content: TRANSLATE_SYSTEM_PROMPT },
          { role: "user", content: `目标语言：${target}\n\n待翻译内容：\n${text}` },
        ],
        2400,
      );
      recordApiUsage(db, userId, { provider: "deepseek", model: llm.model, endpoint: "/api/llm/translate", tokens_input: Math.ceil(text.length / 4), tokens_output: Math.ceil(translated.length / 4) });
      res.json({ success: true, text: translated });
    } catch (err: any) {
      res.status(500).json({ success: false, error: err.message || "翻译失败" });
    }
  });

  // ── Suggest tags ───────────────────────────────────────────────────
  router.post("/api/suggest-tags", async (req: Request, res: Response) => {
    const userId = requireUser(req, res);
    if (!userId) return;
    if (!enforceRateLimit(req, res, "suggest-tags", 30, 60 * 60 * 1000, String(userId))) return;

    const title = String(req.body.title ?? "").trim().slice(0, 200);
    const author = String(req.body.author ?? "").trim().slice(0, 100);
    const summary = String(req.body.summary ?? "").trim().slice(0, 8000);
    if (!title && !summary) { res.status(400).json({ success: false, error: "缺少标题或总结内容" }); return; }

    const llm = getLlmConfigWithFallback(db, userId);
    if (!llm.apiKey) { res.status(400).json({ success: false, error: "请先在设置中填写 API Key" }); return; }

    try {
      const tags = await suggestTags(title, author, summary, {
        apiKey: llm.apiKey,
        baseUrl: llm.baseUrl,
        model: llm.model,
      });
      res.json({ success: true, tags });
    } catch (err: any) {
      res.status(500).json({ success: false, error: err.message || String(err) });
    }
  });

  return router;
}
