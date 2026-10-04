// src/lib/anchor.test.ts
//
// 浮层几何的两条硬规则：上方放不下要能翻到下方，靠边的触发件不能把面板推出视口。
// 这两种情况在真浏览器里都很难凑（要刚好卡在边界上），而几何算错的表现是「面板飘在
// 奇怪的地方 / 被切掉一截」—— 在单测里钉住比靠肉眼看稳。
import { describe, expect, it } from 'vitest'

import { anchorPanel } from './anchor'

/** 输入卡底部的一个触发件：约 32px 高，左边离视口 40px。 */
const trigger = (over: Partial<{ top: number; bottom: number; left: number; right: number }> = {}) => ({
  top: 700,
  bottom: 732,
  left: 40,
  right: 200,
  ...over,
})

const viewport = { width: 1280, height: 800 }

describe('anchorPanel 向上弹（输入卡在底部）', () => {
  it('上方放得下就向上弹，面板底边与触发件之间留一条 gap', () => {
    const placement = anchorPanel(trigger(), { width: 240, height: 180 }, viewport)
    expect(placement.side).toBe('up')
    expect(placement.top).toBe(700 - 4 - 180)
    expect(placement.left).toBe(40)
  })

  it('放得下时 maxHeight 不小于面板自身高度 —— 不放得下才滚动', () => {
    // 这一条是手机上踩过的坑：maxHeight 若按「面板高度之外还剩多少」算，放得下的面板
    // 也会被压出一条滚动，四行只剩两行可见。
    const placement = anchorPanel(trigger(), { width: 240, height: 180 }, viewport)
    expect(placement.maxHeight).toBeGreaterThanOrEqual(180)
  })
})

describe('anchorPanel 上方放不下时向下弹', () => {
  it('触发件贴着顶边、面板比上方空间高，下方更宽敞 → 翻到下方', () => {
    const placement = anchorPanel(trigger({ top: 40, bottom: 72 }), { width: 240, height: 180 }, viewport)
    expect(placement.side).toBe('down')
    expect(placement.top).toBe(72 + 4)
    expect(placement.maxHeight).toBe(800 - (72 + 4) - 8)
  })
})

describe('anchorPanel 两侧都放不下', () => {
  it('上方仍然比下方宽敞时留在上方，顶边夹在 margin 且给出可滚动的高度', () => {
    // 触发件偏下：上方 488px、下方 256px，都不够 600px 的面板 —— 选更宽敞的上方
    const placement = anchorPanel(trigger({ top: 500, bottom: 532 }), { width: 240, height: 600 }, viewport)
    expect(placement.side).toBe('up')
    expect(placement.top).toBe(8) // 原始位置是负数，夹到 margin
    expect(placement.maxHeight).toBe(500 - 4 - 8) // 从顶边到触发件之间真正剩的高度
    expect(placement.maxHeight).toBeLessThan(600)
  })
})

describe('anchorPanel 左右夹紧', () => {
  it('靠右的触发件不会把面板推出右边界', () => {
    const placement = anchorPanel(trigger({ left: 1260, right: 1280 }), { width: 240, height: 180 }, viewport)
    expect(placement.left).toBe(1280 - 240 - 8)
  })

  it('左边溢出的触发件贴住左边界', () => {
    const placement = anchorPanel(trigger({ left: -30, right: 60 }), { width: 240, height: 180 }, viewport)
    expect(placement.left).toBe(8)
  })

  it('面板比视口还宽时贴住左边界，不给出负坐标', () => {
    const placement = anchorPanel(trigger(), { width: 1400, height: 180 }, viewport)
    expect(placement.left).toBe(8)
  })
})

describe('anchorPanel 参数可调', () => {
  it('gap / margin / preferred 都能被调用方覆盖', () => {
    // 面板矮到下方放得下，preferred=down 就用下方；gap 10、margin 20 都进了结果
    const placement = anchorPanel(trigger(), { width: 240, height: 20 }, viewport, {
      preferred: 'down',
      gap: 10,
      margin: 20,
    })
    expect(placement.side).toBe('down')
    expect(placement.top).toBe(732 + 10)
    expect(placement.left).toBe(40)
  })
})
