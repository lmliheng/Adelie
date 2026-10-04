// /opt/adelie-design/server.mjs
//
// Adelie 设计规格页的静态服务器。只用 Node 标准库：这一页没有任何构建步骤，
// 也不该为了发一份 HTML 去装 nginx 或一个依赖树。
//
// 为什么自己写而不是 `python3 -m http.server`：那个默认不设 Cache-Control、
// 目录列表全开、也没有并发上限意识。这里要的东西很少——MIME、缓存头、
// 路径越界防护、健康检查——加起来一个文件就够。

import { createServer } from 'node:http';
import { createReadStream, statSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { dirname, extname, join, normalize, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(process.env.ROOT ?? dirname(fileURLToPath(import.meta.url)));
const HOST = process.env.HOST ?? '0.0.0.0';
const PORT = Number(process.env.PORT ?? 3004);

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.webmanifest': 'application/manifest+json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.ico': 'image/x-icon',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.woff2': 'font/woff2',
  '.txt': 'text/plain; charset=utf-8',
};

// 图片可以长期缓存（文件名不变就意味着内容不变），页面与样式一律回源校验：
// 这一页是拿来给人看的规格，改一个字就该立刻看到，不该等缓存过期。
const IMMUTABLE = new Set(['.png', '.ico', '.jpg', '.jpeg', '.webp', '.woff2']);

function resolveTarget(urlPath) {
  let pathname;
  try {
    pathname = decodeURIComponent(urlPath.split('?')[0]);
  } catch {
    return null; // 坏掉的百分号编码
  }
  if (pathname.endsWith('/')) pathname += 'index.html';
  const abs = normalize(join(ROOT, pathname));
  // 越界防护：拼出来的路径必须还在 ROOT 里（`/..%2f..%2fetc/passwd` 这类）
  if (abs !== ROOT && !abs.startsWith(ROOT + sep)) return null;
  return abs;
}

function send(res, status, headers, body) {
  res.writeHead(status, headers);
  if (body === undefined) res.end();
  else res.end(body);
}

function notFound(res) {
  const body = '<!doctype html><meta charset="utf-8"><title>404</title>' +
    '<body style="font:15px system-ui;padding:48px;color:#111827">' +
    '<p><b>404</b> —— 这个地址上没有东西。</p>' +
    '<p><a href="/">回到 Adelie 设计规格</a></p>';
  send(res, 404, { 'content-type': MIME['.html'], 'cache-control': 'no-store' }, body);
}

const server = createServer((req, res) => {
  const method = req.method ?? 'GET';
  if (method !== 'GET' && method !== 'HEAD') {
    send(res, 405, { allow: 'GET, HEAD', 'content-type': 'text/plain; charset=utf-8' }, '只支持 GET / HEAD\n');
    return;
  }

  const url = req.url ?? '/';
  if (url === '/healthz') {
    send(res, 200, { 'content-type': MIME['.json'], 'cache-control': 'no-store' },
      JSON.stringify({ ok: true, service: 'adelie-design', root: ROOT }));
    return;
  }

  const file = resolveTarget(url);
  if (file === null) {
    notFound(res);
    return;
  }

  let stat;
  try {
    stat = statSync(file);
    if (stat.isDirectory()) {
      const index = join(file, 'index.html');
      stat = statSync(index);
      return serve(index, stat);
    }
  } catch {
    // 目录请求少了尾斜杠、或文件不存在
    if (!url.endsWith('/')) {
      try {
        if (statSync(file).isDirectory()) return redirectIndex(res, url);
      } catch { /* 落下去 404 */ }
    }
    notFound(res);
    return;
  }
  serve(file, stat);

  function serve(abs, st) {
    const ext = extname(abs).toLowerCase();
    const etag = `W/"${st.size.toString(16)}-${st.mtimeMs.toString(16)}"`;
    if (req.headers['if-none-match'] === etag) {
      send(res, 304, { etag, 'cache-control': cacheFor(ext) });
      return;
    }
    const headers = {
      'content-type': MIME[ext] ?? 'application/octet-stream',
      'content-length': String(st.size),
      'last-modified': st.mtime.toUTCString(),
      etag,
      'cache-control': cacheFor(ext),
      'x-content-type-options': 'nosniff',
    };
    if (method === 'HEAD') {
      send(res, 200, headers);
      return;
    }
    res.writeHead(200, headers);
    createReadStream(abs).pipe(res);
  }

  function redirectIndex(res2, u) {
    send(res2, 301, { location: u + '/', 'cache-control': 'no-store' });
  }
});

function cacheFor(ext) {
  return IMMUTABLE.has(ext) ? 'public, max-age=604800, immutable' : 'no-cache';
}

server.listen(PORT, HOST, () => {
  const fingerprint = createHash('sha256').update(ROOT + PORT).digest('hex').slice(0, 8);
  console.log(`Adelie 设计规格已就绪：http://${HOST === '0.0.0.0' ? '0.0.0.0' : HOST}:${PORT}/  root=${ROOT} #${fingerprint}`);
});

for (const sig of ['SIGINT', 'SIGTERM']) {
  process.on(sig, () => server.close(() => process.exit(0)));
}
