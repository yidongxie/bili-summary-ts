import { Router, Request, Response } from 'express';
import { DataStore, LibraryItem } from '../data/store';
import { execSync } from 'child_process';
import fs from 'fs';
import os from 'os';
import path from 'path';

export function createLarkExportRouter(store: DataStore): Router {
  const router = Router();

  router.post('/api/export/:id/lark', async (req: Request, res: Response) => {
    try {
      const item = store.loadLibrary().find((i: LibraryItem) => i.id === req.params.id);
      if (!item) { res.status(404).json({ success: false, error: '未找到收藏' }); return; }
      const includeTranscript = Boolean(req.body?.include_transcript);

      const parts: string[] = [
        `# ${item.title}`,
        '',
        `> UP主: ${item.author}  |  链接: [${item.link}](${item.link})`,
        '',
        '---',
        '',
        '## AI 总结',
        '',
        item.summary,
      ];
      if (item.notes) parts.push('', '---', '', '## 我的笔记', '', item.notes);
      if (includeTranscript && item.transcript) parts.push('', '---', '', '## 视频文本', '', item.transcript);
      parts.push('', '---', '', '> 由 BiliStudy 自动导出');
      const md = parts.filter(Boolean).join('\n').trim() + '\n';

      const tmpFile = path.join(os.tmpdir(), `bilistudy-lark-${item.id.slice(0, 8)}.md`);
      fs.writeFileSync(tmpFile, md, 'utf-8');

      let stdout: string;
      try {
        stdout = execSync(
          `lark-cli docs +create --api-version v2 --doc-format markdown --content "@${tmpFile}"`,
          { maxBuffer: 10 * 1024 * 1024, encoding: 'utf-8', timeout: 30000 },
        ).toString();
      } finally {
        try { fs.unlinkSync(tmpFile); } catch { /* ignore */ }
      }

      let result: any;
      try {
        result = JSON.parse(stdout);
      } catch {
        throw new Error('飞书 API 响应解析失败: ' + stdout.slice(0, 500));
      }

      const docUrl = result?.url || result?.data?.url || '';
      const docToken = result?.doc_token || result?.data?.document_id || result?.data?.doc_token || '';
      if (!docUrl && !docToken) {
        throw new Error('未获取到文档链接: ' + JSON.stringify(result).slice(0, 500));
      }

      res.json({ success: true, url: docUrl, doc_token: docToken });
    } catch (err: any) {
      console.error('[export/lark]', err);
      res.status(500).json({ success: false, error: err.message || String(err) });
    }
  });

  return router;
}
