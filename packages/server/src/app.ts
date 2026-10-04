// Hono 应用工厂（契约全文）。
//
// 所有「可变的部分」都从 deps 注入（见 context.ts）：工作区、会话根目录、provider
// 工厂、关闭回调。测试因此可以塞进一个假 provider、把会话根指到临时目录，而不碰
// 用户的真实环境。
import { Hono } from 'hono';

import { createServerContext } from './context.js';
import { isLoopbackRequest } from './auth.js';
import { jsonError } from './http.js';
import { createIdentityMiddleware } from './identity.js';
import { registerAuthRoutes } from './routes/auth.js';
import { registerChatRoutes } from './routes/chat.js';
import { registerConfigRoutes } from './routes/config.js';
import { registerSessionRoutes } from './routes/sessions.js';
import { registerUserRoutes } from './routes/users.js';
import { frontendMissingPage, resolveWebDist, serveDistFile, wantsHtml } from './static.js';

import type { AppDeps, ServerContext } from './context.js';
import type { AppEnv } from './identity.js';

export function createApp(deps: AppDeps = {}): Hono<AppEnv> {
  const ctx = createServerContext(deps);
  const distDir = resolveWebDist(deps.webDist ?? process.env['ADELIE_WEB_DIST'] ?? null);

  const app = new Hono<AppEnv>();

  // 认证只罩 /api/*：静态资源必须公开，不然浏览器拿不到应用外壳，
  // 也就没机会在后续请求里带上 Cookie 或 token（契约 §0）。
  app.use('/api/*', createIdentityMiddleware(ctx.identityOptions));

  app.get('/api/health', (c) => c.json({
    ok: true,
    name: 'adelie',
    version: ctx.version,
    uptimeMs: Date.now() - ctx.startedAt,
  }));

  registerAuthRoutes(app, ctx);
  registerUserRoutes(app, ctx);
  registerConfigRoutes(app, ctx);
  registerSessionRoutes(app, ctx);
  registerChatRoutes(app, ctx);

  // ---- 优雅关闭 ----
  //
  // 契约外，桌面壳需要它：Windows 上 Electron 的 child.kill() 是硬终止，而会话事件
  // 是 appendFileSync 写的，硬杀可能截断最后一条。所以先请求优雅关闭，超时再杀。
  app.post('/api/shutdown', (c) => {
    // 只允许本机调用：远程客户端就算拿着有效凭证也不能关掉别人的服务 ——
    // 「关掉它」不该是一个远程动作（与 v0.1.0 一致）
    if (!isLoopbackRequest(c)) return c.json({ error: 'unauthorized' }, 401);

    // 先把响应发出去再收摊。同步关服务器会让这个 202 还没写回客户端就断了连接，
    // 所以让出一个 tick，等响应离开处理链之后再等运行中的轮次落盘。
    setTimeout(() => {
      void (async () => {
        try {
          await ctx.runs.settleAll();
        } finally {
          // 用户库是唯一一个需要在退出前显式收尾的东西（SQLite 文件句柄）
          ctx.close();
          await deps.onShutdown?.();
        }
      })();
    }, 10);

    return c.json({ ok: true }, 202);
  });

  app.notFound((c) => {
    const path = new URL(c.req.url).pathname;
    if (path === '/api' || path.startsWith('/api/')) {
      return jsonError(c, 404, 'not_found', `没有这个接口：${path}`);
    }
    if (c.req.method !== 'GET' && c.req.method !== 'HEAD') {
      return jsonError(c, 404, 'not_found', `没有这个路径：${path}`);
    }

    if (distDir !== null) {
      const file = serveDistFile(distDir, path, wantsHtml(c.req.header('Accept')));
      if (file !== null) return file;
      return jsonError(c, 404, 'not_found', `没有这个文件：${path}`);
    }

    // 没有构建产物：回说明页而不是 500 —— 后端可以脱离前端单独跑
    return c.html(frontendMissingPage(ctx.version), 200);
  });

  app.onError((error, c) => {
    console.error('[adelie-server] 未处理的异常:', error);
    return jsonError(c, 500, 'internal', error.message);
  });

  return app;
}

export type { AppDeps, ServerContext };
