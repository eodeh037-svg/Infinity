import fs from 'fs'
import { buildAuthoritativeSignal } from '../lib/signals/tradeSetup'
import { StrategyKey } from '../lib/signals/strategies'
import { Candle } from '../lib/indicators/types'
import {
  estimateCandleStepMs,
  resolveHorizonCandles,
  roundTripCostPrice,
  effectiveRisk,
} from '../lib/signals/backtest'

const DATA = JSON.parse(fs.readFileSync('/tmp/sigdata/candles.json', 'utf8'))
const STRATS = ['scalping', 'dayTrading', 'swingTrading'] as StrategyKey[]
const PAIRS = ['EUR/USD', 'GBP/USD', 'BTC/USD']
const STEP = 7
const LOOKBACK = 260
const MAX_H = 72
const HORIZONS = [6, 12, 24, 48, 72]

type Trade = {
  pair: string
  strategy: StrategyKey
  primaryTf: string
  index: number
  signal: 'BUY' | 'SELL'
  entry: number
  sl: number
  tp: number
  rr: number
  confidence: number
  entryType: string
  entryOffsetAtr: number
  riskAtr: number
  rewardAtr: number
  atr: number
  candles: Candle[]
  mfeR: Record<number, number>
  maeR: Record<number, number>
  hit1R: Record<number, number>
  hit15R: Record<number, number>
  hit2R: Record<number, number>
  outcome: Record<number, string>
  barsToExit: Record<number, number>
}

const ANALYSED: Record<string, { t: string[]; p: string }> = {
  scalping: { t: ['5min', '15min'], p: '5min' },
  dayTrading: { t: ['15min', '1h'], p: '1h' },
  swingTrading: { t: ['4h', '1day'], p: '1day' },
}

function tfsFor(strategy: StrategyKey): string[] {
  return ANALYSED[strategy].t
}

function primaryFor(strategy: StrategyKey): string {
  return ANALYSED[strategy].p
}

function genTrades(): { trades: Trade[]; holds: number; evals: number } {
  const trades: Trade[] = []
  let holds = 0
  let evals = 0

  for (const pair of PAIRS) {
    const primary = DATA[`${pair}|${primaryFor('dayTrading')}`] ?? DATA[`${pair}|1h`]
    for (const strategy of STRATS) {
      const pTf = primaryFor(strategy)
      const series = DATA[`${pair}|${pTf}`]
      if (!series || series.length < LOOKBACK + MAX_H + 5) continue
      const needed = tfsFor(strategy)

      for (let i = LOOKBACK; i <= series.length - 1 - MAX_H; i += STEP) {
        const asOf = series[i].time
        const map: Record<string, Candle[]> = {}
        let ok = true
        for (const tf of needed) {
          const arr: Candle[] = DATA[`${pair}|${tf}`]
          if (!arr) { ok = false; break }
          map[tf] = arr.filter(c => c.time <= asOf)
        }
        if (!ok) continue
        if ((map[pTf]?.length ?? 0) < 60) continue

        evals++
        const res = buildAuthoritativeSignal(map as any, strategy, 0)
        if (res.signal === 'HOLD' || res.entry === null || res.stopLoss === null || res.takeProfit === null) {
          holds++
          continue
        }
        const atr = res.indicators?.atr ?? 0
        const risk = Math.abs(res.entry - res.stopLoss)
        const reward = Math.abs(res.takeProfit - res.entry)
        const reference = series[i].close

        const t: Trade = {
          pair, strategy, primaryTf: pTf, index: i,
          signal: res.signal, entry: res.entry, sl: res.stopLoss, tp: res.takeProfit,
          rr: res.riskReward ?? 0, confidence: res.confidence,
          entryType: res.entryPlan?.type ?? 'unknown',
          entryOffsetAtr: atr > 0 ? Math.abs(reference - res.entry) / atr : 0,
          riskAtr: atr > 0 ? risk / atr : 0,
          rewardAtr: atr > 0 ? reward / atr : 0,
          atr, candles: series,
          mfeR: {}, maeR: {}, hit1R: {}, hit15R: {}, hit2R: {},
          outcome: {}, barsToExit: {},
        }
        trades.push(t)
      }
    }
  }
  return { trades, holds, evals }
}

