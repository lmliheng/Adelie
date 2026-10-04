// src/lib/shortcuts.ts
//
// 键位分发器与命令表 —— 全是纯函数，不碰 DOM。
//
// 为什么要先有分发器再谈命令面板：界面上的键盘行为原本散在五处原生 `keydown` 监听里
// （App / SettingsDialog / UsersDialog…），每加一个快捷键就要再写一个监听、再想一次
// 「会不会和别的冲突」。把「按键 → 命令 id」这条映射收进一个纯函数之后，命令面板只是
// 这份命令表的另一张脸：面板里能搜索、能点击执行的，和按快捷键执行的是**同一批对象**，
// 不会出现「面板列了但按不出来」或反过来的分叉。
//
// 这里刻意只做三件事：解析键位规格（`"mod+k"`）、把事件归一成一个键位、从命令表里挑出
// 命中的那条。真正的副作用（打开哪个面板、切什么主题）由调用方在 `run()` 里给。

/** 一个归一化后的键位。`mod` = Ctrl（Windows/Linux）或 ⌘（macOS），由平台决定怎么显示 */
export interface KeyChord {
  /** 归一化键名：小写；空格是 `space`、Esc 是 `escape` */
  key: string
  mod: boolean
  shift: boolean
  alt: boolean
}

export type Platform = 'mac' | 'other'

/** 一条可执行命令。`chord` 缺省表示「只能在命令面板里选，没有快捷键」 */
export interface ShortcutCommand {
  id: string
  title: string
  group: string
  chord?: KeyChord
  /** 只有管理员能用：面板上标出来，调用方负责在建表时按身份过滤 */
  adminOnly?: boolean
  run: () => void
}

const MOD_ALIASES = new Set(['mod', 'cmd', 'ctrl', 'meta'])

function normalizeKeyName(name: string): string {
  if (name === ' ') return 'space'
  if (name === 'esc') return 'escape'
  if (name === 'return') return 'enter'
  return name
}

/**
 * 解析 `"mod+shift+k"` 这样的规格。认不出来返回 null（而不是抛错）：
 * 一条写错的键位不该让整张命令表加载失败，跳过它是更稳的失败方式。
 */
export function parseChord(spec: string): KeyChord | null {
  const parts = spec
    .toLowerCase()
    .split('+')
    .map((part) => part.trim())
    .filter((part) => part !== '')
  if (parts.length === 0) return null

  const chord: KeyChord = { key: '', mod: false, shift: false, alt: false }
  for (const part of parts) {
    if (MOD_ALIASES.has(part)) {
      chord.mod = true
      continue
    }
    if (part === 'shift') {
      chord.shift = true
      continue
    }
    if (part === 'alt' || part === 'option') {
      chord.alt = true
      continue
    }
    // 其余一律当键名，且只允许出现一个（`"a+b"` 是写错了，宁可判成 null）
    if (chord.key !== '') return null
    chord.key = normalizeKeyName(part)
  }
  if (chord.key === '') return null
  return chord
}

/** 显示用的键名。字母大写，`space`/`escape` 这些给人话 */
export function displayKey(key: string): string {
  if (key === 'space') return 'Space'
  if (key === 'escape') return 'Esc'
  if (key === 'enter') return 'Enter'
  if (key === 'arrowup') return '↑'
  if (key === 'arrowdown') return '↓'
  if (key === 'arrowleft') return '←'
  if (key === 'arrowright') return '→'
  if (key.length === 1) return key.toUpperCase()
  return key
}

/**
 * 键位的显示文本。mac 走 ⌘K 那种无分隔的记法，其余走 `Ctrl+K`。
 * 平台由调用方传进来而不是在这里读 `navigator` —— 这样它能被测，也不会在服务端渲染时炸。
 */
export function chordLabel(chord: KeyChord, platform: Platform): string {
  const mac = platform === 'mac'
  const parts: string[] = []
  if (chord.mod) parts.push(mac ? '⌘' : 'Ctrl')
  if (chord.alt) parts.push(mac ? '⌥' : 'Alt')
  if (chord.shift) parts.push(mac ? '⇧' : 'Shift')
  parts.push(displayKey(chord.key))
  return mac ? parts.join('') : parts.join('+')
}

/** 从 navigator 猜平台。只在真的没有 navigator 时才落到 `other` */
export function detectPlatform(nav?: { platform?: string; userAgent?: string } | null): Platform {
  const source = `${nav?.platform ?? ''} ${nav?.userAgent ?? ''}`.toLowerCase()
  return /mac|iphone|ipad|ipod/.test(source) ? 'mac' : 'other'
}

