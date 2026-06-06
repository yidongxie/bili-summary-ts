/** BiliStudy – main server entry point */

import path from 'path';
import express from 'express';
import { createApiRouter } from './routes/api';
import { createLarkExportRouter } from './routes/lark-export';
import { DataStore } from './data/store';

const HOST = process.env.HOST || '127.0.0.1';
const PORT = parseInt(process.env.PORT || '8080', 10);

const app = express();

// JSON body parsing
app.use(express.json({ limit: '2mb' }));

// API routes
const dataDir = path.resolve(__dirname, '..', 'data');
const store = new DataStore(dataDir);
app.use(createApiRouter(store));
app.use(createLarkExportRouter(store));

// Static files (frontend)
const publicDir = path.resolve(__dirname, '..', 'public');
app.use(express.static(publicDir));

// SPA fallback – serve index.html for unknown GET routes
app.use((_req, res, next) => {
  if (_req.method === 'GET' && !_req.path.startsWith('/api/')) {
    res.sendFile(path.join(publicDir, 'index.html'), (err) => {
      if (err) next();
    });
  } else {
    next();
  }
});

export function startServer(host?: string, port?: number): Promise<string> {
  const h = host || HOST;
  const p = port || PORT;
  return new Promise((resolve, reject) => {
    const server = app.listen(p, h, () => {
      const url = `http://${h}:${p}/`;
      console.log(`BiliStudy started: ${url}`);
      resolve(url);
    });
    server.on('error', reject);
  });
}

// Direct run
if (require.main === module) {
  startServer().then((url) => {
    console.log(`Open: ${url}`);
    console.log('Press Ctrl+C to stop');
  }).catch((err) => {
    console.error('Failed to start:', err);
    process.exit(1);
  });
}
