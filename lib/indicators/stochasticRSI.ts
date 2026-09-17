import { calculateRSI } from './rsi'
import { IndicatorPoint } from './types'

export function calculateStochasticRSI(
  closes: number[],
  rsiPeriod: number = 14,
  stochPeriod: number = 14
): IndicatorPoint[] {
  const rsiValues = calculateRSI(closes, rsiPeriod)
  const results: IndicatorPoint[] = closes.map(() => ({ time: 0, value: 0 }))

  if (closes.length < rsiPeriod + stochPeriod) return results

  for (let i = rsiPeriod + stochPeriod - 1; i < closes.length; i++) {
    const start = i - stochPeriod + 1
    const rsiSlice = rsiValues.slice(start, i + 1).filter((v): v is number => v !== null)

    if (rsiSlice.length < stochPeriod) continue

    const rsiMin = Math.min(...rsiSlice)
    const rsiMax = Math.max(...rsiSlice)
    const rsiRange = rsiMax - rsiMin

    if (rsiRange === 0) {
      results[i] = { time: i, value: 50 }
    } else {
      const currentRSI = rsiValues[i] ?? 0
      results[i] = { time: i, value: ((currentRSI - rsiMin) / rsiRange) * 100 }
    }
  }

  return results
}

export function analyzeStochasticRSI(
  stochRSIValues: IndicatorPoint[],
  lastIndex: number
): {
  signal: 'BUY' | 'SELL' | 'NONE'
  overbought: boolean
  oversold: boolean
  divergence: 'BULLISH' | 'BEARISH' | 'NONE'
} {
  if (lastIndex < 1) {
    return { signal: 'NONE', overbought: false, oversold: false, divergence: 'NONE' }
  }

  const currentValue = stochRSIValues[lastIndex]?.value ?? 0
  const previousValue = stochRSIValues[lastIndex - 1]?.value ?? 0

  const overbought = currentValue >= 80
  const oversold = currentValue <= 20

  let signal: 'BUY' | 'SELL' | 'NONE' = 'NONE'
  if (previousValue < 20 && currentValue > 20) signal = 'BUY'
  else if (previousValue > 80 && currentValue < 80) signal = 'SELL'

  const divergence = 'NONE'

  return { signal, overbought, oversold, divergence }
}
