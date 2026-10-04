// src/lib/usage.ts
//
// 成本中心的**纯逻辑**：把用量折成钱、把钱写成人看的样子、把断掉的天补齐。
//
// 为什么单独一个模块：这三件事都必须和 core 的 `usage/rates.ts` 一模一样 ——
// 每轮统计行与 `/usage` 页面能对上，唯一的保证就是**同一条算式、同一个价目表出处**。
// 塞进组件里就只能靠「点开两个页面用眼睛比」，而钱的差错不会自己跳出来。
//
// 价格从哪来：`GET /api/models` 的 `rates`（契约 §2），界面**不自己抄一份**。
// 目录里没有 rates 就是没定价 —— 返回 null，让调用方说「未定价」，绝不猜一个数字。

import type { ModelCatalog, ModelRates, ModelRefInfo, TokenUsageLike, UsageTotals } from '../api/types'

function emptyTotals(): UsageTotals {
  return { runs: 0, inputTokens: 0, outputTokens: 0, totalTokens: 0, costUsd: 0, unpricedRuns: 0 }
}

/**
 * 某条模型的牌价。**逐字镜像** core 的 `ratesFor`：
 *
 * 只认 `(provider, model)` 精确匹配。模型名是自由字符串（各家迭代快），靠前缀猜
 * 「这是哪个家族的哪一档」猜错的代价是钱，所以宁可不认 —— 认不出来就是「未定价」。
 *
 * 找不到提供方、或找到了但这一家没有这个型号，都返回 null（core 里也是这两条路）。
 */
export function ratesForModel(catalog: ModelCatalog | null, model: ModelRefInfo | null): ModelRates | null {
  if (catalog === null || model === null) return null
  for (const group of catalog.groups) {
    if (group.id !== model.provider) continue
    for (const candidate of group.models) {
      if (candidate.id === model.model) return candidate.rates ?? null
    }
    // 用户手填的型号：这一家里没有它，按未定价处理
    return null
  }
  return null
}

/**
 * 一次用量值多少钱（美元）。**逐字镜像** core `usage/rates.ts` 的 `estimateCostUsd`，
 * 所以这里的输入和 `/usage` 一样：`未命中输入 × input + 命中输入 × (cacheRead ?? input)
 * + 输出 × output`，单位是美元 / 百万 token。
 *
 * 三条容易写错的：
 *   1. `cacheHitTokens` 缺省 = 0（「没报」与「命中 0」在钱上同解，都按输入价算）；
 *   2. 未命中的输入优先取 `cacheMissTokens`，没有它才用 `max(0, prompt - cacheHit)`
 *      —— 不然会把命中的那部分又按输入价算一遍；
 *   3. 结果四舍五入到 1e-6，浮点尾巴（0.30000000000000004）不该出现在界面上。
 *
 * `rates` 为空返回 `null`（= 未定价）。**绝不猜价**：缺价时调用方只显示 token。
 */
export function costOfUsage(
  usage: TokenUsageLike | null | undefined,
  rates: ModelRates | null | undefined,
): number | null {
  if (usage === null || usage === undefined) return null
  if (rates === null || rates === undefined) return null

  const cacheHit = usage.cacheHitTokens ?? 0
  const cacheMiss = usage.cacheMissTokens
  const inputTokens = cacheMiss ?? Math.max(0, usage.promptTokens - cacheHit)
  const cachePrice = rates.cacheRead ?? rates.input

  const cost =
    (inputTokens / 1_000_000) * rates.input +
    (cacheHit / 1_000_000) * cachePrice +
    (usage.completionTokens / 1_000_000) * rates.output

  return Math.round(cost * 1_000_000) / 1_000_000
}

/**
 * 钱写成人看的样子。
 *
 * 分档的理由只有一个：**小额不能被显示成 `$0`**。「花了 0.4 分」与「没花钱」在界面上
 * 是两件事，前者写成 `$0.00` 会让人以为这一轮没计费。所以：
 *   0 → `$0`；< 0.01 → 至少 4 位有效（`$0.004996`、`$0.0008`）；≥ 0.01 → 三位小数；
 *   ≥ 1 → 两位小数。
 * `< 0.01` 那档用 `toPrecision(4)` 再抹掉尾巴的零：`0.0008` 不该写成 `$0.0008000`。
 */
export function formatUsd(value: number): string {
  if (!Number.isFinite(value)) return '—'
  if (value === 0) return '$0'
  if (value < 0) return `$-${formatUsd(-value).slice(1)}`
  if (value >= 1) return `$${value.toFixed(2)}`
  if (value >= 0.01) return `$${value.toFixed(3)}`
  // 4 位有效数字；成本已经被 core/web 两边都收在 1e-6，所以不会走到科学计数法那一档
  const text = String(Number(value.toPrecision(4)))
  return text.includes('e') ? `<$0.000001` : `$${text}`
}

