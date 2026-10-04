// src/components/ComposerMenu.tsx
//
// 输入卡底部那条控制带上的一个菜单：**触发件 + 浮层面板**。模型与审批口径都用它，
// 外观照搬 penguin 的 ToolbarTrigger / MenuSelect —— 这就是「对话框底下选项」的那一套。
//
// 触发件是**胶囊**：一个标记（Icon）+ 当前值文字 + 紧凑箭头；无边框、灰墨色，hover 才
// 出现柔和底色并转正文色，禁用时半透明。它**不是**原生 `<select>`：原生控件的样子由
// 浏览器决定（系统蓝高亮、边框、圆角），和输入卡的其余部分不是一套。
//
// 面板**portal 到 document.body**，用 position:fixed 按触发件的 getBoundingClientRect()
// 定位，并且向上弹 —— 输入卡钉在页面底部。位置由 lib/anchor.ts 的纯函数算（空间不够
// 往下弹、左右夹紧，都有单测）。之所以非 portal 不可：`.composer-tools` 是 overflow-x:auto
// （窄屏只滚它），面板留在里面会被裁掉；penguin 也是因为这条才 portal。
//
// 无障碍：触发件 aria-haspopup="menu" / aria-expanded；行是 role="menuitemradio" 且带
// aria-checked；Escape 关、点外面关，关掉后焦点回到触发件；触发件带 aria-label。
// 打开时焦点送进面板第一行 —— 面板在 body 末尾，不在触发件的 Tab 序列里，不送焦点
// 键盘用户就到不了那几行。

import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from 'react'
import { createPortal } from 'react-dom'

import { anchorPanel, type PanelPlacement } from '../lib/anchor'
import { Icon, type IconName } from './Icon'

export interface ComposerMenuOption {
  value: string
  /** 行里的主文字 */
  label: string
  /** 同一行后随的灰色说明（模型的 id / 审批那一档会发生什么） */
  detail?: string | undefined
  disabled?: boolean
}

export function ComposerMenu({
  label,
  title,
  glyph,
  value,
  display,
  options,
  note,
  disabled = false,
  testId,
  menuName,
  onPick,
}: {
  /** 触发件的无障碍名（屏幕阅读器念「模型」/「审批口径」），也是面板的名字 */
  label: string
  /** 面板顶部标题条上的控件名 */
  title: string
  /** 触发件前导的标记 */
  glyph: IconName
  /** 当前值 id（用来给对应的行打勾） */
  value: string
  /** 触发件上显示的当前值（目录里的 label，取不到就退回裸 id） */
  display: string
  options: ComposerMenuOption[]
  /** 面板末尾的灰色脚注 */
  note?: string | undefined
  disabled?: boolean
  /** 端到端要的钩子：仍挂在触发件上 */
  testId: string
  /** 面板的钩子：`data-menu` */
  menuName: string
  onPick: (value: string) => void
}): ReactNode {
  const [open, setOpen] = useState(false)
  // 面板摆在哪；null = 还没量过（先渲染成隐藏的，量完再显形，免得闪一下错的定位）
  const [placement, setPlacement] = useState<PanelPlacement | null>(null)
  const triggerRef = useRef<HTMLButtonElement | null>(null)
  const panelRef = useRef<HTMLDivElement | null>(null)

  // 开面板时量触发件与面板，按纯函数的结果摆好；窗口变化、控制带横滚都重新量一次
  // （窄屏点一个半露的控件会把它滚进视野，不重算面板就飘在原来的位置）。
  useLayoutEffect(() => {
    if (!open) {
      setPlacement(null)
      return
    }
    const trigger = triggerRef.current
    const panel = panelRef.current
    if (trigger === null || panel === null) return
    const place = () => {
      const rect = trigger.getBoundingClientRect()
      setPlacement(
        anchorPanel(
          { top: rect.top, bottom: rect.bottom, left: rect.left, right: rect.right },
          { width: panel.offsetWidth, height: panel.offsetHeight },
          { width: window.innerWidth, height: window.innerHeight },
        ),
      )
    }
    place()
    window.addEventListener('resize', place)
    window.addEventListener('scroll', place, true)
    return () => {
      window.removeEventListener('resize', place)
      window.removeEventListener('scroll', place, true)
    }
  }, [open])

  // 点外面或 Escape 关掉。Escape 之后焦点回到触发件 —— 不能把键盘用户留在一个刚卸掉的
  // 面板上。触发件上的点击由它自己的 onClick 切换，不走这里。
  useEffect(() => {
    if (!open) return
    const onPointerDown = (event: MouseEvent) => {
      const target = event.target as Node
      if (triggerRef.current?.contains(target) === true) return
      if (panelRef.current?.contains(target) === true) return
      setOpen(false)
    }
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return
      setOpen(false)
      triggerRef.current?.focus()
    }
    window.addEventListener('mousedown', onPointerDown)
    window.addEventListener('keydown', onKeyDown)
    return () => {
      window.removeEventListener('mousedown', onPointerDown)
      window.removeEventListener('keydown', onKeyDown)
    }
  }, [open])

  // 面板量完位置后把焦点送进第一行（量之前它是 visibility:hidden，聚焦不了）。
  useEffect(() => {
    if (!open || placement === null) return
    panelRef.current?.querySelector<HTMLElement>('[role="menuitemradio"]')?.focus()
  }, [open, placement])

  const pick = (next: string) => {
    setOpen(false)
    onPick(next)
  }

  return (
    <>
      <button
        type="button"
        ref={triggerRef}
        data-testid={testId}
        className="composer-trigger"
        aria-label={label}
        aria-haspopup="menu"
        aria-expanded={open}
        disabled={disabled}
        onClick={() => setOpen((current) => !current)}
      >
        <Icon name={glyph} size={14} />
        <span className="composer-trigger-label">{display}</span>
        <span className="composer-trigger-caret">
          <Icon name="chevron" size={12} />
        </span>
      </button>

      {open &&
        createPortal(
          <div
            ref={panelRef}
            className="composer-menu"
            data-menu={menuName}
            style={
              placement === null
                ? { left: 0, top: 0, visibility: 'hidden' }
                : { left: placement.left, top: placement.top, maxHeight: placement.maxHeight }
            }
          >
            <div className="composer-menu-title">{title}</div>
            <div role="menu" aria-label={title} className="composer-menu-list">
              {options.map((option) => {
                const checked = option.value === value
                return (
                  <button
                    key={option.value}
                    type="button"
                    role="menuitemradio"
                    aria-checked={checked}
                    data-value={option.value}
                    disabled={option.disabled === true}
                    className="composer-menu-row"
                    onClick={() => pick(option.value)}
                  >
                    <span className="composer-menu-row-label">{option.label}</span>
                    {option.detail !== undefined && (
                      <span className="composer-menu-row-detail">{option.detail}</span>
                    )}
                    <span className="composer-menu-row-check">
                      {checked && <Icon name="check" size={14} />}
                    </span>
                  </button>
                )
              })}
            </div>
            {note !== undefined && note !== '' && <div className="composer-menu-note">{note}</div>}
          </div>,
          document.body,
        )}
    </>
  )
}
