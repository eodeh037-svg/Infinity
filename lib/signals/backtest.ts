import { Candle, generateSignal, SignalOptions } from './signalEngine'

export type BacktestConfig = {
  name: string
  options?: SignalOptions
}

export type BacktestCosts = {
  spreadPips?: number
  commissionPips?: number
  slippagePips?: number
  spreadBp?: number
  commissionBp?: number
  slippageBp?: number
  pipSize?: number
}

export type BacktestOptions = {
  lookback?: number
  horizon?: number
  step?: number
  horizonHours?: number
  candleStepMs?: number
  costs?: BacktestCosts
}

export type TradeOutcome = 'WIN' | 'LOSS' | 'TIMEOUT'

export type BacktestTrade = {
  index: number
  time: number
  signal: 'BUY' | 'SELL'
  entry: number
  stopLoss: number
  takeProfit: number
  riskReward: number
  confidence: number
  outcome: TradeOutcome
  exitIndex: number
  exitTime: number
  grossR: number
  costR: number
  r: number
  mfeR: number
  maeR: number
  mfeFullR: number
  maeFullR: number
  reached1R: boolean
  reached15R: boolean
  reached2R: boolean
  reachedTp: boolean
  reasons: string[]
}

export type ReachStats = {
  '1R': number | null
  '1.5R': number | null
  '2R': number | null
  tp: number | null
}

export type BacktestSummary = {
  configName: string
  candlesUsed: number
  evaluations: number
  signals: number
  holds: number
  wins: number
  losses: number
  timeouts: number
  winRate: number | null
  expectancyR: number
  expectancyGrossR: number | null
  avgR: number | null
  avgCostR: number | null
  avgConfidence: number | null
  holdRate: number
  medianMfeR: number | null
  medianMaeR: number | null
  medianMfeFullR: number | null
  reachPct: ReachStats
  horizonCandles: number
  trades: BacktestTrade[]
}

const DEFAULT_LOOKBACK = 250
const DEFAULT_HORIZON = 24
const DEFAULT_STEP = 1
const DEFAULT_HORIZON_STEP_MS = 60 * 60 * 1000
const HOUR_MS = 60 * 60 * 1000

export function effectiveRisk(entry: number, stopLoss: number): number {
  const risk = Math.abs(entry - stopLoss)
  return risk > 0 ? risk : 1
}

export function estimateCandleStepMs(candles: Candle[]): number | null {
  const deltas: number[] = []
  for (let i = 1; i < candles.length; i++) {
    const delta = candles[i].time - candles[i - 1].time
    if (delta > 0 && Number.isFinite(delta)) deltas.push(delta)
  }
  if (deltas.length === 0) return null
  return Math.round(deltas.reduce((a, b) => a + b, 0) / deltas.length)
}

export function resolveHorizonCandles(
  candles: Candle[],
  opts: { horizon?: number; horizonHours?: number; candleStepMs?: number } = {}
): number {
  const horizon = opts.horizon ?? DEFAULT_HORIZON
  if (!opts.horizonHours || opts.horizonHours <= 0) return horizon
  const stepMs =
    opts.candleStepMs ??
    estimateCandleStepMs(candles) ??
    DEFAULT_HORIZON_STEP_MS
  return Math.max(1, Math.round((opts.horizonHours * HOUR_MS) / stepMs))
}

export function roundTripCostPrice(costs: BacktestCosts = {}): (entry: number) => number {
  const pipSize = costs.pipSize ?? 0.0001
  const pipCost =
    ((costs.spreadPips ?? 0) + (costs.commissionPips ?? 0) + (costs.slippagePips ?? 0)) * pipSize
  const bpCost = ((costs.spreadBp ?? 0) + (costs.commissionBp ?? 0) + (costs.slippageBp ?? 0)) / 10000
  return (entry: number) => pipCost + bpCost * entry
}

