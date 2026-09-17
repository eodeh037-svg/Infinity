import { Candle } from '../../indicators/types'
import { VolatilityRegime, VolatilityDirection, VolatilityRegimeResult } from './types'

const ATR_PERIOD = 14
const DIRECTION_LOOKBACK = 10
const RATIO_MEDIAN_LOOKBACK = 50

export function detectVolatilityRegime(
  candles: Candle[],
  atrValues: (number | null)[],
  atrPercentile: number | null
): VolatilityRegimeResult {
  if (candles.length < ATR_PERIOD + 10 || atrValues.length < ATR_PERIOD + 5) {
    return emptyResult('Insufficient data for volatility analysis')
  }

  const lastIndex = candles.length - 1
  const recentATR = extractRecentATR(atrValues, lastIndex, RATIO_MEDIAN_LOOKBACK)

  if (recentATR.length < 5) {
    return emptyResult('Insufficient ATR history for volatility classification')
  }

  const currentATR = recentATR[recentATR.length - 1]
  const percentile = atrPercentile ?? 50

  const regime = classifyRegime(percentile)
  const direction = classifyDirection(recentATR)
  const atrRatio = calculateATRRatio(recentATR)

  const evidence: string[] = []
  evidence.push(`ATR regime: ${regime} (percentile ${percentile.toFixed(0)})`)
  evidence.push(`Volatility direction: ${direction}`)
  if (atrRatio > 1.3) {
    evidence.push(`ATR elevated (${atrRatio.toFixed(2)}x median)`)
  } else if (atrRatio < 0.7) {
    evidence.push(`ATR depressed (${atrRatio.toFixed(2)}x median)`)
  }

  return {
    regime,
    direction,
    atrPercentile: percentile,
    atrRatio,
    coverage: 'full',
    evidence,
  }
}

function extractRecentATR(
  atrValues: (number | null)[],
  lastIndex: number,
  count: number
): number[] {
  const result: number[] = []
  const start = Math.max(0, lastIndex - count + 1)
  for (let i = start; i <= lastIndex; i++) {
    const v = atrValues[i]
    if (v !== null && v !== undefined && Number.isFinite(v)) {
      result.push(v)
    }
  }
  return result
}

function classifyRegime(percentile: number): VolatilityRegime {
  if (percentile < 15) return 'very_low'
  if (percentile < 30) return 'low'
  if (percentile < 70) return 'normal'
  if (percentile < 85) return 'high'
  return 'extreme'
}

function classifyDirection(recentATR: number[]): VolatilityDirection {
  if (recentATR.length < DIRECTION_LOOKBACK) return 'stable'

  const half = Math.floor(recentATR.length / 2)
  const firstHalf = recentATR.slice(0, half)
  const secondHalf = recentATR.slice(half)

  const avgFirst = firstHalf.reduce((a, b) => a + b, 0) / firstHalf.length
  const avgSecond = secondHalf.reduce((a, b) => a + b, 0) / secondHalf.length

  if (avgFirst === 0) return 'stable'

  const changeRatio = (avgSecond - avgFirst) / avgFirst

  if (changeRatio > 0.08) return 'expanding'
  if (changeRatio < -0.08) return 'contracting'
  return 'stable'
}

function calculateATRRatio(recentATR: number[]): number {
  if (recentATR.length < 10) return 1.0

  const sorted = [...recentATR].sort((a, b) => a - b)
  const median = sorted[Math.floor(sorted.length / 2)]
  const current = recentATR[recentATR.length - 1]

  if (median === 0) return 1.0
  return current / median
}

function emptyResult(reason: string): VolatilityRegimeResult {
  return {
    regime: 'normal',
    direction: 'stable',
    atrPercentile: 50,
    atrRatio: 1.0,
    coverage: 'unavailable',
    evidence: [reason],
  }
}
