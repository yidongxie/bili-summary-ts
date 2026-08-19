import { Router, Request, Response } from "express";
import { enforceRateLimit } from "../common/rateLimit";
import { isAllowedAudioProxyUrl } from "./utils";

function requireUser(req: Request, res: Response): number | null {
  const user = (req as any).user;
  if (!user) { res.status(401).json({ success: false, error: "请先登录" }); return null; }
  return user.id;
}

export function createAudioProxyRouter(): Router {
  const router = Router();

  router.get("/api/proxy/audio", async (req: Request, res: Response) => {
    const userId = requireUser(req, res);
    if (!userId) return;
    if (!enforceRateLimit(req, res, "proxy-audio", 120, 10 * 60 * 1000, String(userId))) return;

    const url = String(req.query.url || "").trim();
    if (!url) { res.status(400).json({ success: false, error: "缺少音频URL" }); return; }
    if (!isAllowedAudioProxyUrl(url)) { res.status(400).json({ success: false, error: "不支持的音频来源" }); return; }

    try {
      const audioRes = await fetch(url, {
        headers: {
          "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
          "Referer": "https://www.xiaoyuzhoufm.com/",
          "Range": req.headers.range || "bytes=0-",
        },
      });

      if (!audioRes.ok) {
        console.error("[Audio proxy] Failed to fetch audio:", audioRes.status, url);
        res.status(audioRes.status).json({ success: false, error: "音频获取失败: " + audioRes.statusText });
        return;
      }

      res.status(audioRes.status === 206 ? 206 : 200);

      const forwardHeaders = [
        "content-type", "content-length", "content-range",
        "accept-ranges", "cache-control", "etag", "last-modified",
      ];
      forwardHeaders.forEach((h) => {
        const val = audioRes.headers.get(h);
        if (val) res.setHeader(h, val);
      });

      res.setHeader("Access-Control-Allow-Origin", "*");
      res.setHeader("Access-Control-Allow-Methods", "GET, HEAD, OPTIONS");
      res.setHeader("Access-Control-Allow-Headers", "Range");

      // Stream with disconnect detection
      let aborted = false;
      res.on("close", () => { aborted = true; });

      const reader = audioRes.body?.getReader();
      if (reader) {
        while (true) {
          const { done, value } = await reader.read();
          if (done || aborted) break;
          res.write(value);
        }
      }
      res.end();
    } catch (err: any) {
      console.error("[Audio proxy error]", err.message, url);
      if (!res.headersSent) {
        res.status(500).json({ success: false, error: "音频代理失败: " + err.message });
      }
    }
  });

  return router;
}
