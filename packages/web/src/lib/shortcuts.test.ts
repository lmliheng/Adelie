// src/lib/shortcuts.test.ts
//
// 键位分发是「按一个键做对的事」这条规矩的唯一出口，所以这几条要被钉住：
// 规格解析、平台显示、事件归一、输入框里放不放行、匹配的严格度、命令过滤的排序。

import { describe, expect, it, vi } from 'vitest'
import {
  chordLabel,
  detectPlatform,
  displayKey,
  eventChord,
  filterCommands,
  isTypingTarget,
  matchChord,
  matchScore,
  parseChord,
  resolveShortcut,
  type ShortcutCommand,
} from './shortcuts'

/** 造一个够用的键盘事件；单测不需要真的 DOM */
function keyEvent(
  key: string,
  options: { ctrl?: boolean; meta?: boolean; shift?: boolean; alt?: boolean; target?: unknown } = {},
): KeyboardEvent {
  return {
    key,
    ctrlKey: options.ctrl === true,
    metaKey: options.meta === true,
    shiftKey: options.shift === true,
    altKey: options.alt === true,
    target: options.target ?? null,
  } as unknown as KeyboardEvent
}

function command(id: string, title: string, group = '通用', chord?: string): ShortcutCommand {
  const parsed = chord === undefined ? null : parseChord(chord)
  return {
    id,
    title,
    group,
    ...(parsed === null ? {} : { chord: parsed }),
    run: vi.fn(),
  }
}

describe('parseChord', () => {
  it('mod 是 Ctrl/⌘ 的抽象', () => {
    expect(parseChord('mod+k')).toEqual({ key: 'k', mod: true, shift: false, alt: false })
    expect(parseChord('Mod+Shift+K')).toEqual({ key: 'k', mod: true, shift: true, alt: false })
    expect(parseChord('meta+,')).toEqual({ key: ',', mod: true, shift: false, alt: false })
  })

  it('别名与规范名都认', () => {
    expect(parseChord('esc')).toEqual({ key: 'escape', mod: false, shift: false, alt: false })
    expect(parseChord('option+k')).toEqual({ key: 'k', mod: false, shift: false, alt: true })
  })

  it('认不出来返回 null，而不是抛错', () => {
    expect(parseChord('')).toBeNull()
    expect(parseChord('   ')).toBeNull()
    expect(parseChord('mod+')).toBeNull()
    expect(parseChord('a+b')).toBeNull()
  })
})

describe('chordLabel / detectPlatform', () => {
  const chord = parseChord('mod+shift+k')
  if (chord === null) throw new Error('测试自检失败')

  it('mac 与其它平台两套记法', () => {
    expect(chordLabel(chord, 'mac')).toBe('⌘⇧K')
    expect(chordLabel(chord, 'other')).toBe('Ctrl+Shift+K')
  })

  it('Esc / Space 是人话', () => {
    expect(displayKey('escape')).toBe('Esc')
    expect(displayKey('space')).toBe('Space')
    expect(displayKey('a')).toBe('A')
  })

  it('从 navigator 猜平台', () => {
    expect(detectPlatform({ platform: 'MacIntel' })).toBe('mac')
    expect(detectPlatform({ userAgent: 'Mozilla/5.0 (iPhone)' })).toBe('mac')
    expect(detectPlatform({ platform: 'Win32' })).toBe('other')
    expect(detectPlatform(null)).toBe('other')
  })
})

describe('eventChord', () => {
  it('字母归一成小写，空格归一成 space，Ctrl 与 ⌘ 都算 mod', () => {
    expect(eventChord(keyEvent('K', { ctrl: true }))).toEqual({ key: 'k', mod: true, shift: false, alt: false })
    expect(eventChord(keyEvent(' ', { meta: true }))).toEqual({ key: 'space', mod: true, shift: false, alt: false })
    expect(eventChord(keyEvent('Escape'))).toEqual({ key: 'escape', mod: false, shift: false, alt: false })
  })
})

describe('isTypingTarget', () => {
  it('输入控件与 contenteditable 都算', () => {
    expect(isTypingTarget({ tagName: 'INPUT' } as unknown as EventTarget)).toBe(true)
    expect(isTypingTarget({ tagName: 'textarea' } as unknown as EventTarget)).toBe(true)
    expect(isTypingTarget({ isContentEditable: true } as unknown as EventTarget)).toBe(true)
    expect(isTypingTarget({ tagName: 'DIV' } as unknown as EventTarget)).toBe(false)
    expect(isTypingTarget(null)).toBe(false)
  })
})

describe('matchChord', () => {
  it('修饰键必须完全一致，`mod+k` 不该被 `mod+shift+k` 触发', () => {
    const chord = parseChord('mod+k')
    if (chord === null) throw new Error('测试自检失败')
    expect(matchChord(chord, keyEvent('k', { ctrl: true }))).toBe(true)
    expect(matchChord(chord, keyEvent('k', { ctrl: true, shift: true }))).toBe(false)
    expect(matchChord(chord, keyEvent('k'))).toBe(false)
  })
})

describe('resolveShortcut', () => {
  const commands = [command('palette', '打开命令面板', '通用', 'mod+k'), command('settings', '打开设置', '通用', 'mod+,')]

  it('按命中的键返回对应命令', () => {
    expect(resolveShortcut(keyEvent('k', { ctrl: true }), commands)?.id).toBe('palette')
    expect(resolveShortcut(keyEvent(',', { meta: true }), commands)?.id).toBe('settings')
  })

  it('没有对应键位时返回 null', () => {
    expect(resolveShortcut(keyEvent('j', { ctrl: true }), commands)).toBeNull()
  })

  it('输入框里敲裸字符不触发，但 Esc 这类非可打印键照常放行', () => {
    const input = { tagName: 'INPUT' } as unknown as EventTarget
    const bare = [command('go', '去某处', '通用', 'k')]
    expect(resolveShortcut(keyEvent('k', { target: input }), bare)).toBeNull()
    const esc = [command('close', '关闭', '通用', 'escape')]
    expect(resolveShortcut(keyEvent('Escape', { target: input }), esc)?.id).toBe('close')
  })

  it('没有配键位的命令不参与匹配', () => {
    const list = [command('nochord', '没有键位', '通用')]
    expect(resolveShortcut(keyEvent('k'), list)).toBeNull()
  })
})

describe('filterCommands', () => {
  const sessionNew = command('session.new', '新建会话', '会话')
  const commands = [
    sessionNew,
    command('session.list', '会话列表', '会话'),
    command('settings.open', '打开设置', '通用'),
    command('theme.toggle', '切换主题', '通用'),
  ]

  it('空查询原样返回', () => {
    expect(filterCommands(commands, '   ').map((c) => c.id)).toEqual(commands.map((c) => c.id))
  })

  it('前缀匹配排在包含匹配前面', () => {
    const ids = filterCommands(commands, '会话').map((c) => c.id)
    expect(ids.slice(0, 2).sort()).toEqual(['session.list', 'session.new'])
    expect(ids).not.toContain('theme.toggle')
  })

  it('支持子序列（跳过中间的字符也能找到，只是排在后面）', () => {
    const ids = filterCommands(commands, 'sgn').map((c) => c.id)
    expect(ids).toEqual(['settings.open'])
  })

  it('没匹配上就什么都不给', () => {
    expect(filterCommands(commands, 'zzzz')).toEqual([])
  })

  it('按 id 也能搜到', () => {
    expect(matchScore(sessionNew, 'new')).toBeGreaterThan(0)
    expect(filterCommands(commands, 'settings')[0]?.id).toBe('settings.open')
  })
})
