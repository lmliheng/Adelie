/**
 * 链接判定的纯逻辑：哪些算「本站」、哪些能交给系统浏览器（可在没有 Electron 的环境里单测）。
 *
 * 为什么会有一条「只放行 http/https/mailto」：`shell.openExternal` 是把 URL 交给操作系统的
 * 启动器，`file:` 能打开本地文件、自定义协议能唤起别的应用 —— 一个网页只要能让你点一个链接，
 * 就能借壳的手去启动它们。放行范围写死在这三个 scheme 上，是这条边界唯一可靠的写法。
 *
 * 解析失败（空串、相对路径、缺 scheme）一律**不算本站、也不放行**：宁可什么都不做。
 */

/** 允许交给系统启动器的 scheme */
const OPENABLE_SCHEMES = new Set(["http:", "https:", "mailto:"]);

function parse(url: string): URL | null {
  try {
    return new URL(url);
  } catch {
    return null;
  }
}

/** 是不是同一个来源（scheme + host + port）。界面是 SPA，同来源的跳转本来就不该被拦。 */
export function sameOrigin(url: string, origin: string): boolean {
  const left = parse(url);
  const right = parse(origin);
  return left !== null && right !== null && left.origin === right.origin;
}

export function isOpenableUrl(url: string): boolean {
  const parsed = parse(url);
  return parsed !== null && OPENABLE_SCHEMES.has(parsed.protocol);
}
