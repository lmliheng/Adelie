/**
 * Adelie 桌面壳的主进程。
 *
 * 形态：一个窗口，内容是 127.0.0.1 上那个内置服务端托管的 Web 应用。壳自己不实现任何
 * 业务逻辑 —— 编辑器、对话、审批、工具时间线全在 Web 里，壳只负责三件事：
 *   1. 把服务端拉起、等它就绪、退出时体面地关掉它；
 *   2. 开窗口指向它（同源 HTTP/SSE，没有自定义协议、没有私有 IPC）；
 *   3. 单实例：第二次启动把已有窗口抬起来，而不是再起一个服务端。
 *
 * 这样做的代价是壳很薄，好处是四个形态共用同一套前端与同一套接口（见 docs/api.md）。
 */
import { existsSync } from "node:fs";
import path from "node:path";
import { BrowserWindow, app, dialog, shell } from "electron";
import { applyAppIdentity, PRODUCT_NAME, userDataDir } from "./app-identity.js";
import { findFreePort } from "./port-memory.js";
import { appPaths, killServerNow, startServer, stopServer } from "./server-process.js";
import type { EmbeddedServer } from "./server-process.js";
import { missingBuildPieces, serverEntryPath, webDistFor } from "./web-dist.js";

applyAppIdentity();

/** Windows 上任务栏图标与通知要用 AppUserModelID 才能认到同一个应用 */
if (process.platform === "win32") {
  app.setAppUserModelId("com.lmliheng.adelie");
}

let server: EmbeddedServer | null = null;
let window: BrowserWindow | null = null;
/** 用户点了退出：不要在此时再弹「启动失败」的框 */
let quitting = false;

/** 开发时窗口用仓库里的图标；打包后由 electron-builder 写进 exe 的资源，这里不用管 */
function windowIcon(): string | undefined {
  const candidate = path.join(app.getAppPath(), "..", "..", "brand", "icons", "icon.png");
  return existsSync(candidate) ? candidate : undefined;
}

function createWindow(origin: string): BrowserWindow {
  const icon = windowIcon();
  const created = new BrowserWindow({
    width: 1180,
    height: 780,
    minWidth: 720,
    minHeight: 520,
    title: PRODUCT_NAME,
    backgroundColor: "#ffffff",
    autoHideMenuBar: true,
    ...(icon === undefined ? {} : { icon }),
    webPreferences: {
      // 前端是普通 Web 应用：不需要 Node，也不需要预加载脚本。
      // 关掉这两样等于把「网页能干什么」限制在网页该有的范围里。
      nodeIntegration: false,
      contextIsolation: true,
      sandbox: true,
    },
  });

  // 外部链接走系统浏览器，不要在应用窗口里把界面顶掉
  created.webContents.setWindowOpenHandler(({ url }) => {
    void shell.openExternal(url);
    return { action: "deny" };
  });

  void created.loadURL(origin);
  return created;
}

async function boot(): Promise<void> {
  const { appPath, desktopDist, userDataDir: dataDir } = appPaths();
  const input = { isPackaged: app.isPackaged, appPath, desktopDist };

  const missing = missingBuildPieces(input);
  if (missing.length > 0) {
    throw new Error(
      `缺少构建产物：${missing.join("、")}。\n先跑 \`pnpm build\`（服务端与 Web 都要先构建）。`,
    );
  }

  const port = await findFreePort();
  server = await startServer({
    entry: serverEntryPath(input),
    port,
    webDist: webDistFor(input),
    userDataDir: dataDir,
  });

  window = createWindow(server.origin);
  window.on("closed", () => {
    window = null;
  });
}

// 第二个实例：把已经开着的窗口抬起来，然后自己退出
if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  app.on("second-instance", () => {
    if (window === null) return;
    if (window.isMinimized()) window.restore();
    window.focus();
  });

  app.whenReady().then(
    () => {
      // userData 目录在 setPath 之前不会存在，日志与端口记忆都要往里写
      void userDataDir(app.isPackaged, app.getPath("appData"));
      boot().catch((error: unknown) => {
        if (quitting) return;
        void dialog.showErrorBox(
          `${PRODUCT_NAME} 启动失败`,
          error instanceof Error ? error.message : String(error),
        );
        app.exit(1);
      });
    },
    (error: unknown) => {
      void dialog.showErrorBox(`${PRODUCT_NAME} 启动失败`, String(error));
      app.exit(1);
    },
  );

  app.on("window-all-closed", () => {
    // 桌面上没有「窗口全关但进程留着」的习惯，关窗即退出（服务端由 before-quit 收尾）
    app.quit();
  });

  // 退出前把服务端关干净。before-quit 是异步的：先拦下退出，收完尾再真退。
  let cleanedUp = false;
  app.on("before-quit", (event) => {
    quitting = true;
    if (cleanedUp || server === null) return;
    event.preventDefault();
    const current = server;
    server = null;
    void stopServer(current).finally(() => {
      cleanedUp = true;
      app.quit();
    });
  });

  process.on("exit", () => killServerNow(server));
}