function rForOutcome(
  signal: 'BUY' | 'SELL',
  entry: number,
  stopLoss: number,
  takeProfit: number,
  outcome: TradeOutcome,
  exitClose: number,
  risk: number
): number {
  if (signal === 'BUY') {
    if (outcome === 'WIN') return (takeProfit - entry) / risk
    if (outcome === 'LOSS') return -1
    return (exitClose - entry) / risk
  }
  if (outcome === 'WIN') return (entry - takeProfit) / risk
  if (outcome === 'LOSS') return -1
  return (entry - exitClose) / risk
}

export type TradeSimulation = {
  outcome: TradeOutcome
  exitIndex: number
  exitTime: number
  mfeR: number
  maeR: number
  mfeFullR: number
  maeFullR: number
  reached1R: boolean
  reached15R: boolean
  reached2R: boolean
  reachedTp: boolean
}

export function simulateTrade(
  candles: Candle[],
  entryIndex: number,
  signal: 'BUY' | 'SELL',
  entry: number,
  stopLoss: number,
  takeProfit: number,
  horizon: number
): TradeSimulation {
  const risk = effectiveRisk(entry, stopLoss)
  const end = Math.min(entryIndex + horizon, candles.length - 1)
  let outcome: TradeOutcome = 'TIMEOUT'
  let exitIndex = end
  let mfeR = 0
  let maeR = 0
  let reached1R = false
  let reached15R = false
  let reached2R = false
  let reachedTp = false

  for (let j = entryIndex + 1; j <= end; j++) {
    const candle = candles[j]
    const favourable = signal === 'BUY' ? candle.high - entry : entry - candle.low
    const adverse = signal === 'BUY' ? entry - candle.low : candle.high - entry
    const favR = favourable / risk
    const advR = adverse / risk
    if (favR > mfeR) mfeR = favR
    if (advR > maeR) maeR = advR
    if (favR >= 1) reached1R = true
    if (favR >= 1.5) reached15R = true
    if (favR >= 2) reached2R = true

    const slHit = signal === 'BUY' ? candle.low <= stopLoss : candle.high >= stopLoss
    const tpHit = signal === 'BUY' ? candle.high >= takeProfit : candle.low <= takeProfit
    if (tpHit) reachedTp = true

    if (slHit && tpHit) {
      outcome = 'LOSS'
      exitIndex = j
      break
    }
    if (tpHit) {
      outcome = 'WIN'
      exitIndex = j
      break
    }
    if (slHit) {
      outcome = 'LOSS'
      exitIndex = j
      break
    }
  }

  let mfeFullR = mfeR
  let maeFullR = maeR
  for (let j = exitIndex + 1; j < candles.length; j++) {
    const candle = candles[j]
    const favourable = signal === 'BUY' ? candle.high - entry : entry - candle.low
    const adverse = signal === 'BUY' ? entry - candle.low : candle.high - entry
    const favR = favourable / risk
    const advR = adverse / risk
    if (favR > mfeFullR) mfeFullR = favR
    if (advR > maeFullR) maeFullR = advR
    if (favR >= 1) reached1R = true
    if (favR >= 1.5) reached15R = true
    if (favR >= 2) reached2R = true
  }

  return {
    outcome,
    exitIndex,
    exitTime: candles[exitIndex].time,
    mfeR,
    maeR,
    mfeFullR,
    maeFullR,
    reached1R,
    reached15R,
    reached2R,
    reachedTp,
  }
}

function median(values: number[]): number | null {
  if (values.length === 0) return null
  const sorted = [...values].sort((a, b) => a - b)
  const mid = Math.floor(sorted.length / 2)
  if (sorted.length % 2 !== 0) return sorted[mid]
  return (sorted[mid - 1] + sorted[mid]) / 2
}

