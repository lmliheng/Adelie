// src/components/UsagePage.tsx
//
// 成本中心（路线图 P4 / 契约 §2 的 `GET /api/usage`）。
//
// 页面只做三件事：把服务端算好的报表**显示出来**、把断掉的天补齐、把「这不是全部的钱」
// 说出来。所有聚合都在服务端（它当场扫事件流），界面**不再自己聚一遍** —— 两份聚合
// 迟早对不上，而那时候没人知道该信谁。
//
// 三条口径是从草稿里带过来的，它们才是这一页的重点：
//   1. **有未定价的轮次必须在卡上说出来**：`costUsd` 只累计有价的轮次，光标着 `$0`
//      会读成「没花钱」，而实际可能是「没定价」；
//   2. 折线不画空白：全是 0 或只有一个点也要画得出来（`chartPoints` 的那两条边界）；
//   3. 数据来源与口径写在页脚 —— 「盘上的事件流 + 当前价目表现算」不是废话，
//      它意味着换价之后这一页的数字会变，而历史 token 不会。
//
// 纯逻辑（钱、日期、折线坐标）在 `lib/usage.ts`，这里只管取数与画。

import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react'
import { api, describeApiError, toApiError } from '../api/client'
import { Icon } from './Icon'
import { compactNumber, relativeTime } from '../lib/format'
import { chartPoints, costCell, dayKeyToTs, fillDays, formatUsd, unpricedNote } from '../lib/usage'
import type { UsageDay } from '../lib/usage'
import type { Credentials } from '../lib/credentials'
import type { UsageReport, UsageTotals } from '../api/types'

type LoadStatus = 'loading' | 'ready' | 'error'

/**
 * 折线的画布。固定 viewBox 由 CSS 拉到容器宽度，等比缩放（不用 preserveAspectRatio="none"：
 * 那会把圆点压成椭圆）。`padLeft` 要给得下**最长的那种金额标签**（`$0.004996` 这种六位小数的
 * 比 `$12.30` 宽得多）—— 给窄了会被 viewBox 裁掉前半截，第一版就是这么错的。
 */
const CHART = { width: 560, height: 100, padLeft: 76, padTop: 12, padRight: 16, padBottom: 22 }

/** viewBox 由留白算出来：调一个数字不用同时改三处（以前这里就对不上） */
const CHART_VIEWBOX = `0 0 ${CHART.padLeft + CHART.width + CHART.padRight} ${CHART.padTop + CHART.height + CHART.padBottom}`
/** 日期标签的基线：贴着绘图区下沿 */
const CHART_LABEL_Y = CHART.padTop + CHART.height + 15

