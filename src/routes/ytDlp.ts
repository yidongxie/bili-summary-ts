import { Router, Request, Response } from "express";
import { isYtDlpAvailable, getYtDlpVersion } from "../common/YtDlpExtractor";

export function createYtDlpRouter(): Router {
  const router = Router();

  router.get("/api/yt-dlp/status", async (req: Request, res: Response) => {
    try {
      const available = await isYtDlpAvailable();
      const version = await getYtDlpVersion();
      res.json({
        success: true,
        available,
        version,
        supports: ["抖音", "小红书", "B站", "YouTube", "小宇宙", "1000+ 其他网站"],
      });
    } catch (error: any) {
      res.json({ success: false, error: error.message });
    }
  });

  return router;
}
