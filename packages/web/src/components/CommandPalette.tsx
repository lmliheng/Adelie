// src/components/CommandPalette.tsx
//
// 命令面板：一张可以搜的**命令表**，不是另一套功能。
//
// 它和快捷键共用同一批 `ShortcutCommand` 对象（`App.tsx` 里建表，这里只渲染），
// 所以「面板里能点的」和「按得出来的」永远是同一件事 —— 面板列的每一行都把它的
// 键位显示出来，那是这份表唯一的自证。
//
// 键位处理放在输入框自己的 `onKeyDown` 里、并 `stopPropagation`：面板开着的时候
// ↑↓/Enter/Esc 归它，别让 App 那层的全局分发器再插一手。

import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { Icon } from './Icon'
import { chordLabel, detectPlatform, filterCommands, type ShortcutCommand } from '../lib/shortcuts'

/** 面板一次最多列这么多条：再多眼就花了，剩下的靠继续输入缩小范围 */
const MAX_ITEMS = 12

export function CommandPalette({
  open,
  commands,
  onClose,
}: {
  open: boolean
  commands: readonly ShortcutCommand[]
  onClose: () => void
}): ReactNode {
  const [query, setQuery] = useState('')
  const [active, setActive] = useState(0)
  const inputRef = useRef<HTMLInputElement | null>(null)
  const listRef = useRef<HTMLDivElement | null>(null)

  const platform = useMemo(
    () => detectPlatform(typeof navigator === 'undefined' ? null : navigator),
    [],
  )
  const results = useMemo(
    () => filterCommands(commands, query).slice(0, MAX_ITEMS),
    [commands, query],
  )

  // 打开时清空查询、聚焦输入；关闭后把焦点还给打开它的那个元素
  useEffect(() => {
    if (!open) return
    const previous = document.activeElement instanceof HTMLElement ? document.activeElement : null
    setQuery('')
    setActive(0)
    inputRef.current?.focus()
    return () => previous?.focus()
  }, [open])

  // 结果集变了就把选中项收回第一条（否则光标会停在一个已经不在列表里的位置）
  useEffect(() => {
    setActive(0)
  }, [query])

  // 选中项滚进视野（列表可能比 MAX_ITEMS 高）
  useEffect(() => {
    const node = listRef.current?.children[active]
    if (node instanceof HTMLElement) node.scrollIntoView({ block: 'nearest' })
  }, [active, results])

  if (!open) return null

  const runActive = () => {
    const command = results[active]
    if (command === undefined) return
    // 先关面板再执行：命令里若是又开了别的对话框，两层叠着会很乱
    onClose()
    command.run()
  }

  return (
    <div
      className="dialog-scrim"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose()
      }}
    >
      <div className="palette" role="dialog" aria-modal="true" aria-label="命令面板">
        <div className="palette-input">
          <Icon name="sparkle" size={16} />
          <input
            ref={inputRef}
            className="palette-field"
            value={query}
            placeholder="输入命令…"
            autoComplete="off"
            spellCheck={false}
            aria-label="搜索命令"
            onChange={(event) => setQuery(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === 'ArrowDown') {
                event.preventDefault()
                event.stopPropagation()
                setActive((value) => Math.min(value + 1, Math.max(results.length - 1, 0)))
              } else if (event.key === 'ArrowUp') {
                event.preventDefault()
                event.stopPropagation()
                setActive((value) => Math.max(value - 1, 0))
              } else if (event.key === 'Enter') {
                event.preventDefault()
                event.stopPropagation()
                runActive()
              } else if (event.key === 'Escape') {
                event.preventDefault()
                event.stopPropagation()
                onClose()
              }
            }}
          />
          <kbd className="kbd">Esc</kbd>
        </div>

        <div className="palette-list" role="listbox" aria-label="命令" ref={listRef}>
          {results.length === 0 && <div className="palette-empty">没有匹配的命令</div>}
          {results.map((command, index) => (
            <button
              key={command.id}
              type="button"
              role="option"
              aria-selected={index === active}
              className={`palette-item${index === active ? ' is-active' : ''}`}
              onMouseEnter={() => setActive(index)}
              onClick={() => {
                onClose()
                command.run()
              }}
            >
              <span className="palette-title">{command.title}</span>
              {command.adminOnly === true && <span className="chip chip-brand">管理员</span>}
              <span className="palette-group">{command.group}</span>
              {command.chord !== undefined && <kbd className="kbd">{chordLabel(command.chord, platform)}</kbd>}
            </button>
          ))}
        </div>
      </div>
    </div>
  )
}
