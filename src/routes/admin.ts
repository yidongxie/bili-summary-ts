import { Router, Request, Response } from "express";
import Database from "better-sqlite3";
import { getAdminStats, listAdminUsers, listAdminTasks, listAdminUsage } from "../db/usageStore";

const ADMIN_EMAIL = process.env.ADMIN_EMAIL?.trim().toLowerCase() || "";

function requireAdmin(req: Request, res: Response): boolean {
  const user = req.user;
  if (!user) { res.status(403).json({ success: false, error: "无管理员权限" }); return false; }
  if (user.is_admin) return true;
  if (ADMIN_EMAIL && String(user.email || "").trim().toLowerCase() === ADMIN_EMAIL) return true;
  res.status(403).json({ success: false, error: "无管理员权限" });
  return false;
}

export function createAdminRouter(db: Database.Database): Router {
  const router = Router();

  router.get("/api/admin/stats", (req: Request, res: Response) => {
    if (!requireAdmin(req, res)) return;
    res.json({ success: true, stats: getAdminStats(db) });
  });

  router.get("/api/admin/users", (req: Request, res: Response) => {
    if (!requireAdmin(req, res)) return;
    res.json({ success: true, users: listAdminUsers(db) });
  });

  router.get("/api/admin/tasks", (req: Request, res: Response) => {
    if (!requireAdmin(req, res)) return;
    res.json({ success: true, tasks: listAdminTasks(db) });
  });

  router.get("/api/admin/usage", (req: Request, res: Response) => {
    if (!requireAdmin(req, res)) return;
    res.json({ success: true, usage: listAdminUsage(db) });
  });

  return router;
}
