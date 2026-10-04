// src/lib/anchor.ts
//
// 浮层面板的定位几何 —— **纯函数**，不认识 React，也不知道自己画的是什么。
//
// 为什么单独一个模块：输入卡钉在页面底部，面板得**向上弹**；可屏幕就那么大，总有弹不下
// 的时候（面板比上方空间还高），这时要翻到下方；左右还得夹在视口里。这几条都是几何，
// 塞进组件里就只能靠在真浏览器里拖窗口来验。拎出来就能用普通单测钉住。
//
// 坐标一律是**视口坐标**（`position: fixed` 那一套），与 triggerRect 的口径一致：
// 面板按这个结果摆上去，祖先元素怎么滚动、有没有 overflow 裁剪都不影响它 —— 那正是
// `.composer-tools`（窄屏横滚）逼着我们走 portal 的原因。

/** 触发件的视口盒（getBoundingClientRect 的四条边） */
export interface Rect {
  top: number
  bottom: number
  left: number
  right: number
}

/** 面板的尺寸（offsetWidth / offsetHeight 量出来的自然大小） */
export interface Size {
  width: number
  height: number
}

/** 视口尺寸 */
export interface Viewport {
  width: number
  height: number
}

/** 面板弹在哪一侧：输入卡在底部时向上，上方放不下时翻到下方 */
export type PanelSide = 'up' | 'down'

export interface PanelPlacement {
  /** 视口坐标：面板顶边（`position: fixed` 的 top） */
  top: number
  /** 视口坐标：面板左边（`position: fixed` 的 left） */
  left: number
  /** 实际弹向哪一侧（与触发件的关系） */
  side: PanelSide
  /** 这一侧放得下多少：面板比它高时靠这个自己内部滚动，始终留在视口里 */
  maxHeight: number
}

export interface AnchorOptions {
  /** 优先弹向哪一侧。默认向上 —— 输入卡钉在页面底部。 */
  preferred?: PanelSide
  /** 触发器与面板之间的空隙 */
  gap?: number
  /** 面板与视口边缘之间至少要留的距离 */
  margin?: number
}

const DEFAULTS = { preferred: 'up', gap: 4, margin: 8 } as const

/**
 * 把面板摆在触发件旁边。
 *
 * 三条规则，按优先级：
 *   1. 首选方向放得下就用它；放不下时**改用更宽敞的那一侧**（上方实在不够就向下弹）；
 *   2. 顶边不放负 —— 夹到 margin，面板靠 maxHeight 内部滚动，不越出上/下边界；
 *   3. 左右夹紧在 [margin, 视口宽 - 面板宽 - margin]，靠边的触发件不会把面板推出屏幕。
 *
 * `maxHeight` 是**选定那一侧真正还剩多少高度**，不是「减去面板自身高度后的剩余」——
 * 后者会让放得下的面板也平白多出一条滚动（手机上就这么翻过车，见单测）。
 */
export function anchorPanel(
  triggerRect: Rect,
  panelSize: Size,
  viewport: Viewport,
  options: AnchorOptions = {},
): PanelPlacement {
  const gap = options.gap ?? DEFAULTS.gap
  const margin = options.margin ?? DEFAULTS.margin
  const preferred = options.preferred ?? DEFAULTS.preferred

  // 两侧各自能给面板多少高度（都扣掉 gap 与边缘留白）。
  const roomAbove = triggerRect.top - gap - margin
  const roomBelow = viewport.height - triggerRect.bottom - gap - margin

  const wantUp = preferred === 'up'
  const fits = wantUp ? panelSize.height <= roomAbove : panelSize.height <= roomBelow
  const side: PanelSide = fits ? preferred : roomAbove > roomBelow ? 'up' : 'down'

  const rawTop = side === 'up' ? triggerRect.top - gap - panelSize.height : triggerRect.bottom + gap
  const top = Math.max(margin, rawTop)

  // 左右：先按触发件左边缘对齐，再夹进视口。面板比视口还宽时夹紧会小于 margin，
  // 这里取 max 保证不为负 —— 溢出的那一截由面板自己的 max-width 收掉。
  const wantedLeft = triggerRect.left
  const maxLeft = viewport.width - panelSize.width - margin
  const left = Math.max(margin, Math.min(wantedLeft, maxLeft))

  // 从摆好的顶边往该侧量到边缘；放得下时它 ≥ 面板高度（于是没有多余的滚动），
  // 放不下时它才是那个更小的可滚动高度。
  const maxHeight = Math.max(
    0,
    side === 'up' ? triggerRect.top - gap - top : viewport.height - margin - top,
  )

  return { top, left, side, maxHeight }
}
