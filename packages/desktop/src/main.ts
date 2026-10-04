/**
 * Adelie 桌面壳的主进程。
 *
 * 形态：一个窗口，内容是 127.0.0.1 上那个内置服务端托管的 Web 应用。壳自己不实现任何
 * 业务逻辑 —— 编辑器、对话、审批、工具时间线全在 Web 里，壳只负责把「桌面」这件事做对：
 *   1. 把服务端拉起、等它就绪、退出时体面地关掉它；
 *   2. 开窗口指向它（同源 HTTP/SSE，没有自定义协议、没有私有 IPC）；
 *   3. 单实例：第二次启动把已有窗口抬起来，而不是再起一个服务端；
 *   4. 记得上次的端口、窗口位置与托盘偏好 —— 界面状态是按 origin 存的，端口一变它们就
 *      全丢了（详见 port-memory.ts）；
 *   5. 托盘与菜单：给用户一个「窗口之外」的入口（打开数据目录、看日志、退出）；
 *   6. 自带 CLI 的安装与自修复：装了桌面版，终端里就能敲 `adelie`。
 *
 * 这样做的代价是壳很薄，好处是四个形态共用同一套前端与同一套接口（见 docs/api.md）。
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { BrowserWindow, Menu, app, dialog, screen, shell } from "electron";
import { PRODUCT_NAME, applyAppIdentity, userDataDir } from "./app-identity.js";
import { buildAppMenu } from "./app-menu.js";
import { cliEntryPath, ensureCliCommand } from "./cli-install.js";
import { createLogger } from "./desktop-log.js";
import { isOpenableUrl, sameOrigin } from "./links.js";
import { choosePort, parsePortMemory, serializePortMemory } from "./port-memory.js";
import { appPaths, killServerNow, startServer, stopServer } from "./server-process.js";
import type { EmbeddedServer } from "./server-process.js";
import { storePaths } from "./storage-paths.js";
import { createTray } from "./tray.js";
import type { TrayController } from "./tray.js";
import { hidesOnClose, readTrayPrefs, writeTrayPrefs } from "./tray-prefs.js";
import type { TrayPrefs } from "./tray-prefs.js";
import { clampToWorkArea, readWindowState, stateFromBounds, writeWindowState } from "./window-state.js";
import { missingBuildPieces, serverEntryPath, webDistFor } from "./web-dist.js";

applyAppIdentity();

/**
 * 数据目录必须在**任何读 userData 的代码之前**钉住：Chromium 的 localStorage、cookie 与
 * 我们自己的 port.json/日志都在它下面，晚一步就会有一部分落进默认目录，症状是
 * 「设置改了不生效」。
 */
const userData = userDataDir(app.isPackaged, app.getPath("appData"));
mkdirSync(userData, { recursive: true });
app.setPath("userData", userData);

const paths = storePaths(userData);
const log = createLogger(paths.log);

/** Windows 上任务栏图标与通知要用 AppUserModelID 才能认到同一个应用 */
if (process.platform === "win32") {
  app.setAppUserModelId("com.lmliheng.adelie");
}

let server: EmbeddedServer | null = null;
let window: BrowserWindow | null = null;
let tray: TrayController | null = null;
/** 用户点了退出：不要在此时再弹「启动失败」的框，也不要再留守到托盘 */
let quitting = false;
let prefs: TrayPrefs = readTrayPrefs(paths.trayPrefs);

/**
 * 图标文件：开发时用仓库里 brand/icons 的 png，打包后用 electron-builder 放进 app 根的 ico。
 * 两者都没有就返回空串 —— 宁可不显示托盘，也不要拿一个空图标去建 Tray（会抛）。
 *
 * 顺序里 `icon.png` 在最前是留给「将来放一张专用小图」的位置；实际存在的是 512x512.png，
 * Electron 会自己缩到状态栏尺寸（Linux 那份在 tray.ts 里显式缩过）。
 */
function iconFile(): string {
  const candidates = app.isPackaged
    ? [path.join(app.getAppPath(), "icon.ico")]
    : [
        path.join(app.getAppPath(), "..", "..", "brand", "icons", "icon.png"),
        path.join(app.getAppPath(), "..", "..", "brand", "icons", "512x512.png"),
      ];
  return candidates.find((file) => existsSync(file)) ?? "";
}

function readIfExists(file: string): string | null {
  try {
    return readFileSync(file, "utf8");
  } catch {
    return null;
  }
}

