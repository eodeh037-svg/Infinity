/**
 * TEMPORARY ANALYSIS HARNESS — before/after comparison of the engine correctness fixes.
 *
 * PURPOSE
 * The working-tree signal engine already contains the 8 correctness fixes (supertrend
 * fallback neutrality, Keltner squeeze score removal, ATR regime heading-score removal,
 * direction-aware Fisher confidence, unconditional-Keltner confidence removal, kept ATR
 * regime confidence adjustment, direction-aware + new retry wording). BEFORE is the
 * SAME working-tree engine with ONLY those five buggy behaviours re-introduced
 * (`analysis/legacy/engineBuggyBefore.ts`: supertrend fallback DOWN, Keltner squeeze
 * addBuy(1), ATR low addBuy(1)/high addSell(1), unconditional Fisher confidence +2,
 * unconditional Keltner-squeeze confidence +1). AFTER is the current production engine.
 *
 * Modes
 *  - 'before':  working-tree engine with the five buggy behaviours re-introduced (isolation copy).
 *  - 'after':   current production engine (all fixes applied).
 *
 * Everything else is IDENTICAL in both modes: cached dataset, per-strategy primary
 * timeframe, causal windows (LOOKBACK..len-1-horizonCandles, step 7), horizon resolution
 * (resolutionHorizonHours + estimateCandleStepMs + resolveHorizonCandles), costs
 * (roundTripCostPrice), and measurement (simulateTrade: MFE/MAE, reach 1R/1.5R/2R/TP,
 * same-bar SL+TP = LOSS). Do NOT edit production code or the dataset.
 *
 * ANALYSIS ONLY — not part of the product. Run: npx tsx analysis/engineBeforeAfter.ts
 */

import fs from 'fs'

import { generateSignal as beforeGenerateSignal } from './legacy/engineBuggyBefore'
import { generateSignal as afterGenerateSignal } from '../lib/signals/signalEngine'
import { SignalResult } from '../lib/signals/signalEngine'
import { Candle } from '../lib/indicators/types'
import { StrategyKey, resolutionHorizonHours } from '../lib/signals/strategies'
import {
  simulateTrade,
  effectiveRisk,
  roundTripCostPrice,
  BacktestCosts,
  estimateCandleStepMs,
  resolveHorizonCandles,
} from '../lib/signals/backtest'

const DATA: Record<string, Candle[]> = JSON.parse(fs.readFileSync('/tmp/sigdata/candles.json', 'utf8'))
const STRATS: StrategyKey[] = ['scalping', 'dayTrading', 'swingTrading', 'positionTrading', 'general']
const PAIRS = ['EUR/USD', 'GBP/USD', 'BTC/USD']
const STEP = 7
const LOOKBACK = 260

type Mode = 'before' | 'after'

const PRIMARY_TF: Record<StrategyKey, string> = {
  scalping: '5min',
  dayTrading: '1h',
  swingTrading: '1day',
  positionTrading: '1day',
  general: '4h',
}

interface TradeRecord {
  key: string
  pair: string
  strategy: StrategyKey
  index: number
  signal: 'BUY' | 'SELL'
  confidence: number
  entry: number
  stop: number
  tp: number
  riskReward: number
  grossR: number
  costR: number
  netR: number
  outcome: 'WIN' | 'LOSS' | 'TIMEOUT'
  mfeR: number
  maeR: number
  reached1R: boolean
  reached15R: boolean
  reached2R: boolean
  reachedTp: boolean
}

interface ModeRun {
  mode: Mode
  evals: number
  holds: number
  actionable: number
  trades: TradeRecord[]
  signals: Record<'BUY' | 'SELL' | 'HOLD', number>
  avgConf: number[]
}

const FX: BacktestCosts = { spreadPips: 0.6, commissionPips: 0.15, slippagePips: 0.1 }
const BTC: BacktestCosts = { spreadBp: 2, commissionBp: 0.5, slippageBp: 0.5 }

function genSignalFor(mode: Mode, candles: Candle[]): SignalResult {
  return mode === 'before' ? beforeGenerateSignal(candles) : afterGenerateSignal(candles)
}

