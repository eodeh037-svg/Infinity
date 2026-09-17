import { IndicatorPoint } from './types'

export function calculateVWAP(
  candles: { time: number; open: number; high: number; low: number; close: number; volume?: number }[],
  lookback: number = 20
): IndicatorPoint[] {
  const results: IndicatorPoint[] = []

  for (let i = 0; i < candles.length; i++) {
    if (i < lookback - 1) {
      results.push({ time: i, value: 0 })
      continue
    }

    const slice = candles.slice(i - lookback + 1, i + 1)
    let cumulativeTPV = 0
    let cumulativeVolume = 0

    for (const candle of slice) {
      const tpv = ((candle.high + candle.low + candle.close) / 3) * (candle.volume || 0)
      cumulativeTPV += tpv
      cumulativeVolume += candle.volume || 0
    }

    const vwap = cumulativeVolume > 0 ? cumulativeTPV / cumulativeVolume : 0
    results.push({ time: i, value: vwap })
  }

  return results
}

export function analyzeVWAP(
  vwapValues: IndicatorPoint[],
  lastClose: number,
  lastIndex: number
): {
  aboveVWAP: boolean
  belowVWAP: boolean
  distanceFromVWAP: number
  vwapTrend: 'rising' | 'falling' | 'flat'
} {
  const currentVWAP = vwapValues[lastIndex]?.value ?? 0
  const distance = currentVWAP > 0 ? ((lastClose - currentVWAP) / currentVWAP) * 100 : 0

  const aboveVWAP = lastClose > currentVWAP
  const belowVWAP = lastClose < currentVWAP

  let vwapTrend: 'rising' | 'falling' | 'flat' = 'flat'
  if (lastIndex >= 5) {
    const recentVWAPs = vwapValues.slice(Math.max(0, lastIndex - 5), lastIndex + 1)
    const firstVWAP = recentVWAPs[0]?.value ?? 0
    const lastVWAP = recentVWAPs[recentVWAPs.length - 1]?.value ?? 0
    const diff = lastVWAP - firstVWAP

    if (Math.abs(diff) > 0.1) {
      vwapTrend = diff > 0 ? 'rising' : 'falling'
    }
  }

  return { aboveVWAP, belowVWAP, distanceFromVWAP: distance, vwapTrend }
}
