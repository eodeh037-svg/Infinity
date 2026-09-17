import { Candle } from './types'

export function calculateParabolicSAR(
  candles: Candle[],
  start: number = 0.02,
  increment: number = 0.02,
  maximum: number = 0.2
): (number | null)[] {
  const results: (number | null)[] = candles.map(() => null)

  if (candles.length < 2) return results

  let sar = candles[0].low
  let ep = candles[0].high
  let af = start
  let trend: 'UP' | 'DOWN' = 'UP'

  results[0] = sar

  for (let i = 1; i < candles.length; i++) {
    if (trend === 'UP') {
      sar = sar + af * (ep - sar)

      if (candles[i].low < sar) {
        sar = ep
        trend = 'DOWN'
        ep = candles[i].low
        af = start
      } else {
        if (candles[i].high > ep) {
          ep = candles[i].high
          af = Math.min(af + increment, maximum)
        }
        results[i] = sar
      }
    } else {
      sar = sar - af * (sar - ep)

      if (candles[i].high > sar) {
        sar = ep
        trend = 'UP'
        ep = candles[i].high
        af = start
      } else {
        if (candles[i].low < ep) {
          ep = candles[i].low
          af = Math.min(af + increment, maximum)
        }
        results[i] = sar
      }
    }
  }

  return results
}

export function analyzeSAR(
  sarValues: (number | null)[],
  closes: number[],
  lastIndex: number
): {
  signal: 'BUY' | 'SELL' | 'NONE'
  inTrend: boolean
  flipCount: number
} {
  if (lastIndex < 1 || sarValues[lastIndex] === null || sarValues[lastIndex - 1] === null) {
    return { signal: 'NONE', inTrend: false, flipCount: 0 }
  }

  const currentSAR = sarValues[lastIndex]!
  const previousSAR = sarValues[lastIndex - 1]!
  const currentClose = closes[lastIndex]
  const previousClose = closes[lastIndex - 1]

  let signal: 'BUY' | 'SELL' | 'NONE' = 'NONE'
  if (previousClose < previousSAR && currentClose > currentSAR) {
    signal = 'BUY'
  } else if (previousClose > previousSAR && currentClose < currentSAR) {
    signal = 'SELL'
  }

  const inTrend = (signal === 'BUY' && currentClose > currentSAR) || (signal === 'SELL' && currentClose < currentSAR)

  return { signal, inTrend, flipCount: 0 }
}
