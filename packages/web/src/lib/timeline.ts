// src/lib/timeline.ts
//
// 事件流 → 时间线条目（纯函数，见 timeline.test.ts）。
//
// 这是「agent 在干什么」的可视化层。两条要求决定了它的形状：
//   1. **历史与实时走同一个函数** —— 回放（GET /api/sessions/:id 的 events）与
//      实时（SSE 的 event 帧）产生的条目必须一模一样，否则「重开一次会话」看到的
//      东西会变。
//   2. **不静默丢东西** —— 认不出来的事件类型也要出一条（kind: 'unknown'），
//      否则新版本服务端加了事件，前端看上去就是「什么都没发生」。
//
// 输入是 wire 上的 unknown，所以每个字段都做收窄；坏数据退化成「尽力显示」，
// 绝不抛错 —— 一条坏事件不该让整段历史渲染不出来。

import type { SessionEventLike } from '../api/types'

export type ToolStatus = 'pending' | 'ok' | 'failed'

export interface ToolEntry {
  kind: 'tool'
  id: string
  at: number
  tool: string
  /** 中文标签（读取文件 / 执行命令 …），认不出的工具用原名 */
  label: string
  /** 一行参数摘要 */
  callSummary: string
  /** 展开后显示的完整参数（JSON 文本） */
  paramsJson: string
  status: ToolStatus
  /** 一行结果摘要 */
  resultSummary: string
  /** 展开后显示的完整结果（JSON/文本），没有可显示内容时为 null */
  resultDetail: string | null
  /** 送进模型的那一份被输出预算截断过 */
  truncated: boolean
  /** 原始字符数 / 送达字符数，缺省 null */
  delivery: { rawChars: number; deliveredChars: number } | null
  /** 这一批动作里有几个（>1 表示模型一轮下了多个工具调用） */
  batchSize: number
  thought: string | null
}

export interface ApprovalEntry {
  kind: 'approval'
  id: string
  at: number
  actionId: string
  tool: string
  summary: string
  riskLevel: string
  affectedFiles: string[]
  decision: 'approve' | 'reject' | 'unknown'
  /** 决定的来源：人 / 策略 / 超时 / 回调出错 */
  source: string
  requestedAt: number
  decidedAt: number
}

export interface FoldedEntry {
  kind: 'context_folded'
  id: string
  at: number
  keepRuns: number
  keepObservations: number
  reason: string
}

export interface UnknownEntry {
  kind: 'unknown'
  id: string
  at: number
  type: string
}

export type TimelineEntry = ToolEntry | ApprovalEntry | FoldedEntry | UnknownEntry

export interface RunSummary {
  usage: { promptTokens: number; completionTokens: number; totalTokens: number; cacheHitTokens: number | null } | null
  iterations: number | null
  toolCalls: number | null
  stopReason: string
  stopDetail: string | null
  fileChanges: Array<{ tool: string; path: string }>
}

export interface TimelineView {
  entries: TimelineEntry[]
  /** run 汇总（stopped 事件），没有就是 null */
  summary: RunSummary | null
  /** 这一轮的最终回答（Final 决策），历史回放时它是正文来源 */
  answer: string | null
}

const EMPTY_VIEW: TimelineView = { entries: [], summary: null, answer: null }

/** 工具名 → 中文标签。仅用于显示，认不出就显示原名 */
const TOOL_LABELS: Record<string, string> = {
  read_file: '读取文件',
  write_file: '写入文件',
  create_file: '新建文件',
  edit_file: '编辑文件',
  apply_diff: '应用补丁',
  delete_file: '删除文件',
  move_file: '移动文件',
  list_files: '列出文件',
  read_directory: '浏览目录',
  glob: '匹配文件',
  search_code: '搜索代码',
  run_command: '执行命令',
  git_operation: 'Git 操作',
  fetch_url: '抓取网页',
  tool_search: '检索工具',
  tool_call: '调用工具',
}

