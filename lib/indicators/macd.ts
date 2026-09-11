import { calculateEMA } from './ema'
import { MACDResult } from './types'

export function calculateMACD(
  closes: number[],
  fastPeriod = 12,
  slowPeriod = 26,
  signalPeriod = 9
): MACDResult[] {
  const result: MACDResult[] = closes.map(() => ({
    macd: null,
    signal: null,
    histogram: null,
  }))

  if (closes.length < slowPeriod) {
    return result
  }

  const fastEMA = calculateEMA(closes, fastPeriod)
  const slowEMA = calculateEMA(closes, slowPeriod)

  const macdValues: (number | null)[] =
    new Array(closes.length).fill(null)

  for (let i = 0; i < closes.length; i++) {
    if (
      fastEMA[i] !== null &&
      slowEMA[i] !== null
    ) {
      macdValues[i] =
        fastEMA[i]! - slowEMA[i]!
    }
  }

  // Extract valid MACD values for signal EMA
  const validMACD: number[] = []

  for (const value of macdValues) {
    if (value !== null) {
      validMACD.push(value)
    }
  }

  const signalValues = calculateEMA(
    validMACD,
    signalPeriod
  )

  let signalIndex = 0

  for (let i = 0; i < closes.length; i++) {
    const macd = macdValues[i]

    if (macd === null) {
      continue
    }

    const signal = signalValues[signalIndex]

    if (signal !== null) {
      result[i] = {
        macd,
        signal,
        histogram: macd - signal,
      }
    } else {
      result[i] = {
        macd,
        signal: null,
        histogram: null,
      }
    }

    signalIndex++
  }

  return result
}