/** 本地日期键 `YYYY-MM-DD`。**与 core `usage/aggregate.ts` 的 `dateKey` 同一口径** */
export function dayKey(ts: number): string {
  const date = new Date(ts)
  const month = `${date.getMonth() + 1}`.padStart(2, '0')
  const day = `${date.getDate()}`.padStart(2, '0')
  return `${date.getFullYear()}-${month}-${day}`
}

/** 日期键 → 那一刻的本地 0 点。跨月、跨年、跨夏令时都由 Date 的构造器自己算 */
export function dayKeyToTs(key: string): number {
  const [year, month, day] = key.split('-').map((part) => Number(part))
  if (year === undefined || month === undefined || day === undefined) return 0
  if (!Number.isFinite(year) || !Number.isFinite(month) || !Number.isFinite(day)) return 0
  return new Date(year, month - 1, day).getTime()
}

/** 折线上的一天：`date` 是本地日期键，零填的那些也在里面 */
export type UsageDay = UsageTotals & { date: string }

export interface DayRange {
  /** 起（含）。epoch 毫秒，按**本地日期**取整到那一天 */
  from: number
  /** 讫（含） */
  to: number
}

/**
 * 把按天分桶补齐成连续序列 —— 折线不能有洞：某天没人干活不是「图断了」，是 0。
 *
 * **不要用毫秒加减来迭代日期**（`from + i * 86400000`）：跨夏令时那天会少/多一小时，
 * 于是某一天被跳过或算两遍。用 `new Date(y, m, d + i)`，日期进位上交给 Date 自己算。
 *
 * 服务端明确说了「空桶不补，补零是界面的事」（契约 §2），所以这一步必须在界面做。
 */
export function fillDays(series: readonly UsageDay[], range: DayRange): UsageDay[] {
  const byDate = new Map(series.map((day) => [day.date, day]))
  const first = new Date(range.from)
  const lastKey = dayKey(range.to)
  const out: UsageDay[] = []

  // 起点是 from 那一天的本地 0 点；`Date` 的构造器会把跨越月年的进位算对
  for (let index = 0; ; index += 1) {
    const cursor = new Date(first.getFullYear(), first.getMonth(), first.getDate() + index)
    const key = dayKey(cursor.getTime())
    if (key > lastKey) break
    out.push(byDate.get(key) ?? { date: key, ...emptyTotals() })
    // 兜底：万一 from/to 给反了或给了个天文数字，不让循环跑到天荒地老
    if (index > 3660) break
  }

  return out
}

/** 折线上一个点（已经落在图框的坐标系里） */
export interface ChartPoint {
  date: string
  x: number
  y: number
  costUsd: number
  runs: number
}

export interface ChartBox {
  width: number
  height: number
}

/**
 * 每日成本 → 折线上的点。y 轴是**绝对值**（不是占最大值百分比）：这样不同会话量的
 * 两个月不会长得一样，代价是最大值变了纵轴比例也跟着变 —— 折线本来就是这个意思。
 *
 * 两个边界必须有确定行为，否则图会「空白」：
 *   1. 全是 0：没有最大值，全部落在底线（o 轴）上，画出来是一条贴着轴的平线；
 *   2. 只有一个点：x 取中间，不然它会贴在左边框上，看起来像没画完。
 */
export function chartPoints(days: readonly UsageDay[], box: ChartBox): ChartPoint[] {
  const count = days.length
  if (count === 0) return []
  const max = days.reduce((acc, day) => Math.max(acc, day.costUsd), 0)

  return days.map((day, index) => {
    const x = count === 1 ? box.width / 2 : (index / (count - 1)) * box.width
    // max 为 0 时（全零）不做除法，直接贴底线
    const y = max <= 0 ? box.height : box.height * (1 - day.costUsd / max)
    return { date: day.date, x, y, costUsd: day.costUsd, runs: day.runs }
  })
}

/**
 * 卡片上那句「这笔钱不是全部」的说明。
 *
 * `unpricedRuns > 0` 时**必须**说出来：卡上写着 `$0`，而实际有 N 轮没定价，
 * 不说的话它读起来就是「没花钱」。返回空串表示没什么要说。
 */
export function unpricedNote(totals: UsageTotals): string {
  if (totals.unpricedRuns <= 0) return ''
  return `其中 ${totals.unpricedRuns} 轮未定价，不计入金额`
}

/** 表格里的金额单元格：整桶都没定价时说「未定价」，而不是 `$0` */
export function costCell(totals: UsageTotals): { text: string; note: string } {
  if (totals.runs === 0) return { text: '—', note: '' }
  if (totals.costUsd === 0 && totals.unpricedRuns > 0) {
    return { text: '未定价', note: `${totals.unpricedRuns} 轮无牌价` }
  }
  if (totals.unpricedRuns > 0) {
    return { text: formatUsd(totals.costUsd), note: `另 ${totals.unpricedRuns} 轮未定价` }
  }
  return { text: formatUsd(totals.costUsd), note: '' }
}