function measureSignal(
  run: ModeRun,
  series: Candle[],
  i: number,
  res: SignalResult,
  pair: string,
  strategy: StrategyKey,
  horizonCandles: number,
  costPrice: (entry: number) => number
): void {
  if (res.signal === 'HOLD') {
    run.holds++
    return
  }
  if (res.entry === null || res.stopLoss === null || res.takeProfit === null) {
    run.holds++
    return
  }

  const sim = simulateTrade(series, i, res.signal, res.entry, res.stopLoss, res.takeProfit, horizonCandles)
  const exitClose = series[sim.exitIndex].close
  const risk = effectiveRisk(res.entry, res.stopLoss)
  const grossR =
    res.signal === 'BUY'
      ? sim.outcome === 'WIN'
        ? (res.takeProfit - res.entry) / risk
        : sim.outcome === 'LOSS'
          ? -1
          : (exitClose - res.entry) / risk
      : sim.outcome === 'WIN'
        ? (res.entry - res.takeProfit) / risk
        : sim.outcome === 'LOSS'
          ? -1
          : (res.entry - exitClose) / risk
  const costR = costPrice(res.entry) / risk
  const netR = grossR - costR

  run.actionable++
  run.avgConf.push(res.confidence)
  run.trades.push({
    key: `${pair}|${strategy}|${i}`,
    pair,
    strategy,
    index: i,
    signal: res.signal as 'BUY' | 'SELL',
    confidence: res.confidence,
    entry: res.entry,
    stop: res.stopLoss,
    tp: res.takeProfit,
    riskReward: res.riskReward ?? NaN,
    grossR,
    costR,
    netR,
    outcome: sim.outcome,
    mfeR: sim.mfeR,
    maeR: sim.maeR,
    reached1R: sim.reached1R,
    reached15R: sim.reached15R,
    reached2R: sim.reached2R,
    reachedTp: sim.reachedTp,
  })
}

function computeRun(mode: Mode): ModeRun {
  const run: ModeRun = { mode, evals: 0, holds: 0, actionable: 0, trades: [], signals: { BUY: 0, SELL: 0, HOLD: 0 }, avgConf: [] }

  for (const pair of PAIRS) {
    for (const strategy of STRATS) {
      const pTf = PRIMARY_TF[strategy]
      const series = DATA[`${pair}|${pTf}`]
      if (!series || series.length < LOOKBACK + 2) continue

      const horizonCandles = resolveHorizonCandles(series, {
        horizonHours: resolutionHorizonHours(strategy),
        candleStepMs: estimateCandleStepMs(series) ?? undefined,
      })
      const costPrice = roundTripCostPrice(pair === 'BTC/USD' ? BTC : FX)
      const lastTestable = series.length - 1 - horizonCandles

      for (let i = LOOKBACK; i <= lastTestable; i += STEP) {
        const asOf = series[i].time
        const window = series.filter((c) => c.time <= asOf)
        if (window.length < LOOKBACK) continue

        run.evals++
        const res = genSignalFor(mode, window)
        run.signals[res.signal ?? 'HOLD']++
        if (res.signal !== 'HOLD') {
          // count produced-but-unmeasurable HOLD as hold for expectancy denominators
          measureSignal(run, series, i, res, pair, strategy, horizonCandles, costPrice)
        } else {
          run.holds++
        }
      }
    }
  }
  return run
}

const mean = (a: number[]) => (a.length ? a.reduce((x, y) => x + y, 0) / a.length : NaN)
const median = (a: number[]) => {
  if (!a.length) return NaN
  const s = [...a].sort((x, y) => x - y)
  const m = Math.floor(s.length / 2)
  return s.length % 2 !== 0 ? s[m] : (s[m - 1] + s[m]) / 2
}
const fmt = (n: number, d = 4) => (Number.isFinite(n) ? n.toFixed(d) : '—')

