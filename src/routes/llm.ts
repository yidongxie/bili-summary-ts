import { Router, Request, Response } from "express";
import Database from "better-sqlite3";
import crypto from "crypto";
import { getLlmConfigWithFallback } from "../db/configStore";
import { searchLibraryForAsk, type AskCitation } from "../db/libraryStore";
import { searchLibrarySemantic } from "../db/embeddingStore";
import { getEmbeddingConfig, embedTexts } from "../llm/embedding";
import { formatDuration } from "../common/date";
import { enforceRateLimit } from "../common/rateLimit";
import { chatCompletion, chatCompletionStream, suggestTags } from "../llm/summarize";
import { recordApiUsage } from "../db/usageStore";
import {
  CHAT_SYSTEM_PROMPT,
  buildChatUserPrompt,
  REWRITE_SYSTEM_PROMPT,
  REWRITE_STYLE_MAP,
  buildRewriteUserPrompt,
  TRANSLATE_SYSTEM_PROMPT,
  ASK_SYSTEM_PROMPT,
  ARTICLE_SYSTEM_PROMPT,
  buildArticleUserPrompt,
} from "../llm/prompts";

function requireUser(req: Request, res: Response): number | null {
  const user = req.user;
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

  // ── Subtitle → article rewrite ─────────────────────────────────────
  router.post("/api/llm/article", async (req: Request, res: Response) => {
    const userId = requireUser(req, res);
    if (!userId) return;
    if (!enforceRateLimit(req, res, "llm-article", 20, 60 * 60 * 1000, String(userId))) return;

    const text = String(req.body.text || "").trim().slice(0, 20000);
    if (!text) { res.status(400).json({ success: false, error: "缺少字幕内容" }); return; }

    const llm = getLlmConfigWithFallback(db, userId);
    if (!llm.apiKey) { res.status(400).json({ success: false, error: "请先在设置中填写 API Key" }); return; }

    try {
      const article = await chatCompletion(
        { apiKey: llm.apiKey, baseUrl: llm.baseUrl, model: llm.model },
        [
          { role: "system", content: ARTICLE_SYSTEM_PROMPT },
          { role: "user", content: buildArticleUserPrompt(text) },
        ],
        2400,
      );
      recordApiUsage(db, userId, { provider: "deepseek", model: llm.model, endpoint: "/api/llm/article", tokens_input: Math.ceil(text.length / 4), tokens_output: Math.ceil(article.length / 4) });
      res.json({ success: true, article });
    } catch (err: any) {
      res.status(500).json({ success: false, error: err.message || "生成文章失败" });
    }
  });

  // ── Ask your knowledge base (RAG, streaming) ───────────────────────
  router.post("/api/llm/ask", async (req: Request, res: Response) => {
    const userId = requireUser(req, res);
    if (!userId) return;
    if (!enforceRateLimit(req, res, "llm-ask", 60, 60 * 60 * 1000, String(userId))) return;

    const question = String(req.body.question || "").trim().slice(0, 500);
    if (!question) { res.status(400).json({ success: false, error: "缺少问题" }); return; }
    const history: Array<{ role: string; content: string }> = Array.isArray(req.body.history)
      ? req.body.history
          .filter((h: any) => h && (h.role === "user" || h.role === "assistant"))
          .slice(-6)
          .map((h: any) => ({ role: h.role, content: String(h.content || "").slice(0, 2000) }))
      : [];

    const llm = getLlmConfigWithFallback(db, userId);
    if (!llm.apiKey) { res.status(400).json({ success: false, error: "请先在设置中填写 API Key" }); return; }

    // Retrieve: keyword citations + semantic hits, then merge with RRF.
    const keywordCitations = searchLibraryForAsk(db, userId, question, 10);
    let semanticHits: Array<{ itemId: string; title: string; bvid: string; link: string; time: number; text: string }> = [];
    const embConfig = getEmbeddingConfig(db, userId);
    if (embConfig) {
      try {
        const [vec] = await embedTexts([question], embConfig);
        if (vec && vec.length) {
          semanticHits = searchLibrarySemantic(db, userId, vec, 10).map((h) => ({
            itemId: h.item.id,
            title: h.item.title,
            bvid: h.item.bvid || "",
            link: h.item.link || "",
            time: h.startSec,
            text: (h.text || h.item.summary || "").slice(0, 200),
          }));
        }
      } catch {
        // ignore semantic failures — keyword citations still work
      }
    }

    const K = 60;
    const merged = new Map<string, { c: any; rrf: number }>();
    keywordCitations.forEach((c, i) => merged.set(c.itemId + ":" + c.time, { c, rrf: 1 / (K + i + 1) }));
    semanticHits.forEach((h, i) => {
      const key = h.itemId + ":" + h.time;
      const add = 1 / (K + i + 1);
      const ex = merged.get(key);
      if (ex) ex.rrf += add;
      else merged.set(key, { c: { itemId: h.itemId, title: h.title, bvid: h.bvid, link: h.link, time: h.time, text: h.text }, rrf: add });
    });
    const citations: any[] = [...merged.values()]
      .sort((a, b) => b.rrf - a.rrf)
      .slice(0, 8)
      .map((x, i) => ({ ...x.c, index: i + 1 }));

    res.writeHead(200, {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no",
    });
    const send = (obj: any) => res.write(`data: ${JSON.stringify(obj)}\n\n`);

    if (!citations.length) {
      send({ type: "citations", citations: [] });
      send({ type: "delta", text: "你的知识库里暂时没有相关内容。先收藏几个视频，再来问我吧。" });
      send({ type: "done" });
      res.end();
      return;
    }

    const context = citations.map((c) => `[${c.index}] ${c.title}（${formatDuration(c.time)}）\n${c.text}`).join("\n\n");
    const cleanCitations = citations.map(({ index, itemId, title, bvid, link, time }) => ({ index, itemId, title, bvid, link, time }));
    send({ type: "citations", citations: cleanCitations });

    let full = "";
    try {
      await chatCompletionStream(
        { apiKey: llm.apiKey, baseUrl: llm.baseUrl, model: llm.model },
        [
          { role: "system", content: ASK_SYSTEM_PROMPT },
          ...history,
          { role: "user", content: `问题：${question}\n\n资料片段：\n${context}` },
        ],
        1200,
        (delta) => {
          full += delta;
          send({ type: "delta", text: delta });
        },
      );
      recordApiUsage(db, userId, { provider: "deepseek", model: llm.model, endpoint: "/api/llm/ask", tokens_input: Math.ceil((question.length + context.length) / 4), tokens_output: Math.ceil(full.length / 4) });
      try {
        db.prepare("INSERT INTO ask_history (id, user_id, question, answer, citations_json) VALUES (?, ?, ?, ?, ?)").run(
          crypto.randomUUID(), userId, question, full, JSON.stringify(cleanCitations),
        );
      } catch { /* ignore history write failure */ }
      send({ type: "done" });
    } catch (err: any) {
      send({ type: "error", error: err.message || "问答失败" });
    } finally {
      res.end();
    }
  });

  // ── Ask history ────────────────────────────────────────────────────
  router.get("/api/llm/ask/history", (req: Request, res: Response) => {
    const userId = requireUser(req, res);
    if (!userId) return;
    const rows = db.prepare("SELECT * FROM ask_history WHERE user_id = ? ORDER BY created_at DESC LIMIT 50").all(userId) as any[];
    res.json({
      success: true,
      history: rows.map((r) => ({
        id: r.id,
        question: r.question,
        answer: r.answer,
        citations: (() => { try { const v = JSON.parse(r.citations_json); return Array.isArray(v) ? v : []; } catch { return []; } })(),
        created_at: r.created_at,
      })),
    });
  });

  router.delete("/api/llm/ask/history", (req: Request, res: Response) => {
    const userId = requireUser(req, res);
    if (!userId) return;
    db.prepare("DELETE FROM ask_history WHERE user_id = ?").run(userId);
    res.json({ success: true });
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
