import { StochasticResult } from './types'

export function calculateStochastic(
  candles: { high: number; low: number; close: number }[],
  kPeriod: number = 14,
  kSmooth: number = 3,
  dPeriod: number = 3
): StochasticResult[] {
  const results: StochasticResult[] = []

  if (candles.length < kPeriod + kSmooth) {
    return candles.map(() => ({ k: null, d: null }))
  }

  const rawK: (number | null)[] = []

  for (let i = 0; i < candles.length; i++) {
    if (i < kPeriod - 1) {
      rawK.push(null)
      continue
    }

    const slice = candles.slice(i - kPeriod + 1, i + 1)
    const highestHigh = Math.max(...slice.map(c => c.high))
    const lowestLow = Math.min(...slice.map(c => c.low))
    const range = highestHigh - lowestLow

    if (range <= 0) {
      rawK.push(null)
      continue
    }

    const k = ((candles[i].close - lowestLow) / range) * 100
    rawK.push(k)
  }

  const smoothedK: (number | null)[] = []

  for (let i = 0; i < rawK.length; i++) {
    if (i < kSmooth - 1) {
      smoothedK.push(null)
      continue
    }

    const slice = rawK.slice(i - kSmooth + 1, i + 1).filter(v => v !== null) as number[]
    if (slice.length === 0) {
      smoothedK.push(null)
      continue
    }

    smoothedK.push(slice.reduce((a, b) => a + b, 0) / slice.length)
  }

  for (let i = 0; i < smoothedK.length; i++) {
    if (i < kSmooth + dPeriod - 2 || smoothedK[i] === null) {
      results.push({ k: null, d: null })
      continue
    }

    const kSlice = smoothedK.slice(i - dPeriod + 1, i + 1).filter(v => v !== null) as number[]
    if (kSlice.length === 0) {
      results.push({ k: null, d: null })
      continue
    }

    const d = kSlice.reduce((a, b) => a + b, 0) / kSlice.length
    results.push({ k: smoothedK[i], d })
  }

  return results
}
