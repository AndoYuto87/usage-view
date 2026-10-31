import { expect, mock, test } from 'claude-code/testing'
import type { SessionUsage } from 'claude-code'
import type { Engine, MockClock } from 'claude-code/testing'

const start = Date.parse('2026-10-31T10:08:00Z')
const at = (minutes: number) => new Date(start + minutes * 60_000).toISOString()

const full: SessionUsage = {
  startedAt: start,
  context: { window: 1_000_000, tokens: 100_000, percent: 10 },
  rateLimits: [
    { kind: 'five_hour', percentUsed: 35, resetsAt: at(12) },
    { kind: 'seven_day', percentUsed: 45, resetsAt: at(32 * 60) },
  ],
}
const empty: SessionUsage = { startedAt: start, context: { window: 1_000_000 }, rateLimits: [] }

let status: string | undefined
let usage: SessionUsage
let isBroken = false // true なら $.session.usage() が読めない
let clock: MockClock

function engine(on: Parameters<Parameters<typeof test>[1]>[1], first: SessionUsage = full) {
  status = 'まだ出ていない'
  usage = first
  isBroken = false
  clock = mock.clock(on, { now: start })
  on('session.start', (_, e) => ({ cwd: e.cwd }))
  on('session.measure', (_, e) => ({ changed: e.changed }))
  on('session.usage', () => {
    if (isBroken) throw new Error('読めない')
    return { value: usage }
  })
  on('ui.status', (_, e) => ((status = e.text), { value: undefined }))
}

const begin = ($: Engine) => $.session.start({ cwd: '/', surface: 'vscode', isInteractive: true })

test('session.start で1行が出る', async ($, on) => {
  engine(on)
  await begin($)
  expect(status).toBe('ctx ■□□□□ 10% │ 5h ■■□□□ 35%(0h12m) │ 7d ■■□□□ 45%(1d8h)')
})

test('session.measure で新しい値になる', async ($, on) => {
  engine(on)
  await begin($)
  await $.session.measure({
    context: { window: 1_000_000, tokens: 500_000, percent: 50 },
    rateLimits: [
      { kind: 'five_hour', percentUsed: 61.5, resetsAt: at(12) },
      { kind: 'seven_day', percentUsed: 47, resetsAt: at(32 * 60) },
    ],
    changed: ['context', 'rateLimits'],
  })
  expect(status).toBe('ctx ■■■□□ 50% │ 5h ■■■□□ 62%(0h12m) │ 7d ■■□□□ 47%(1d8h)')
})

test('ターンの合間も60秒ごとに書き直し、時間が減る', async ($, on) => {
  engine(on)
  await begin($)
  await clock.advance(59_000)
  expect(status).toBe('ctx ■□□□□ 10% │ 5h ■■□□□ 35%(0h12m) │ 7d ■■□□□ 45%(1d8h)')
  await clock.advance(1_000)
  expect(status).toBe('ctx ■□□□□ 10% │ 5h ■■□□□ 35%(0h11m) │ 7d ■■□□□ 45%(1d7h)')
  await clock.advance(60_000)
  expect(status).toBe('ctx ■□□□□ 10% │ 5h ■■□□□ 35%(0h10m) │ 7d ■■□□□ 45%(1d7h)')
})

test('値が無ければ行を消す', async ($, on) => {
  // セッションの始めで、まだ何も無い
  engine(on, empty)
  await begin($)
  expect(status).toBe(undefined)
  // 出ていた行も、値が無くなれば消える
  await $.session.measure({ ...full, changed: ['context'] })
  expect(status).not.toBe(undefined)
  await $.session.measure({ ...empty, changed: ['context', 'rateLimits'] })
  expect(status).toBe(undefined)
})

test('読めなくてもセッションは止めず、前の表示のまま', async ($, on) => {
  engine(on)
  await begin($)
  const shown = status
  isBroken = true
  await clock.advance(60_000)
  expect(status).toBe(shown)
  // 読めるようになれば、また書き直す
  isBroken = false
  await clock.advance(60_000)
  expect(status).toBe('ctx ■□□□□ 10% │ 5h ■■□□□ 35%(0h10m) │ 7d ■■□□□ 45%(1d7h)')
})

test('始めに読めなくても、セッションは始まる', async ($, on) => {
  engine(on)
  isBroken = true
  expect(await begin($)).toEqual({ cwd: '/' })
  isBroken = false
  await clock.advance(60_000)
  expect(status).toBe('ctx ■□□□□ 10% │ 5h ■■□□□ 35%(0h11m) │ 7d ■■□□□ 45%(1d7h)')
})