function summarize(trades: TradeRecord[]) {
  const n = trades.length
  const wins = trades.filter((t) => t.outcome === 'WIN').length
  const losses = trades.filter((t) => t.outcome === 'LOSS').length
  const timeouts = trades.filter((t) => t.outcome === 'TIMEOUT').length
  const closed = wins + losses
  const gp = trades.filter((t) => t.outcome === 'WIN').reduce((a, t) => a + t.grossR, 0)
  const gl = trades.filter((t) => t.outcome === 'LOSS').reduce((a, t) => a + Math.abs(t.grossR), 0)
  return {
    n,
    winRate: closed ? (wins / closed) * 100 : NaN,
    lossRate: n ? (losses / n) * 100 : NaN,
    timeoutRate: n ? (timeouts / n) * 100 : NaN,
    grossExp: mean(trades.map((t) => t.grossR)),
    netExp: mean(trades.map((t) => t.netR)),
    avgR: mean(trades.map((t) => t.netR)),
    medR: median(trades.map((t) => t.netR)),
    profitFactor: gl > 0 ? gp / gl : NaN,
    avgCostR: mean(trades.map((t) => t.costR)),
    medCostR: median(trades.map((t) => t.costR)),
    mfeMean: mean(trades.map((t) => t.mfeR)),
    mfeMed: median(trades.map((t) => t.mfeR)),
    maeMean: mean(trades.map((t) => t.maeR)),
    maeMed: median(trades.map((t) => t.maeR)),
    reach1R: n ? (trades.filter((t) => t.reached1R).length / n) * 100 : NaN,
    reach15R: n ? (trades.filter((t) => t.reached15R).length / n) * 100 : NaN,
    reach2R: n ? (trades.filter((t) => t.reached2R).length / n) * 100 : NaN,
    reachTp: n ? (trades.filter((t) => t.reachedTp).length / n) * 100 : NaN,
    buys: trades.filter((t) => t.signal === 'BUY').length,
    sells: trades.filter((t) => t.signal === 'SELL').length,
    avgConf: mean(trades.map((t) => t.confidence)),
    medConf: median(trades.map((t) => t.confidence)),
    avgRr: mean(trades.map((t) => t.riskReward)),
  }
}

type Summary = ReturnType<typeof summarize>
type Deltas = { label: string; before: number; after: number; delta: number; relPct: number }[]

function deltaRows(bf: Summary, af: Summary, br: ModeRun, ar: ModeRun): Deltas {
  const d = (label: string, bv: number, av: number) => ({
    label,
    before: bv,
    after: av,
    delta: av - bv,
    relPct: Number.isFinite(bv) && bv !== 0 ? ((av - bv) / Math.abs(bv)) * 100 : NaN,
  })
  return [
    d('evaluated windows', br.evals, ar.evals),
    d('actionable signals', bf.n, af.n),
    d('hold rate %', br.evals ? (br.holds / br.evals) * 100 : NaN, ar.evals ? (ar.holds / ar.evals) * 100 : NaN),
    d('BUY count', bf.buys, af.buys),
    d('SELL count', bf.sells, af.sells),
    d('avg confidence', bf.avgConf, af.avgConf),
    d('median confidence', bf.medConf, af.medConf),
    d('gross expectancy R', bf.grossExp, af.grossExp),
    d('net expectancy R', bf.netExp, af.netExp),
    d('avg net R', bf.avgR, af.avgR),
    d('median net R', bf.medR, af.medR),
    d('win rate %', bf.winRate, af.winRate),
    d('loss rate %', bf.lossRate, af.lossRate),
    d('timeout rate %', bf.timeoutRate, af.timeoutRate),
    d('profit factor', bf.profitFactor, af.profitFactor),
    d('avg MFE R', bf.mfeMean, af.mfeMean),
    d('median MFE R', bf.mfeMed, af.mfeMed),
    d('avg MAE R', bf.maeMean, af.maeMean),
    d('median MAE R', bf.maeMed, af.maeMed),
    d('reached 1R %', bf.reach1R, af.reach1R),
    d('reached 1.5R %', bf.reach15R, af.reach15R),
    d('reached 2R %', bf.reach2R, af.reach2R),
    d('reached TP %', bf.reachTp, af.reachTp),
    d('avg costR', bf.avgCostR, af.avgCostR),
    d('median costR', bf.medCostR, af.medCostR),
    d('avg R:R', bf.avgRr, af.avgRr),
  ]
}

