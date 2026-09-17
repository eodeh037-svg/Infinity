import { Candle } from './types'
import { calculateEMA } from './ema'
import { calculateATR } from './atr'

export function calculateKeltner(
  candles: Candle[],
  period: number = 20,
  atrPeriod: number = 10,
  multiplier: number = 2.0
): {
  upper: number | null
  middle: number | null
  lower: number | null
  width: number | null
}[] {
  const results: { upper: number | null; middle: number | null; lower: number | null; width: number | null }[] =
    candles.map(() => ({
      upper: null,
      middle: null,
      lower: null,
      width: null,
    }))

  if (candles.length < period) return results

  const closes = candles.map(c => c.close)
  const emaValues = calculateEMA(closes, period)
  const atrValues = calculateATR(candles, atrPeriod)

  for (let i = period - 1; i < candles.length; i++) {
    const ema = emaValues[i]
    const atr = atrValues[i] ?? 0
    if (ema === null) continue

    const upper = ema + multiplier * atr
    const lower = ema - multiplier * atr
    const width = ema > 0 ? (upper - lower) / ema : 0

    results[i] = { upper, middle: ema, lower, width }
  }

  return results
}

export function analyzeKeltner(
  keltnerResults: { upper: number | null; middle: number | null; lower: number | null; width: number | null }[],
  lastClose: number,
  lastIndex: number
): {
  aboveUpper: boolean
  belowLower: boolean
  squeeze: boolean
  trend: 'bullish' | 'bearish' | 'neutral'
} {
  const k = keltnerResults[lastIndex]
  if (!k || k.upper === null || k.lower === null) {
    return { aboveUpper: false, belowLower: false, squeeze: false, trend: 'neutral' }
  }

  const aboveUpper = lastClose > k.upper
  const belowLower = lastClose < k.lower
  const squeeze = k.width !== null && k.width < 0.01

  const upperSlope = lastIndex >= 2 && keltnerResults[lastIndex - 1]?.upper !== null && keltnerResults[lastIndex - 2]?.upper !== null
    ? keltnerResults[lastIndex - 1].upper! - keltnerResults[lastIndex - 2].upper!
    : 0
  const lowerSlope = lastIndex >= 2 && keltnerResults[lastIndex - 1]?.lower !== null && keltnerResults[lastIndex - 2]?.lower !== null
    ? keltnerResults[lastIndex - 1].lower! - keltnerResults[lastIndex - 2].lower!
    : 0

  const trend: 'bullish' | 'bearish' | 'neutral' =
    upperSlope > 0 && lowerSlope > 0 ? 'bullish' : upperSlope < 0 && lowerSlope < 0 ? 'bearish' : 'neutral'

  return { aboveUpper, belowLower, squeeze, trend }
}