export function mapEventsToTimeline(events: readonly SessionEventLike[]): TimelineView {
  if (events.length === 0) return EMPTY_VIEW

  const entries: TimelineEntry[] = []
  // 先配对：某条决策吃掉了哪些观察。被吃掉的观察不再单独成卡，
  // 否则一次工具调用会在时间线上出现两遍（「调用」一次、「结果」一次）。
  const pairs = pairObservations(events)
  let summary: RunSummary | null = null
  let answer: string | null = null

  for (let index = 0; index < events.length; index += 1) {
    const event = events[index]
    if (event === undefined) continue
    const id = `e${index}`
    const at = event.ts
    const payload = asRecord(event.payload)

    if (event.type === 'decision') {
      // Final 决策是这一轮的回答：历史上它就是正文；实时流里正文来自 delta，
      // 两者存在同一个字段上也没关系（实时那份更长更新，见 TurnView 的取值顺序）。
      const decision = asRecord(payload?.['decision'])
      const type = asString(decision?.['type'])
      if (type === 'Final') {
        const text = asString(decision?.['answer'])
        if (text !== null && text !== '') answer = text
        continue
      }
      // 计划不再是运行时状态：它是模型自己用普通文件工具维护的一个文件
      // （会话草稿目录里的 PLAN.md），所以在时间线上就是普通的写/改文件工具卡，
      // 这里不再有 Replan 决策一类需要特判的形状。
      const actions = collectActions(decision)
      if (actions.length === 0) continue
      const observations = pairs.byDecision.get(index) ?? []
      actions.forEach((action, actionIndex) => {
        // id 必须唯一：批量动作里多条卡片来自同一个事件，React 的 key 也用它
        const entryId = actions.length > 1 ? `${id}-a${actionIndex}` : id
        entries.push(buildToolEntry(entryId, at, action, actions.length, observations[actionIndex] ?? null))
      })
      continue
    }

    if (event.type === 'observation') {
      // 已经被上面的决策吃掉的观察不再重复出卡
      if (pairs.consumed.has(index)) continue
      // 走到这里说明观察没有对应的决策（老日志/异常），按「只有结果的卡片」显示，而不是丢掉。
      const observation = asRecord(payload?.['observation'])
      const action = asRecord(observation?.['action'])
      entries.push(
        buildToolEntry(
          id,
          at,
          {
            tool: asString(action?.['tool']) ?? 'unknown',
            params: asRecord(action?.['params']) ?? {},
            thought: asString(action?.['thought']) ?? '',
          },
          1,
          observation === null ? null : { result: observation['result'], delivery: observation['delivery'] },
        ),
      )
      continue
    }

    if (event.type === 'approval') {
      const approval = asRecord(payload?.['approval'])
      entries.push({
        kind: 'approval',
        id,
        at,
        actionId: asString(approval?.['id']) ?? '',
        tool: asString(approval?.['tool']) ?? 'unknown',
        summary: asString(approval?.['summary']) ?? '',
        riskLevel: asString(approval?.['riskLevel']) ?? 'low',
        affectedFiles: asStringArray(approval?.['affectedFiles']),
        decision: asString(approval?.['decision']) === 'approve' ? 'approve' : asString(approval?.['decision']) === 'reject' ? 'reject' : 'unknown',
        source: asString(approval?.['source']) ?? 'unknown',
        requestedAt: asNumber(approval?.['requestedAt']) ?? at,
        decidedAt: asNumber(approval?.['decidedAt']) ?? at,
      })
      continue
    }

    if (event.type === 'context_folded') {
      entries.push({
        kind: 'context_folded',
        id,
        at,
        keepRuns: asNumber(payload?.['keepRuns']) ?? 0,
        keepObservations: asNumber(payload?.['keepObservations']) ?? 0,
        reason: asString(payload?.['reason']) ?? '',
      })
      continue
    }

    if (event.type === 'stopped') {
      summary = buildSummary(payload)
      continue
    }

    if (event.type === 'task_started') continue

    entries.push({ kind: 'unknown', id, at, type: event.type })
  }

  // 计划与验收都不是运行时事件：前者是模型自己维护的文件（普通工具卡），
  // 后者是模型自己跑的项目命令（普通工具卡）。时间线上不再有它们的专门条目。
  return { entries, summary, answer }
}