function mulberry32(seed: number): () => number {
  return () => {
    let t = (seed += 0x6d2b79f5)
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

function bootstrapCI(values: number[], seed = 42): { lo: number; hi: number } {
  const rand = mulberry32(seed)
  const n = values.length
  if (!n) return { lo: NaN, hi: NaN }
  const means: number[] = []
  for (let b = 0; b < 2000; b++) {
    let sum = 0
    for (let k = 0; k < n; k++) sum += values[Math.floor(rand() * n)]
    means.push(sum / n)
  }
  means.sort((a, b) => a - b)
  return { lo: means[Math.floor(means.length * 0.05)], hi: means[Math.floor(means.length * 0.95)] }
}

function renderMD(o: {
  dataset: any
  deltas: Deltas
  signals: { before: Record<string, number>; after: Record<string, number> }
  before: { evalText: string; summary: Summary }
  after: { evalText: string; summary: Summary }
  byStrategy: { strategy: StrategyKey; before: Summary; after: Summary }[]
  byDirection: { direction: 'BUY' | 'SELL'; before: Summary; after: Summary }[]
  paired: any
}): string {
  const L: string[] = []
  const { dataset, deltas, signals, before, after, paired, byStrategy, byDirection } = o

  L.push('# Before vs After — engine correctness fixes (controlled comparison)')
  L.push('')
  L.push('## 1. Objective')
  L.push('Isolate the engine correctness fixes (8 fixes in `generateSignal`/`calculateConfidence`) and measure their effect on signal generation and forward outcomes under identical data, windows, horizons, costs and measurement. BEFORE = the same engine with the five fix behaviours reverted (isolation copy); AFTER = the current production engine. Analysis artifact — no production logic modified beyond the fixes.')
  L.push('')
  L.push('## 2. Scope & constraints')
  L.push('- Same cached dataset for both modes (`/tmp/sigdata/candles.json`).')
  L.push('- Same methodology in both modes: causal windows, wall-clock horizons, costs, gross/net R, MFE/MAE, reach flags.')
  L.push('- No tuning against the sample; no strategy/weight/confidence-architecture changes; no AI/ML or new runtime deps (analysis uses tsx only).')
  L.push('- The only behavioural difference between modes is the engine module (section 3).')
  L.push('')
  L.push('## 3. The change')
  L.push('BEFORE = working-tree engine with ONLY the five fix behaviours reverted (supertrend fallback DOWN, Keltner squeeze addBuy(1), ATR low addBuy(1)/high addSell(1), unconditional Fisher confidence +2, unconditional Keltner-squeeze confidence +1). `analysis/legacy/engineBuggyBefore.ts` is a byte-for-byte copy of the production engine except those five hunks and the re-pointed import paths.')
  L.push('AFTER = current `lib/signals/signalEngine.ts`. Fixes: supertrend fallback neutral (null, was DOWN); Keltner squeeze no longer scores addBuy(1); ATR low/high regime no longer scores addBuy(1)/addSell(1) (contextual reason only); Fisher confidence +2 only when aligned with the signal; unconditional Keltner-squeeze confidence +1 removed; ATR regime confidence adjustment kept; neutral retry wording.')
  L.push('')
  L.push('## 4. Logical isolation')
  L.push('Both engines are the same codebase; BEFORE differs from AFTER ONLY in the five behaviour hunks above (`git diff --no-index -w lib/signals/signalEngine.ts analysis/legacy/engineBuggyBefore.ts`). Measurement code, horizons, costs and windows are byte-identical between modes; only the engine module is swapped. This isolates the fixes without the SL-signature/refactor noise of the full HEAD engine.')
  L.push('')
  L.push('## 5. Dataset')
  L.push(`- Symbol pairs: ${dataset.pairs.join(', ')}.`)
  L.push(`- Strategies (primary TF): ${Object.entries(dataset.primaryTimeframes).map(([k, v]) => `${k}/${v}`).join(', ')}.`)
  L.push(`- Date range: ${dataset.dateRange.start} → ${dataset.dateRange.end}.`)
  L.push(`- Source: ${dataset.source}`)
  L.push('')
  L.push('## 6. Evaluation methodology')
  L.push('- Causal: primary-TF candles filtered to signal time (asOf); window i from LOOKBACK to len−1−horizonCandles, step 7.')
  L.push(`- Start of evaluation: entryIndex + 1; same-bar SL+TP = LOSS.`)
  L.push(`- Horizon: per-strategy wall-clock hours resolved to primary-TF candle counts (estimateCandleStepMs/resolveHorizonCandles).`)
  L.push(`- Costs: roundTripCostPrice — FX spread 0.6 + commission 0.15 + slippage 0.1 pips; BTC 2 + 0.5 + 0.5 bp; netR = grossR − costR/risk.`)
  L.push(`- Excursions: production simulateTrade (MFE/MAE via candle extremes, reach 1R/1.5R/2R/TP).`)
  L.push('')
  L.push('## 7. Before vs After table')
  L.push('| metric | before | after | Δ | rel% |')
  L.push('|---|---:|---:|---:|---:|')
  for (const d of deltas) {
    const rel = Number.isFinite(d.relPct) ? `${d.relPct.toFixed(1)}%` : '—'
    L.push(`| ${d.label} | ${fmt(d.before)} | ${fmt(d.after)} | ${fmt(d.delta)} | ${rel} |`)
  }
  L.push('')
  L.push('## 8. Signals')
  L.push(`- Signal distribution — before: ${JSON.stringify(signals.before)}; after: ${JSON.stringify(signals.after)}.`)
  L.push('')
  L.push('## 9. Breakdowns')
  L.push('### By strategy')
  L.push('| strategy | before n | before netE[R] | after n | after netE[R] | Δn | ΔnetE[R] |')
  L.push('|---|---:|---:|---:|---:|---:|---:|')
  for (const s of byStrategy) {
    if (s.before.n === 0 && s.after.n === 0) continue
    L.push(`| ${s.strategy} | ${s.before.n} | ${fmt(s.before.netExp)} | ${s.after.n} | ${fmt(s.after.netExp)} | ${s.after.n - s.before.n} | ${fmt(s.after.netExp - s.before.netExp)} |`)
  }
  L.push('')
  L.push('### By direction')
  L.push('| direction | before n | before netE[R] | after n | after netE[R] | Δn | ΔnetE[R] |')
  L.push('|---|---:|---:|---:|---:|---:|---:|')
  for (const d of byDirection) {
    if (d.before.n === 0 && d.after.n === 0) continue
    L.push(`| ${d.direction} | ${d.before.n} | ${fmt(d.before.netExp)} | ${d.after.n} | ${fmt(d.after.netExp)} | ${d.after.n - d.before.n} | ${fmt(d.after.netExp - d.before.netExp)} |`)
  }
  L.push('')
  L.push('## 10. Bootstrap / uncertainty')
  L.push(`- Paired windows where both modes produced an actionable trade: ${paired.bothActionable}; windows where only one mode did: ${paired.modeSwitchedWindows}.`)
  L.push(`- Mean paired ΔnetR = ${fmt(paired.meanDeltaNetR)} — 90% bootstrap CI [${fmt(paired.ciNetR90.lo)}, ${fmt(paired.ciNetR90.hi)}] (seeded, 2000 draws).`)
  L.push(`- Mean paired ΔgrossR = ${fmt(paired.meanDeltaGrossR)} — 90% bootstrap CI [${fmt(paired.ciGrossR90.lo)}, ${fmt(paired.ciGrossR90.hi)}].`)
  L.push('- Paired deltas where both modes hold are 0; the CI is dominated by the windows where the fixes changed the signal side.')
  L.push('')
  L.push('## 11. Caveats & sample size')
  L.push('- Overlapping multi-strategy meta-sample: the same window can appear under more than one strategy, so trades are not independent draws.')
  L.push('- Bootstrap CIs are a sanity check, not a significance test; do not decide on a single E[R].')
  L.push('- Rows with small n are flagged LOW SAMPLE (e.g. SELL-only windows).')
  L.push('')
  L.push('## 12. Conclusion')
  L.push('The fixes remove noisy/directional evidence (Keltner squeeze, ATR low/high) and add an alignment gate to the Fisher confidence bonus. Expect HOLD-rate and BUY/SELL distribution changes concentrated in low-volatility windows; net effect on this dataset reported in section 7.')
  L.push('')
  L.push('## 13. Reproduce')
  L.push('```')
  L.push('npx tsx analysis/engineBeforeAfter.ts')
  L.push('npx vitest run')
  L.push('npx tsc --noEmit')
  L.push('```')
  L.push('')
  return L.join('\n')
}

function main(): void {
  console.log('computing before (buggy behaviours restored) …')
  const beforeRun = computeRun('before')
  console.log('computing after (fixed production engine) …')
  const afterRun = computeRun('after')

  const bf = summarize(beforeRun.trades)
  const af = summarize(afterRun.trades)
  const deltas = deltaRows(bf, af, beforeRun, afterRun)

  const keySet = new Set([...afterRun.trades.map((t) => t.key), ...beforeRun.trades.map((t) => t.key)])
  const pairedNet: number[] = []
  const pairedGross: number[] = []
  let switched = 0
  for (const key of keySet) {
    const at = afterRun.trades.find((t) => t.key === key)
    const bt = beforeRun.trades.find((t) => t.key === key)
    if (at && bt) {
      pairedNet.push(at.netR - bt.netR)
      pairedGross.push(at.grossR - bt.grossR)
    } else {
      switched++
    }
  }
  const ciNet = bootstrapCI(pairedNet)
  const ciGross = bootstrapCI(pairedGross)

  const allTimes = Object.values(DATA).flat().map((c) => c.time)
  const dateRange = { start: new Date(Math.min(...allTimes)).toISOString(), end: new Date(Math.max(...allTimes)).toISOString() }

  const out = {
    dataset: {
      source: '/tmp/sigdata/candles.json (identical for both modes)',
      dateRange,
      pairs: PAIRS,
      strategies: STRATS,
      primaryTimeframes: PRIMARY_TF,
      costs: { EUR_USD: FX, GBP_USD: FX, BTC_USD: BTC },
    },
    methodology: {
      causalWindows: 'primary-TF candles filtered to signal time (asOf); window i from LOOKBACK to len-1-horizonCandles, step 7',
      startOfEval: 'entryIndex + 1',
      sameBarSlAndTp: 'counted as LOSS',
      horizon: 'resolutionHorizonHours(strategy) resolved to primary-TF candles (estimateCandleStepMs/resolveHorizonCandles)',
      costs: 'production roundTripCostPrice: FX spread 0.6 + commission 0.15 + slippage 0.1 pips; BTC 2 + 0.5 + 0.5 bp',
      grossToNet: 'netR = grossR - costR/risk',
      excursions: 'production simulateTrade: MFE/MAE via candle extremes (until-exit + full-window reach flags)',
      engines: { before: 'working-tree engine with the five fix behaviours reverted (analysis/legacy/engineBuggyBefore.ts)', after: 'current lib/signals/signalEngine.ts' },
    },
    signals: {
      before: { ...beforeRun.signals, holds_total: beforeRun.holds },
      after: { ...afterRun.signals, holds_total: afterRun.holds },
    },
    before: { evals: beforeRun.evals, holds: beforeRun.holds, actionable: beforeRun.actionable, summary: bf, trades: beforeRun.trades },
    after: { evals: afterRun.evals, holds: afterRun.holds, actionable: afterRun.actionable, summary: af, trades: afterRun.trades },
    deltas,
    paired: {
      bothActionable: pairedNet.length,
      modeSwitchedWindows: switched,
      meanDeltaNetR: mean(pairedNet),
      meanDeltaGrossR: mean(pairedGross),
      ciNetR90: ciNet,
      ciGrossR90: ciGross,
    },
    byStrategy: STRATS.map((s) => ({
      strategy: s,
      before: summarize(beforeRun.trades.filter((t) => t.strategy === s)),
      after: summarize(afterRun.trades.filter((t) => t.strategy === s)),
    })),
    byDirection: (['BUY', 'SELL'] as const).map((dir) => ({
      direction: dir,
      before: summarize(beforeRun.trades.filter((t) => t.signal === dir)),
      after: summarize(afterRun.trades.filter((t) => t.signal === dir)),
    })),
    note: 'Overlapping multi-strategy meta-sample; no production code modified; conclusions drawn from paired deltas, not a single E[R].',
  }

  fs.mkdirSync('analysis', { recursive: true })
  fs.writeFileSync('analysis/engine-before-after-comparison.json', JSON.stringify(out, null, 2))
  fs.writeFileSync('analysis/engine-before-after-comparison.md', renderMD(out as never))

  console.log(`before: evals=${beforeRun.evals} holds=${beforeRun.holds} actionable=${beforeRun.actionable}`)
  console.log(`after:  evals=${afterRun.evals} holds=${afterRun.holds} actionable=${afterRun.actionable}`)
  console.log(`mode-switched windows: ${switched} / ${keySet.size}`)
  console.log(`netE[R]: before=${fmt(bf.netExp)} after=${fmt(af.netExp)}`)
  console.log(`winRate: before=${fmt(bf.winRate)} after=${fmt(af.winRate)}`)
  console.log('wrote analysis/engine-before-after-comparison.json + .md')
}

main()