function summarize(
  name: string,
  candles: Candle[],
  trades: BacktestTrade[],
  holds: number,
  horizonCandles: number
): BacktestSummary {
  const wins = trades.filter(t => t.outcome === 'WIN')
  const losses = trades.filter(t => t.outcome === 'LOSS')
  const timeouts = trades.filter(t => t.outcome === 'TIMEOUT')
  const closedR = [...wins, ...losses].map(t => t.r)
  const allR = trades.map(t => t.r)
  const allGrossR = trades.map(t => t.grossR)
  const evaluations = trades.length + holds

  const reachPct: ReachStats = {
    '1R': trades.length > 0 ? (trades.filter(t => t.reached1R).length / trades.length) * 100 : null,
    '1.5R': trades.length > 0 ? (trades.filter(t => t.reached15R).length / trades.length) * 100 : null,
    '2R': trades.length > 0 ? (trades.filter(t => t.reached2R).length / trades.length) * 100 : null,
    tp: trades.length > 0 ? (trades.filter(t => t.reachedTp).length / trades.length) * 100 : null,
  }

  return {
    configName: name,
    candlesUsed: candles.length,
    evaluations,
    signals: trades.length,
    holds,
    wins: wins.length,
    losses: losses.length,
    timeouts: timeouts.length,
    winRate: closedR.length > 0 ? wins.length / (wins.length + losses.length) : null,
    expectancyR: allR.length > 0 ? allR.reduce((a, b) => a + b, 0) / allR.length : 0,
    expectancyGrossR: allGrossR.length > 0 ? allGrossR.reduce((a, b) => a + b, 0) / allGrossR.length : null,
    avgR: closedR.length > 0 ? closedR.reduce((a, b) => a + b, 0) / closedR.length : null,
    avgCostR:
      trades.length > 0 ? trades.reduce((a, t) => a + t.costR, 0) / trades.length : null,
    avgConfidence:
      trades.length > 0 ? trades.reduce((a, t) => a + t.confidence, 0) / trades.length : null,
    holdRate: evaluations > 0 ? holds / evaluations : 0,
    medianMfeR: median(trades.map(t => t.mfeR)),
    medianMaeR: median(trades.map(t => t.maeR)),
    medianMfeFullR: median(trades.map(t => t.mfeFullR)),
    reachPct,
    horizonCandles,
    trades,
  }
}

export function runBacktest(
  candles: Candle[],
  configs: BacktestConfig[],
  options: BacktestOptions = {}
): BacktestSummary[] {
  const lookback = options.lookback ?? DEFAULT_LOOKBACK
  const step = options.step ?? DEFAULT_STEP
  const horizonCandles = resolveHorizonCandles(candles, options)
  const costPrice = roundTripCostPrice(options.costs ?? {})

  return configs.map(config => {
    const trades: BacktestTrade[] = []
    let holds = 0
    const lastTestable = candles.length - 1 - horizonCandles

    for (let i = lookback; i <= lastTestable; i += step) {
      const window = candles.slice(0, i + 1)
      const result = generateSignal(window, 0, config.options)
      if (result.signal === 'HOLD') {
        holds++
        continue
      }
      if (result.entry === null || result.stopLoss === null || result.takeProfit === null) continue

      const { outcome, exitIndex, exitTime, mfeR, maeR, mfeFullR, maeFullR, reached1R, reached15R, reached2R, reachedTp } =
        simulateTrade(
          candles,
          i,
          result.signal,
          result.entry,
          result.stopLoss,
          result.takeProfit,
          horizonCandles
        )
      const exitClose = candles[exitIndex].close
      const risk = effectiveRisk(result.entry, result.stopLoss)
      const grossR = rForOutcome(
        result.signal,
        result.entry,
        result.stopLoss,
        result.takeProfit,
        outcome,
        exitClose,
        risk
      )
      const costR = costPrice(result.entry) / risk
      const netR = grossR - costR

      trades.push({
        index: i,
        time: candles[i].time,
        signal: result.signal,
        entry: result.entry,
        stopLoss: result.stopLoss,
        takeProfit: result.takeProfit,
        riskReward: result.riskReward ?? 0,
        confidence: result.confidence,
        outcome,
        exitIndex,
        exitTime,
        grossR,
        costR,
        r: netR,
        mfeR,
        maeR,
        mfeFullR,
        maeFullR,
        reached1R,
        reached15R,
        reached2R,
        reachedTp,
        reasons: result.reasons,
      })
    }

    return summarize(config.name, candles, trades, holds, horizonCandles)
  })
}