function measure(t: Trade) {
  const risk = Math.abs(t.entry - t.sl)
  if (risk <= 0) return
  for (const h of HORIZONS) {
    let mfe = 0
    let mae = 0
    let hit1 = 0
    let hit15 = 0
    let hit2 = 0
    let outcome = 'TIMEOUT'
    let bars = h
    const end = Math.min(t.index + h, t.candles.length - 1)
    for (let j = t.index + 1; j <= end; j++) {
      const c = t.candles[j]
      const fav = t.signal === 'BUY' ? c.high - t.entry : t.entry - c.low
      const adv = t.signal === 'BUY' ? t.entry - c.low : c.high - t.entry
      if (fav > mfe) mfe = fav
      if (adv > mae) mae = adv
      if (fav >= risk * 1) hit1 = 1
      if (fav >= risk * 1.5) hit15 = 1
      if (fav >= risk * 2) hit2 = 1
      const slHit = t.signal === 'BUY' ? c.low <= t.sl : c.high >= t.sl
      const tpHit = t.signal === 'BUY' ? c.high >= t.tp : c.low <= t.tp
      if (slHit) { outcome = 'LOSS'; bars = j - t.index; break }
      if (tpHit) { outcome = 'WIN'; bars = j - t.index; break }
    }
    t.mfeR[h] = mfe / risk
    t.maeR[h] = mae / risk
    t.hit1R[h] = hit1
    t.hit15R[h] = hit15
    t.hit2R[h] = hit2
    t.outcome[h] = outcome
    t.barsToExit[h] = bars
  }
}

function rMult(t: Trade, h: number): number {
  const risk = Math.abs(t.entry - t.sl)
  const end = Math.min(t.index + h, t.candles.length - 1)
  let exitClose = t.entry
  let outcome = 'TIMEOUT'
  for (let j = t.index + 1; j <= end; j++) {
    const c = t.candles[j]
    const slHit = t.signal === 'BUY' ? c.low <= t.sl : c.high >= t.sl
    const tpHit = t.signal === 'BUY' ? c.high >= t.tp : c.low <= t.tp
    if (slHit) { outcome = 'LOSS'; exitClose = c.close; break }
    if (tpHit) { outcome = 'WIN'; exitClose = c.close; break }
    exitClose = c.close
  }
  if (outcome === 'WIN') return t.rr
  if (outcome === 'LOSS') return -1
  return t.signal === 'BUY' ? (exitClose - t.entry) / risk : (t.entry - exitClose) / risk
}

const { trades, holds, evals } = genTrades()
trades.forEach(measure)

const fmt = (n: number, d = 3) => (Number.isFinite(n) ? n.toFixed(d) : 'n/a')
const avg = (a: number[]) => (a.length ? a.reduce((x, y) => x + y, 0) / a.length : NaN)

const slBuckets: [string, number, number][] = [
  ['<1.5', 0, 1.5], ['1.5-1.75', 1.5, 1.75], ['1.75-2.0', 1.75, 2.0],
  ['2.0-2.5', 2.0, 2.5], ['2.5-3.0', 2.5, 3.0],
]
const rrBuckets: [string, number, number][] = [
  ['1.0-1.5', 1.0, 1.5], ['1.5-2.0', 1.5, 2.0], ['2.0-2.5', 2.0, 2.5],
  ['2.5-3.0', 2.5, 3.0], ['>3.0', 3.0, 99],
]
const confBuckets: [string, number, number][] = [
  ['<50', 0, 50], ['50-59', 50, 60], ['60-69', 60, 70], ['70-79', 70, 80], ['80+', 80, 999],
]