function normalizeEventKey(key: string): string {
  // 带 Shift 时字母会给成大写、空格仍是 ' '；统一成小写键名再比
  if (key === ' ') return 'space'
  if (key === 'Esc') return 'escape'
  return key.toLowerCase()
}

/** 把一次按键归一成键位。`mod` 同时认 Ctrl 与 ⌘，这样一条规格能覆盖两个平台 */
export function eventChord(event: KeyboardEvent): KeyChord {
  return {
    key: normalizeEventKey(event.key),
    mod: event.ctrlKey || event.metaKey,
    shift: event.shiftKey,
    alt: event.altKey,
  }
}

/**
 * 焦点是否在输入控件里（决定「裸键」要不要放行）。
 *
 * 用鸭子类型而不是 `instanceof HTMLElement`：单测跑在 node 环境（没有 DOM 全局），
 * 一个 `instanceof` 会让整个模块在那儿直接抛 ReferenceError，而这条判断本身不需要 DOM。
 */
export function isTypingTarget(target: EventTarget | null): boolean {
  if (target === null || typeof target !== 'object') return false
  const element = target as { tagName?: unknown; isContentEditable?: unknown }
  const tag = typeof element.tagName === 'string' ? element.tagName.toUpperCase() : ''
  if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return true
  return element.isContentEditable === true
}

function isPrintable(key: string): boolean {
  return key.length === 1 || key === 'space'
}

/** 键位与事件是否完全一致（mod/shift/alt 都要对上，避免 `mod+k` 被 `mod+shift+k` 误触） */
export function matchChord(chord: KeyChord, event: KeyboardEvent): boolean {
  const actual = eventChord(event)
  return (
    chord.key === actual.key &&
    chord.mod === actual.mod &&
    chord.shift === actual.shift &&
    chord.alt === actual.alt
  )
}

/**
 * 挑出这次按键对应的命令。
 *
 * 一条要紧的规矩：**在输入框里敲不带修饰键的可打印字符（或空格）不触发命令**。
 * 否则用户在输入框里打一个字母把面板打开了，键盘就成了敌人的东西。
 * Esc / Enter / 方向键这类不算可打印字符，照常放行（关闭、选择还得靠它们）。
 */
export function resolveShortcut(
  event: KeyboardEvent,
  commands: readonly ShortcutCommand[],
): ShortcutCommand | null {
  const actual = eventChord(event)
  if (isTypingTarget(event.target) && !actual.mod && !actual.alt && isPrintable(actual.key)) {
    return null
  }
  for (const command of commands) {
    if (command.chord !== undefined && matchChord(command.chord, event)) return command
  }
  return null
}

/** 一条文本对查询串的匹配分。前缀 > 词首前缀 > 包含 > 子序列，越大越靠前 */
function scoreText(text: string, query: string): number {
  const haystack = text.toLowerCase()
  if (query === '') return 0
  if (haystack === query) return 1000
  if (haystack.startsWith(query)) return 800 - Math.min(haystack.length - query.length, 99)
  const boundary = haystack.replace(/[\s\-_./]/g, ' ')
  if (boundary.split(' ').some((word) => word.startsWith(query))) return 650
  const at = haystack.indexOf(query)
  if (at >= 0) return 450 - Math.min(at, 99)
  if (subsequence(haystack, query)) return 120
  return 0
}

function subsequence(haystack: string, needle: string): boolean {
  if (needle === '') return true
  let index = 0
  for (const char of haystack) {
    if (char === needle[index]) index += 1
    if (index === needle.length) return true
  }
  return false
}

export function matchScore(command: ShortcutCommand, query: string): number {
  const normalized = query.trim().toLowerCase()
  if (normalized === '') return 1
  return Math.max(
    scoreText(command.title, normalized),
    scoreText(command.group, normalized) * 0.6,
    scoreText(command.id, normalized) * 0.5,
  )
}

/** 过滤并排序命令表。空查询原样返回（保持调用方给的顺序） */
export function filterCommands(
  commands: readonly ShortcutCommand[],
  query: string,
): ShortcutCommand[] {
  const normalized = query.trim().toLowerCase()
  if (normalized === '') return [...commands]
  return commands
    .map((command, index) => ({ command, index, score: matchScore(command, normalized) }))
    .filter((entry) => entry.score > 0)
    // 同分时用原顺序兜底，排序才是稳定的（否则每次输入光标都会跳）
    .sort((a, b) => b.score - a.score || a.index - b.index)
    .map((entry) => entry.command)
}
