import { Router, Request, Response } from "express";
import Database from "better-sqlite3";
import {
  queryLibrary,
  findLibraryItem,
  findLibraryItemByBvid,
  saveLibraryItem,
  deleteLibraryItem,
  updateLibraryArticle,
  reindexLibraryFts,
  listTags,
  updateTagMetadata,
  renameTag,
  mergeTags,
  deleteTag,
  bulkAddTags,
  bulkRemoveTags,
  bulkSetCategory,
  bulkDeleteItems,
  listSnippets,
  createSnippet,
  updateSnippet,
  deleteSnippet,
} from "../db/libraryStore";
import { generateEmbeddingForItem, embedTexts, getEmbeddingConfig } from "../llm/embedding";
import { searchLibrarySemantic, searchSimilarItems, getItemVector, listMissingEmbeddingItems } from "../db/embeddingStore";

function requireUser(req: Request, res: Response): number | null {
  const user = req.user;
  if (!user) { res.status(401).json({ success: false, error: "请先登录" }); return null; }
  return user.id;
}

export function createLibraryRouter(db: Database.Database): Router {
  const router = Router();

  // ── Library list ────────────────────────────────────────────────────
  router.get("/api/library", (req: Request, res: Response) => {
    const userId = req.user?.id;
    if (!userId) {
      res.json({ success: true, items: [], categories: [], tags: [], total: 0, page: 1, page_size: 20 });
      return;
    }
    const page = Math.max(1, parseInt(String(req.query.page || "1"), 10) || 1);
    const pageSize = Math.min(100, Math.max(1, parseInt(String(req.query.page_size || "20"), 10) || 20));
    const result = queryLibrary(db, userId, {
      q: String(req.query.q || "").trim(),
      category: String(req.query.category || "").trim(),
      tag: String(req.query.tag || "").trim(),
      sort: String(req.query.sort || "updated_desc"),
      page,
      pageSize,
    });
    res.json({
      success: true,
      items: result.items,
      categories: result.categories,
      tags: result.tags,
      total: result.total,
      page: result.page,
      page_size: result.pageSize,
    });
  });

  router.post("/api/library/reindex", (req: Request, res: Response) => {
    const userId = requireUser(req, res);
    if (!userId) return;
    const indexed = reindexLibraryFts(db, userId);
    res.json({ success: true, indexed });
  });

  // Backfill embeddings for items saved before semantic search existed (incremental).
  router.post("/api/library/reindex-embeddings", async (req: Request, res: Response) => {
    const userId = requireUser(req, res);
    if (!userId) return;
    const config = getEmbeddingConfig(db, userId);
    if (!config) { res.status(400).json({ success: false, error: "请先在设置中配置硅基流动 API Key（Whisper）" }); return; }
    const rows = listMissingEmbeddingItems(db, userId);
    for (const row of rows) {
      let segs: any;
      try { segs = JSON.parse(row.subtitle_segments || "[]"); } catch { segs = undefined; }
      await generateEmbeddingForItem(db, userId, { id: row.id, title: row.title, summary: row.summary, subtitle_segments: Array.isArray(segs) ? segs : undefined });
    }
    res.json({ success: true, total: rows.length });
  });

  router.get("/api/library/check/:bvid", (req: Request, res: Response) => {
    const userId = req.user?.id;
    if (!userId) { res.json({ success: true, saved: false }); return; }
    const found = findLibraryItemByBvid(db, userId, req.params.bvid);
    res.json({ success: true, saved: !!found, item: found || undefined });
  });

  // Semantic search over stored embeddings (best-effort; empty when unconfigured).
  router.get("/api/library/semantic-search", async (req: Request, res: Response) => {
    const userId = requireUser(req, res);
    if (!userId) return;
    const q = String(req.query.q || "").trim();
    if (!q) { res.json({ success: true, items: [] }); return; }
    const config = getEmbeddingConfig(db, userId);
    if (!config) { res.json({ success: true, items: [] }); return; }
    try {
      const [vec] = await embedTexts([q], config);
      if (!vec || !vec.length) { res.json({ success: true, items: [] }); return; }
      const hits = searchLibrarySemantic(db, userId, vec, 10);
      res.json({ success: true, items: hits.map((h) => h.item) });
    } catch {
      res.json({ success: true, items: [] });
    }
  });

  // Similar videos by item-level embedding (for recommendations).
  router.get("/api/library/:id/similar", async (req: Request, res: Response) => {
    const userId = requireUser(req, res);
    if (!userId) return;
    const item = findLibraryItem(db, userId, req.params.id);
    if (!item) { res.status(404).json({ success: false, error: "未找到收藏" }); return; }
    const vec = getItemVector(db, item.id);
    if (!vec) { res.json({ success: true, items: [] }); return; }
    const similar = searchSimilarItems(db, userId, vec, item.id, 6);
    res.json({ success: true, items: similar.map((s) => ({ ...s.item, score: s.score })) });
  });

  router.get("/api/library/:id", (req: Request, res: Response) => {
    const userId = req.user?.id;
    if (!userId) { res.status(401).json({ success: false, error: "请先登录" }); return; }
    const item = findLibraryItem(db, userId, req.params.id);
    if (!item) { res.json({ success: false, error: "未找到收藏" }); return; }
    res.json({ success: true, item });
  });

  router.post("/api/library", async (req: Request, res: Response) => {
    const userId = req.user?.id;
    if (!userId) { res.status(401).json({ success: false, error: "请先登录" }); return; }
    const video = req.body.video ?? {};
    const summary = String(req.body.summary ?? "").trim();
    if (!video || !summary) { res.json({ success: false, error: "缺少视频信息或总结内容" }); return; }
    const item = saveLibraryItem(db, userId, {
      id: req.body.id,
      title: video.title,
      author: video.author,
      duration: video.duration,
      bvid: video.bvid,
      link: video.link,
      pic: video.pic,
      summary,
      transcript: String(req.body.transcript ?? "").trim(),
      subtitle_count: Number(req.body.subtitle_count ?? 0) || 0,
      subtitle_segments: Array.isArray(req.body.subtitle_segments) ? req.body.subtitle_segments : undefined,
      chapters: Array.isArray(req.body.chapters) ? req.body.chapters : undefined,
      // Undefined when omitted so an update preserves the stored values.
      category: req.body.category == null ? undefined : String(req.body.category).trim() || "待整理",
      tags: Array.isArray(req.body.tags) ? req.body.tags : undefined,
      notes: req.body.notes == null ? undefined : String(req.body.notes).trim(),
      article: req.body.article == null ? undefined : String(req.body.article).trim(),
      mode: String(req.body.mode ?? "brief").trim() || "brief",
    });
    // Generate semantic index (bounded to 6s) so we can also detect semantic
    // duplicates below. Never throws — embedding failures are swallowed.
    await Promise.race([
      generateEmbeddingForItem(db, userId, item),
      new Promise((r) => setTimeout(r, 6000)),
    ]).catch(() => {});

    let duplicates: Array<{ id: string; title: string }> = [];
    const vec = getItemVector(db, item.id);
    if (vec) {
      duplicates = searchSimilarItems(db, userId, vec, item.id, 3)
        .filter((s) => s.score >= 0.92)
        .map((s) => ({ id: s.item.id, title: s.item.title }));
    }

    res.json({ success: true, item, duplicates });
  });
  router.delete("/api/library/:id", (req: Request, res: Response) => {
    const userId = req.user?.id;
    if (!userId) { res.status(401).json({ success: false, error: "请先登录" }); return; }
    const ok = deleteLibraryItem(db, userId, req.params.id);
    res.json({ success: ok, error: ok ? undefined : "未找到收藏" });
  });

  // Persist a (re)generated article without touching the rest of the item —
  // keeps notes/tags/category intact and skips embedding re-index/dupe checks.
  router.post("/api/library/:id/article", (req: Request, res: Response) => {
    const userId = requireUser(req, res);
    if (!userId) return;
    if (!findLibraryItem(db, userId, req.params.id)) {
      res.status(404).json({ success: false, error: "未找到收藏" }); return;
    }
    updateLibraryArticle(db, userId, req.params.id, String(req.body.article ?? ""));
    res.json({ success: true });
  });

  // ── Tags ────────────────────────────────────────────────────────────
  router.get("/api/tags", (req: Request, res: Response) => {
    const userId = requireUser(req, res);
    if (!userId) return;
    res.json({ success: true, tags: listTags(db, userId) });
  });

  router.post("/api/tags/metadata", (req: Request, res: Response) => {
    const userId = requireUser(req, res);
    if (!userId) return;
    updateTagMetadata(db, userId, String(req.body.name || ""), String(req.body.color || "#0ea5e9"), String(req.body.description || ""));
    res.json({ success: true, tags: listTags(db, userId) });
  });

  router.post("/api/tags/rename", (req: Request, res: Response) => {
    const userId = requireUser(req, res);
    if (!userId) return;
    const changed = renameTag(db, userId, String(req.body.from || ""), String(req.body.to || ""));
    res.json({ success: true, changed, tags: listTags(db, userId) });
  });

  router.post("/api/tags/merge", (req: Request, res: Response) => {
    const userId = requireUser(req, res);
    if (!userId) return;
    const changed = mergeTags(db, userId, String(req.body.from || ""), String(req.body.to || ""));
    res.json({ success: true, changed, tags: listTags(db, userId) });
  });

  router.post("/api/tags/delete", (req: Request, res: Response) => {
    const userId = requireUser(req, res);
    if (!userId) return;
    const changed = deleteTag(db, userId, String(req.body.name || ""));
    res.json({ success: true, changed, tags: listTags(db, userId) });
  });

  // ── Bulk operations ─────────────────────────────────────────────────
  router.post("/api/library/bulk/tags/add", (req: Request, res: Response) => {
    const userId = requireUser(req, res);
    if (!userId) return;
    const changed = bulkAddTags(db, userId, req.body.ids || [], req.body.tags || []);
    res.json({ success: true, changed });
  });

  router.post("/api/library/bulk/tags/remove", (req: Request, res: Response) => {
    const userId = requireUser(req, res);
    if (!userId) return;
    const changed = bulkRemoveTags(db, userId, req.body.ids || [], req.body.tags || []);
    res.json({ success: true, changed });
  });

  router.post("/api/library/bulk/category", (req: Request, res: Response) => {
    const userId = requireUser(req, res);
    if (!userId) return;
    const changed = bulkSetCategory(db, userId, req.body.ids || [], String(req.body.category || "待整理"));
    res.json({ success: true, changed });
  });

  router.post("/api/library/bulk/delete", (req: Request, res: Response) => {
    const userId = requireUser(req, res);
    if (!userId) return;
    const changed = bulkDeleteItems(db, userId, req.body.ids || []);
    res.json({ success: true, changed });
  });

  // ── Snippets ────────────────────────────────────────────────────────
  router.get("/api/snippets", (req: Request, res: Response) => {
    const userId = requireUser(req, res);
    if (!userId) return;
    const libraryItemId = String(req.query.library_item_id || "").trim() || undefined;
    res.json({ success: true, snippets: listSnippets(db, userId, libraryItemId) });
  });

  router.post("/api/snippets", (req: Request, res: Response) => {
    const userId = requireUser(req, res);
    if (!userId) return;
    const libraryItemId = String(req.body.library_item_id || "").trim();
    if (!libraryItemId || !findLibraryItem(db, userId, libraryItemId)) {
      res.status(404).json({ success: false, error: "未找到收藏" }); return;
    }
    const snippet = createSnippet(db, userId, {
      library_item_id: libraryItemId,
      content: String(req.body.content || "").trim(),
      source_text: String(req.body.source_text || "").trim(),
      timestamp_sec: req.body.timestamp_sec === undefined ? null : Number(req.body.timestamp_sec),
      tags: Array.isArray(req.body.tags) ? req.body.tags : [],
    });
    res.json({ success: true, snippet });
  });

  router.post("/api/snippets/:id", (req: Request, res: Response) => {
    const userId = requireUser(req, res);
    if (!userId) return;
    const snippet = updateSnippet(db, userId, req.params.id, {
      content: String(req.body.content || "").trim(),
      source_text: String(req.body.source_text || "").trim(),
      timestamp_sec: req.body.timestamp_sec === undefined ? null : Number(req.body.timestamp_sec),
      tags: Array.isArray(req.body.tags) ? req.body.tags : [],
    });
    if (!snippet) { res.status(404).json({ success: false, error: "未找到片段" }); return; }
    res.json({ success: true, snippet });
  });

  router.delete("/api/snippets/:id", (req: Request, res: Response) => {
    const userId = requireUser(req, res);
    if (!userId) return;
    const ok = deleteSnippet(db, userId, req.params.id);
    res.json({ success: ok, error: ok ? undefined : "未找到片段" });
  });

  return router;
}
