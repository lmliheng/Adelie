// src/api/client.ts
//
// 后端访问层：fetch 封装 + ApiError + POST 的 SSE 流式读取。
//
// 唯一出口是这里 —— 其它文件不直接 fetch。理由是错误处理要和契约绑定：
// 后端所有错误都是 `{ error, message }`（docs/api.md 第 7 节），
// 统一转成 ApiError 才能让界面给出「哪一类错、要不要重试、是不是要去填 token」。

import { createSseParser, type SseFrame } from './sse'
import { authHeaders, resolveRequestUrl, type Credentials } from '../lib/credentials'
import type { ConfigInfo, ConfigPatch, HealthInfo, ModelCatalog, SessionDetail, SessionSummary, ToolInfo } from './types'

export class ApiError extends Error {
  readonly status: number
  readonly code: string

  constructor(status: number, code: string, message: string) {
    super(message)
    this.name = 'ApiError'
    this.status = status
    this.code = code
  }

  /** 网络层失败（DNS/拒绝连接/离线）时 status 为 0 */
  get isNetwork(): boolean {
    return this.status === 0
  }

  get isAuth(): boolean {
    return this.status === 401 || this.code === 'unauthorized'
  }

  get isOffline(): boolean {
    return this.code === 'offline'
  }
}

/** 把任何异常转成 ApiError，界面只需要处理一种错误类型 */
export function toApiError(error: unknown): ApiError {
  if (error instanceof ApiError) return error
  if (error instanceof DOMException && error.name === 'AbortError') {
    return new ApiError(0, 'aborted', '请求已取消')
  }
  const message = error instanceof Error ? error.message : String(error)
  return new ApiError(0, 'network', message)
}

/** 人话版错误文案。code 已知的按契约给，未知的退回服务端的 message */
export function describeApiError(error: ApiError, target: Credentials): string {
  if (error.code === 'aborted') return '请求已取消'
  if (error.code === 'offline') return '未连接到 Adelie 服务端'
  if (error.isAuth) return '未授权：服务端地址不对或 token 无效'
  switch (error.code) {
    case 'busy':
      return '这一轮还在执行中，等它结束或先停止'
    case 'stale_approval':
      return '这条审批已失效（已超时或被处理过）'
    case 'not_found':
      return '会话不存在，可能已被删除'
    case 'bad_request':
      return error.message || '请求不合法'
    case 'network':
      return target.baseUrl === ''
        ? '连不上 Adelie 服务端（同源）。确认服务端已启动，或到设置里填服务端地址'
        : `连不上 ${target.baseUrl}，确认服务端在运行、地址和端口正确、且在同一网络里`
    default:
      return error.message || `请求失败（${error.status}）`
  }
}

interface RequestOptions {
  method?: string
  body?: unknown
  signal?: AbortSignal
}

async function request<T>(target: Credentials, path: string, options: RequestOptions = {}): Promise<T> {
  const headers: Record<string, string> = { ...authHeaders(target.token) }
  if (options.body !== undefined) headers['content-type'] = 'application/json'

  let response: Response
  try {
    response = await fetch(resolveRequestUrl(target.baseUrl, path), {
      method: options.method ?? 'GET',
      headers,
      // 同源请求带 cookie 没意义（单用户 token 鉴权），keepalive 又会限制体积；显式省略
      ...(options.body === undefined ? {} : { body: JSON.stringify(options.body) }),
      ...(options.signal === undefined ? {} : { signal: options.signal }),
    })
  } catch (error) {
    throw toApiError(error)
  }

  if (!response.ok) throw await readError(response)
  if (response.status === 204) return undefined as T
  const text = await response.text()
  if (text.trim() === '') return undefined as T
  try {
    return JSON.parse(text) as T
  } catch {
    throw new ApiError(response.status, 'bad_response', '服务端返回了无法解析的内容')
  }
}

async function readError(response: Response): Promise<ApiError> {
  let code = 'internal'
  let message = ''
  try {
    const text = await response.text()
    const parsed: unknown = JSON.parse(text)
    if (typeof parsed === 'object' && parsed !== null) {
      const record = parsed as Record<string, unknown>
      if (typeof record['error'] === 'string') code = record['error']
      if (typeof record['message'] === 'string') message = record['message']
    }
  } catch {
    // 非 JSON 错误体（反代返回的 HTML 等）：保留状态码
  }
  if (code === 'internal' && response.status === 401) code = 'unauthorized'
  return new ApiError(response.status, code, message)
}