function summarizeRow(list: Trade[]): (string|number)[] {
  const s = stats(list, 24)
  return [s.n, fmt(s.wr,1), fmt(s.exp), fmt(s.mfe,2), fmt(s.mae,2)]
}

function targetRow(rr: number, h: number): (string|number)[] {
  let w = 0, l = 0, to = 0, sum = 0, mfe = 0
  for (const t of trades) {
    const risk = Math.abs(t.entry - t.sl)
    const tgt = t.signal === 'BUY' ? t.entry + risk * rr : t.entry - risk * rr
    const end = Math.min(t.index + h, t.candles.length - 1)
    let outcome = 'TIMEOUT'
    let f = 0
    for (let j = t.index + 1; j <= end; j++) {
      const c = t.candles[j]
      const fav = t.signal === 'BUY' ? c.high - t.entry : t.entry - c.low
      if (fav > f) f = fav
      const slHit = t.signal === 'BUY' ? c.low <= t.sl : c.high >= t.sl
      const tpHit = t.signal === 'BUY' ? c.high >= tgt : c.low <= tgt
      if (slHit) { outcome = 'LOSS'; break }
      if (tpHit) { outcome = 'WIN'; break }
    }
    mfe += f / risk
    if (outcome === 'WIN') { w++; sum += rr }
    else if (outcome === 'LOSS') { l++; sum -= 1 }
    else { to++ }
  }
  const n = trades.length
  return [fmt((w/n)*100,1), fmt((l/n)*100,1), fmt((to/n)*100,1), fmt(sum/n), fmt(mfe/n,2)]
}

function stats(list: Trade[], h: number) {
  const w = list.filter(t => t.outcome[h] === 'WIN').length
  const l = list.filter(t => t.outcome[h] === 'LOSS').length
  const to = list.filter(t => t.outcome[h] === 'TIMEOUT').length
  const closed = w + l
  const exp = list.length ? avg(list.map(t => rMult(t, h))) : NaN
  return {
    n: list.length, win: w, loss: l, to,
    wr: closed ? (w / closed) * 100 : NaN,
    exp,
    mfe: avg(list.map(t => t.mfeR[h])),
    mae: avg(list.map(t => t.maeR[h])),
    rr: avg(list.map(t => t.rr)),
  }
}

function table(title: string, rows: any[]) {
  console.log(`\n### ${title}`)
  console.log(rows.map(r => r.join(' | ')).join('\n'))
}

console.log(`evaluations=${evals} holds=${holds} holdRate=${((holds / evals) * 100).toFixed(1)}% signals=${trades.length}`)

function show(title: string, header: string[], rows: (string|number)[][]) {
  console.log('\n### ' + title)
  console.log(header.join(' | '))
  for (const r of rows) console.log(r.join(' | '))
}

const H = HORIZONS
const pct = (x: number) => fmt(x, 1)

const horizonRows = (list: Trade[]) => H.map(h => {
  const s = stats(list, h)
  return ['H=' + h, s.n, pct(s.wr), pct((s.loss/s.n)*100), pct((s.to/s.n)*100),
    fmt(s.rr,2), fmt(s.exp), fmt(s.mfe,2), fmt(s.mae,2)]
})
const HHDR = ['horizon','n','win%','loss%','timeout%','avgRR','expectR','MFE_R','MAE_R']

show('PART2 HORIZON SWEEP (ALL)', HHDR, horizonRows(trades))
for (const pair of PAIRS) show('HORIZON SWEEP ' + pair, HHDR, horizonRows(trades.filter(t => t.pair === pair)))

const entryRows: (string|number)[][] = []
for (const tp of ['market','pullback']) {
  const l = trades.filter(t => t.entryType === tp)
  const s = stats(l, 24)
  entryRows.push([tp, s.n, pct(s.wr), fmt(s.exp), fmt(s.mfe,2), fmt(s.mae,2),
    fmt(avg(l.map(t => t.entryOffsetAtr)),2), fmt(s.rr,2)])
}
show('PART4 ENTRY TYPE @24', ['type','n','win%','E_R','MFE_R','MAE_R','entryOffsetATR','avgRR'], entryRows)

