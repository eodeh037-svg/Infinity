import { Candle } from './types'

export function calculateATRPercentile(
  candles: Candle[],
  atrPeriod: number = 14,
  lookback: number = 100
): {
  percentile: number
  regime: 'low' | 'medium' | 'high'
  multiplier: number
} {
  if (candles.length < atrPeriod + lookback) {
    return { percentile: 50, regime: 'medium', multiplier: 1.0 }
  }

  const atrValues = candles.map((_, i) => {
    if (i < atrPeriod) return null
    let atr = 0
    for (let j = i - atrPeriod + 1; j <= i; j++) {
      const tr = Math.max(
        candles[j].high - candles[j].low,
        Math.abs(candles[j].high - (j > 0 ? candles[j - 1].close : candles[j].low)),
        Math.abs(candles[j].low - (j > 0 ? candles[j - 1].close : candles[j].high))
      )
      atr += tr
    }
    return atr / atrPeriod
  })

  const recentATR = atrValues.slice(-lookback).filter((v): v is number => v !== null)
  const currentATR = recentATR[recentATR.length - 1]

  if (!currentATR || recentATR.length < 10) {
    return { percentile: 50, regime: 'medium', multiplier: 1.0 }
  }

  const sorted = [...recentATR].sort((a, b) => a - b)
  const rank = sorted.filter(v => v < currentATR).length
  const percentile = sorted.length > 0 ? (rank / sorted.length) * 100 : 50

  let regime: 'low' | 'medium' | 'high'
  let multiplier: number

  if (percentile < 25) {
    regime = 'low'
    multiplier = 0.7
  } else if (percentile < 75) {
    regime = 'medium'
    multiplier = 1.0
  } else {
    regime = 'high'
    multiplier = 1.3
  }

  return { percentile, regime, multiplier }
}

export function analyzeATRPercentileSignal(
  percentile: number,
  regime: string
): {
  score: number
  reason: string
} {
  if (regime === 'low') {
    return { score: 1, reason: `ATR at ${percentile.toFixed(0)}th percentile — low volatility, breakout potential` }
  } else if (regime === 'high') {
    return { score: -1, reason: `ATR at ${percentile.toFixed(0)}th percentile — high volatility, risk of reversal` }
  }
  return { score: 0, reason: `ATR at ${percentile.toFixed(0)}th percentile — normal volatility` }
}
