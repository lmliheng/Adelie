// src/lib/format.ts
//
// 显示用的小工具。全在这里是为了让「时间怎么措辞」「token 怎么缩写」只有一处定义。

/** 相对时间：刚刚 / 5 分钟前 / 3 小时前 / 昨天 14:02 / 10-02 14:02 / 2025-10-02 14:02 */
export function relativeTime(ts: number, now: number = Date.now()): string {
  if (!Number.isFinite(ts) || ts <= 0) return '时间未知'
  const diff = now - ts
  if (diff < 45_000) return '刚刚'
  if (diff < 3_600_000) return `${Math.max(1, Math.round(diff / 60_000))} 分钟前`
  const startOfToday = new Date(now)
  startOfToday.setHours(0, 0, 0, 0)
  if (ts >= startOfToday.getTime()) return `${Math.round(diff / 3_600_000)} 小时前`
  if (ts >= startOfToday.getTime() - 86_400_000) return `昨天 ${clockTime(ts)}`
  const date = new Date(ts)
  const sameYear = date.getFullYear() === new Date(now).getFullYear()
  return sameYear ? `${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${clockTime(ts)}` : `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${clockTime(ts)}`
}

/** HH:MM:SS / HH:MM */
export function clockTime(ts: number, withSeconds = false): string {
  if (!Number.isFinite(ts)) return '--:--'
  const date = new Date(ts)
  return withSeconds
    ? `${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}`
    : `${pad(date.getHours())}:${pad(date.getMinutes())}`
}

/** 秒数 → 12s / 1m 20s（代码/日志口径） */
export function duration(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds < 0) return '0s'
  if (seconds < 60) return `${seconds.toFixed(seconds < 10 ? 1 : 0)}s`
  const minutes = Math.floor(seconds / 60)
  return `${minutes}m ${Math.round(seconds % 60)}s`
}

/** 秒数 → 12 秒 / 51 分钟 / 2 小时 5 分钟（界面文案口径，不夹英文单位） */
export function durationZh(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds < 0) return '0 秒'
  if (seconds < 60) return `${Math.round(seconds)} 秒`
  const minutes = Math.round(seconds / 60)
  if (minutes < 60) return `${minutes} 分钟`
  const hours = Math.floor(minutes / 60)
  const rest = minutes % 60
  return rest === 0 ? `${hours} 小时` : `${hours} 小时 ${rest} 分钟`
}

/** token 数：1234 → 1.2k */
export function compactNumber(value: number | null | undefined): string {
  if (value === null || value === undefined || !Number.isFinite(value)) return '—'
  if (Math.abs(value) < 1000) return String(value)
  if (Math.abs(value) < 1_000_000) return `${(value / 1000).toFixed(value < 10_000 ? 1 : 0)}k`
  return `${(value / 1_000_000).toFixed(1)}M`
}

/** 把绝对路径缩短成末尾两段，给侧栏一类的窄位置用 */
export function shortenPath(path: string): string {
  if (path === '') return ''
  const parts = path.split('/').filter((part) => part !== '')
  if (parts.length <= 3) return path
  return `…/${parts.slice(-2).join('/')}`
}

function pad(value: number): string {
  return String(value).padStart(2, '0')
}
