/**
 * 内置服务端的生命周期：以 Electron 的 utilityProcess 起一个独立的 Node 进程跑
 * `server.js`，探测 HTTP 就绪，退出时先请求优雅关闭（POST /api/shutdown）再兜底杀。
 *
 * 为什么是子进程而不是在主进程里 `import`：服务端要跑用户工作区里的代码、要能崩；
 * 崩了不该带走窗口。utilityProcess 与主进程同一份 Node 运行时，但内存隔离。
 *
 * 为什么先优雅关闭：Windows 上 child.kill() 是 TerminateProcess（硬终止），而会话事件
 * 是追加写的 —— 硬杀会把最后一条事件截成半行。
 */
import fs from "node:fs";
import path from "node:path";
import { app, utilityProcess } from "electron";
import type { UtilityProcess } from "electron";

export interface EmbeddedServer {
  child: UtilityProcess;
  origin: string;
}

/** 服务端从启动到回答 /api/health 的时限 */
const READY_TIMEOUT_MS = 30_000;
/** 优雅关闭的等待上限；超时就杀 */
const SHUTDOWN_GRACE_MS = 5_000;

const delay = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms));

async function pingHealth(origin: string): Promise<boolean> {
  try {
    const response = await fetch(`${origin}/api/health`, { signal: AbortSignal.timeout(2_000) });
    return response.ok;
  } catch {
    return false;
  }
}

export async function waitForHealth(origin: string, exited: () => boolean): Promise<void> {
  const deadline = Date.now() + READY_TIMEOUT_MS;
  for (;;) {
    if (exited()) throw new Error("内置服务端在就绪之前退出了（见日志 server.log）");
    if (await pingHealth(origin)) return;
    if (Date.now() >= deadline) {
      throw new Error(`内置服务端 ${READY_TIMEOUT_MS / 1000} 秒内没有就绪`);
    }
    await delay(200);
  }
}

export interface StartServerOptions {
  /** 服务端 bundle 的绝对路径 */
  entry: string;
  /** 壳自己挑好的端口 */
  port: number;
  /** Web 产物目录（交给服务端托管），null 表示不托管 */
  webDist: string | null;
  /** 用户数据目录，日志写在这里 */
  userDataDir: string;
}

export async function startServer(options: StartServerOptions): Promise<EmbeddedServer> {
  const origin = `http://127.0.0.1:${options.port}`;
  const logStream = fs.createWriteStream(path.join(options.userDataDir, "server.log"), { flags: "a" });

  const child = utilityProcess.fork(options.entry, [], {
    stdio: "pipe",
    env: {
      ...process.env,
      // 只绑回环：桌面应用的接口不该出现在局域网上（手机 PWA 走 `adelie serve --host` 那条路）
      ADELIE_HOST: "127.0.0.1",
      PORT: String(options.port),
      ...(options.webDist === null ? {} : { ADELIE_WEB_DIST: options.webDist }),
      ADELIE_DESKTOP: "1",
    },
    serviceName: "adelie-server",
  });

  child.stdout?.on("data", (chunk: Buffer) => logStream.write(chunk));
  child.stderr?.on("data", (chunk: Buffer) => logStream.write(chunk));

  let exited = false;
  child.on("exit", () => {
    exited = true;
    logStream.end();
  });

  await waitForHealth(origin, () => exited);
  return { child, origin };
}

export async function stopServer(server: EmbeddedServer | null): Promise<void> {
  if (server === null) return;
  try {
    await fetch(`${server.origin}/api/shutdown`, {
      method: "POST",
      signal: AbortSignal.timeout(2_000),
    });
  } catch {
    // 服务端可能已经死了；下面的兜底杀会处理
  }
  const deadline = Date.now() + SHUTDOWN_GRACE_MS;
  while (Date.now() < deadline) {
    if (!(await pingHealth(server.origin))) return;
    await delay(150);
  }
  // 到点还在：硬杀。这里已经不是「要不要优雅」的问题，而是「能不能退出」的问题。
  try {
    server.child.kill();
  } catch {
    // 已经死了
  }
}

/** 主进程退出前的兜底：进程组被带走时至少别留下一个孤儿服务端 */
export function killServerNow(server: EmbeddedServer | null): void {
  if (server === null) return;
  try {
    server.child.kill();
  } catch {
    // 已经死了
  }
}

/** app 路径相关的一处集中解析，供 main.ts 与单测共用 */
export function appPaths(): { appPath: string; desktopDist: string; userDataDir: string } {
  const desktopDist = path.join(app.getAppPath(), "dist");
  return { appPath: app.getAppPath(), desktopDist, userDataDir: app.getPath("userData") };
}
