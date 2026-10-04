/**
 * 数据根下那几个小文件的落点。
 *
 * 集中在一处而不是散在各模块里拼路径：这些文件属于**同一份用户数据**，它们的相对位置
 * 一旦分叉（有人写 `port.json`、有人读 `ports.json`），症状是「设置时好时坏」——
 * 最难查的那类问题。
 */
import path from "node:path";

export interface StorePaths {
  /** 记住上次用的端口 */
  port: string;
  /** 窗口尺寸与位置 */
  window: string;
  /** 托盘偏好（图标开关、关窗是否继续后台运行） */
  trayPrefs: string;
  /** 壳自己的日志（含内置服务端的 stdout/stderr） */
  log: string;
  /** 内置服务端的原始输出（保留，便于用户贴给开发者） */
  serverLog: string;
}

export function storePaths(userDataDir: string): StorePaths {
  return {
    port: path.join(userDataDir, "port.json"),
    window: path.join(userDataDir, "window.json"),
    trayPrefs: path.join(userDataDir, "tray.json"),
    log: path.join(userDataDir, "logs", "desktop.log"),
    serverLog: path.join(userDataDir, "server.log"),
  };
}