/** 攒一小会儿再写：拖窗口时会连着发几十个事件，每次都同步落盘没必要 */
function debounce(fn: () => void, ms: number): () => void {
  let timer: NodeJS.Timeout | null = null;
  return () => {
    if (timer !== null) clearTimeout(timer);
    timer = setTimeout(() => {
      timer = null;
      fn();
    }, ms);
  };
}

function showWindow(): void {
  if (window === null) return;
  if (window.isMinimized()) window.restore();
  window.show();
  window.focus();
}

/**
 * 交给系统启动器的唯一入口：壳里所有「打开外面的东西」都从这里走，放行范围只在这一个地方。
 * 不放行的记一条日志 —— 用户点了个没反应的链接时，日志里得有原因。
 */
function openExternal(url: string): void {
  if (!isOpenableUrl(url)) {
    log.warn(`拒绝打开这个链接（只放行 http/https/mailto）：${url}`);
    return;
  }
  void shell.openExternal(url);
}

function createWindow(origin: string): BrowserWindow {
  // 记下来的坐标先夹进屏幕：换了显示器/拔了外接屏之后，上次那组数可能整个在可见区之外
  const state = readWindowState(paths.window);
  const bounds = clampToWorkArea(state, screen.getAllDisplays());
  const icon = iconFile();

  const created = new BrowserWindow({
    ...bounds,
    // 兜底：即使记下来的尺寸过关，也不允许拖到比这更小
    minWidth: 720,
    minHeight: 520,
    // 先不显示：等首帧好了再 show，避免用户看到白屏闪一下
    show: false,
    title: PRODUCT_NAME,
    backgroundColor: "#ffffff",
    autoHideMenuBar: true,
    ...(icon === "" ? {} : { icon }),
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
    openExternal(url);
    return { action: "deny" };
  });

  // 界面是单页应用（路由走 pushState，不触发这个事件），所以「要导航离开本站」一定是
  // 外链或者误点：交给系统浏览器，窗口原地不动。少了这条，一个普通 <a href> 就能把应用
  // 窗口顶成别人的网页 —— 而且没有后退键，用户只能重启应用。
  created.webContents.on("will-navigate", (event, url) => {
    if (sameOrigin(url, origin)) return;
    event.preventDefault();
    openExternal(url);
  });

  created.once("ready-to-show", () => {
    if (state.maximized) created.maximize();
    created.show();
  });

  // 用 getNormalBounds 而不是 getBounds：最大化时的 bounds 是整屏，存下来下次就丢了原始尺寸
  const persistNow = (): void => {
    writeWindowState(paths.window, stateFromBounds(created.getNormalBounds(), created.isMaximized()));
  };
  const persist = debounce(persistNow, 400);
  created.on("resized", persist);
  created.on("moved", persist);

  created.on("close", (event) => {
    persistNow();
    if (hidesOnClose({ quitting, hasTrayIcon: tray?.hasIcon() ?? false, prefs })) {
      event.preventDefault();
      created.hide();
      log.info("窗口关闭 → 继续在托盘中运行");
    }
  });

  // 崩了/卡了要让日志里有据可查，否则用户能给的只有「打不开」三个字
  created.webContents.on("render-process-gone", (_event, details) => {
    log.error(`界面进程退出：${details.reason}（exitCode ${details.exitCode}）`);
  });
  created.webContents.on("unresponsive", () => log.warn("界面无响应"));
  created.webContents.on("responsive", () => log.info("界面恢复响应"));
  created.webContents.on("did-fail-load", (_event, errorCode, errorDescription, validatedURL) => {
    log.error(`界面加载失败 ${errorCode} ${errorDescription} ${validatedURL}`);
  });

  void created.loadURL(origin);
  return created;
}

function installTray(origin: string): void {
  tray = createTray({
    iconPath: iconFile(),
    productName: PRODUCT_NAME,
    origin,
    prefs,
    log: (message) => log.info(message),
    handlers: {
      onShow: showWindow,
      onToggleHideOnClose: () => {
        prefs = { ...prefs, hideOnClose: !prefs.hideOnClose };
        writeTrayPrefs(paths.trayPrefs, prefs);
        tray?.refresh(prefs);
        log.info(`关闭窗口后继续在托盘中运行：${prefs.hideOnClose ? "开" : "关"}`);
      },
      onOpenDataDir: () => {
        void shell.openPath(userData);
      },
      onOpenLog: () => {
        void shell.openPath(paths.log);
      },
      onQuit: () => app.quit(),
    },
  });
}

