/**
 * 应用菜单：窗口顶栏（Windows 上按 Alt 唤出）那一排。
 *
 * 为什么用 `role` 而不是自己写：复制/粘贴/缩放/开发者工具这些行为在各平台上有一堆
 * 边角（比如 macOS 的 Cmd 快捷键、输入法下的撤销栈），`role` 是 Electron 把这些都处理
 * 好的那层。这里只补自己需要的入口：数据目录、日志、关于。
 *
 * 壳的界面本身是网页，菜单只是**逃生门**：网页里进不去的地方（数据目录、日志文件）在这里。
 */
import { Menu, app } from "electron";
import type { MenuItemConstructorOptions } from "electron";

export interface AppMenuActions {
  openDataDir(): void;
  openLog(): void;
  about(): void;
}

export function buildAppMenu(input: {
  productName: string;
  locale?: "zh" | "en";
  actions: AppMenuActions;
}): Menu {
  const zh = (input.locale ?? "zh") === "zh";
  const template: MenuItemConstructorOptions[] = [
    {
      label: zh ? "文件" : "File",
      submenu: [
        { label: zh ? "打开数据目录" : "Open data folder", click: () => input.actions.openDataDir() },
        { label: zh ? "查看日志" : "View log", click: () => input.actions.openLog() },
        { type: "separator" },
        { role: "quit", label: zh ? "退出" : "Quit" },
      ],
    },
    {
      label: zh ? "编辑" : "Edit",
      submenu: [
        { role: "undo", label: zh ? "撤销" : "Undo" },
        { role: "redo", label: zh ? "重做" : "Redo" },
        { type: "separator" },
        { role: "cut", label: zh ? "剪切" : "Cut" },
        { role: "copy", label: zh ? "复制" : "Copy" },
        { role: "paste", label: zh ? "粘贴" : "Paste" },
        { role: "selectAll", label: zh ? "全选" : "Select all" },
      ],
    },
    {
      label: zh ? "视图" : "View",
      submenu: [
        { role: "reload", label: zh ? "重新加载界面" : "Reload" },
        { role: "resetZoom", label: zh ? "实际大小" : "Actual size" },
        { role: "zoomIn", label: zh ? "放大" : "Zoom in" },
        { role: "zoomOut", label: zh ? "缩小" : "Zoom out" },
        { type: "separator" },
        { role: "togglefullscreen", label: zh ? "全屏" : "Toggle full screen" },
        { role: "toggleDevTools", label: zh ? "开发者工具" : "Developer tools" },
      ],
    },
    {
      label: zh ? "帮助" : "Help",
      submenu: [{ label: zh ? `关于 ${input.productName}` : `About ${input.productName}`, click: () => input.actions.about() }],
    },
  ];

  // macOS 的第一个菜单必须是应用名，否则「关于/退出」会跑错地方
  if (process.platform === "darwin") {
    template.unshift({
      label: app.name,
      submenu: [
        { role: "about", label: zh ? `关于 ${input.productName}` : `About ${input.productName}` },
        { type: "separator" },
        { role: "hide", label: zh ? "隐藏" : "Hide" },
        { role: "quit", label: zh ? "退出" : "Quit" },
      ],
    });
  }

  return Menu.buildFromTemplate(template);
}
