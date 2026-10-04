// src/lib/credentials.ts
//
// 连接凭据：服务端地址 + token（docs/api.md 第 0 节）。
//
// 两种使用场景决定了这里的默认值：
//   1. 服务端就在本机 —— 同源访问，baseUrl 留空（空字符串 = 相对路径请求 /api/...），
//      token 也不需要（回环地址放行）。所以「空凭据」是一个正常状态，不是没配置。
//   2. 手机 PWA 连局域网里的服务端 —— 必须是绝对地址 + Bearer token，存在
//      localStorage 里（跨会话记住，否则每次打开都要重输）。
//
// 存的是本地存储里的一段 JSON；解析必须容错（用户手改、旧版本格式、隐私模式下
// 写入失败），任何异常都退回「空凭据」而不是抛错。

const STORAGE_KEY = 'adelie.web.credentials.v1'

export interface Credentials {
  /** 空字符串 = 同源。非空时是形如 http://192.168.1.5:7370 的绝对地址，不带结尾斜杠 */
  baseUrl: string
  /** 空字符串 = 不带 Authorization */
  token: string
}

export const EMPTY_CREDENTIALS: Credentials = { baseUrl: '', token: '' }

/** localStorage 的最小接口：测试里用内存实现替掉，不必依赖 jsdom */
export interface KeyValueStore {
  getItem(key: string): string | null
  setItem(key: string, value: string): void
  removeItem(key: string): void
}

/** 浏览器 localStorage 的惰性取用：隐私模式/禁用存储时返回 null 而不是抛 */
export function browserStore(): KeyValueStore | null {
  try {
    const store = globalThis.localStorage
    if (store === undefined) return null
    // 探一次写入：Safari 隐私模式下 getItem 能用但 setItem 抛
    const probe = '__adelie_probe__'
    store.setItem(probe, '1')
    store.removeItem(probe)
    return store
  } catch {
    return null
  }
}

export function parseCredentials(raw: string | null): Credentials {
  if (raw === null || raw.trim() === '') return { ...EMPTY_CREDENTIALS }
  try {
    const parsed: unknown = JSON.parse(raw)
    if (typeof parsed !== 'object' || parsed === null) return { ...EMPTY_CREDENTIALS }
    const record = parsed as Record<string, unknown>
    return {
      baseUrl: normalizeBaseUrl(typeof record['baseUrl'] === 'string' ? record['baseUrl'] : ''),
      token: typeof record['token'] === 'string' ? record['token'].trim() : '',
    }
  } catch {
    return { ...EMPTY_CREDENTIALS }
  }
}

export function serializeCredentials(credentials: Credentials): string {
  return JSON.stringify({ baseUrl: credentials.baseUrl, token: credentials.token })
}

export function loadCredentials(store: KeyValueStore | null = browserStore()): Credentials {
  if (store === null) return { ...EMPTY_CREDENTIALS }
  return parseCredentials(store.getItem(STORAGE_KEY))
}

export function saveCredentials(
  credentials: Credentials,
  store: KeyValueStore | null = browserStore(),
): void {
  if (store === null) return
  try {
    store.setItem(STORAGE_KEY, serializeCredentials(credentials))
  } catch {
    // 写不进去（配额/隐私模式）时不影响本次会话使用，只是下次要重填
  }
}

/**
 * 归一化服务端地址。
 *
 * 空 → 空（同源）。用户手输的形态很多：`192.168.1.5:7370`、`http://host:7370/`、
 * 甚至带路径。只接受 http/https；其余（比如用户手抖打成 `htp://`）一律返回空串，
 * 让调用方给出「地址无效」而不是让 fetch 抛一个看不懂的错。
 */
export function normalizeBaseUrl(input: string): string {
  const trimmed = input.trim()
  if (trimmed === '' || trimmed === '/') return ''
  const withScheme = /^[a-z][a-z0-9+.-]*:\/\//i.test(trimmed) ? trimmed : `http://${trimmed}`
  let url: URL
  try {
    url = new URL(withScheme)
  } catch {
    return ''
  }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') return ''
  // 主机名必须是域名 / IPv4 / [IPv6]。不校验的话 `ht!tp://` 会被错误地当成
  // 「http://ht!tp」这种可解析的东西，用户看到的就只是一个莫名其妙的连接失败。
  const host = url.hostname
  const hostOk = host.startsWith('[') ? /^\[[0-9a-f:.]+\]$/i.test(host) : /^[a-z0-9]([a-z0-9._-]*[a-z0-9])?$/i.test(host)
  if (!hostOk) return ''
  // 丢掉 query/hash：token 走查询串是另一回事，见 parseConnectionInput
  url.search = ''
  url.hash = ''
  const path = url.pathname.replace(/\/+$/, '')
  return `${url.origin}${path === '/' ? '' : path}`
}

/**
 * 解析用户在设置页粘贴的「服务端地址」输入。
 *
 * 服务端启动时会打印一个带 token 的 URL（docs/api.md 第 0 节），所以粘贴进来的
 * 可能是 `http://192.168.1.5:7370/?token=abc`。这里顺手把 token 拆出来，
 * 省掉「复制完还要手动把 token 再抄一遍」这一步。
 */
export function parseConnectionInput(input: string): { baseUrl: string; token: string | null } {
  const trimmed = input.trim()
  if (trimmed === '') return { baseUrl: '', token: null }
  const withScheme = /^[a-z][a-z0-9+.-]*:\/\//i.test(trimmed) ? trimmed : `http://${trimmed}`
  let url: URL
  try {
    url = new URL(withScheme)
  } catch {
    return { baseUrl: normalizeBaseUrl(input), token: null }
  }
  const token = url.searchParams.get('token')
  return { baseUrl: normalizeBaseUrl(input), token: token === null || token === '' ? null : token }
}

/** 拼请求地址：baseUrl 为空时用站点相对路径（同源） */
export function resolveRequestUrl(baseUrl: string, path: string): string {
  const suffix = path.startsWith('/') ? path : `/${path}`
  return baseUrl === '' ? suffix : `${baseUrl}${suffix}`
}

/** 鉴权头：没有 token 就不带（回环地址无需鉴权） */
export function authHeaders(token: string): Record<string, string> {
  return token === '' ? {} : { authorization: `Bearer ${token}` }
}