export function UsagePage({
  credentials,
  isAdmin,
  onOpenSession,
}: {
  credentials: Credentials
  isAdmin: boolean
  onOpenSession: (sessionId: string) => void
}): ReactNode {
  const [report, setReport] = useState<UsageReport | null>(null)
  const [status, setStatus] = useState<LoadStatus>('loading')
  const [error, setError] = useState<string | null>(null)
  // 「含其他账号的会话」是**管理员的**开关（契约 §2：普通用户传 scope=all 会被静默忽略，
  // 所以干脆不给这个开关，免得点了没反应像是坏了）
  const [scopeAll, setScopeAll] = useState(false)
  const [attempt, setAttempt] = useState(0)

  useEffect(() => {
    const controller = new AbortController()
    setStatus('loading')
    api
      .usage(credentials, scopeAll ? { scopeAll: true } : {}, controller.signal)
      .then((data) => {
        setReport(data)
        setStatus('ready')
        setError(null)
      })
      .catch((caught: unknown) => {
        // abort 是我们自己切页/切开关造成的，不是错误
        if (controller.signal.aborted) return
        setStatus('error')
        setError(describeApiError(toApiError(caught), credentials))
      })
    return () => controller.abort()
  }, [attempt, credentials, scopeAll])

  // 折线的横轴：从最早有数据的那天到今天。服务端明确说「空桶不补，补零是界面的事」，
  // 所以缺的天在这里补成 0；`to` 取服务端的 now，今天没干活也要在图上占一格。
  const days = useMemo<UsageDay[]>(() => {
    if (report === null) return []
    const first = report.series[0]
    if (first === undefined) return []
    const from = dayKeyToTs(first.date)
    return fillDays(report.series, { from, to: Math.max(report.now, from) })
  }, [report])

  const reload = useCallback(() => setAttempt((value) => value + 1), [])

  const head = (
    <div className="page-head">
      <Icon name="chart" size={16} />
      <h2 id="page-title">成本中心</h2>
      {isAdmin && (
        <label className="checkbox-row usage-scope">
          <input
            type="checkbox"
            data-testid="usage-scope"
            checked={scopeAll}
            onChange={(event) => setScopeAll(event.target.checked)}
          />
          <span>含其他账号的会话</span>
        </label>
      )}
      <button type="button" className="btn btn-secondary" onClick={reload} disabled={status === 'loading'}>
        <Icon name="refresh" size={15} />
        刷新
      </button>
    </div>
  )

  return (
    <div className="page">
      <div className="usage">
        {head}

        {error !== null && (
          <p className="errorbox" role="alert">
            <span className="errorbox-title">
              <Icon name="alert" size={15} />
              用量与成本拉不下来
            </span>
            <span>{error}</span>
            <span className="errorbox-actions">
              <button type="button" className="btn btn-secondary" onClick={reload}>
                <Icon name="refresh" size={15} />
                重试
              </button>
            </span>
          </p>
        )}

        {report === null ? (
          status === 'loading' ? (
            <p className="hint">正在统计……</p>
          ) : null
        ) : (
          <>
            <div className="usage-cards">
              <SummaryCard id="today" label="今天" totals={report.summary.today} />
              <SummaryCard id="last7d" label="最近 7 天" totals={report.summary.last7d} />
              <SummaryCard id="total" label="累计" totals={report.summary.total} />
            </div>

            {report.summary.total.runs === 0 ? (
              <div className="page-card">
                <p className="usage-empty-title">还没有可统计的轮次</p>
                <p className="page-what">
                  跑几轮之后这里会出现按天的成本折线、哪家模型最贵、哪条会话烧得最多。
                  数字全部来自盘上的事件流，成本按<strong>当前</strong>价目表现算 —— 换价之后这一页会变，
                  而已经落盘的 token 不变。
                </p>
              </div>
            ) : (
              <CostChart days={days} />
            )}

            <section className="usage-section">
              <p className="section-title">按模型</p>
              <div className="usage-table-wrap">
                <table className="usage-table">
                  <thead>
                    <tr>
                      <th>模型</th>
                      <th className="num">轮次</th>
                      <th className="num">token</th>
                      <th className="num">金额</th>
                    </tr>
                  </thead>
                  <tbody>
                    {report.byModel.length === 0 && (
                      <tr>
                        <td colSpan={4} className="usage-none">
                          这段时间没有记录
                        </td>
                      </tr>
                    )}
                    {report.byModel.map((bucket) => {
                      const cost = costCell(bucket)
                      return (
                        <tr key={`${bucket.provider}/${bucket.model}`}>
                          <td className="usage-model">
                            <span className="usage-provider">{bucket.provider}</span>
                            <span className="usage-sep">/</span>
                            <span className="usage-name">{bucket.model}</span>
                          </td>
                          <td className="num">{bucket.runs}</td>
                          <td className="num">{compactNumber(bucket.totalTokens)}</td>
                          <td className="num">
                            <span className={bucket.unpricedRuns > 0 ? 'usage-unpriced' : undefined}>
                              {cost.text}
                            </span>
                            {cost.note !== '' && <span className="usage-note">{cost.note}</span>}
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            </section>

            <section className="usage-section">
              <p className="section-title">按会话</p>
              <div className="usage-table-wrap">
                <table className="usage-table">
                  <thead>
                    <tr>
                      <th>会话</th>
                      <th>最后活动</th>
                      <th className="num">轮次</th>
                      <th className="num">token</th>
                      <th className="num">金额</th>
                    </tr>
                  </thead>
                  <tbody>
                    {report.bySession.length === 0 && (
                      <tr>
                        <td colSpan={5} className="usage-none">
                          这段时间没有记录
                        </td>
                      </tr>
                    )}
                    {report.bySession.map((bucket) => {
                      const cost = costCell(bucket)
                      return (
                        <tr key={bucket.sessionId}>
                          <td className="usage-session-cell">
                            {/* 行可点：点开那条会话（由 App 接上「打开 + 回对话页」）。用
                                真的 button 而不是给 `<tr>` 挂 onClick —— 键盘也能到，触屏上
                                它自己就是一个 ≥40px 的落点 */}
                            <button
                              type="button"
                              className="usage-session"
                              data-testid={`usage-session-${bucket.sessionId}`}
                              title={bucket.sessionId}
                              onClick={() => onOpenSession(bucket.sessionId)}
                            >
                              {bucket.sessionId}
                            </button>
                          </td>
                          <td className="usage-when">{relativeTime(bucket.lastActiveAt, report.now)}</td>
                          <td className="num">{bucket.runs}</td>
                          <td className="num">{compactNumber(bucket.totalTokens)}</td>
                          <td className="num">
                            <span className={bucket.unpricedRuns > 0 ? 'usage-unpriced' : undefined}>
                              {cost.text}
                            </span>
                            {cost.note !== '' && <span className="usage-note">{cost.note}</span>}
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            </section>

            <p className="usage-foot">
              数字来自盘上的事件流，成本按当前价目表现算（美元 / 百万 token，价目表由{' '}
              <code>GET /api/models</code> 下发）；扫了 {report.sessionsScanned} 条会话（
              {report.unreadableSessions} 条读不动）。
            </p>
          </>
        )}
      </div>
    </div>
  )
}

/** 一张汇总卡：钱 + token + 轮次，三样缺一不可（只看钱看不出规模） */
function SummaryCard({ id, label, totals }: { id: string; label: string; totals: UsageTotals }): ReactNode {
  const note = unpricedNote(totals)
  return (
    <div className="usage-card" data-testid={`usage-card-${id}`} data-runs={totals.runs} data-cost={totals.costUsd}>
      <span className="usage-card-label">{label}</span>
      <span className="usage-card-cost">{formatUsd(totals.costUsd)}</span>
      <span className="usage-card-meta">
        {compactNumber(totals.totalTokens)} tokens · {totals.runs} 轮
      </span>
      {note !== '' && <span className="usage-card-note">{note}</span>}
    </div>
  )
}

/**
 * 按天的成本折线。手写 inline SVG（不引图表库：一条折线换不来一个依赖，而且它的
 * 空桶/单点边界我们自己写在 `chartPoints` 里，比读别人的文档便宜）。
 */
function CostChart({ days }: { days: readonly UsageDay[] }): ReactNode {
  const points = chartPoints(days, { width: CHART.width, height: CHART.height })
  if (points.length === 0) return null

  const max = days.reduce((acc, day) => Math.max(acc, day.costUsd), 0)
  const first = days[0]
  const last = days[days.length - 1]
  const polyline = points.map((point) => `${point.x.toFixed(1)},${point.y.toFixed(1)}`).join(' ')
  // 点太密时只画线：几百个圆点糊成一条带子，反而看不清
  const showDots = points.length <= 62

  return (
    <section className="usage-chart-card">
      <p className="section-title">每天花了多少</p>
      <svg
        className="usage-chart"
        viewBox={CHART_VIEWBOX}
        role="img"
        aria-label={`每日成本折线：${first?.date ?? ''} 到 ${last?.date ?? ''}，最高一天 ${formatUsd(max)}`}
      >
        <g transform={`translate(${CHART.padLeft}, ${CHART.padTop})`}>
          {/* 纵轴只标两端：这条线的意思是「哪天比哪天贵」，刻度多了是噪声 */}
          <text className="usage-axis" x={-8} y={4} textAnchor="end" dominantBaseline="hanging">
            {formatUsd(max)}
          </text>
          <text className="usage-axis" x={-8} y={CHART.height} textAnchor="end">
            $0
          </text>
          <line className="usage-axis-line" x1={0} y1={0} x2={CHART.width} y2={0} />
          <line className="usage-axis-line" x1={0} y1={CHART.height} x2={CHART.width} y2={CHART.height} />
          {/* 全是 0 时这条折线贴在底线上 —— 看起来还是「这段时间没花钱」，而不是空白 */}
          <polyline className="usage-line" points={polyline} />
          {showDots &&
            points.map((point) => (
              <circle key={point.date} className="usage-point" cx={point.x} cy={point.y} r={3.5}>
                <title>{`${point.date} · ${formatUsd(point.costUsd)} · ${point.runs} 轮`}</title>
              </circle>
            ))}
        </g>
        {first !== undefined && (
          <text className="usage-axis" x={CHART.padLeft} y={CHART_LABEL_Y}>
            {first.date.slice(5)}
          </text>
        )}
        {last !== undefined && points.length > 1 && (
          <text className="usage-axis" x={CHART.padLeft + CHART.width} y={CHART_LABEL_Y} textAnchor="end">
            {last.date.slice(5)}
          </text>
        )}
      </svg>
      {max === 0 && (
        <p className="usage-chart-note">
          {days.some((day) => day.runs > 0)
            ? '这段时间的轮次都没有牌价，金额一律不计 —— token 照记。'
            : '这段时间没有花钱。'}
        </p>
      )}
    </section>
  )
}
