// Web 构建产物的静态托管（契约 §6）。
//
// 查找顺序：`ADELIE_WEB_DIST` 优先，否则按 `packages/web/dist` 定位。两者都指不到
// 目录时不是错误 —— 后端可以脱离前端单独跑（curl 调 API、桌面壳自带界面），
// 所以根路径回一个说明页而不是 500。
import { existsSync, readFileSync, statSync } from 'node:fs';
import { extname, join, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const MIME_TYPES: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.map': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.webp': 'image/webp',
  '.ico': 'image/x-icon',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.ttf': 'font/ttf',
  '.txt': 'text/plain; charset=utf-8',
  '.webmanifest': 'application/manifest+json',
  '.wasm': 'application/wasm',
};

/**
 * 定位构建产物目录。
 *
 * 从本文件出发的 `../../web/dist` 与从包根出发的 `../web/dist` 是同一处 ——
 * 源码跑（src/）与构建产物（dist/）都在包根下一层，这个相对路径两种跑法都成立。
 *
 * 显式配置了 `ADELIE_WEB_DIST` 却指不到目录时，不再回退到仓库里的默认位置：
 * 那是配置写错了，静默托起一份陈旧产物比明说「没有前端」更难查。
 */
export function resolveWebDist(explicit: string | null | undefined): string | null {
  if (typeof explicit === 'string' && explicit.trim() !== '') {
    return existsSync(explicit) ? explicit : null;
  }

  const candidate = fileURLToPath(new URL('../../web/dist', import.meta.url));
  return existsSync(candidate) ? candidate : null;
}

function decodePath(pathname: string): string | null {
  try {
    return decodeURIComponent(pathname);
  } catch {
    // 畸形百分号编码：不解析它，交给上层当作 404
    return null;
  }
}

function fileResponse(path: string): Response {
  const body = readFileSync(path);
  const type = MIME_TYPES[extname(path).toLowerCase()] ?? 'application/octet-stream';
  return new Response(body, {
    headers: { 'Content-Type': type, 'Content-Length': String(body.byteLength) },
  });
}

/**
 * 把一个非 `/api/*` 路径映射到文件。
 *
 * 找不到文件时只有「请求看起来要 HTML」才回落到 index.html —— 这是 SPA 路由需要
 * 的那一条。若对 /assets/x.js 也回落，HTML 会被当作 JS 执行，报错信息与真正的原因
 * 差着十万八千里。
 */
export function serveDistFile(distDir: string, pathname: string, acceptsHtml: boolean): Response | null {
  const decoded = decodePath(pathname);
  if (decoded === null) return null;

  const base = resolve(distDir);
  const suffix = decoded.endsWith('/') ? `${decoded}index.html` : decoded;
  const target = resolve(join(base, suffix));

  // 路径穿越防护：解析之后必须仍在产物目录内
  if (target !== base && !target.startsWith(base + sep)) return null;

  if (existsSync(target) && statSync(target).isFile()) return fileResponse(target);

  if (acceptsHtml && extname(target) === '') {
    const index = join(base, 'index.html');
    if (existsSync(index)) return fileResponse(index);
  }

  return null;
}

export function wantsHtml(accept: string | undefined): boolean {
  if (accept === undefined || accept === '') return false;
  return accept.includes('text/html') || accept.includes('*/*');
}

/** 没有构建产物时的说明页。不是一个错误页，是一个「怎么把前端放进来」的提示 */
export function frontendMissingPage(version: string): string {
  return `<!doctype html>
<html lang="zh-CN">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Adelie ${version} — 后端已就绪</title>
<style>
  body { font-family: ui-sans-serif, system-ui, -apple-system, "Segoe UI", sans-serif;
         margin: 0; background: #fefefe; color: #1a2a49; }
  main { max-width: 42rem; margin: 12vh auto; padding: 0 1.5rem; line-height: 1.7; }
  h1 { font-size: 1.35rem; }
  code { background: #f1f5fb; padding: .1rem .35rem; border-radius: .25rem; }
  a { color: #015dfc; }
  .dim { color: #5b6b85; }
</style>
</head>
<body>
<main>
  <h1>Adelie 后端已就绪（v${version}）</h1>
  <p>没有找到 Web 构建产物，所以这里只能给你这页说明。API 本身照常可用。</p>
  <ul>
    <li><a href="/api/health">/api/health</a> — 健康检查</li>
    <li><a href="/api/config">/api/config</a> — 当前配置</li>
    <li><a href="/api/tools">/api/tools</a> — 工具清单</li>
    <li><a href="/api/sessions">/api/sessions</a> — 会话列表</li>
  </ul>
  <p class="dim">要看到界面，先构建前端（<code>pnpm --filter adelie-web build</code>），
  或用 <code>ADELIE_WEB_DIST</code> 指到构建产物目录。</p>
</main>
</body>
</html>
`;
}
