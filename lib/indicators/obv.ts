import { IndicatorPoint } from './types'

export function calculateOBV(
  closes: number[],
  volumes: number[],
): IndicatorPoint[] {
  const results: IndicatorPoint[] = closes.map(() => ({ time: 0, value: 0 }))

  if (closes.length < 2 || volumes.length < 2) {
    return results
  }

  let obv = volumes[0] || 0
  results[0] = { time: 0, value: obv }

  for (let i = 1; i < closes.length; i++) {
    const change = closes[i] - closes[i - 1]
    if (change > 0) {
      obv += volumes[i] || 0
    } else if (change < 0) {
      obv -= volumes[i] || 0
    }
    results[i] = { time: i, value: obv }
  }

  return results
}

export function analyzeOBV(
  obvValues: IndicatorPoint[],
  closes: number[],
  lastIndex: number,
  lookback: number = 20
): {
  obvRising: boolean
  obvFalling: boolean
  obvDivergence: 'BULLISH' | 'BEARISH' | 'NONE'
  obvConfirm: boolean
} {
  const start = Math.max(0, lastIndex - lookback)
  const recentOBV = obvValues.slice(start, lastIndex + 1)
  const recentCloses = closes.slice(start, lastIndex + 1)

  if (recentOBV.length < 2) {
    return { obvRising: false, obvFalling: false, obvDivergence: 'NONE', obvConfirm: false }
  }

  const firstOBV = recentOBV[0].value
  const lastOBV = recentOBV[recentOBV.length - 1].value
  const obvDiff = lastOBV - firstOBV

  const firstClose = recentCloses[0]
  const lastClose = recentCloses[recentCloses.length - 1]
  const closeDiff = lastClose - firstClose

  const obvRising = obvDiff > 0
  const obvFalling = obvDiff < 0

  let obvDivergence: 'BULLISH' | 'BEARISH' | 'NONE' = 'NONE'
  if (closeDiff > 0 && obvDiff < 0) {
    obvDivergence = 'BEARISH'
  } else if (closeDiff < 0 && obvDiff > 0) {
    obvDivergence = 'BULLISH'
  }

  const obvConfirm = (closeDiff > 0 && obvRising) || (closeDiff < 0 && obvFalling)

  return { obvRising, obvFalling, obvDivergence, obvConfirm }
}
