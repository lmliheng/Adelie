/**
 * 内置服务端的位置：打包后随安装包走 `<app>/server.js`（electron-builder 把 tsup 产物
 * 摊在 app 根下），源码运行时跑 `packages/server/dist/main.js`。
 *
 * 显式解析而不是「让 Node 自己找」：找不到时要在开窗口**之前**报错，否则用户看到的是
 * 一个空白窗口加一句不知所云的 net::ERR_CONNECTION_REFUSED。
 */
import { existsSync } from "node:fs";
import path from "node:path";

export interface ServerEntryInput {
  isPackaged: boolean;
  appPath: string;
  /** shell 自己的 dist/（源码运行时是 packages/desktop/dist） */
  desktopDist: string;
}

export function serverEntryPath({ isPackaged, appPath, desktopDist }: ServerEntryInput): string {
  return isPackaged
    ? path.join(appPath, "dist", "server.js")
    : path.join(desktopDist, "..", "..", "server", "dist", "main.js");
}

/**
 * Web 构建产物：打包后是 `<app>/web-dist`（electron-builder 映射自 packages/web/dist），
 * 源码运行时直接指回 `packages/web/dist`。服务端拿到它就不再自己猜。
 */
export function webDistFor({ isPackaged, appPath, desktopDist }: ServerEntryInput): string | null {
  const candidate = isPackaged
    ? path.join(appPath, "web-dist")
    : path.join(desktopDist, "..", "..", "web", "dist");
  return existsSync(path.join(candidate, "index.html")) ? candidate : null;
}

/** 启动前的自检：返回缺失的项，空数组表示可以继续 */
export function missingBuildPieces(input: ServerEntryInput): string[] {
  const missing: string[] = [];
  if (!existsSync(serverEntryPath(input))) missing.push("服务端产物（packages/server/dist/main.js）");
  if (webDistFor(input) === null) missing.push("Web 产物（packages/web/dist/index.html）");
  return missing;
}
