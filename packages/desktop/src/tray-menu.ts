/**
 * 托盘菜单：**纯数据**，不碰 Electron（可单测）。
 *
 * 壳里只剩「把这堆数据翻译成 Menu.buildFromTemplate」这一步。为什么值得拆开：
 * 菜单项的文案与勾选状态是最容易出错、又最难在无头环境里验证的东西 —— 拆成纯函数之后，
 * 「偏好是关的时候勾选框不该打勾」这种判断可以在 CI 里跑。
 *
 * 菜单每次弹出前**重建**：勾选状态因此永远是当下的值，而不是启动那一刻的快照。
 */

import type { TrayPrefs } from "./tray-prefs.js";

export type TrayAction =
  /** 把窗口显示出来并聚焦 */
  | { kind: "show" }
  /** 用系统浏览器打开当前 origin（同一个服务端，界面上没有的入口） */
  | { kind: "open-external" }
  /** 勾/去勾「关闭窗口后继续在托盘中运行」 */
  | { kind: "toggle-hide-on-close" }
  /** 在文件管理器里打开数据目录（会话、密钥、日志都在里面） */
  | { kind: "open-data-dir" }
  /** 打开壳的日志文件 */
  | { kind: "open-log" }
  | { kind: "quit" };

export interface TrayMenuItem {
  id: string;
  label?: string;
  type?: "normal" | "separator" | "checkbox";
  checked?: boolean;
  action?: TrayAction;
}

export function trayTooltip(productName: string, origin: string): string {
  return `${productName} · ${origin}`;
}

export function trayMenuTemplate(input: {
  productName: string;
  origin: string;
  prefs: TrayPrefs;
  /** 界面语言；壳只做中英两份，缺省中文 */
  locale?: "zh" | "en";
}): TrayMenuItem[] {
  const zh = (input.locale ?? "zh") === "zh";
  return [
    {
      id: "show",
      label: zh ? `打开 ${input.productName}` : `Open ${input.productName}`,
      action: { kind: "show" },
    },
    {
      id: "open-browser",
      label: zh ? "在浏览器里打开" : "Open in browser",
      action: { kind: "open-external" },
    },
    { id: "sep-1", type: "separator" },
    {
      id: "hide-on-close",
      label: zh ? "关闭窗口后继续在托盘中运行" : "Keep running in the tray when closed",
      type: "checkbox",
      checked: input.prefs.hideOnClose,
      action: { kind: "toggle-hide-on-close" },
    },
    { id: "sep-2", type: "separator" },
    {
      id: "open-data-dir",
      label: zh ? "打开数据目录" : "Open data folder",
      action: { kind: "open-data-dir" },
    },
    {
      id: "open-log",
      label: zh ? "查看日志" : "View log",
      action: { kind: "open-log" },
    },
    { id: "sep-3", type: "separator" },
    {
      id: "quit",
      label: zh ? `退出 ${input.productName}` : `Quit ${input.productName}`,
      action: { kind: "quit" },
    },
  ];
}

/**
 * Linux 的托盘（AppIndicator / StatusNotifierItem）**不会**发 click / right-click 事件，
 * 只能挂一个常驻菜单；macOS 与 Windows 上左键唤起窗口、右键弹菜单。壳按这张表决定怎么接。
 */
export function trayPlatformStyle(platform: NodeJS.Platform): {
  attachMenuAlways: boolean;
  clickShowsWindow: boolean;
} {
  if (platform === "linux") return { attachMenuAlways: true, clickShowsWindow: false };
  return { attachMenuAlways: false, clickShowsWindow: true };
}
