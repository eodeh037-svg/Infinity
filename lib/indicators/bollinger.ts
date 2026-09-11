import { BollingerResult } from './types'

export function calculateBollinger(
  closes: number[],
  period: number = 20,
  stdDevMultiplier: number = 2
): BollingerResult[] {
  const results: BollingerResult[] = []

  if (closes.length < period) {
    return closes.map(() => ({ upper: null, middle: null, lower: null, width: null }))
  }

  for (let i = 0; i < closes.length; i++) {
    if (i < period - 1) {
      results.push({ upper: null, middle: null, lower: null, width: null })
      continue
    }

    const slice = closes.slice(i - period + 1, i + 1)
    const sum = slice.reduce((a, b) => a + b, 0)
    const middle = sum / period

    const squaredDiffs = slice.map(val => Math.pow(val - middle, 2))
    const variance = squaredDiffs.reduce((a, b) => a + b, 0) / period
    const stdDev = Math.sqrt(variance)

    const upper = middle + stdDevMultiplier * stdDev
    const lower = middle - stdDevMultiplier * stdDev
    const width = middle > 0 ? (upper - lower) / middle : 0

    results.push({ upper, middle, lower, width })
  }

  return results
}

export function detectBollingerSqueeze(
  bollingerResults: BollingerResult[],
  lookback: number = 120
): { isSqueeze: boolean; squeezeIntensity: number } {
  const recent = bollingerResults
    .slice(-lookback)
    .filter(b => b.width !== null)

  if (recent.length < lookback / 2) {
    return { isSqueeze: false, squeezeIntensity: 0 }
  }

  const widths = recent.map(b => b.width!)
  const currentWidth = widths[widths.length - 1]
  const avgWidth = widths.reduce((a, b) => a + b, 0) / widths.length
  const minWidth = Math.min(...widths)

  const isSqueeze = currentWidth < avgWidth * 0.75
  const squeezeIntensity = avgWidth > 0 ? Math.max(0, (avgWidth - currentWidth) / avgWidth) : 0

  return { isSqueeze, squeezeIntensity }
}