export const api = {
  health: (target: Credentials, signal?: AbortSignal) =>
    request<HealthInfo>(target, '/api/health', signal === undefined ? {} : { signal }),

  listSessions: (target: Credentials, signal?: AbortSignal) =>
    request<{ sessions: SessionSummary[] }>(target, '/api/sessions', signal === undefined ? {} : { signal }).then(
      (data) => data.sessions ?? [],
    ),

  createSession: (target: Credentials, workspace?: string) =>
    request<{ session: SessionSummary }>(target, '/api/sessions', {
      method: 'POST',
      ...(workspace === undefined || workspace === '' ? {} : { body: { workspace } }),
    }).then((data) => data.session),

  getSession: (target: Credentials, id: string, signal?: AbortSignal) =>
    request<SessionDetail>(target, `/api/sessions/${encodeURIComponent(id)}`, signal === undefined ? {} : { signal }),

  deleteSession: (target: Credentials, id: string) =>
    request<void>(target, `/api/sessions/${encodeURIComponent(id)}`, { method: 'DELETE' }),

  getConfig: (target: Credentials, signal?: AbortSignal) =>
    request<ConfigInfo>(target, '/api/config', signal === undefined ? {} : { signal }),

  patchConfig: (target: Credentials, patch: ConfigPatch) =>
    request<ConfigInfo>(target, '/api/config', { method: 'PATCH', body: patch }),

  // 能选哪些模型由服务端的模型目录决定：界面不再自己抄一份清单，
  // 否则「服务端支持 kimi、设置里却选不到」这种漂移迟早会发生
  listModels: (target: Credentials, signal?: AbortSignal) =>
    request<ModelCatalog>(target, '/api/models', signal === undefined ? {} : { signal }),

  listTools: (target: Credentials, signal?: AbortSignal) =>
    request<{ tools: ToolInfo[] }>(target, '/api/tools', signal === undefined ? {} : { signal }).then(
      (data) => data.tools ?? [],
    ),

  cancel: (target: Credentials, id: string) =>
    request<unknown>(target, `/api/sessions/${encodeURIComponent(id)}/cancel`, { method: 'POST' }),

  approve: (target: Credentials, id: string, body: { actionId: string; decision: 'approve' | 'deny'; remember?: boolean }) =>
    request<{ ok: boolean }>(target, `/api/sessions/${encodeURIComponent(id)}/approvals`, { method: 'POST', body }),
}

export interface StreamHandlers {
  onFrame: (frame: SseFrame) => void
}

/**
 * 发一条消息并读取 SSE 流。
 *
 * 用 fetch + ReadableStream 而不是 EventSource：契约是 POST（EventSource 只能 GET），
 * 且要带 Authorization 头（EventSource 不能带自定义头）。分帧交给 sse.ts。
 *
 * 返回时流已结束（正常结束或服务端关闭连接）；请求被 abort 会抛 ApiError('aborted')。
 */
export async function streamMessage(
  target: Credentials,
  sessionId: string,
  text: string,
  handlers: StreamHandlers,
  signal: AbortSignal,
): Promise<void> {
  let response: Response
  try {
    response = await fetch(resolveRequestUrl(target.baseUrl, `/api/sessions/${encodeURIComponent(sessionId)}/messages`), {
      method: 'POST',
      headers: { 'content-type': 'application/json', accept: 'text/event-stream', ...authHeaders(target.token) },
      body: JSON.stringify({ text }),
      signal,
    })
  } catch (error) {
    throw toApiError(error)
  }

  if (!response.ok) throw await readError(response)
  if (response.body === null) throw new ApiError(response.status, 'bad_response', '服务端没有返回流')

  const reader = response.body.getReader()
  const decoder = new TextDecoder()
  const parser = createSseParser()
  try {
    for (;;) {
      const { done, value } = await reader.read()
      if (done) break
      // stream: true 让多字节字符跨块时不被切坏（中文按 3 字节传）
      for (const frame of parser.push(decoder.decode(value, { stream: true }))) handlers.onFrame(frame)
    }
    for (const frame of parser.push(decoder.decode())) handlers.onFrame(frame)
    for (const frame of parser.flush()) handlers.onFrame(frame)
  } catch (error) {
    throw toApiError(error)
  } finally {
    reader.releaseLock()
  }
}
