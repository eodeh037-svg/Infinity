import { Candle } from './types'

export function calculateSupertrend(
  candles: Candle[],
  period: number = 10,
  multiplier: number = 3.0
): { supertrend: number | null; direction: 'UP' | 'DOWN' }[] {
  const results: { supertrend: number | null; direction: 'UP' | 'DOWN' }[] =
    candles.map(() => ({ supertrend: null, direction: 'DOWN' }))

  if (candles.length < period + 1) return results

  const atrValues = calculateATR(candles, period)
  const hl2Values = candles.map(c => (c.high + c.low) / 2)

  const basicUpper = hl2Values.map((_, i) => {
    if (i < period - 1) return Infinity
    const atr = atrValues[i] ?? 0
    return hl2Values[i] + multiplier * atr
  })

  const basicLower = hl2Values.map((_, i) => {
    if (i < period - 1) return -Infinity
    const atr = atrValues[i] ?? 0
    return hl2Values[i] - multiplier * atr
  })

  let finalUpper = basicUpper[period - 1] === Infinity ? Infinity : basicUpper[period - 1]
  let finalLower = basicLower[period - 1] === -Infinity ? -Infinity : basicLower[period - 1]

  for (let i = period; i < candles.length; i++) {
    if (basicUpper[i] < finalUpper || candles[i - 1].close > finalUpper) {
      finalUpper = basicUpper[i]
    } else {
      finalUpper = basicUpper[i] >= finalUpper ? finalUpper : basicUpper[i]
    }

    if (basicLower[i] > finalLower || candles[i - 1].close < finalLower) {
      finalLower = basicLower[i]
    } else {
      finalLower = basicLower[i] <= finalLower ? finalLower : basicLower[i]
    }

    if (candles[i - 1].close <= finalUpper && candles[i].close > finalUpper) {
      results[i] = { supertrend: finalLower, direction: 'UP' }
    } else if (candles[i - 1].close >= finalLower && candles[i].close < finalLower) {
      results[i] = { supertrend: finalUpper, direction: 'DOWN' }
    } else {
      results[i] = {
        supertrend: results[i - 1].direction === 'UP' ? finalLower : finalUpper,
        direction: results[i - 1].direction,
      }
    }
  }

  return results
}

function calculateATR(
  candles: Candle[],
  period: number
): number[] {
  const result: number[] = new Array(candles.length).fill(0)
  if (candles.length <= period) return result

  const trueRanges: number[] = []
  for (let i = 0; i < candles.length; i++) {
    if (i === 0) {
      trueRanges.push(candles[i].high - candles[i].low)
      continue
    }
    const tr = Math.max(
      candles[i].high - candles[i].low,
      Math.abs(candles[i].high - candles[i - 1].close),
      Math.abs(candles[i].low - candles[i - 1].close)
    )
    trueRanges.push(tr)
  }

  let atr = trueRanges.slice(0, period).reduce((a, b) => a + b, 0) / period
  result[period - 1] = atr

  for (let i = period; i < candles.length; i++) {
    atr = ((atr * (period - 1)) + trueRanges[i]) / period
    result[i] = atr
  }

  return result
}