interface RawAction {
  tool: string
  params: Record<string, unknown>
  thought: string
}

function collectActions(decision: Record<string, unknown> | null): RawAction[] {
  if (decision === null) return []
  const type = asString(decision['type'])
  if (type === 'Action') return [toAction(decision)]
  if (type === 'BatchAction') {
    const raw = decision['actions']
    if (!Array.isArray(raw)) return []
    return raw.map((item) => toAction(asRecord(item) ?? {})).filter((action) => action.tool !== '')
  }
  return []
}

function toAction(record: Record<string, unknown>): RawAction {
  return {
    tool: asString(record['tool']) ?? '',
    params: asRecord(record['params']) ?? {},
    thought: asString(record['thought']) ?? '',
  }
}

interface RawObservation {
  result: unknown
  delivery: unknown
}

function buildToolEntry(
  id: string,
  at: number,
  action: RawAction,
  batchSize: number,
  observation: RawObservation | null,
): ToolEntry {
  // 决策事件自己带的是「模型要做什么」；观察事件带的是「做了什么、结果如何」。
  // 两者合并成一张卡：一次工具调用在时间线上就该是一行，而不是「调用」+「结果」两行。
  const result = observation === null ? null : asRecord(observation.result)
  const delivery = observation === null ? null : asRecord(observation.delivery)

  const success = result === null ? null : result['success'] === true
  const errorText = result === null ? null : asString(result['error'])
  const display = result === null ? null : asString(result['display'])
  const data = result === null ? null : result['data']

  return {
    kind: 'tool',
    id,
    at,
    tool: action.tool,
    label: TOOL_LABELS[action.tool] ?? action.tool,
    callSummary: summarizeToolCall(action.tool, action.params),
    paramsJson: safeJson(action.params),
    status: result === null ? 'pending' : success === true ? 'ok' : 'failed',
    resultSummary:
      errorText !== null && errorText !== ''
        ? truncateMiddle(errorText, 160)
        : display !== null && display !== ''
          ? truncateMiddle(display, 160)
          : summarizeData(data),
    resultDetail: buildResultDetail(data, errorText),
    truncated: delivery?.['truncated'] === true,
    delivery:
      delivery !== null && typeof delivery['rawChars'] === 'number' && typeof delivery['deliveredChars'] === 'number'
        ? { rawChars: delivery['rawChars'], deliveredChars: delivery['deliveredChars'] }
        : null,
    batchSize,
    thought: action.thought === '' ? null : action.thought,
  }
}

/**
 * 把「决策 → 它产生的观察」配对。
 *
 * 批量动作（BatchAction）里模型一轮下了多个工具调用，观察按同样的顺序紧跟其后，
 * 所以「第 i 个动作配第 i 个观察」比「按工具名匹配」更准 —— 同一批里同名工具
 * 出现两次是很常见的（比如并行读两个文件），按名字匹配会把两张卡都指向同一次结果。
 *
 * 返回两份东西：每条决策索引对应的观察列表，以及所有被消费掉的观察索引
 * （用来避免观察再单独成卡）。
 */
function pairObservations(events: readonly SessionEventLike[]): {
  byDecision: Map<number, RawObservation[]>
  consumed: Set<number>
} {
  const byDecision = new Map<number, RawObservation[]>()
  const consumed = new Set<number>()

  for (let index = 0; index < events.length; index += 1) {
    const event = events[index]
    if (event === undefined || event.type !== 'decision') continue
    const payload = asRecord(event.payload)
    const decision = asRecord(payload?.['decision'])
    const actions = collectActions(decision)
    if (actions.length === 0) continue

    const observations: RawObservation[] = []
    for (let cursor = index + 1; cursor < events.length && observations.length < actions.length; cursor += 1) {
      const candidate = events[cursor]
      if (candidate === undefined) continue
      if (candidate.type === 'observation') {
        const observationPayload = asRecord(candidate.payload)
        const observation = asRecord(observationPayload?.['observation'])
        observations.push({ result: observation?.['result'], delivery: observation?.['delivery'] })
        consumed.add(cursor)
        continue
      }
      if (candidate.type === 'decision' || candidate.type === 'stopped') break
    }
    if (observations.length > 0) byDecision.set(index, observations)
  }

  return { byDecision, consumed }
}

