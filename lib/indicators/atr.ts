import { Candle } from './types'

export function calculateATR(
  candles: Candle[],
  period = 14
): (number | null)[] {
  const result: (number | null)[] =
    new Array(candles.length).fill(null)

  if (period <= 0) {
    throw new Error('ATR period must be greater than 0')
  }

  if (candles.length <= period) {
    return result
  }

  const trueRanges: number[] = []

  for (let i = 0; i < candles.length; i++) {
    if (i === 0) {
      trueRanges.push(
        candles[i].high - candles[i].low
      )
      continue
    }

    const current = candles[i]
    const previous = candles[i - 1]

    const trueRange = Math.max(
      current.high - current.low,
      Math.abs(current.high - previous.close),
      Math.abs(current.low - previous.close)
    )

    trueRanges.push(trueRange)
  }

  // Initial ATR = SMA of first `period` TR values
  let atr = 0

  for (let i = 1; i <= period; i++) {
    atr += trueRanges[i]
  }

  atr /= period

  result[period] = atr

  // Wilder smoothing
  for (let i = period + 1; i < candles.length; i++) {
    atr =
      ((atr * (period - 1)) + trueRanges[i]) /
      period

    result[i] = atr
  }

  return result
}
