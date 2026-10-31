import type { EngineInterface, Register, Timer } from 'claude-code'
import { formatLine } from './format'

// ターンの合間に書き直す間隔(D-015)。時間は分の単位で出すので、これより細かくしても見た目は変わらない
const REFRESH_MS = 60_000

let timer: Timer | undefined

// 今の値で1行を書き直す。値が無ければ行が消える(D-014)
async function refresh($: EngineInterface): Promise<void> {
  const [usage, now] = await Promise.all([$.session.usage(), $.clock.now()])
  $.ui.status(formatLine(usage, now))
}

export const register: Register = on => {
  on('session.start', async ($, e, next) => {
    // 有効にし直したときなどに時計が2つにならないよう、前のを止める(/clear では来ない)
    timer?.cancel()
    timer = $.clock.every(REFRESH_MS, () => void refresh($).catch(() => {})) // 読めなければ前の表示のまま
    await refresh($)
    return next(e)
  }).catch(($, e, next) => next(e)) // 読めなくてもセッションは止めない

  // 各ターンの後と、枠が1ポイント動いたとき
  on('session.measure', async ($, e, next) => {
    $.ui.status(formatLine(e, await $.clock.now()))
    return next(e)
  }).catch(($, e, next) => next(e))
}
