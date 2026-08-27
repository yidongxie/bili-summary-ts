import { Router, Request, Response } from "express";
import Database from "better-sqlite3";
import { getOrCreateChatThread, listChatMessages, appendChatMessage } from "../db/usageStore";

function requireUser(req: Request, res: Response): number | null {
  const user = req.user;
  if (!user) { res.status(401).json({ success: false, error: "请先登录" }); return null; }
  return user.id;
}

export function createChatRouter(db: Database.Database): Router {
  const router = Router();

  router.get("/api/chat/thread", (req: Request, res: Response) => {
    const userId = requireUser(req, res);
    if (!userId) return;
    const thread = getOrCreateChatThread(db, userId, {
      library_item_id: String(req.query.library_item_id || "") || undefined,
      target_key: String(req.query.target_key || "") || undefined,
      title: String(req.query.title || "学习对话"),
    });
    res.json({ success: true, thread, messages: listChatMessages(db, userId, (thread as any).id) });
  });

  router.post("/api/chat/thread/:id/messages", (req: Request, res: Response) => {
    const userId = requireUser(req, res);
    if (!userId) return;
    const message = appendChatMessage(db, userId, req.params.id, {
      role: String(req.body.role || "user"),
      content: String(req.body.content || ""),
      citations: Array.isArray(req.body.citations) ? req.body.citations : [],
    });
    if (!message) { res.status(404).json({ success: false, error: "未找到对话" }); return; }
    res.json({ success: true, message });
  });

  return router;
}
