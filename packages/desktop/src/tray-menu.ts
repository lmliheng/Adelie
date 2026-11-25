/**
 * The tray menu as data — pure, no Electron imports (unit-tested). src/tray.ts turns it
 * into a native menu and binds the actions.
 *
 * The entries are deliberately few: the window is the product, and the tray is the way back
 * to it. Restart and quit are process-level actions, so the window stays a plain browser and
 * the shell gains no channel into the Web App.
 *
 * The labels are written twice here rather than read from the Web App's catalogs: the shell
 * is a separate process that starts before any page is loaded and must draw a menu whether or
 * not one ever is, and it cannot import from `packages/web` — nothing in this package depends
 * on it. Four strings is the whole surface, and the type below makes a missing translation a
 * compile error rather than a menu that silently falls back to English.
 */

/** What a menu entry does when it is clicked. */
export type TrayAction = "open" | "toggle-close-to-tray" | "restart" | "quit";

/**
 * Whether a value off the wire names an action this build knows. The custom menu window reports
 * its clicks as strings (see tray-menu-window.ts), and an action nothing binds is dropped rather
 * than performed.
 */
export function isTrayAction(value: unknown): value is TrayAction {
  return (
    value === "open" || value === "toggle-close-to-tray" || value === "restart" || value === "quit"
  );
}

export interface TrayMenuItem {
  action?: TrayAction;
  label?: string;
  type?: "separator" | "checkbox";
  checked?: boolean;
}

/** The two languages the Web App has, which the tray follows. */
export type TrayLocale = "zh" | "en";

/** One language's menu wording. `open` takes the app name, which carries a dev suffix unpackaged. */
interface TrayLabels {
  open: (appName: string) => string;
  closeToTray: string;
  restart: string;
  quit: string;
}

export const TRAY_LABELS: Record<TrayLocale, TrayLabels> = {
  en: {
    open: (appName) => `Open ${appName}`,
    closeToTray: "Keep running in the tray when the window closes",
    restart: "Restart",
    quit: "Quit",
  },
  zh: {
    // The app name is a proper noun and stays as it is, here as everywhere else.
    open: (appName) => `打开 ${appName}`,
    closeToTray: "关闭窗口后继续在托盘中运行",
    restart: "重启",
    quit: "退出",
  },
};

/**
 * The device language the shell falls back to until the Web App reports its own — the same
 * rule the Web App applies to `navigator.language` when its own preference is "follow the
 * system", so an untouched install agrees with itself across the window and the tray.
 */
export function resolveTrayLocale(language: string | undefined): TrayLocale {
  return language?.toLowerCase().startsWith("zh") ? "zh" : "en";
}

/** The menu entries, in order, in the given language. */
export function trayMenuTemplate(opts: {
  appName: string;
  closeToTray: boolean;
  locale: TrayLocale;
}): TrayMenuItem[] {
  const t = TRAY_LABELS[opts.locale];
  return [
    { action: "open", label: t.open(opts.appName) },
    { type: "separator" },
    {
      action: "toggle-close-to-tray",
      label: t.closeToTray,
      type: "checkbox",
      checked: opts.closeToTray,
    },
    { type: "separator" },
    { action: "restart", label: t.restart },
    { action: "quit", label: t.quit },
  ];
}
