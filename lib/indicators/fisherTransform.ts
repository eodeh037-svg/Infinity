import { IndicatorPoint } from './types'

export function calculateFisherTransform(
  closes: number[],
  period: number = 10
): IndicatorPoint[] {
  const results: IndicatorPoint[] = closes.map(() => ({ time: 0, value: 0 }))

  if (closes.length < period + 1) {
    return results
  }

  let prevFisher = 0

  for (let i = period; i < closes.length; i++) {
    const slice = closes.slice(i - period, i + 1)
    const high = Math.max(...slice)
    const low = Math.min(...slice)
    const priceDiff = high - low

    if (priceDiff === 0) {
      results[i] = { time: i, value: prevFisher }
      continue
    }

    const normalizedPrice = 2 * ((closes[i] - low) / priceDiff) - 1
    const fishValue = 0.5 * Math.log((1 + normalizedPrice) / (1 - normalizedPrice)) + 0.5 * prevFisher
    const clampedFish = Math.max(-0.999, Math.min(0.999, fishValue))

    results[i] = { time: i, value: clampedFish }
    prevFisher = clampedFish
  }

  return results
}

export function analyzeFisher(
  fisherValues: IndicatorPoint[],
  lastIndex: number,
  lookback: number = 5
): {
  signal: 'BUY' | 'SELL' | 'NONE'
  strength: number
  divergence: 'BULLISH' | 'BEARISH' | 'NONE'
} {
  const start = Math.max(0, lastIndex - lookback)
  const recentFisher = fisherValues.slice(start, lastIndex + 1)

  if (recentFisher.length < 2) {
    return { signal: 'NONE', strength: 0, divergence: 'NONE' }
  }

  const currentFisher = recentFisher[recentFisher.length - 1].value
  const previousFisher = recentFisher[recentFisher.length - 2].value
  const firstFisher = recentFisher[0].value

  const signal = currentFisher > 0 ? 'BUY' : currentFisher < 0 ? 'SELL' : 'NONE'
  const strength = Math.abs(currentFisher)

  let divergence: 'BULLISH' | 'BEARISH' | 'NONE' = 'NONE'
  const priceDirection = currentFisher > firstFisher ? 'up' : 'down'

  if (priceDirection === 'down' && currentFisher > firstFisher) {
    divergence = 'BULLISH'
  } else if (priceDirection === 'up' && currentFisher < firstFisher) {
    divergence = 'BEARISH'
  }

  return { signal, strength, divergence }
}