function buildSummary(payload: Record<string, unknown> | null): RunSummary {
  const usage = asRecord(payload?.['tokenUsage'])
  const fileChanges = Array.isArray(payload?.['fileChanges'])
    ? payload['fileChanges'].map((item) => {
        const record = asRecord(item) ?? {}
        return { tool: asString(record['tool']) ?? '', path: asString(record['path']) ?? '' }
      })
    : []
  return {
    usage:
      usage === null
        ? null
        : {
            promptTokens: asNumber(usage['promptTokens']) ?? 0,
            completionTokens: asNumber(usage['completionTokens']) ?? 0,
            totalTokens: asNumber(usage['totalTokens']) ?? 0,
            cacheHitTokens: asNumber(usage['cacheHitTokens']),
          },
    iterations: asNumber(payload?.['iterationCount']),
    toolCalls: asNumber(payload?.['toolCallCount']),
    stopReason: describeStopReason(payload?.['stopReason']).text,
    stopDetail: describeStopReason(payload?.['stopReason']).detail,
    fileChanges,
  }
}

/** 停止原因 → 中文短语 + 补充说明。契约里它是联合类型，但 wire 上可能是未知形状 */
export function describeStopReason(raw: unknown): { text: string; detail: string | null } {
  if (raw === undefined || raw === null) return { text: '已结束', detail: null }
  // 契约里 cancelled 出现在 docs（第 4 节）而 core 的类型叫 user_interrupted，两者都认
  const record = typeof raw === 'string' ? { type: raw } : asRecord(raw)
  const type = asString(record?.['type']) ?? (typeof raw === 'string' ? raw : 'unknown')
  switch (type) {
    case 'task_completed':
      return { text: '任务完成', detail: null }
    case 'user_interrupted':
    case 'cancelled':
      return { text: '已被取消', detail: null }
    case 'max_iterations':
      return { text: '达到最大迭代数', detail: `上限 ${asNumber(record?.['limit']) ?? '?'}` }
    case 'max_tool_calls':
      return { text: '达到工具调用上限', detail: `上限 ${asNumber(record?.['limit']) ?? '?'}` }
    case 'max_tokens':
      return { text: '达到 token 上限', detail: `上限 ${asNumber(record?.['limit']) ?? '?'}` }
    case 'max_file_changes':
      return { text: '达到文件变更上限', detail: `上限 ${asNumber(record?.['limit']) ?? '?'}` }
    case 'timeout':
      return { text: '模型响应超时', detail: `${asNumber(record?.['durationMs']) ?? '?'} ms` }
    case 'no_progress':
      return { text: '没有进展', detail: `${asString(record?.['tool']) ?? '?'} 连续 ${asNumber(record?.['repeats']) ?? '?'} 次结果相同` }
    case 'error':
      return { text: '执行出错', detail: asString(record?.['message']) }
    default:
      return { text: type, detail: null }
  }
}

