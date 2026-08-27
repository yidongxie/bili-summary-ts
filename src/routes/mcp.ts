/** Minimal MCP (Model Context Protocol) server over Streamable HTTP.
 *
 * Exposes a read-only subset of BiliStudy to agents: search the library,
 * list it, fetch an item, and ask a question over the whole knowledge base.
 * Auth via `Authorization: Bearer <API token>` (see /api/config/api-token).
 */

import { Router, Request, Response } from "express";
import Database from "better-sqlite3";
import { verifyApiToken, getLlmConfigWithFallback } from "../db/configStore";
import { queryLibrary, findLibraryItem, searchLibraryForAsk } from "../db/libraryStore";
import { searchLibrarySemantic } from "../db/embeddingStore";
import { getEmbeddingConfig, embedTexts } from "../llm/embedding";
import { chatCompletion } from "../llm/summarize";
import { ASK_SYSTEM_PROMPT } from "../llm/prompts";
import { formatDuration } from "../common/date";
import { submitSummaryTask, getSummaryTask } from "../db/taskQueue";

const MCP_VERSION = "2024-11-05";
const SERVER_NAME = "bilistudy";
const SERVER_VERSION = "4.0.0";

interface ToolResult {
  content: Array<{ type: "text"; text: string }>;
  isError?: boolean;
}

const toolDefs = [
  {
    name: "search_library",
    description: "在 BiliStudy 收藏库中搜索视频/播客（关键词全文搜索）。返回标题、作者、时长、链接和摘要片段。",
    inputSchema: {
      type: "object",
      properties: {
        q: { type: "string", description: "搜索关键词" },
        category: { type: "string", description: "按分类过滤（可选）" },
        tag: { type: "string", description: "按标签过滤（可选）" },
        page: { type: "integer", description: "页码，默认 1" },
        page_size: { type: "integer", description: "每页数量，默认 20，最大 100" },
      },
      required: ["q"],
    },
  },
  {
    name: "list_library",
    description: "列出收藏库中的内容（按更新时间倒序）。",
    inputSchema: {
      type: "object",
      properties: {
        page: { type: "integer" },
        page_size: { type: "integer" },
        category: { type: "string" },
        tag: { type: "string" },
      },
    },
  },
  {
    name: "get_library_item",
    description: "获取收藏库中某一条的完整内容（总结、字幕、章节、标签、笔记）。",
    inputSchema: {
      type: "object",
      properties: { id: { type: "string", description: "条目的 id" } },
      required: ["id"],
    },
  },
  {
    name: "ask_knowledge_base",
    description: "基于整个收藏库的内容回答一个问题（RAG），返回答案与引用来源（带时间戳）。",
    inputSchema: {
      type: "object",
      properties: { question: { type: "string", description: "要问的问题" } },
      required: ["question"],
    },
  },
  {
    name: "summarize_video",
    description: "提交一个视频/播客链接进行 AI 总结（异步，最多等待 180 秒返回结果）。",
    inputSchema: {
      type: "object",
      properties: {
        url: { type: "string", description: "B站/YouTube/小宇宙/抖音/小红书等视频或播客链接" },
        mode: { type: "string", enum: ["brief", "detailed", "timeline", "knowledge"], description: "总结模式，默认 brief" },
      },
      required: ["url"],
    },
  },
];

function extractBearer(req: Request): string {
  const h = String(req.headers.authorization || "");
  const m = h.match(/^Bearer\s+(.+)$/i);
  return m ? m[1].trim() : "";
}

function textResult(text: string, isError = false): ToolResult {
  return { content: [{ type: "text", text }], ...(isError ? { isError: true } : {}) };
}

