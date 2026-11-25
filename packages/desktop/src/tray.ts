/**
 * The system tray icon: a lightweight entry point that survives closing the window, so the
 * app can keep serving in the background without leaving the user hunting for a way back in.
 *
 * Electron-facing and untested, like main.ts and menu.ts — the menu entries, the menu window's
 * document and placement, the preference file and the icon lookup are pure modules beside it,
 * and they carry the tests.
 *
 * How the menu is opened splits by platform, for reasons noted at the split below — and so does
 * what draws it: a menu the shell pops up itself is the app's own window (tray-menu-window.ts),
 * while the one Linux desktops open for us is the native menu they draw themselves.
 */
import { BrowserWindow, Menu, nativeImage, nativeTheme, screen, Tray } from "electron";
import type { MenuItemConstructorOptions } from "electron";
import { isTrayAction, trayMenuTemplate } from "./tray-menu.js";
import type { TrayAction, TrayLocale, TrayMenuItem } from "./tray-menu.js";
import {
  TRAY_MENU_CHANNELS,
  TRAY_MENU_WINDOW_OPTIONS,
  placeTrayMenu,
  trayMenuDocument,
  trayMenuDocumentUrl,
  trayMenuSize,
} from "./tray-menu-window.js";
import type { Rectangle } from "./tray-menu-window.js";
import { readTrayPrefs, updateTrayPrefs } from "./tray-prefs.js";

export interface TrayHandle {
  /** The live preference: the window's close handler asks at close time, not at install time. */
  closeToTray(): boolean;
  /** Redraws the menu in another language, for when the Web App's changes while the app runs. */
  setLocale(locale: TrayLocale): void;
  dispose(): void;
}

export interface TrayOptions {
  userDataDir: string;
  /** Resolved tray image, or null when the asset is missing (see app-icon.ts). */
  iconPath: string | null;
  /** The menu window's preload bridge, or null before the asset build has run (see tray-menu-window.ts). */
  preloadPath: string | null;
  appName: string;
  /** The language the menu is drawn in, until the Web App reports a different one. */
  locale: TrayLocale;
  onShowWindow: () => void;
  onRestart: () => void;
  onQuit: () => void;
  log: (line: string) => void;
}

/** How long the menu window may take to report its size before it is taken down again. */
const MENU_REPORT_TIMEOUT_MS = 2000;

/**
 * Installs the tray icon, or returns null when the platform cannot host one — a Linux desktop
 * without a tray implementation, or a headless CI run. The tray is a convenience; nothing
 * about it may keep the app from starting.
 */
