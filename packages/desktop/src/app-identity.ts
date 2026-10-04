/**
 * 应用身份：进程标题、窗口标题与 userData 目录都从这里取一处。
 *
 * Electron 默认把 userData 定在 `<appData>/<package.json name>`，而打包后的包名是
 * `adelie-desktop` —— 一旦某天改了包名，用户的历史数据就会「消失」（其实是换了目录）。
 * 所以显式钉住一个与包名无关的名字。
 */
import { app } from "electron";
import path from "node:path";

/** 品牌名，出现在窗口标题、菜单与安装包上 */
export const PRODUCT_NAME = "Adelie";

/** userData 目录名：与包名解耦，改名不搬数据 */
const DATA_DIR_NAME = "Adelie";

/**
 * 在 app ready 之前调用一次。`app.setName` 必须在任何读 userData 的代码之前跑，
 * 否则第一份数据会落到旧目录里去。
 */
export function applyAppIdentity(): void {
  app.setName(DATA_DIR_NAME);
}

/**
 * 开发时（`electron .` 直接跑源码）与打包后共用一个 userData 会互相污染：开发里
 * 换端口、换工作区，装好的那份跟着一起变。给源码运行单独一个目录。
 */
export function userDataDir(isPackaged: boolean, appDataPath: string): string {
  return path.join(appDataPath, isPackaged ? DATA_DIR_NAME : `${DATA_DIR_NAME} (dev)`);
}
