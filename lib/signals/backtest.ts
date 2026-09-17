import { Candle, generateSignal, SignalOptions } from './signalEngine'

export type BacktestConfig = {
  name: string
  options?: SignalOptions
}

export type BacktestOptions = {
  lookback?: number
  horizon?: number
  step?: number
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
  r: number
  reasons: string[]
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
  avgR: number | null
  avgConfidence: number | null
  holdRate: number
  trades: BacktestTrade[]
}

const DEFAULT_LOOKBACK = 250
const DEFAULT_HORIZON = 24
const DEFAULT_STEP = 1

function rForOutcome(
  signal: 'BUY' | 'SELL',
  entry: number,
  stopLoss: number,
  takeProfit: number,
  outcome: TradeOutcome,
  exitClose: number
): number {
  if (signal === 'BUY') {
    const risk = entry - stopLoss
    if (outcome === 'WIN') return (takeProfit - entry) / risk
    if (outcome === 'LOSS') return -1
    return (exitClose - entry) / risk
  }
  const risk = stopLoss - entry
  if (outcome === 'WIN') return (entry - takeProfit) / risk
  if (outcome === 'LOSS') return -1
  return (entry - exitClose) / risk
}

function simulateTrade(
  candles: Candle[],
  entryIndex: number,
  signal: 'BUY' | 'SELL',
  entry: number,
  stopLoss: number,
  takeProfit: number,
  horizon: number
): { outcome: TradeOutcome; exitIndex: number; exitTime: number } {
  const end = Math.min(entryIndex + horizon, candles.length - 1)
  for (let j = entryIndex + 1; j <= end; j++) {
    const candle = candles[j]
    if (signal === 'BUY') {
      const slHit = candle.low <= stopLoss
      const tpHit = candle.high >= takeProfit
      if (slHit && tpHit) return { outcome: 'LOSS', exitIndex: j, exitTime: candle.time }
      if (tpHit) return { outcome: 'WIN', exitIndex: j, exitTime: candle.time }
      if (slHit) return { outcome: 'LOSS', exitIndex: j, exitTime: candle.time }
    } else {
      const slHit = candle.high >= stopLoss
      const tpHit = candle.low <= takeProfit
      if (slHit && tpHit) return { outcome: 'LOSS', exitIndex: j, exitTime: candle.time }
      if (tpHit) return { outcome: 'WIN', exitIndex: j, exitTime: candle.time }
      if (slHit) return { outcome: 'LOSS', exitIndex: j, exitTime: candle.time }
    }
  }
  const exitIndex = Math.min(entryIndex + horizon, candles.length - 1)
  return { outcome: 'TIMEOUT', exitIndex, exitTime: candles[exitIndex].time }
}

function summarize(
  name: string,
  candles: Candle[],
  trades: BacktestTrade[],
  holds: number
): BacktestSummary {
  const wins = trades.filter(t => t.outcome === 'WIN')
  const losses = trades.filter(t => t.outcome === 'LOSS')
  const timeouts = trades.filter(t => t.outcome === 'TIMEOUT')
  const closedR = [...wins, ...losses].map(t => t.r)
  const allR = trades.map(t => t.r)
  const evaluations = trades.length + holds

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
    avgR: closedR.length > 0 ? closedR.reduce((a, b) => a + b, 0) / closedR.length : null,
    avgConfidence:
      trades.length > 0 ? trades.reduce((a, t) => a + t.confidence, 0) / trades.length : null,
    holdRate: evaluations > 0 ? holds / evaluations : 0,
    trades,
  }
}

export function runBacktest(
  candles: Candle[],
  configs: BacktestConfig[],
  options: BacktestOptions = {}
): BacktestSummary[] {
  const lookback = options.lookback ?? DEFAULT_LOOKBACK
  const horizon = options.horizon ?? DEFAULT_HORIZON
  const step = options.step ?? DEFAULT_STEP

  return configs.map(config => {
    const trades: BacktestTrade[] = []
    let holds = 0
    const lastTestable = candles.length - 1 - horizon

    for (let i = lookback; i <= lastTestable; i += step) {
      const window = candles.slice(0, i + 1)
      const result = generateSignal(window, 0, config.options)
      if (result.signal === 'HOLD') {
        holds++
        continue
      }
      if (result.stopLoss === null || result.takeProfit === null) continue

      const { outcome, exitIndex, exitTime } = simulateTrade(
        candles,
        i,
        result.signal,
        result.entry,
        result.stopLoss,
        result.takeProfit,
        horizon
      )
      const exitClose = candles[exitIndex].close
      const r = rForOutcome(
        result.signal,
        result.entry,
        result.stopLoss,
        result.takeProfit,
        outcome,
        exitClose
      )

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
        r,
        reasons: result.reasons,
      })
    }

    return summarize(config.name, candles, trades, holds)
  })
}