export function installTray(opts: TrayOptions): TrayHandle | null {
  if (opts.iconPath === null) {
    opts.log("no tray icon asset was found; running without a tray icon");
    return null;
  }
  let prefs = readTrayPrefs(opts.userDataDir);
  let locale = opts.locale;
  let tray: Tray;
  try {
    const image = nativeImage.createFromPath(opts.iconPath);
    // A template image is drawn as a mask, so the menu bar inverts it with its own light or
    // dark appearance. Electron also infers this from the `…Template` file name; saying it
    // here keeps the behavior if the asset is ever renamed.
    if (process.platform === "darwin") image.setTemplateImage(true);
    tray = new Tray(image);
  } catch (err) {
    opts.log(`the tray icon could not be created: ${String(err)}`);
    return null;
  }
  tray.setToolTip(opts.appName);

  // How the menu is reached splits by platform. The AppIndicator / StatusNotifierItem trays
  // most Linux desktops use emit neither `click` nor `right-click`, and an attached context
  // menu is the only reliable way to open one there — the desktop itself decides which click
  // opens it. On macOS an attached menu opens on a left click too, which would cost the icon
  // its one-click path back to the window, so those two pop the menu by hand.
  const ATTACHES_MENU = process.platform === "linux";
  // What draws it differs again. The attached menu is the desktop's, so it stays native. A menu
  // this shell opens itself is the app's own window, drawn smaller than the operating system
  // would (see tray-menu-window.ts). Without the bridge to that window the native menu is the
  // fallback, so a source checkout that has not built its assets still has a working tray.
  const CUSTOM_MENU = !ATTACHES_MENU && opts.preloadPath !== null;

  function setCloseToTray(next: boolean): void {
    // Optimistic: the checkbox shows the click even when the write below fails.
    prefs = { ...prefs, closeToTray: next };
    try {
      // Read-modify-write: the Appearance switch writes showTrayIcon into the same file,
      // and this snapshot was taken when the tray was installed.
      prefs = updateTrayPrefs(opts.userDataDir, { closeToTray: next });
    } catch (err) {
      opts.log(`the tray preference could not be saved: ${String(err)}`);
    }
    // An attached menu is a snapshot: rebuild it so the checkbox shows what was just written.
    // The custom window paints its document per opening, so it needs nothing here.
    attachMenu();
  }

  function template(): TrayMenuItem[] {
    return trayMenuTemplate({ appName: opts.appName, closeToTray: prefs.closeToTray, locale });
  }

  function nativeItem(item: TrayMenuItem): MenuItemConstructorOptions {
    if (item.type === "separator") return { type: "separator" };
    const base: MenuItemConstructorOptions = { label: item.label };
    switch (item.action) {
      case "open":
        return { ...base, click: opts.onShowWindow };
      case "toggle-close-to-tray":
        return {
          ...base,
          type: "checkbox",
          checked: item.checked === true,
          click: (menuItem) => setCloseToTray(menuItem.checked),
        };
      case "restart":
        return { ...base, click: opts.onRestart };
      case "quit":
        return { ...base, click: opts.onQuit };
      default:
        return base;
    }
  }

  // Built fresh for each popup (and re-attached on each toggle where the menu is attached), so
  // the checkbox shows the preference as it stands rather than as it was at install.
  function buildMenu(): Menu {
    return Menu.buildFromTemplate(template().map(nativeItem));
  }

  /** No-op off Linux: the menu is built per popup there instead. */
  function attachMenu(): void {
    if (ATTACHES_MENU) tray.setContextMenu(buildMenu());
  }

  // --- the app's own menu window (Windows, macOS) ---------------------------------------------

  let menuWindow: BrowserWindow | null = null;

  function closeMenuWindow(): void {
    const win = menuWindow;
    if (win === null) return;
    menuWindow = null;
    if (!win.isDestroyed()) win.destroy();
  }

  /**
   * The icon's rectangle where the shell has one, and the pointer where it has not: a tray icon
   * the desktop keeps in its overflow area reports no bounds, and the click that opened the menu
   * left the pointer on it.
   */
  function menuAnchor(): Rectangle {
    const bounds = tray.getBounds();
    if (bounds.width > 0 && bounds.height > 0) return bounds;
    const point = screen.getCursorScreenPoint();
    return { x: point.x, y: point.y, width: 1, height: 1 };
  }

  function runAction(action: TrayAction): void {
    switch (action) {
      case "open":
        opts.onShowWindow();
        return;
      case "toggle-close-to-tray":
        setCloseToTray(!prefs.closeToTray);
        return;
      case "restart":
        opts.onRestart();
        return;
      case "quit":
        opts.onQuit();
        return;
    }
  }

  function openMenuWindow(): void {
    if (menuWindow !== null) return;
    const preload = opts.preloadPath;
    if (preload === null) return;
    const anchor = menuAnchor();
    const workArea = screen.getDisplayMatching(anchor).workArea;
    const win = new BrowserWindow({
      ...TRAY_MENU_WINDOW_OPTIONS,
      webPreferences: { ...TRAY_MENU_WINDOW_OPTIONS.webPreferences, preload },
    });
    menuWindow = win;
    let guard: NodeJS.Timeout | null = null;
    /** Idempotent: blur, Escape, a picked entry and the guard all land here. */
    const close = (): void => {
      if (guard !== null) {
        clearTimeout(guard);
        guard = null;
      }
      if (menuWindow === win) menuWindow = null;
      if (!win.isDestroyed()) win.destroy();
    };
    // The window is shown only once it has measured itself, so a window whose bridge never
    // answers would sit invisible and hold the menu shut — worse than no menu at all. The guard
    // is what makes that impossible.
    guard = setTimeout(() => {
      opts.log("the tray menu window never reported its size; closing it");
      close();
    }, MENU_REPORT_TIMEOUT_MS);
    win.on("blur", close);
    win.on("closed", () => {
      if (menuWindow === win) menuWindow = null;
    });
    // There is nowhere to navigate to, and nothing that may: the document is the whole surface.
    win.webContents.setWindowOpenHandler(() => ({ action: "deny" }));
    win.webContents.on("will-navigate", (event) => event.preventDefault());
    win.webContents.on("before-input-event", (_event, input) => {
      if (input.key === "Escape") close();
    });
    win.webContents.ipc.on(TRAY_MENU_CHANNELS.size, (_event, size: unknown) => {
      const measured = trayMenuSize(size);
      if (measured === null || win.isDestroyed()) return;
      if (guard !== null) {
        clearTimeout(guard);
        guard = null;
      }
      win.setBounds(placeTrayMenu(anchor, measured, workArea));
      win.show();
      win.focus();
    });
    win.webContents.ipc.on(TRAY_MENU_CHANNELS.pick, (_event, action: unknown) => {
      if (!isTrayAction(action)) return;
      close();
      runAction(action);
    });
    void win.loadURL(
      trayMenuDocumentUrl(
        trayMenuDocument({ items: template(), dark: nativeTheme.shouldUseDarkColors }),
      ),
    );
  }

  function openMenu(): void {
    if (CUSTOM_MENU) openMenuWindow();
    else tray.popUpContextMenu(buildMenu());
  }

  // Registered everywhere: harmless on a tray that never emits it, and where the click does
  // arrive it is the shortest way back to the window. Where it does not, the menu's first
  // entry opens the window instead.
  tray.on("click", (event) => {
    // macOS treats Ctrl+click as a right click; where the OS still delivers it as a plain
    // click, this keeps it on the menu rather than raising the window.
    if (process.platform === "darwin" && event.ctrlKey) {
      openMenu();
      return;
    }
    closeMenuWindow();
    opts.onShowWindow();
  });
  if (!ATTACHES_MENU) tray.on("right-click", () => openMenu());
  attachMenu();

  return {
    closeToTray: () => prefs.closeToTray,
    setLocale: (next) => {
      locale = next;
      // Only Linux holds a built menu; the custom window paints its document per opening.
      attachMenu();
    },
    dispose: () => {
      closeMenuWindow();
      tray.destroy();
    },
  };
}
