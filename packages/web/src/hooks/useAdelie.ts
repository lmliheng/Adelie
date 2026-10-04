// src/hooks/useAdelie.ts
//
// 应用状态机：连接、会话、对话流、审批、配置。
//
// 三条设计取舍：
//   1. **轮次按会话分桶**（turnsBySession）。同一时刻只能有一轮在一个会话里跑，
//      但用户可以在别的会话里干活，所以流不能绑死「当前会话」—— 分桶之后切会话
//      不会把增量写串到别的会话里。
//   2. **增量与事件分开处理**。delta 只改 content/reasoning（高频，走缓冲），
//      `event` 帧进 events 数组（低频，每次都重算时间线）。事件数组的身份变化
//      才是重算时间线的触发点。
//   3. **错误只存人话**。ApiError 在边界上就被 describeApiError 翻成中文，
//      界面层不再判断状态码。

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { api, describeApiError, streamMessage, toApiError, type ApiError } from '../api/client'
import { parseFrameData, type SseFrame } from '../api/sse'
import type {
  ConfigInfo,
  ConfigPatch,
  HealthInfo,
  PendingActionLike,
  RunFinishedInfo,
  SessionEventLike,
  SessionSummary,
  ToolInfo,
} from '../api/types'
import { buildTurns } from '../lib/history'
import {
  loadCredentials,
  saveCredentials,
  type Credentials,
} from '../lib/credentials'

export type ConnectionStatus = 'checking' | 'online' | 'offline' | 'unauthorized'
export type LoadStatus = 'idle' | 'loading' | 'ready' | 'error'
export type TurnStatus = 'running' | 'done' | 'error' | 'interrupted'

export interface TurnState {
  id: string
  runId: string | null
  task: string
  at: number
  status: TurnStatus
  events: SessionEventLike[]
  content: string
  reasoning: string
  reasoningStartedAt: number | null
  contentStartedAt: number | null
  approval: PendingActionLike | null
  /** 这条审批的处置结果，用于把卡片换成一行结果 */
  approvalOutcome: 'approve' | 'deny' | 'stale' | null
  stopRequested: boolean
  error: { code: string; message: string } | null
  finished: RunFinishedInfo | null
}

export interface ConnectionState {
  status: ConnectionStatus
  health: HealthInfo | null
  error: string | null
}

interface ListState<T> {
  status: LoadStatus
  items: T[]
  error: string | null
}

const HEALTH_TIMEOUT_MS = 6000

export interface AdelieController {
  credentials: Credentials
  setCredentials: (next: Credentials) => void
  connection: ConnectionState
  retryConnection: () => void
  sessions: ListState<SessionSummary>
  activeId: string | null
  openSession: (id: string) => void
  newSession: () => Promise<string | null>
  removeSession: (id: string) => Promise<void>
  reloadSession: (id: string) => Promise<void>
  turns: TurnState[]
  streamingSessionIds: Set<string>
  isStreaming: boolean
  transcript: { status: LoadStatus; error: string | null }
  send: (text: string) => Promise<void>
  stop: () => void
  decideApproval: (turn: TurnState, decision: 'approve' | 'deny', remember: boolean) => Promise<void>
  config: { status: LoadStatus; data: ConfigInfo | null; error: string | null }
  loadConfig: () => Promise<void>
  saveConfig: (patch: ConfigPatch) => Promise<boolean>
  tools: { status: LoadStatus; items: ToolInfo[]; error: string | null }
  loadTools: () => Promise<void>
  refreshSessions: () => Promise<void>
}

