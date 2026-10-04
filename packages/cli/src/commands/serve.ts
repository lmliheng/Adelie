/**
 * `adelie serve`：把 Web / PWA 用的后端起起来。
 *
 * 为什么放在 CLI 里而不是让用户自己去跑 `adelie-server`：装一次 `npm i -g @lmliheng/adelie`
 * 就同时得到了终端与界面两条路。「桌面」那条走 Electron 壳（它自己 fork 服务端），
 * 「手机」那条就是这里 —— 在电脑上 `adelie serve --host 0.0.0.0`，手机打开打印出来的
 * 地址，添加到主屏幕即可。
 *
 * adelie-server 是运行时才 import 的：会话模式（绝大多数调用）不该为了一个用不到的
 * HTTP 服务付启动开销，也不该在它没装好时连 CLI 都起不来。
 */
import { createRequire } from 'node:module';
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import type { CliArgs } from 'adelie-core';
import { PACKAGE_VERSION } from '../version.js';

interface StartedServer {
  url: string;
  token: string | null;
  close(): Promise<void>;
}

interface ServerModule {
  startServer(options: {
    port?: number;
    hostname?: string;
    token?: string;
    webDist?: string;
    version?: string;
  }): Promise<StartedServer>;
}

/**
 * 界面产物在哪。
 *
 * 发布出去的 CLI 包里带着一份（dist/web-dist，见 scripts/bundle-web.mjs）；源码运行时
 * 按构建产物同样在 dist/web-dist。找不到就交给服务端去报「前端没构建」——那时边界
 * 情形（只构建了 CLI）下用户能读到的是一页说明，而不是一个空窗口。
 */
function webDistNextToBundle(): string | undefined {
  const candidate = fileURLToPath(new URL('./web-dist', import.meta.url));
  return existsSync(candidate) ? candidate : undefined;
}

/**
 * 解析 adelie-server。
 *
 * 官方安装里它是 `adelie` 的依赖，正常一定有；装不上时（例如把 CLI 单独拷出来）
 * 要给出能照着做的下一步，而不是一句 MODULE_NOT_FOUND。
 */
async function loadServer(): Promise<ServerModule> {
  try {
    return (await import('adelie-server')) as unknown as ServerModule;
  } catch (error) {
    const require = createRequire(import.meta.url);
    let hint = '';
    try {
      require.resolve('adelie-server');
    } catch {
      hint = '看起来它没装好。重装一次：npm i -g @lmliheng/adelie（或 pnpm add adelie-server）';
    }
    throw new Error(`起不了界面后端：${(error as Error).message}\n${hint}`);
  }
}

export async function runServe(args: CliArgs): Promise<void> {
  const { startServer } = await loadServer();

  const options: Parameters<ServerModule['startServer']>[0] = { version: PACKAGE_VERSION };
  if (args.servePort !== undefined) options.port = args.servePort;
  if (args.serveHost !== undefined) options.hostname = args.serveHost;
  if (args.serveToken !== undefined) options.token = args.serveToken;
  const webDist = webDistNextToBundle();
  if (webDist !== undefined) options.webDist = webDist;

  const started = await startServer(options);

  console.log(`Adelie 后端已就绪：${started.url}`);
  if (started.token !== null) {
    console.log('  （带 token 的地址就是访问凭证，别再转发给别人）');
  }
  console.log('  Ctrl+C 停止');

  // 等信号：服务端的请求处理都挂在 http server 上，这里只需别让进程退出。
  await new Promise<void>((resolve) => {
    const stop = (): void => resolve();
    process.on('SIGINT', stop);
    process.on('SIGTERM', stop);
  });

  await started.close();
  console.log('\n已停止。');
}
