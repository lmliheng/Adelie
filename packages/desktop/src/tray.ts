/**
 * 托盘：Electron 的那一半。
 *
 * 菜单的**数据**在 tray-menu.ts 里（纯函数，可单测）；这里只做三件事：把数据翻成
 * Menu、把动作接到回调上、按平台决定什么时候弹菜单。菜单**每次弹出前重建** ——
 * 勾选状态因此是当下的值，而不是启动那一刻的快照。
 *
 * 图标开关是「重建」而不只是隐藏：Windows 上留着一个不可见的 Tray 对象会让
 * `window-all-closed → app.quit()` 的行为变得难猜，不如干干净净地销毁。
 */
import { Menu, Tray, nativeImage, shell } from "electron";
import type { MenuItemConstructorOptions } from "electron";
import type { TrayAction } from "./tray-menu.js";
import { trayMenuTemplate, trayPlatformStyle, trayTooltip } from "./tray-menu.js";
import type { TrayPrefs } from "./tray-prefs.js";

export interface TrayHandlers {
  /** 把窗口显示出来并聚焦 */
  onShow(): void;
  /** 勾/去勾「关闭窗口后继续在托盘中运行」；调用方改完偏好要再调 refresh */
  onToggleHideOnClose(): void;
  onOpenDataDir(): void;
  onOpenLog(): void;
  onQuit(): void;
}

export interface TrayController {
  /** 偏好变了就调它：图标该建的建、该毁的毁，菜单跟着重画 */
  refresh(prefs: TrayPrefs): void;
  /** 现在真的有托盘图标吗（关窗要不要留守取决于它） */
  hasIcon(): boolean;
  destroy(): void;
}

export interface CreateTrayInput {
  /** 图标文件路径；空串表示没有可用图标，此时不建托盘 */
  iconPath: string;
  productName: string;
  origin: string;
  prefs: TrayPrefs;
  locale?: "zh" | "en";
  handlers: TrayHandlers;
  /** 记日志用；托盘建不起来不该让应用起不来，所以只记不抛 */
  log(message: string): void;
}

export function createTray(input: CreateTrayInput): TrayController {
  const style = trayPlatformStyle(process.platform);
  let prefs = input.prefs;
  let tray: Tray | null = null;

  const run = (action: TrayAction): void => {
    switch (action.kind) {
      case "show":
        input.handlers.onShow();
        return;
      case "open-external":
        void shell.openExternal(input.origin);
        return;
      case "toggle-hide-on-close":
        input.handlers.onToggleHideOnClose();
        return;
      case "open-data-dir":
        input.handlers.onOpenDataDir();
        return;
      case "open-log":
        input.handlers.onOpenLog();
        return;
      case "quit":
        input.handlers.onQuit();
        return;
    }
  };

  const buildMenu = (): Menu => {
    const items = trayMenuTemplate({
      productName: input.productName,
      origin: input.origin,
      prefs,
      ...(input.locale === undefined ? {} : { locale: input.locale }),
    });
    // 逐字段赋值而不是透传对象：electron 的选项类型是 exact 的，`undefined` 混进去会
    // 被当成「显式置空」，勾选框会因此变成不确定状态。
    const template: MenuItemConstructorOptions[] = items.map((item) => {
      const options: MenuItemConstructorOptions = { id: item.id };
      if (item.label !== undefined) options.label = item.label;
      if (item.type !== undefined) options.type = item.type;
      if (item.checked !== undefined) options.checked = item.checked;
      if (item.action !== undefined) {
        const action = item.action;
        options.click = (): void => run(action);
      }
      return options;
    });
    return Menu.buildFromTemplate(template);
  };

  const build = (): void => {
    if (input.iconPath === "") return;
    try {
      const icon = nativeImage.createFromPath(input.iconPath);
      if (icon.isEmpty()) {
        input.log(`托盘图标读不出来：${input.iconPath}，这次不显示托盘图标`);
        return;
      }
      // Linux 的托盘只认常驻菜单，状态栏图标尺寸也小一档
      const ready = process.platform === "linux" ? icon.resize({ width: 22, height: 22 }) : icon;
      tray = new Tray(ready);
      tray.setToolTip(trayTooltip(input.productName, input.origin));
      if (style.attachMenuAlways) {
        tray.setContextMenu(buildMenu());
      } else {
        tray.on("click", () => input.handlers.onShow());
        tray.on("right-click", () => {
          if (tray !== null) tray.popUpContextMenu(buildMenu());
        });
      }
      input.log("托盘图标已显示");
    } catch (error) {
      // 没有托盘服务的桌面环境（精简的 Linux、CI）里 new Tray 会抛。少一个图标是小事，
      // 让整个应用起不来是大事 —— 而且 hasIcon() 会因此回 false，关窗就真的退出，
      // 不会把用户留在「没窗口也没图标」的状态里。
      tray = null;
      input.log(`托盘图标没能创建：${String(error)}；应用照常运行`);
    }
  };

  const teardown = (): void => {
    tray?.destroy();
    tray = null;
  };

  const refresh = (next: TrayPrefs): void => {
    prefs = next;
    if (!next.showIcon) {
      if (tray !== null) {
        teardown();
        input.log("托盘图标已隐藏");
      }
      return;
    }
    if (tray === null) {
      build();
      return;
    }
    // 图标还在、只是勾选状态变了：Linux 上菜单是常驻的，得手动重挂
    if (style.attachMenuAlways) tray.setContextMenu(buildMenu());
  };

  refresh(prefs);

  return {
    refresh,
    hasIcon: () => tray !== null,
    destroy: teardown,
  };
}
