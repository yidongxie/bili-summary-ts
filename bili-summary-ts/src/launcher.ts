/** One-click launcher – find free port, start server, open browser */

import net from 'net';
import http from 'http';
import { exec } from 'child_process';
import { startServer } from './index';

const HOST = '127.0.0.1';
const PORT_START = 8080;
const PORT_END = 8099;

function findFreePort(): Promise<number> {
  return new Promise((resolve, reject) => {
    let found = false;
    let checked = 0;
    const total = PORT_END - PORT_START + 1;

    for (let port = PORT_START; port <= PORT_END; port++) {
      const sock = net.createConnection({ host: HOST, port, timeout: 200 });
      sock.on('error', () => {
        if (!found) { found = true; resolve(port); }
        sock.destroy();
      });
      sock.on('connect', () => {
        sock.destroy();
        checked++;
        if (checked === total && !found) {
          reject(new Error(`没有找到可用端口（${PORT_START}-${PORT_END} 都被占用）`));
        }
      });
    }
  });
}

function waitUntilReady(url: string, timeout = 10000): Promise<boolean> {
  const deadline = Date.now() + timeout;
  return new Promise((resolve) => {
    const check = () => {
      if (Date.now() > deadline) { resolve(false); return; }
      http
        .get(url, (res) => { resolve(res.statusCode === 200); })
        .on('error', () => { setTimeout(check, 300); });
    };
    check();
  });
}

function openBrowser(url: string): void {
  const cmd = process.platform === 'win32' ? `start ${url}` : process.platform === 'darwin' ? `open ${url}` : `xdg-open ${url}`;
  exec(cmd, (err) => {
    if (err) console.error('Failed to open browser:', err.message);
  });
}

async function main() {
  console.log('正在启动 BiliStudy...');
  const port = await findFreePort();
  console.log(`端口: ${port}`);

  await startServer(HOST, port);

  const healthUrl = `http://${HOST}:${port}/health`;
  const ready = await waitUntilReady(healthUrl);
  if (!ready) {
    console.error('启动失败：健康检查未通过');
    process.exit(1);
  }

  const url = `http://${HOST}:${port}/`;
  console.log(`已启动: ${url}`);
  console.log('浏览器会自动打开。保持这个窗口打开，按 Ctrl+C 可停止服务。');
  openBrowser(url);
}

main().catch((err) => {
  console.error('启动错误:', err);
  process.exit(1);
});