function installCli(): void {
  const desktopDist = path.join(app.getAppPath(), "dist");
  try {
    const result = ensureCliCommand({
      platform: process.platform,
      entry: cliEntryPath({ isPackaged: app.isPackaged, appPath: app.getAppPath(), desktopDist }),
      // 用应用自带的运行时跑 CLI，所以用户不需要自己装 Node
      executable: app.getPath("exe"),
      appPath: app.getAppPath(),
      home: app.getPath("home"),
      env: process.env,
    });
    log.info(`自带 CLI：${result.message}`);
  } catch (error) {
    // 装不上只是少了个便利入口，不该影响应用本身
    log.warn(`自带 CLI 安装失败：${String(error)}`);
  }
}

function installMenu(): void {
  Menu.setApplicationMenu(
    buildAppMenu({
      productName: PRODUCT_NAME,
      actions: {
        openDataDir: () => {
          void shell.openPath(userData);
        },
        openLog: () => {
          void shell.openPath(paths.log);
        },
        about: () => {
          void dialog.showMessageBox({
            type: "info",
            title: `关于 ${PRODUCT_NAME}`,
            message: `${PRODUCT_NAME} ${app.getVersion()}`,
            detail: `桌面端与内置服务端共用同一套引擎。\n数据目录：${userData}\n日志：${paths.log}`,
            buttons: ["好"],
          });
        },
      },
    }),
  );
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

  // 端口记忆：先试上次那个，不行才让内核分配。界面（localStorage、cookie）是按 origin
  // 存的 —— 每次换端口 = 每次都是新站点，用户会以为「我设过的全没了」。
  const memory = parsePortMemory(readIfExists(paths.port));
  const chosen = await choosePort(memory);
  if (chosen.port !== memory.lastPort) {
    try {
      writeFileSync(paths.port, serializePortMemory({ lastPort: chosen.port }), { mode: 0o600 });
    } catch {
      // 记不住端口只是下次换个 origin，不影响这次启动
    }
  }
  log.info(`壳启动：v${app.getVersion()}，${process.platform}，数据目录 ${dataDir}`);
  log.info(`端口 ${chosen.port}${chosen.reused ? "（沿用上次）" : "（新分配）"}`);

  server = await startServer({
    entry: serverEntryPath(input),
    port: chosen.port,
    webDist: webDistFor(input),
    userDataDir: dataDir,
  });

  window = createWindow(server.origin);
  window.on("closed", () => {
    window = null;
  });

  installMenu();
  installTray(server.origin);
  installCli();
  log.info("就绪");
}

// 第二个实例：把已经开着的窗口抬起来，然后自己退出
if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  app.on("second-instance", () => {
    showWindow();
  });

  app.whenReady().then(
    () => {
      boot().catch((error: unknown) => {
        if (quitting) return;
        const detail = error instanceof Error ? error.message : String(error);
        log.error(`启动失败：${detail}`);
        void dialog.showErrorBox(`${PRODUCT_NAME} 启动失败`, `${detail}\n\n日志：${paths.log}`);
        app.exit(1);
      });
    },
    (error: unknown) => {
      log.error(`启动失败（ready 之前）：${String(error)}`);
      void dialog.showErrorBox(`${PRODUCT_NAME} 启动失败`, String(error));
      app.exit(1);
    },
  );

  app.on("window-all-closed", () => {
    // 关窗即退出；「关窗留守到托盘」时窗口只是被 hide，不会走到这里
    app.quit();
  });

  // 退出前把服务端关干净。before-quit 是异步的：先拦下退出，收完尾再真退。
  let cleanedUp = false;
  app.on("before-quit", (event) => {
    quitting = true;
    tray?.destroy();
    if (cleanedUp || server === null) return;
    event.preventDefault();
    const current = server;
    server = null;
    void stopServer(current).finally(() => {
      cleanedUp = true;
      log.info("已退出");
      app.quit();
    });
  });

  // 这里**刻意不注册** SIGINT/SIGTERM 监听器（2026-10-04 在 Linux 上实测）：Electron 自己
  // 接住这两个信号并走正常退出序列（before-quit → 关窗口 → will-quit），主进程里的
  // `process.on("SIGTERM")` **不会被调用** —— 注册了也只是永不触发的死代码。收尾因此只有
  // 一条路：上面的 before-quit。
  process.on("exit", () => killServerNow(server));
}
