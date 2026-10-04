// src/lib/usage.test.ts
//
// 这里钉住的是**钱**与**连续的天**，两件错了也不会崩、只会静静撒谎的事。
//
// 钱的算式必须与 core `usage/rates.ts` 的 `estimateCostUsd` 逐字一致：/usage 页读的是
// 服务端按那条算式算出来的数，而每轮统计行是界面自己现算的 —— 两条路算的不是同一笔账，
// 用户看到的就是「同一个模型同一个轮次，两处金额不一样」。所以下面几组数字是照
// `packages/core/test/usage.test.ts` 里那几条（全命中 / 全未命中 / 只给命中数）抄的。
import { describe, expect, it } from 'vitest'

import { chartPoints, costCell, costOfUsage, dayKey, dayKeyToTs, fillDays, formatUsd, ratesForModel, unpricedNote } from './usage'
import type { ModelCatalog, UsageTotals } from '../api/types'

/** deepseek-chat 的牌价（core 的 model-catalog：0.27 / 0.07 / 1.1） */
const RATES = { input: 0.27, cacheRead: 0.07, output: 1.1 }

const catalog: ModelCatalog = {
  default: 'deepseek',
  groups: [
    {
      id: 'deepseek',
      label: 'DeepSeek',
      envKey: 'DEEPSEEK_API_KEY',
      hasApiKey: true,
      models: [
        { id: 'deepseek-chat', label: '对话（默认）', rates: { input: 0.27, cacheRead: 0.07, output: 1.1 } },
        // 目录里有、但没牌价：未定价，不能编一个数字
        { id: 'deepseek-flash', label: '快而省' },
      ],
    },
  ],
}

function totals(overrides: Partial<UsageTotals> = {}): UsageTotals {
  return { runs: 0, inputTokens: 0, outputTokens: 0, totalTokens: 0, costUsd: 0, unpricedRuns: 0, ...overrides }
}

describe('costOfUsage：与 core 的 estimateCostUsd 同一条算式', () => {
  it('全未命中：命中数 0，整段按输入价', () => {
    const cost = costOfUsage(
      { promptTokens: 1_000_000, completionTokens: 0, totalTokens: 1_000_000, cacheHitTokens: 0 },
      RATES,
    )
    expect(cost).toBe(0.27)
  })

  it('全命中：整段按缓存价（比输入价低一个量级，不分开算会系统性高估）', () => {
    const cost = costOfUsage(
      { promptTokens: 1_000_000, completionTokens: 0, totalTokens: 1_000_000, cacheHitTokens: 1_000_000 },
      RATES,
    )
    expect(cost).toBe(0.07)
  })

  it('只给命中数：未命中的那部分由 prompt - cacheHit 推出来，不能把命中的又算一遍', () => {
    const cost = costOfUsage(
      { promptTokens: 1_000_000, completionTokens: 0, totalTokens: 1_000_000, cacheHitTokens: 400_000 },
      RATES,
    )
    // 0.6 × 0.27 + 0.4 × 0.07 = 0.162 + 0.028
    expect(cost).toBe(0.19)
  })

  it('给了 cacheMissTokens 就用它当未命中输入（响应自己报的数最可信）', () => {
    const cost = costOfUsage(
      {
        promptTokens: 2_000_000, // 故意与 miss + hit 不等：应该听 cacheMissTokens 的
        completionTokens: 0,
        totalTokens: 2_000_000,
        cacheHitTokens: 500_000,
        cacheMissTokens: 1_500_000,
      },
      RATES,
    )
    // 1.5 × 0.27 + 0.5 × 0.07 = 0.405 + 0.035
    expect(cost).toBe(0.44)
  })

  it('输出按输出价，输入输出相加', () => {
    const cost = costOfUsage({ promptTokens: 1_000_000, completionTokens: 1_000_000, totalTokens: 2_000_000 }, RATES)
    // 没有命中数 = 命中 0 → 1 × 0.27 + 1 × 1.1
    expect(cost).toBe(1.37)
  })

  it('没有 cacheRead 的价目表：命中的那部分按输入价算（会高估，core 认下了这件事）', () => {
    const cost = costOfUsage(
      { promptTokens: 1_000_000, completionTokens: 0, totalTokens: 1_000_000, cacheHitTokens: 1_000_000 },
      { input: 0.15, output: 0.6 },
    )
    expect(cost).toBe(0.15)
  })

  it('没价返回 null —— 绝不猜价（目录里有这个模型也没有用）', () => {
    expect(costOfUsage({ promptTokens: 10, completionTokens: 5, totalTokens: 15 }, null)).toBeNull()
    expect(costOfUsage({ promptTokens: 10, completionTokens: 5, totalTokens: 15 }, undefined)).toBeNull()
    expect(costOfUsage(null, RATES)).toBeNull()
  })

  it('浮点尾巴被抹到 1e-6（0.30000000000000004 不该出现在界面上）', () => {
    const cost = costOfUsage({ promptTokens: 1_111_111, completionTokens: 0, totalTokens: 1_111_111 }, RATES)
    expect(cost).toBe(0.3)
  })
})

describe('ratesForModel：只认 (provider, model) 精确匹配', () => {
  it('命中目录里的模型', () => {
    expect(ratesForModel(catalog, { provider: 'deepseek', model: 'deepseek-chat' })).toEqual(RATES)
  })

  it('目录里有这个模型但没牌价 → null（未定价）', () => {
    expect(ratesForModel(catalog, { provider: 'deepseek', model: 'deepseek-flash' })).toBeNull()
  })

  it('提供方或型号不在目录里 → null，不靠前缀猜家族', () => {
    expect(ratesForModel(catalog, { provider: 'deepseek', model: 'deepseek-chat-0324' })).toBeNull()
    expect(ratesForModel(catalog, { provider: 'openai', model: 'deepseek-chat' })).toBeNull()
    expect(ratesForModel(null, { provider: 'deepseek', model: 'deepseek-chat' })).toBeNull()
    expect(ratesForModel(catalog, null)).toBeNull()
  })
})