export function useAdelie(): AdelieController {
  const [credentials, setCredentialsState] = useState<Credentials>(() => loadCredentials())
  const [connection, setConnection] = useState<ConnectionState>({ status: 'checking', health: null, error: null })
  const [sessions, setSessions] = useState<ListState<SessionSummary>>({ status: 'loading', items: [], error: null })
  const [activeId, setActiveId] = useState<string | null>(null)
  const [turnsBySession, setTurnsBySession] = useState<Record<string, TurnState[]>>({})
  const [transcript, setTranscript] = useState<{ status: LoadStatus; error: string | null }>({ status: 'idle', error: null })
  const [config, setConfig] = useState<{ status: LoadStatus; data: ConfigInfo | null; error: string | null }>({
    status: 'idle',
    data: null,
    error: null,
  })
  const [tools, setTools] = useState<ListState<ToolInfo>>({ status: 'idle', items: [], error: null })

  const controllers = useRef(new Map<string, AbortController>())
  /** 增量缓冲：按会话聚合，定时批量写入 state（每帧一次 setState 而不是每个 delta 一次） */
  const deltaBuffer = useRef(new Map<string, { turnId: string; content: string; reasoning: string }>())
  const flushTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  const turns = useMemo(() => (activeId === null ? [] : (turnsBySession[activeId] ?? [])), [activeId, turnsBySession])
  const streamingSessionIds = useMemo(() => {
    const set = new Set<string>()
    for (const [sessionId, list] of Object.entries(turnsBySession)) {
      if (list.some((turn) => turn.status === 'running')) set.add(sessionId)
    }
    return set
  }, [turnsBySession])

  const mutateTurn = useCallback((sessionId: string, turnId: string, updater: (turn: TurnState) => TurnState) => {
    setTurnsBySession((prev) => {
      const list = prev[sessionId]
      if (list === undefined) return prev
      let changed = false
      const next = list.map((turn) => {
        if (turn.id !== turnId) return turn
        changed = true
        return updater(turn)
      })
      return changed ? { ...prev, [sessionId]: next } : prev
    })
  }, [])

  const flushDeltas = useCallback(() => {
    if (flushTimer.current !== null) {
      clearTimeout(flushTimer.current)
      flushTimer.current = null
    }
    if (deltaBuffer.current.size === 0) return
    const pending = [...deltaBuffer.current.entries()]
    deltaBuffer.current.clear()
    const now = Date.now()
    setTurnsBySession((prev) => {
      const next = { ...prev }
      for (const [sessionId, buffer] of pending) {
        const list = next[sessionId]
        if (list === undefined) continue
        next[sessionId] = list.map((turn) => {
          if (turn.id !== buffer.turnId) return turn
          return {
            ...turn,
            content: turn.content + buffer.content,
            reasoning: turn.reasoning + buffer.reasoning,
            contentStartedAt:
              turn.contentStartedAt ?? (buffer.content === '' ? null : now),
            reasoningStartedAt:
              turn.reasoningStartedAt ?? (buffer.reasoning === '' ? null : now),
          }
        })
      }
      return next
    })
  }, [])

  const queueDelta = useCallback(
    (sessionId: string, turnId: string, kind: 'content' | 'reasoning', text: string) => {
      const buffer = deltaBuffer.current.get(sessionId) ?? { turnId, content: '', reasoning: '' }
      if (buffer.turnId !== turnId) return // 同一会话里已经换了新的一轮：丢掉过期增量
      if (kind === 'reasoning') buffer.reasoning += text
      else buffer.content += text
      deltaBuffer.current.set(sessionId, buffer)
      // 60ms 一批：比 rAF 稳（后台标签页 rAF 不跑），又能把 token 级别的增量合并成一次渲染
      if (flushTimer.current === null) flushTimer.current = setTimeout(flushDeltas, 60)
    },
    [flushDeltas],
  )

  const handleFrame = useCallback(
    (sessionId: string, turnId: string, frame: SseFrame) => {
      const data = parseFrameData(frame)
      const record = asRecord(data)

      switch (frame.event) {
        case 'delta': {
          const text = record?.['text']
          if (typeof text !== 'string' || text === '') return
          const kind = record?.['kind'] === 'reasoning' ? 'reasoning' : 'content'
          queueDelta(sessionId, turnId, kind, text)
          return
        }
        case 'event': {
          const type = record?.['type']
          if (typeof type !== 'string') return
          const ts = typeof record?.['timestamp'] === 'number' ? record['timestamp'] : Date.now()
          const event: SessionEventLike = { type, payload: record?.['payload'] ?? null, ts }
          mutateTurn(sessionId, turnId, (turn) => ({ ...turn, events: [...turn.events, event] }))
          return
        }
        case 'approval_request': {
          const action = asRecord(record?.['action'])
          if (action === null) return
          const approval = normalizePendingAction(action)
          mutateTurn(sessionId, turnId, (turn) => ({ ...turn, approval }))
          return
        }
        case 'run_started': {
          const runId = record?.['runId']
          if (typeof runId !== 'string') return
          mutateTurn(sessionId, turnId, (turn) => ({ ...turn, runId }))
          return
        }
        case 'run_finished': {
          flushDeltas()
          const finished = normalizeRunFinished(record)
          mutateTurn(sessionId, turnId, (turn) => ({ ...turn, finished, status: 'done', approval: null }))
          return
        }
        case 'error': {
          flushDeltas()
          const message = typeof record?.['message'] === 'string' ? record['message'] : '运行失败'
          mutateTurn(sessionId, turnId, (turn) => ({ ...turn, status: 'error', error: { code: 'run_error', message } }))
          return
        }
        case 'done': {
          flushDeltas()
          mutateTurn(sessionId, turnId, (turn) =>
            turn.status === 'running' ? { ...turn, status: 'done' } : turn,
          )
          return
        }
        default: {
          // 契约外的事件名：照样留在时间线上，免得「服务端多说了句什么」在界面上消失
          mutateTurn(sessionId, turnId, (turn) => ({
            ...turn,
            events: [...turn.events, { type: frame.event, payload: data, ts: Date.now() }],
          }))
        }
      }
    },
    [flushDeltas, mutateTurn, queueDelta],
  )

  // ---- 连接 ----

  const loadConfig = useCallback(async () => {
    setConfig((prev) => ({ ...prev, status: 'loading', error: null }))
    try {
      const data = await api.getConfig(credentials)
      setConfig({ status: 'ready', data, error: null })
    } catch (error) {
      setConfig({ status: 'error', data: null, error: describeApiError(toApiError(error), credentials) })
    }
  }, [credentials])

  const loadTools = useCallback(async () => {
    setTools((prev) => ({ ...prev, status: 'loading', error: null }))
    try {
      const items = await api.listTools(credentials)
      setTools({ status: 'ready', items, error: null })
    } catch (error) {
      setTools({ status: 'error', items: [], error: describeApiError(toApiError(error), credentials) })
    }
  }, [credentials])

  const refreshSessions = useCallback(async () => {
    setSessions((prev) => ({ ...prev, status: prev.items.length === 0 ? 'loading' : prev.status }))
    try {
      const items = await api.listSessions(credentials)
      setSessions({ status: 'ready', items, error: null })
    } catch (error) {
      setSessions({ status: 'error', items: [], error: describeApiError(toApiError(error), credentials) })
    }
  }, [credentials])

  /** 每次点「重试」自增，用来重跑探活 effect */
  const [attempt, setAttempt] = useState(0)

  const retryConnection = useCallback(() => {
    setSessions({ status: 'loading', items: [], error: null })
    setAttempt((value) => value + 1)
  }, [])

  // 探活 + 拉配置与会话；换地址、重试、首次打开都走这条路径
  useEffect(() => {
    let cancelled = false
    const controller = new AbortController()
    const run = async () => {
      setConnection({ status: 'checking', health: null, error: null })
      try {
        const health = await api.health(credentials, controller.signal)
        if (cancelled) return
        setConnection({ status: 'online', health, error: null })
        await Promise.all([refreshSessions(), loadConfig()])
      } catch (error) {
        if (cancelled) return
        const apiError = toApiError(error)
        const message = describeApiError(apiError, credentials)
        setConnection({
          status: apiError.isAuth ? 'unauthorized' : 'offline',
          health: null,
          error: message,
        })
        setSessions({ status: 'error', items: [], error: message })
      }
    }
    void run()
    return () => {
      cancelled = true
      controller.abort()
    }
  }, [attempt, credentials, loadConfig, refreshSessions])

  const reloadSession = useCallback(
    async (sessionId: string) => {
      setTranscript({ status: 'loading', error: null })
      try {
        const detail = await api.getSession(credentials, sessionId)
        const historyTurns = buildTurns(detail.events ?? []).map((turn) => {
          const stopped = turn.events.some((event) => event.type === 'stopped')
          return {
            id: turn.id,
            runId: turn.id,
            task: turn.task,
            at: turn.at,
            status: stopped ? ('done' as TurnStatus) : ('interrupted' as TurnStatus),
            events: turn.events,
            content: '',
            reasoning: '',
            reasoningStartedAt: null,
            contentStartedAt: null,
            approval: null,
            approvalOutcome: null,
            stopRequested: false,
            error: stopped
              ? null
              : { code: 'incomplete', message: '这一轮没有收到结束事件，可能被中断了' },
            finished: null,
          }
        })
        setTurnsBySession((prev) => {
          const live = (prev[sessionId] ?? []).filter((turn) => turn.status === 'running')
          // 正在跑的那一轮不在历史里（事件还没落盘完），追加在后面而不是丢掉
          const liveIds = new Set(historyTurns.map((turn) => turn.runId))
          const keep = live.filter((turn) => turn.runId !== null && !liveIds.has(turn.runId))
          return { ...prev, [sessionId]: [...historyTurns, ...keep] }
        })
        setTranscript({ status: 'ready', error: null })
      } catch (error) {
        setTranscript({ status: 'error', error: describeApiError(toApiError(error), credentials) })
      }
    },
    [credentials],
  )

  const openSession = useCallback(
    (id: string) => {
      setActiveId(id)
      void reloadSession(id)
    },
    [reloadSession],
  )

  const newSession = useCallback(async (): Promise<string | null> => {
    try {
      const session = await api.createSession(credentials)
      setSessions((prev) => ({ status: 'ready', items: [session, ...prev.items], error: null }))
      setTurnsBySession((prev) => ({ ...prev, [session.id]: [] }))
      setActiveId(session.id)
      setTranscript({ status: 'ready', error: null })
      return session.id
    } catch (error) {
      setSessions((prev) => ({ ...prev, status: 'error', error: describeApiError(toApiError(error), credentials) }))
      return null
    }
  }, [credentials])

  const removeSession = useCallback(
    async (id: string) => {
      const previous = sessions.items
      setSessions((prev) => ({ ...prev, items: prev.items.filter((item) => item.id !== id) }))
      try {
        await api.deleteSession(credentials, id)
        setTurnsBySession((prev) => {
          const next = { ...prev }
          delete next[id]
          return next
        })
        if (activeId === id) {
          const remaining = previous.filter((item) => item.id !== id)
          const next = remaining[0]
          if (next === undefined) {
            setActiveId(null)
            setTranscript({ status: 'idle', error: null })
          } else {
            openSession(next.id)
          }
        }
      } catch (error) {
        // 删失败要把列表还原，否则界面显示「已删除」而服务端还在
        setSessions((prev) => ({ ...prev, items: previous, error: describeApiError(toApiError(error), credentials) }))
      }
    },
    [activeId, credentials, openSession, sessions.items],
  )

  // ---- 对话 ----

  const ensureSession = useCallback(async (): Promise<string | null> => {
    if (activeId !== null) return activeId
    return newSession()
  }, [activeId, newSession])

  const send = useCallback(
    async (text: string) => {
      const trimmed = text.trim()
      if (trimmed === '') return
      const sessionId = await ensureSession()
      if (sessionId === null) return
      if (controllers.current.has(sessionId)) return // 同一会话已有在跑的流

      const turn: TurnState = {
        id: `t-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
        runId: null,
        task: trimmed,
        at: Date.now(),
        status: 'running',
        events: [],
        content: '',
        reasoning: '',
        reasoningStartedAt: null,
        contentStartedAt: null,
        approval: null,
        approvalOutcome: null,
        stopRequested: false,
        error: null,
        finished: null,
      }
      setTurnsBySession((prev) => ({ ...prev, [sessionId]: [...(prev[sessionId] ?? []), turn] }))

      const controller = new AbortController()
      controllers.current.set(sessionId, controller)
      try {
        await streamMessage(credentials, sessionId, trimmed, { onFrame: (frame) => handleFrame(sessionId, turn.id, frame) }, controller.signal)
        flushDeltas()
        mutateTurn(sessionId, turn.id, (current) => {
          if (current.status !== 'running') return current
          // 用户点过停止：服务端收尾时可能直接关流，这不算「断流」
          if (current.stopRequested) return { ...current, status: 'done' }
          return {
            ...current,
            status: 'interrupted',
            error: { code: 'stream_closed', message: '连接在收到结束标记前断开了' },
          }
        })
      } catch (error) {
        const apiError = toApiError(error)
        flushDeltas()
        if (apiError.code === 'aborted') {
          mutateTurn(sessionId, turn.id, (current) =>
            current.status === 'running' ? { ...current, status: 'interrupted' } : current,
          )
        } else {
          mutateTurn(sessionId, turn.id, (current) => ({
            ...current,
            status: 'error',
            error: { code: apiError.code, message: describeApiError(apiError, credentials) },
          }))
        }
      } finally {
        controllers.current.delete(sessionId)
        void refreshSessions()
      }
    },
    [credentials, ensureSession, flushDeltas, handleFrame, mutateTurn, refreshSessions],
  )

  const stop = useCallback(() => {
    if (activeId === null) return
    const sessionId = activeId
    const controller = controllers.current.get(sessionId)
    setTurnsBySession((prev) => {
      const list = prev[sessionId]
      if (list === undefined) return prev
      return {
        ...prev,
        [sessionId]: list.map((turn) => (turn.status === 'running' ? { ...turn, stopRequested: true } : turn)),
      }
    })
    // 先请求服务端停止（契约第 4 节），再等它自己收尾：只断流的话服务端会继续跑，
    // 而且拿不到 stopped 事件的 stopped/usage 汇总。
    void api.cancel(credentials, sessionId).then(
      () => {
        // 兜底：服务端 8 秒内没关流就本地断开，避免按钮点了没反应
        setTimeout(() => controllers.current.get(sessionId)?.abort(), 8000)
      },
      (error: unknown) => {
        const apiError: ApiError = toApiError(error)
        controllers.current.get(sessionId)?.abort()
        setTurnsBySession((prev) => {
          const list = prev[sessionId]
          if (list === undefined) return prev
          return {
            ...prev,
            [sessionId]: list.map((turn) =>
              turn.status === 'running'
                ? { ...turn, error: { code: apiError.code, message: describeApiError(apiError, credentials) } }
                : turn,
            ),
          }
        })
      },
    )
  }, [activeId, credentials])

  const decideApproval = useCallback(
    async (turn: TurnState, decision: 'approve' | 'deny', remember: boolean) => {
      const sessionId = activeId
      if (sessionId === null || turn.approval === null) return
      const actionId = turn.approval.id
      try {
        await api.approve(credentials, sessionId, { actionId, decision, remember })
        mutateTurn(sessionId, turn.id, (current) => ({
          ...current,
          approvalOutcome: decision,
          approval: null,
        }))
      } catch (error) {
        const apiError = toApiError(error)
        if (apiError.code === 'stale_approval' || apiError.status === 409) {
          mutateTurn(sessionId, turn.id, (current) => ({ ...current, approvalOutcome: 'stale', approval: null }))
          return
        }
        mutateTurn(sessionId, turn.id, (current) => ({
          ...current,
          error: { code: apiError.code, message: describeApiError(apiError, credentials) },
        }))
      }
    },
    [activeId, credentials, mutateTurn],
  )

  // ---- 配置 ----

  const saveConfig = useCallback(
    async (patch: ConfigPatch): Promise<boolean> => {
      try {
        const data = await api.patchConfig(credentials, patch)
        setConfig({ status: 'ready', data, error: null })
        // 工作区变了，会话列表跟着变（契约第 2 节）
        if (patch.workspace !== undefined) {
          setActiveId(null)
          setTurnsBySession({})
          setTranscript({ status: 'idle', error: null })
          await refreshSessions()
        }
        return true
      } catch (error) {
        setConfig((prev) => ({ ...prev, status: 'error', error: describeApiError(toApiError(error), credentials) }))
        return false
      }
    },
    [credentials, refreshSessions],
  )

  const setCredentials = useCallback((next: Credentials) => {
    const normalized: Credentials = { baseUrl: next.baseUrl.trim(), token: next.token.trim() }
    saveCredentials(normalized)
    setCredentialsState(normalized)
    // 换服务端 = 换一整套数据，本地状态全部清空（否则会看到上一台机器的会话）
    setActiveId(null)
    setTurnsBySession({})
    setTranscript({ status: 'idle', error: null })
    setSessions({ status: 'loading', items: [], error: null })
    setConfig({ status: 'idle', data: null, error: null })
    setTools({ status: 'idle', items: [], error: null })
  }, [])

  // 卸载时断开所有流（不断的话组件已卸载、回调还在 setState）
  useEffect(() => {
    const map = controllers.current
    return () => {
      for (const controller of map.values()) controller.abort()
      map.clear()
    }
  }, [])

  // 首次拉到会话列表后自动进入最近一个会话（没有就停在空态，发第一条时再建）
  useEffect(() => {
    if (activeId !== null) return
    if (sessions.status !== 'ready') return
    const first = sessions.items[0]
    if (first !== undefined) openSession(first.id)
  }, [activeId, openSession, sessions.items, sessions.status])

  return {
    credentials,
    setCredentials,
    connection,
    retryConnection,
    sessions,
    activeId,
    openSession,
    newSession,
    removeSession,
    reloadSession,
    turns,
    streamingSessionIds,
    isStreaming: streamingSessionIds.has(activeId ?? ''),
    transcript,
    send,
    stop,
    decideApproval,
    config,
    loadConfig,
    saveConfig,
    tools,
    loadTools,
    refreshSessions,
  }
}

function asRecord(value: unknown): Record<string, unknown> | null {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return null
  return value as Record<string, unknown>
}

function normalizePendingAction(action: Record<string, unknown>): PendingActionLike {
  const preview = asRecord(action['preview']) ?? {}
  const source = asRecord(action['source']) ?? {}
  const decision = asRecord(source['decision']) ?? {}
  const affectedFiles = Array.isArray(preview['affectedFiles'])
    ? preview['affectedFiles'].map((item) => {
        const record = asRecord(item) ?? {}
        const path = typeof record['path'] === 'string' ? record['path'] : ''
        const changeType = typeof record['changeType'] === 'string' ? record['changeType'] : 'modify'
        const diff = typeof record['diffPreview'] === 'string' ? record['diffPreview'] : undefined
        return diff === undefined ? { path, changeType } : { path, changeType, diffPreview: diff }
      })
    : []
  const risk = preview['riskLevel']
  return {
    id: typeof action['id'] === 'string' ? action['id'] : '',
    runId: typeof action['runId'] === 'string' ? action['runId'] : '',
    createdAt: typeof action['createdAt'] === 'number' ? action['createdAt'] : Date.now(),
    source: {
      thought: typeof source['thought'] === 'string' ? source['thought'] : '',
      decision: {
        type: 'Action',
        tool: typeof decision['tool'] === 'string' ? decision['tool'] : '',
        params: asRecord(decision['params']) ?? {},
      },
    },
    preview: {
      tool: typeof preview['tool'] === 'string' ? preview['tool'] : '',
      summary: typeof preview['summary'] === 'string' ? preview['summary'] : '模型请求执行一个需要确认的操作',
      affectedFiles,
      riskLevel: risk === 'medium' || risk === 'high' ? risk : 'low',
    },
    status: typeof action['status'] === 'string' ? action['status'] : 'pending',
    expiresAt: typeof action['expiresAt'] === 'number' ? action['expiresAt'] : Date.now(),
  }
}

function normalizeRunFinished(record: Record<string, unknown> | null): RunFinishedInfo {
  const usage = asRecord(record?.['usage'])
  const fileChanges = Array.isArray(record?.['fileChanges'])
    ? record['fileChanges'].map((item) => {
        const entry = asRecord(item) ?? {}
        return {
          tool: typeof entry['tool'] === 'string' ? entry['tool'] : '',
          path: typeof entry['path'] === 'string' ? entry['path'] : '',
        }
      })
    : []
  return {
    runId: typeof record?.['runId'] === 'string' ? record['runId'] : '',
    stopReason: record?.['stopReason'] ?? null,
    usage:
      usage === null || typeof usage['totalTokens'] !== 'number'
        ? null
        : {
            promptTokens: typeof usage['promptTokens'] === 'number' ? usage['promptTokens'] : 0,
            completionTokens: typeof usage['completionTokens'] === 'number' ? usage['completionTokens'] : 0,
            totalTokens: usage['totalTokens'],
          },
    fileChanges,
    iterations: typeof record?.['iterations'] === 'number' ? record['iterations'] : null,
  }
}
