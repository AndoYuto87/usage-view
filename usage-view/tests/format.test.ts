import { expect, test } from 'claude-code/testing'
import { formatLine, gauge, untilReset } from '../hooks/format'

const now = Date.parse('2026-10-31T10:08:00Z')
const at = (minutes: number, seconds = 0) => new Date(now + minutes * 60_000 + seconds * 1000).toISOString()

test('四角は5個、20%ごとの境目で増える', async () => {
  // D-013 の例
  expect(gauge(10)).toBe('■□□□□')
  expect(gauge(35)).toBe('■■□□□')
  expect(gauge(45)).toBe('■■□□□')
  // 境目
  expect(gauge(0)).toBe('□□□□□')
  expect(gauge(9)).toBe('□□□□□')
  expect(gauge(29)).toBe('■□□□□')
  expect(gauge(30)).toBe('■■□□□')
  expect(gauge(89)).toBe('■■■■□')
  expect(gauge(90)).toBe('■■■■■')
  expect(gauge(100)).toBe('■■■■■')
  // 四捨五入した%から数える(9.6% は 10% と出るので1個)
  expect(gauge(9.6)).toBe('■□□□□')
  // 0〜5個に収める
  expect(gauge(120)).toBe('■■■■■')
  expect(gauge(-5)).toBe('□□□□□')
})

test('1日未満は時間と分、1日以上は日と時間', async () => {
  expect(untilReset(at(12), now)).toBe('0h12m')
  expect(untilReset(at(80), now)).toBe('1h20m')
  expect(untilReset(at(23 * 60 + 59), now)).toBe('23h59m')
  expect(untilReset(at(24 * 60), now)).toBe('1d0h')
  expect(untilReset(at(32 * 60 + 59), now)).toBe('1d8h')
  // 分は切り捨て
  expect(untilReset(at(12, 59), now)).toBe('0h12m')
})

test('過ぎた時刻は 0h0m、読めない時刻は undefined', async () => {
  expect(untilReset(at(0, 30), now)).toBe('0h0m')
  expect(untilReset(at(-5), now)).toBe('0h0m')
  expect(untilReset('not a date', now)).toBe(undefined)
})

test('3つを決まった順に1行に並べる', async () => {
  const line = formatLine(
    {
      context: { window: 1_000_000, percent: 10 },
      rateLimits: [
        { kind: 'seven_day', percentUsed: 45, resetsAt: at(32 * 60) },
        { kind: 'five_hour', percentUsed: 34.6, resetsAt: at(12) },
      ],
    },
    now,
  )
  expect(line).toBe('ctx ■□□□□ 10% │ 5h ■■□□□ 35%(0h12m) │ 7d ■■□□□ 45%(1d8h)')
})

test('値が無い項目は外し、時刻が無ければ括弧を付けない', async () => {
  // セッションの始めは ctx の%が無い
  expect(
    formatLine({ context: { window: 1_000_000 }, rateLimits: [{ kind: 'five_hour', percentUsed: 32, resetsAt: at(20) }] }, now),
  ).toBe('5h ■■□□□ 32%(0h20m)')
  // API キーで使うときは枠が無い。ほかの枠(spend_limit など)は出さない
  expect(
    formatLine({ context: { window: 200_000, percent: 8 }, rateLimits: [{ kind: 'spend_limit', percentUsed: 50 }] }, now),
  ).toBe('ctx □□□□□ 8%')
  expect(formatLine({ context: { window: 200_000 }, rateLimits: [{ kind: 'seven_day', percentUsed: 45 }] }, now)).toBe(
    '7d ■■□□□ 45%',
  )
})

test('3つとも無ければ undefined', async () => {
  expect(formatLine({ context: { window: 200_000 }, rateLimits: [] }, now)).toBe(undefined)
})
