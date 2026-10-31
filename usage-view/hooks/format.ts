// 表示の部品。フックからは呼ばれるだけで、$ には触らない
import type { SessionUsage } from 'claude-code'

// 四角は5個、1つ20%(D-013)
const BOXES = 5

// 並べる順と、行に出す名前(D-003)
const LIMITS = [
  { kind: 'five_hour', label: '5h' },
  { kind: 'seven_day', label: '7d' },
] as const

const MINUTE = 60_000

// %の数字と四角の数がずれないよう、四捨五入した%から数える
export function gauge(percent: number): string {
  const n = Math.min(Math.max(Math.round(Math.round(percent) / (100 / BOXES)), 0), BOXES)
  return '■'.repeat(n) + '□'.repeat(BOXES - n)
}

// リセットまでの時間。1日以上は 1d8h、1日未満は 0h12m(D-009)。過ぎていたら 0h0m
export function untilReset(resetsAt: string, now: number): string | undefined {
  const at = Date.parse(resetsAt)
  if (Number.isNaN(at)) return undefined
  const minutes = Math.max(Math.floor((at - now) / MINUTE), 0)
  const days = Math.floor(minutes / (24 * 60))
  const hours = Math.floor((minutes % (24 * 60)) / 60)
  return days > 0 ? `${days}d${hours}h` : `${hours}h${minutes % 60}m`
}

function item(label: string, percent: number, time?: string): string {
  return `${label} ${gauge(percent)} ${Math.round(percent)}%${time ? `(${time})` : ''}`
}

// 1行にする。値が無い項目は外し、全部無ければ undefined(D-014)
export function formatLine(usage: Pick<SessionUsage, 'context' | 'rateLimits'>, now: number): string | undefined {
  const items: string[] = []
  // コンテキストには時間を付けない(D-006)
  if (usage.context.percent !== undefined) items.push(item('ctx', usage.context.percent))
  for (const { kind, label } of LIMITS) {
    const limit = usage.rateLimits.find(r => r.kind === kind)
    if (!limit) continue
    items.push(item(label, limit.percentUsed, limit.resetsAt && untilReset(limit.resetsAt, now)))
  }
  return items.length > 0 ? items.join(' │ ') : undefined
}
