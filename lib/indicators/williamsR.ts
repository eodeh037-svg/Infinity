import { Candle } from './types'

export type WilliamsRResult = {
  value: number | null
}

export function calculateWilliamsR(
  candles: Candle[],
  period: number = 14
): WilliamsRResult[] {
  const results: WilliamsRResult[] = []

  for (let i = 0; i < candles.length; i++) {
    if (i < period - 1) {
      results.push({ value: null })
      continue
    }

    let highestHigh = -Infinity
    let lowestLow = Infinity

    for (let j = i - period + 1; j <= i; j++) {
      if (candles[j].high > highestHigh) highestHigh = candles[j].high
      if (candles[j].low < lowestLow) lowestLow = candles[j].low
    }

    const close = candles[i].close
    const range = highestHigh - lowestLow

    if (range === 0) {
      results.push({ value: null })
    } else {
      const wr = ((highestHigh - close) / range) * -100
      results.push({ value: wr })
    }
  }

  return results
}