describe('formatUsd：小额不能显示成 $0', () => {
  it('0 就是 $0', () => {
    expect(formatUsd(0)).toBe('$0')
  })

  it('< 0.01：至少 4 位有效，且不留一串零', () => {
    expect(formatUsd(0.004996)).toBe('$0.004996')
    expect(formatUsd(0.0008)).toBe('$0.0008')
    expect(formatUsd(0.000001)).toBe('$0.000001')
  })

  it('≥ 0.01：三位小数', () => {
    expect(formatUsd(0.0123)).toBe('$0.012')
    expect(formatUsd(0.5)).toBe('$0.500')
  })

  it('≥ 1：两位小数', () => {
    expect(formatUsd(1)).toBe('$1.00')
    expect(formatUsd(1.2345)).toBe('$1.23')
    expect(formatUsd(1234.5)).toBe('$1234.50')
  })

  it('不是数字就明说（读不动的数据不该画成一个金额）', () => {
    expect(formatUsd(Number.NaN)).toBe('—')
  })
})

describe('fillDays：折线要连续', () => {
  const from = dayKeyToTs('2026-10-01')
  const to = dayKeyToTs('2026-10-05')

  it('缺的天补成 0，已有的桶原样留下', () => {
    const days = fillDays(
      [
        { date: '2026-10-01', ...totals({ runs: 2, totalTokens: 100, costUsd: 0.001 }) },
        { date: '2026-10-04', ...totals({ runs: 1, totalTokens: 50, costUsd: 0.002, unpricedRuns: 1 }) },
      ],
      { from, to },
    )
    expect(days.map((day) => day.date)).toEqual([
      '2026-10-01',
      '2026-10-02',
      '2026-10-03',
      '2026-10-04',
      '2026-10-05',
    ])
    expect(days[1]).toMatchObject({ runs: 0, totalTokens: 0, costUsd: 0 })
    expect(days[3]).toMatchObject({ runs: 1, costUsd: 0.002, unpricedRuns: 1 })
  })

  it('跨月不断天，且每个相邻日期恰好差一个日历日（跨夏令时也不会跳）', () => {
    const days = fillDays([], { from: dayKeyToTs('2026-03-01'), to: dayKeyToTs('2026-04-05') })
    expect(days).toHaveLength(36)
    expect(days[0]?.date).toBe('2026-03-01')
    expect(days[35]?.date).toBe('2026-04-05')
    for (let index = 1; index < days.length; index += 1) {
      const previous = days[index - 1]?.date ?? ''
      const [year, month, day] = previous.split('-').map(Number)
      const expected = dayKey(new Date(year ?? 0, (month ?? 1) - 1, (day ?? 1) + 1).getTime())
      expect(days[index]?.date).toBe(expected)
    }
  })

  it('区间外的桶不进来，反着的区间给空表', () => {
    const days = fillDays(
      [{ date: '2026-09-01', ...totals({ runs: 9 }) }],
      { from, to },
    )
    expect(days.every((day) => day.runs === 0)).toBe(true)
    expect(fillDays([], { from: to, to: from })).toEqual([])
  })

  it('空序列 + 单日区间 = 一天的零桶', () => {
    expect(fillDays([], { from, to: from })).toHaveLength(1)
  })
})

describe('chartPoints：全零与单点也要画得出来', () => {
  const box = { width: 100, height: 50 }

  it('一个点取中间，不然它贴在左边框上像没画完', () => {
    const points = chartPoints([{ date: '2026-10-04', ...totals({ runs: 3, costUsd: 0.5 }) }], box)
    expect(points).toEqual([{ date: '2026-10-04', x: 50, y: 0, costUsd: 0.5, runs: 3 }])
  })

  it('全是 0：不除以零，整条线贴底线（不是空白）', () => {
    const points = chartPoints(
      [
        { date: '2026-10-03', ...totals() },
        { date: '2026-10-04', ...totals() },
      ],
      box,
    )
    expect(points.map((point) => point.y)).toEqual([50, 50])
    expect(points.map((point) => point.x)).toEqual([0, 100])
  })

  it('最大值落在顶端，0 落在底端', () => {
    const points = chartPoints(
      [
        { date: '2026-10-03', ...totals({ costUsd: 0 }) },
        { date: '2026-10-04', ...totals({ costUsd: 0.5 }) },
      ],
      box,
    )
    expect(points[0]?.y).toBe(50)
    expect(points[1]?.y).toBe(0)
  })

  it('空输入给空数组', () => {
    expect(chartPoints([], box)).toEqual([])
  })
})

describe('卡片与表格的措辞', () => {
  it('有未定价的轮次就必须说出来', () => {
    expect(unpricedNote(totals({ runs: 3, unpricedRuns: 2 }))).toBe('其中 2 轮未定价，不计入金额')
    expect(unpricedNote(totals({ runs: 3 }))).toBe('')
  })

  it('表格金额：一整桶都没定价时说「未定价」，不是 $0', () => {
    expect(costCell(totals({ runs: 2, unpricedRuns: 2 })).text).toBe('未定价')
    expect(costCell(totals({ runs: 2, unpricedRuns: 1, costUsd: 0.002 }))).toEqual({
      text: '$0.002',
      note: '另 1 轮未定价',
    })
    expect(costCell(totals({ runs: 1, costUsd: 0.5 })).text).toBe('$0.500')
    expect(costCell(totals()).text).toBe('—')
  })
})