async function runTool(db: Database.Database, userId: number, name: string, args: Record<string, unknown>): Promise<ToolResult> {
  switch (name) {
    case "search_library": {
      const q = String(args.q || "").trim();
      if (!q) return textResult("缺少参数 q", true);
      const res = queryLibrary(db, userId, {
        q,
        category: args.category ? String(args.category) : undefined,
        tag: args.tag ? String(args.tag) : undefined,
        page: Number(args.page || 1),
        pageSize: Number(args.page_size || 20),
      });
      const items = res.items.map((i) => ({
        id: i.id,
        title: i.title,
        author: i.author,
        duration: formatDuration(i.duration),
        link: i.link,
        tags: i.tags || [],
        summary: (i.summary || "").slice(0, 500),
        snippet: i.snippet || "",
      }));
      return textResult(JSON.stringify({ total: res.total, page: res.page, items }, null, 2));
    }
    case "list_library": {
      const res = queryLibrary(db, userId, {
        category: args.category ? String(args.category) : undefined,
        tag: args.tag ? String(args.tag) : undefined,
        page: Number(args.page || 1),
        pageSize: Number(args.page_size || 20),
      });
      const items = res.items.map((i) => ({
        id: i.id,
        title: i.title,
        author: i.author,
        duration: formatDuration(i.duration),
        link: i.link,
        tags: i.tags || [],
        summary: (i.summary || "").slice(0, 300),
      }));
      return textResult(JSON.stringify({ total: res.total, page: res.page, items }, null, 2));
    }
    case "get_library_item": {
      const id = String(args.id || "").trim();
      if (!id) return textResult("缺少参数 id", true);
      const item = findLibraryItem(db, userId, id);
      if (!item) return textResult("未找到该条目", true);
      return textResult(JSON.stringify({
        id: item.id,
        title: item.title,
        author: item.author,
        duration: formatDuration(item.duration),
        link: item.link,
        category: item.category,
        tags: item.tags || [],
        mode: item.mode,
        summary: item.summary || "",
        transcript: item.transcript || "",
        notes: item.notes || "",
        chapters: item.chapters || [],
      }, null, 2));
    }
    case "ask_knowledge_base": {
      const question = String(args.question || "").trim().slice(0, 500);
      if (!question) return textResult("缺少参数 question", true);
      return textResult(JSON.stringify(await answerFromLibrary(db, userId, question), null, 2));
    }
    case "summarize_video": {
      const url = String(args.url || "").trim();
      if (!url) return textResult("缺少参数 url", true);
      const mode = String(args.mode || "brief").trim() || "brief";
      const userRow = db.prepare("SELECT email FROM users WHERE id = ?").get(userId) as { email?: string } | undefined;
      const submitted = submitSummaryTask(db, userId, userRow?.email || "", url, { mode });
      if (!submitted.ok || !submitted.task_id) return textResult(submitted.error || "提交失败", true);

      const deadline = Date.now() + 180000;
      while (Date.now() < deadline) {
        await new Promise((r) => setTimeout(r, 1500));
        const t = getSummaryTask(db, submitted.task_id!, userId);
        if (!t) return textResult("任务不存在", true);
        if (t.status === "done") {
          return textResult(JSON.stringify({ task_id: submitted.task_id, ...(t.result || {}) }, null, 2));
        }
        if (t.status === "error") return textResult(t.error || "任务失败", true);
      }
      return textResult(`任务处理超时（180 秒）。task_id=${submitted.task_id}，可稍后通过「get_library_item」或轮询查询结果。`, true);
    }
    default:
      return textResult(`未知工具: ${name}`, true);
  }
}

async function answerFromLibrary(db: Database.Database, userId: number, question: string) {
  const llm = getLlmConfigWithFallback(db, userId);
  if (!llm.apiKey) return { error: "未配置 API Key，请在设置中填写 DeepSeek API Key" };

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
    } catch { /* ignore semantic failures */ }
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

  if (!citations.length) return { answer: "你的知识库里暂时没有相关内容。", citations: [] };

  const context = citations.map((c) => `[${c.index}] ${c.title}（${formatDuration(c.time)}）\n${c.text}`).join("\n\n");
  const answer = await chatCompletion(
    { apiKey: llm.apiKey, baseUrl: llm.baseUrl, model: llm.model },
    [
      { role: "system", content: ASK_SYSTEM_PROMPT },
      { role: "user", content: `问题：${question}\n\n资料片段：\n${context}` },
    ],
    1200,
  );
  return {
    answer,
    citations: citations.map(({ index, itemId, title, bvid, link, time }) => ({ index, itemId, title, bvid, link, time })),
  };
}

export function createMcpRouter(db: Database.Database): Router {
  const router = Router();

  router.get("/api/mcp", (req: Request, res: Response) => {
    res.json({
      name: SERVER_NAME,
      version: SERVER_VERSION,
      protocolVersion: MCP_VERSION,
      transport: "streamable-http",
      endpoint: "/api/mcp",
      auth: "Bearer <API token>",
    });
  });

  router.post("/api/mcp", async (req: Request, res: Response) => {
    const token = extractBearer(req);
    const userId = verifyApiToken(db, token);
    if (!userId) {
      res.status(401).json({ jsonrpc: "2.0", error: { code: -32001, message: "未授权：缺少或无效的 API token" } });
      return;
    }

    const body = req.body as any;
    const id = body?.id;
    const method = String(body?.method || "");

    // Notifications have no id and expect no response.
    if (!id && method.startsWith("notifications/")) {
      res.status(202).end();
      return;
    }

    if (!method || typeof id === "undefined") {
      res.status(400).json({ jsonrpc: "2.0", id: id ?? null, error: { code: -32600, message: "Invalid request" } });
      return;
    }

    try {
      switch (method) {
        case "initialize":
          res.json({
            jsonrpc: "2.0",
            id,
            result: {
              protocolVersion: MCP_VERSION,
              capabilities: { tools: {} },
              serverInfo: { name: SERVER_NAME, version: SERVER_VERSION },
            },
          });
          return;
        case "ping":
          res.json({ jsonrpc: "2.0", id, result: {} });
          return;
        case "tools/list":
          res.json({ jsonrpc: "2.0", id, result: { tools: toolDefs } });
          return;
        case "tools/call": {
          const name = String(body?.params?.name || "");
          const args = (body?.params?.arguments || {}) as Record<string, unknown>;
          const result = await runTool(db, userId, name, args);
          res.json({ jsonrpc: "2.0", id, result });
          return;
        }
        default:
          res.json({ jsonrpc: "2.0", id, error: { code: -32601, message: `Method not found: ${method}` } });
          return;
      }
    } catch (err: any) {
      res.json({ jsonrpc: "2.0", id, error: { code: -32603, message: err?.message || String(err) } });
    }
  });

  return router;
}
