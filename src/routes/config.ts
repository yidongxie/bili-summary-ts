import { Router, Request, Response } from "express";
import Database from "better-sqlite3";
import { getPublicConfig, getDecryptedConfig, saveConfig as saveUserConfig, generateApiToken, getApiToken } from "../db/configStore";
import { isSafeUpstreamUrl } from "./utils";
import { isSafePublicHttpUrl } from "../common/urlSafety";
import { enforceRateLimit } from "../common/rateLimit";

function requireUser(req: Request, res: Response): number | null {
  const user = req.user;
  if (!user) { res.status(401).json({ success: false, error: "请先登录" }); return null; }
  return user.id;
}

function isAdminUser(user: any): boolean {
  if (!user) return false;
  if (user.is_admin) return true;
  const ADMIN_EMAIL = process.env.ADMIN_EMAIL?.trim().toLowerCase() || "";
  return !!ADMIN_EMAIL && String(user.email || "").trim().toLowerCase() === ADMIN_EMAIL;
}

export function createConfigRouter(db: Database.Database): Router {
  const router = Router();

  // ── Public config ──────────────────────────────────────────────────
  router.get("/api/config", (req: Request, res: Response) => {
    const userId = req.user?.id;
    if (!userId) {
      res.json({
        success: true,
        config: {
          default_category: "待整理",
          deepseek_base_url: "https://api.deepseek.com/v1",
          deepseek_model: "deepseek-v4-flash",
          whisper_base_url: "https://api.siliconflow.cn/v1",
          whisper_model: "TeleAI/TeleSpeechASR",
          embedding_model: "BAAI/bge-m3",
          vision_model: "",
          obsidian_folder: "BiliStudy",
          obsidian_vault_name: "",
          api_key_set: false,
          whisper_api_key_set: false,
          api_token_set: false,
        },
      });
      return;
    }
    const pub = getPublicConfig(db, userId);
    res.json({ success: true, config: pub });
  });

  router.post("/api/config", (req: Request, res: Response) => {
    const userId = req.user?.id;
    if (!userId) { res.status(401).json({ success: false, error: "请先登录" }); return; }

    // SSRF 防护：非管理员不得把 LLM/Whisper 基址指向内网/本地地址。
    // 管理员不受限，以便接入自建 FunASR / 本地 LLM。
    if (!isAdminUser(req.user)) {
      const body = req.body || {};
      const baseFields = [body.deepseek_base_url, body.whisper_base_url];
      for (const base of baseFields) {
        if (base && !isSafePublicHttpUrl(String(base))) {
          res.status(400).json({ success: false, error: "不允许将服务地址指向内部或本地网络" });
          return;
        }
      }
    }

    saveUserConfig(db, userId, req.body);
    const pub = getPublicConfig(db, userId);
    res.json({ success: true, config: pub });
  });

  // ── API token (for MCP / OpenAPI / agent access) ────────────────────
  router.get("/api/config/api-token", (req: Request, res: Response) => {
    const userId = requireUser(req, res);
    if (!userId) return;
    res.json({ success: true, has_token: !!getApiToken(db, userId) });
  });

  router.post("/api/config/api-token", (req: Request, res: Response) => {
    const userId = requireUser(req, res);
    if (!userId) return;
    if (!enforceRateLimit(req, res, "api-token", 10, 60 * 60 * 1000, String(userId))) return;
    const token = generateApiToken(db, userId);
    res.json({ success: true, token });
  });

  router.post("/api/config/test-deepseek", async (req: Request, res: Response) => {
    const userId = requireUser(req, res);
    if (!userId) return;
    if (!enforceRateLimit(req, res, "test-deepseek", 10, 10 * 60 * 1000, String(userId))) return;

    const config = getDecryptedConfig(db, userId);
    const apiKey = String(req.body.api_key || config.api_key || "").trim();
    const baseUrl = String(req.body.base_url || config.deepseek_base_url || "https://api.deepseek.com/v1").replace(/\/+$/, "");
    const model = String(req.body.model || config.deepseek_model || "deepseek-v4-flash").trim();
    if (!apiKey) { res.status(400).json({ success: false, error: "请先填写 DeepSeek API Key" }); return; }
    if (!isSafeUpstreamUrl(baseUrl)) { res.status(400).json({ success: false, error: "不允许连接到该地址" }); return; }

    try {
      const r = await fetch(baseUrl + "/chat/completions", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
        body: JSON.stringify({ model, messages: [{ role: "user", content: "ping" }], max_tokens: 8 }),
        signal: AbortSignal.timeout(30000),
      });
      if (!r.ok) {
        const text = await r.text().catch(() => r.statusText);
        res.status(400).json({ success: false, error: `连接失败 (${r.status}): ${text.slice(0, 200)}` });
        return;
      }
      res.json({ success: true });
    } catch (err: any) {
      res.status(400).json({ success: false, error: err.message || "连接失败" });
    }
  });

  router.post("/api/config/test-whisper", async (req: Request, res: Response) => {
    const userId = requireUser(req, res);
    if (!userId) return;
    if (!enforceRateLimit(req, res, "test-whisper", 10, 10 * 60 * 1000, String(userId))) return;

    const config = getDecryptedConfig(db, userId);
    const apiKey = String(req.body.whisper_api_key || config.whisper_api_key || "").trim();
    const baseUrl = String(req.body.whisper_base_url || config.whisper_base_url || "https://api.siliconflow.cn/v1").replace(/\/+$/, "");
    if (!apiKey) { res.status(400).json({ success: false, error: "请先填写 Whisper API Key" }); return; }
    if (!isSafeUpstreamUrl(baseUrl)) { res.status(400).json({ success: false, error: "不允许连接到该地址" }); return; }

    try {
      const r = await fetch(baseUrl + "/models", { headers: { Authorization: `Bearer ${apiKey}` }, signal: AbortSignal.timeout(30000) });
      if (!r.ok) {
        const text = await r.text().catch(() => r.statusText);
        res.status(400).json({ success: false, error: `连接失败 (${r.status}): ${text.slice(0, 200)}` });
        return;
      }
      res.json({ success: true });
    } catch (err: any) {
      res.status(400).json({ success: false, error: err.message || "连接失败" });
    }
  });

  return router;
}