const slRows: (string|number)[][] = []
for (const [label, lo, hi] of slBuckets) {
  const l = trades.filter(t => t.riskAtr >= lo && t.riskAtr < hi)
  const s = stats(l, 24)
  slRows.push([label, s.n, pct(s.wr), fmt(s.exp), fmt(s.mfe,2), fmt(s.mae,2),
    pct(avg(l.map(t => t.hit1R[24]))*100), pct(avg(l.map(t => t.hit2R[24]))*100)])
}
show('PART5 SL DISTANCE (ATR) @24', ['bucket','n','win%','E_R','MFE_R','MAE_R','reached1R%','reached2R%'], slRows)

const rrRows: (string|number)[][] = []
for (const [label, lo, hi] of rrBuckets) {
  const l = trades.filter(t => t.rr >= lo && t.rr < hi)
  const s = stats(l, 24)
  rrRows.push([label, s.n, pct(s.wr), fmt(s.exp), fmt(avg(l.map(t => t.barsToExit[24])),1),
    pct(avg(l.map(t => t.hit1R[24]))*100), pct(avg(l.map(t => t.hit15R[24]))*100),
    pct(avg(l.map(t => t.hit2R[24]))*100)])
}
show('PART6 TARGET RR @24', ['bucket','n','win%','E_R','avgBarsToExit','reached1R%','reached1.5R%','reached2R%'], rrRows)

const dirRows: (string|number)[][] = []
dirRows.push(['BUY', ...summarizeRow(trades.filter(t => t.signal === 'BUY'))])
dirRows.push(['SELL', ...summarizeRow(trades.filter(t => t.signal === 'SELL'))])
for (const p of PAIRS) dirRows.push([p, ...summarizeRow(trades.filter(t => t.pair === p))])
for (const s of STRATS) dirRows.push([s, ...summarizeRow(trades.filter(t => t.strategy === s))])
for (const tf of [...new Set(trades.map(t => t.primaryTf))]) {
  dirRows.push(['tf:' + tf, ...summarizeRow(trades.filter(t => t.primaryTf === tf))])
}
show('PART7 DIRECTION / PAIR / STRATEGY / TF @24', ['group','n','win%','E_R','MFE_R','MAE_R'], dirRows)

const confRows: (string|number)[][] = []
for (const [label, lo, hi] of confBuckets) {
  const l = trades.filter(t => t.confidence >= lo && t.confidence < hi)
  confRows.push([label, ...summarizeRow(l)])
}
show('PART7 CONFIDENCE @24', ['bucket','n','win%','E_R','MFE_R','MAE_R'], confRows)

const tgtRows: (string|number)[][] = []
for (const rr of [1.0,1.25,1.5,1.75,2.0,2.25,2.5,3.0]) {
  tgtRows.push([rr, ...targetRow(rr, 24)])
}
show('PART9 TARGET MULTIPLE SWEEP @24 (analysis only)', ['targetR','win%','loss%','timeout%','E_R','MFE_R'], tgtRows)

const compRows: (string|number)[][] = []
for (const p of PAIRS) compRows.push(['pair', p, trades.filter(t => t.pair === p).length, pct(trades.filter(t => t.pair === p).length/trades.length*100)])
for (const s of STRATS) compRows.push(['strategy', s, trades.filter(t => t.strategy === s).length, pct(trades.filter(t => t.strategy === s).length/trades.length*100)])
for (const tf of [...new Set(trades.map(t => t.primaryTf))]) compRows.push(['timeframe', tf, trades.filter(t => t.primaryTf === tf).length, pct(trades.filter(t => t.primaryTf === tf).length/trades.length*100)])
for (const d of ['BUY','SELL']) compRows.push(['direction', d, trades.filter(t => t.signal === d).length, pct(trades.filter(t => t.signal === d).length/trades.length*100)])
for (const [label, lo, hi] of confBuckets) compRows.push(['confidence', label, trades.filter(t => t.confidence >= lo && t.confidence < hi).length, pct(trades.filter(t => t.confidence >= lo && t.confidence < hi).length/trades.length*100)])
show('PART11 SAMPLE COMPOSITION', ['dim','value','n','share%'], compRows)