/** 参数摘要：按工具语义挑出最关键的两三个字段，一行说完 */
export function summarizeToolCall(tool: string, params: Record<string, unknown>): string {
  const path = asString(params['path']) ?? asString(params['file']) ?? asString(params['filePath'])
  switch (tool) {
    case 'read_file': {
      const start = asNumber(params['startLine'])
      const end = asNumber(params['endLine'])
      const range = start !== null ? ` · 第 ${start}–${end ?? '末'} 行` : ''
      return `${path ?? '?'}${range}`
    }
    case 'write_file':
    case 'create_file': {
      const content = asString(params['content'])
      const size = content === null ? null : `${content.length} 字符`
      return [path ?? '?', size].filter((part): part is string => part !== null).join(' · ')
    }
    case 'edit_file':
    case 'apply_diff':
    case 'delete_file':
    case 'move_file':
      return [path ?? '?', asString(params['destination']) ?? asString(params['newPath'])].filter((p): p is string => p !== null).join(' → ')
    case 'run_command': {
      const command = asString(params['command']) ?? asString(params['cmd']) ?? '?'
      return truncateMiddle(command.replace(/\s+/g, ' '), 140)
    }
    case 'list_files':
    case 'read_directory':
      return path ?? asString(params['directory']) ?? '.'
    case 'glob':
      return asString(params['pattern']) ?? path ?? '?'
    case 'search_code': {
      const query = asString(params['query']) ?? asString(params['pattern']) ?? '?'
      return [truncateMiddle(query, 60), path].filter((p): p is string => p !== null).join(' · ')
    }
    case 'fetch_url':
      return truncateMiddle(asString(params['url']) ?? '?', 120)
    case 'git_operation':
      return [asString(params['operation']) ?? '?', asString(params['args']) ?? ''].join(' ').trim()
    case 'tool_search':
      return asString(params['query']) ?? '?'
    case 'tool_call':
      return asString(params['name']) ?? asString(params['tool']) ?? '?'
    default: {
      const pairs = Object.entries(params)
        .filter(([, value]) => value !== null && value !== undefined && value !== '')
        .slice(0, 3)
        .map(([key, value]) => `${key}=${truncateMiddle(stringifyCompact(value), 48)}`)
      return pairs.length > 0 ? pairs.join(' · ') : '（无参数）'
    }
  }
}

/** 结果摘要：优先用工具自己给的人读摘要（ToolResult.display），否则压一压 data */
export function summarizeData(data: unknown): string {
  if (data === null || data === undefined) return '（无输出）'
  if (typeof data === 'string') return truncateMiddle(data.replace(/\s+/g, ' ').trim(), 160) || '（空输出）'
  if (typeof data === 'number' || typeof data === 'boolean') return String(data)
  if (Array.isArray(data)) return `${data.length} 项`
  const record = asRecord(data)
  if (record !== null) {
    // 常见形状优先：先看人类可读的字段
    for (const key of ['summary', 'message', 'text', 'content', 'output', 'stdout']) {
      const value = record[key]
      if (typeof value === 'string' && value.trim() !== '') return truncateMiddle(value.replace(/\s+/g, ' ').trim(), 160)
    }
    const keys = Object.keys(record)
    const head = keys.slice(0, 4).map((key) => `${key}=${truncateMiddle(stringifyCompact(record[key]), 32)}`)
    return truncateMiddle(`${keys.length} 个字段 · ${head.join(' · ')}`, 180)
  }
  return truncateMiddle(stringifyCompact(data), 160)
}

/** 展开后显示的完整结果 */
function buildResultDetail(data: unknown, errorText: string | null): string | null {
  if (errorText !== null && errorText !== '') {
    const dataText = data === null || data === undefined ? '' : `\n\n${safeJson(data)}`
    return `错误：${errorText}${dataText}`
  }
  if (data === null || data === undefined) return null
  if (typeof data === 'string') return data.length > 20_000 ? `${data.slice(0, 20_000)}\n… （已截断显示）` : data
  return safeJson(data)
}

/** 中间省略的截断：前缀 + 尾缀，比只留前缀更容易判断内容 */
export function truncateMiddle(text: string, max: number): string {
  if (text.length <= max) return text
  const head = Math.ceil((max - 1) / 2)
  const tail = Math.floor((max - 1) / 2)
  return `${text.slice(0, head)}…${text.slice(text.length - tail)}`
}

function safeJson(value: unknown): string {
  try {
    const text = JSON.stringify(value, null, 2)
    return text === undefined ? String(value) : text
  } catch {
    // 循环引用等：退化成 String()，显示不好看但不至于崩
    return String(value)
  }
}

function stringifyCompact(value: unknown): string {
  if (typeof value === 'string') return value
  try {
    return JSON.stringify(value) ?? String(value)
  } catch {
    return String(value)
  }
}

function asRecord(value: unknown): Record<string, unknown> | null {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return null
  return value as Record<string, unknown>
}

function asString(value: unknown): string | null {
  return typeof value === 'string' ? value : null
}

function asNumber(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null
}

function asStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return []
  return value.filter((item): item is string => typeof item === 'string')
}
