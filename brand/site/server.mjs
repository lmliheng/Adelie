// /opt/adelie-design/server.mjs
//
// Adelie 设计规格页的静态服务器。只用 Node 标准库：这一页没有任何构建步骤，
// 也不该为了发一份 HTML 去装 nginx 或一个依赖树。
//
// 为什么自己写而不是 `python3 -m http.server`：那个默认不设 Cache-Control、
// 目录列表全开、也没有并发上限意识。这里要的东西很少——MIME、缓存头、
// 路径越界防护、区间请求、健康检查——加起来一个文件就够。
//
// 为什么还要支持 Range：这里同时托管桌面的安装包（100MB 量级）。下载中断后
// 能不能续传，取决于服务端认不认 `Range: bytes=`；不认就得从零再来一次。

import { createServer } from 'node:http';
import { createReadStream, statSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { dirname, extname, join, normalize, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(process.env.ROOT ?? dirname(fileURLToPath(import.meta.url)));
const HOST = process.env.HOST ?? '0.0.0.0';
const PORT = Number(process.env.PORT ?? 3004);
// 单次响应的读盘块大小：下载 100MB 的安装包时，64KiB 比默认的 16KiB 少几轮系统调用。
const CHUNK = 64 * 1024;

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
  // 发布产物
  '.exe': 'application/vnd.microsoft.portable-executable',
  '.zip': 'application/zip',
  '.dmg': 'application/x-apple-diskimage',
  '.gz': 'application/gzip',
  '.tgz': 'application/gzip',
  '.msi': 'application/x-msi',
  '.blockmap': 'application/octet-stream',
};

// 图片可以长期缓存（文件名不变就意味着内容不变），页面与样式一律回源校验：
// 这一页是拿来给人看的规格，改一个字就该立刻看到，不该等缓存过期。
const IMMUTABLE = new Set(['.png', '.ico', '.jpg', '.jpeg', '.webp', '.woff2', '.exe', '.zip', '.dmg', '.tgz', '.gz', '.msi']);

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

// 两件事分清楚：send 是「一个完整响应，写完就结束」，begin 只写头、正文交给调用方
// 边读边灌。混用它们是这类小服务器最容易犯的错 —— 头写完就 end()，正文再也出不去。
function send(res, status, headers, body) {
  res.writeHead(status, headers);
  if (body === undefined) res.end();
  else res.end(body);
}

function begin(res, status, headers) {
  res.writeHead(status, headers);
}

function notFound(res) {
  const body = '<!doctype html><meta charset="utf-8"><title>404</title>' +
    '<body style="font:15px system-ui;padding:48px;color:#111827">' +
    '<p><b>404</b> —— 这个地址上没有东西。</p>' +
    '<p><a href="/">回到 Adelie 设计规格</a></p>';
  send(res, 404, { 'content-type': MIME['.html'], 'cache-control': 'no-store' }, body);
}

// 只解析单区间 `bytes=a-b` / `bytes=a-` / `bytes=-n`。多区间（逗号）在这个场景里
// 收益为零，直接当整文件发，省得写 multipart/byteranges。
function parseRange(header, size) {
  if (!header) return null;
  const m = /^bytes=(\d*)-(\d*)$/.exec(header.trim());
  if (!m) return null;
  const [, rawStart, rawEnd] = m;
  if (rawStart === '' && rawEnd === '') return null;
  let start;
  let end;
  if (rawStart === '') {
    // 后缀区间：最后 n 字节
    const suffix = Number(rawEnd);
    if (!Number.isFinite(suffix) || suffix <= 0) return 'unsatisfiable';
    start = Math.max(0, size - suffix);
    end = size - 1;
  } else {
    start = Number(rawStart);
    end = rawEnd === '' ? size - 1 : Number(rawEnd);
    if (!Number.isFinite(start) || !Number.isFinite(end)) return null;
    if (end > size - 1) end = size - 1;
  }
  if (start > end || start >= size) return 'unsatisfiable';
  return { start, end };
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
    // 发布产物一律当附件下载：浏览器别猜、也别想着内联渲染一个 .exe
    const isDownload = abs.startsWith(join(ROOT, 'downloads') + sep);
    const base = {
      'content-type': MIME[ext] ?? 'application/octet-stream',
      'last-modified': st.mtime.toUTCString(),
      etag,
      'cache-control': cacheFor(ext),
      'x-content-type-options': 'nosniff',
      'accept-ranges': 'bytes',
    };
    if (isDownload) base['content-disposition'] = `attachment; filename="${abs.slice(abs.lastIndexOf(sep) + 1)}"`;

    if (req.headers['if-none-match'] === etag && !req.headers.range) {
      send(res, 304, base);
      return;
    }

    const range = parseRange(req.headers.range, st.size);
    if (range === 'unsatisfiable') {
      send(res, 416, { ...base, 'content-range': `bytes */${st.size}`, 'cache-control': 'no-store' });
      return;
    }

    if (range) {
      const { start, end } = range;
      const headers206 = { ...base, 'content-length': String(end - start + 1), 'content-range': `bytes ${start}-${end}/${st.size}` };
      if (method === 'HEAD') {
        send(res, 206, headers206);
        return;
      }
      begin(res, 206, headers206);
      createReadStream(abs, { start, end, highWaterMark: CHUNK }).on('error', () => res.destroy()).pipe(res);
      return;
    }

    if (method === 'HEAD') {
      send(res, 200, { ...base, 'content-length': String(st.size) });
      return;
    }
    begin(res, 200, { ...base, 'content-length': String(st.size) });
    createReadStream(abs, { highWaterMark: CHUNK }).on('error', () => res.destroy()).pipe(res);
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