const sl2 = trades.map(t => t.riskAtr).sort((a,b)=>a-b)
const rr2 = trades.map(t => t.rr).sort((a,b)=>a-b)
const q = (a: number[], p: number) => a.length ? a[Math.min(a.length-1, Math.floor(a.length*p))] : NaN
console.log('\n### RISK/REWARD DISTRIBUTION')
console.log('SL(ATR) p10=' + fmt(q(sl2,.1)) + ' p50=' + fmt(q(sl2,.5)) + ' p90=' + fmt(q(sl2,.9)))
console.log('TP(RR)  p10=' + fmt(q(rr2,.1)) + ' p50=' + fmt(q(rr2,.5)) + ' p90=' + fmt(q(rr2,.9)))

const json = trades.map(({ candles, mfeR, maeR, hit1R, hit15R, hit2R, outcome, barsToExit, ...rest }) => rest)
fs.writeFileSync('/tmp/sigdata/trades.json', JSON.stringify(json))
console.log('\nwrote /tmp/sigdata/trades.json n=' + json.length)

const FX_COSTS = { spreadPips: 0.6, commissionPips: 0.15, slippagePips: 0.1, pipSize: 0.0001 }
const BTC_COSTS = { spreadBp: 2, commissionBp: 0.5, slippageBp: 0.5 }

function costRFor(t: Trade): number {
  const costs = t.pair === 'BTC/USD' ? BTC_COSTS : FX_COSTS
  return roundTripCostPrice(costs)(t.entry) / effectiveRisk(t.entry, t.sl)
}

function netExp(list: Trade[]): number {
  return avg(list.map(t => rMult(t, 24) - costRFor(t)))
}

const costGroupRows: (string|number)[][] = []
for (const pair of PAIRS) {
  const list = trades.filter(t => t.pair === pair)
  costGroupRows.push(['pair', pair, ...costRow(list)])
}
for (const s of STRATS) {
  const list = trades.filter(t => t.strategy === s)
  costGroupRows.push(['strategy', s, ...costRow(list)])
}
for (const [label, lo, hi] of confBuckets) {
  const list = trades.filter(t => t.confidence >= lo && t.confidence < hi)
  costGroupRows.push(['confidence', label, ...costRow(list)])
}
show(
  'PART20 COSTS vs GROSS/NET EXPECTANCY @24 (FX pips / crypto bp, production helper)',
  ['dim', 'value', 'n', 'costR_p50', 'costR_mean', 'expGross', 'expNet'],
  costGroupRows
)

function costRow(list: Trade[]): (string|number)[] {
  const costs = list.map(costRFor).sort((a, b) => a - b)
  const p50 = costs.length ? costs[Math.floor(costs.length / 2)] : NaN
  return [
    list.length,
    fmt(p50),
    fmt(avg(costs)),
    fmt(avg(list.map(t => rMult(t, 24)))),
    fmt(netExp(list)),
  ]
}

const wcRows: (string|number)[][] = []
for (const pair of PAIRS) {
  for (const s of STRATS) {
    const pTf = primaryFor(s)
    const series = DATA[`${pair}|${pTf}`]
    if (!series) continue
    const step = estimateCandleStepMs(series)
    const h1 = resolveHorizonCandles(series, { horizonHours: 1 })
    const h24 = resolveHorizonCandles(series, { horizonHours: 24 })
    wcRows.push([pair, s, pTf, fmt((step ?? 0) / 60000, 0) + 'min', h1, h24])
  }
}
show('PART20 WALL-CLOCK HORIZON CONVERSION (confirmed step per series)', ['pair', 'strategy', 'primaryTf', 'step', 'candles@1h', 'candles@24h'], wcRows)
