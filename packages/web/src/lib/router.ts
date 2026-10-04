// src/lib/router.ts
//
// 极小的路径路由：只做四件事 —— 去掉部署根、归一化路径、给一个路径算出该显示哪个页面、
// 把应用内路径拼回可点的 URL。
//
// 为什么**不**引 react-router：`base: './'` 下 BrowserRouter 的 `basename` 是有歧义的
// （`'./'` 不是合法 basename），而这个仓库已经为同一个问题解过一次 —— `register-sw.ts`
// 用 `new URL('sw.js', document.baseURI)` 拿部署根。六个平级路由不值得再引一个依赖，
// 而且这四个函数是纯的：跑在 node 环境的单测里，不需要 DOM。

/** 首页：`/chat` 不在导航里，但它是「无路径 / 未知路径」的落点 */
export const HOME_PATH = '/chat'

export type PageId = 'chat' | 'projects' | 'agents' | 'models' | 'plugins' | 'usage'

export interface NavPage {
  id: Exclude<PageId, 'chat'>
  path: string
  label: string
}

/** 导航顺序即 rail 上的顺序。「对话」不在表里，它是首页与落点（见 NavRail） */
export const NAV_PAGES: readonly NavPage[] = [
  { id: 'projects', path: '/projects', label: '项目' },
  { id: 'agents', path: '/agents', label: '智能体' },
  { id: 'models', path: '/models', label: '模型' },
  { id: 'plugins', path: '/plugins', label: '插件' },
  { id: 'usage', path: '/usage', label: '成本中心' },
]

/** 路径归一化：补前导斜杠、去掉结尾斜杠（根除外）。空串当根 */
export function normalizePath(value: string): string {
  if (value === '') return '/'
  const withSlash = value.startsWith('/') ? value : `/${value}`
  if (withSlash.length > 1 && withSlash.endsWith('/')) return withSlash.replace(/\/+$/, '') || '/'
  return withSlash
}

/**
 * 浏览器里的 pathname → 应用内路径。
 *
 * `base` 由调用方给（浏览器里是 `document.baseURI` 的 pathname），所以这个函数能在单测里
 * 跑遍三种部署：站点根 `/`、GitHub Pages 的子路径 `/Adelie/`、以及 `base: './'` 解析出
 * 来的相对形式。
 */
export function stripBase(pathname: string, base: string): string {
  const root = base.endsWith('/') ? base.slice(0, -1) : base
  if (root === '' || root === '.') return normalizePath(pathname)
  if (pathname === root) return '/'
  if (pathname.startsWith(`${root}/`)) return normalizePath(pathname.slice(root.length))
  return normalizePath(pathname)
}

/** 应用内路径 → 可 push / 可放进 href 的 URL（带上部署根） */
export function withBase(path: string, base: string): string {
  const root = base.endsWith('/') ? base : `${base}/`
  const relative = normalizePath(path).replace(/^\//, '')
  return relative === '' ? root : `${root}${relative}`
}

/**
 * 认不出来的路径返回 null —— 调用方把它当首页，而不是白屏。
 *
 * 根路径（`/` 与空串）也算首页：子路径部署下打开 `/Adelie/` 时 `stripBase` 的结果正是 `/`，
 * 让人一进来就落在对话页，而不是先白屏再靠调用方兜底。
 */
export function pageIdOf(path: string): PageId | null {
  const normalized = normalizePath(path)
  if (normalized === '/' || normalized === HOME_PATH) return 'chat'
  return NAV_PAGES.find((page) => page.path === normalized)?.id ?? null
}

/** 这一页在 rail 上对应的条目；首页没有条目 */
export function navPageOf(id: PageId): NavPage | null {
  return NAV_PAGES.find((page) => page.id === id) ?? null
}
