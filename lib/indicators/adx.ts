import { Candle, ADXResult } from './types'

export function calculateADX(
  candles: Candle[],
  period: number = 14
): ADXResult[] {
  const results: ADXResult[] = []

  if (candles.length < period + 1) {
    return candles.map(() => ({ adx: null, plusDI: null, minusDI: null }))
  }

  const trueRanges: number[] = []
  const plusDMs: number[] = []
  const minusDMs: number[] = []

  for (let i = 1; i < candles.length; i++) {
    const high = candles[i].high
    const low = candles[i].low
    const prevHigh = candles[i - 1].high
    const prevLow = candles[i - 1].low
    const prevClose = candles[i - 1].close

    const tr = Math.max(
      high - low,
      Math.abs(high - prevClose),
      Math.abs(low - prevClose)
    )
    trueRanges.push(tr)

    const upMove = high - prevHigh
    const downMove = prevLow - low

    plusDMs.push(upMove > downMove && upMove > 0 ? upMove : 0)
    minusDMs.push(downMove > upMove && downMove > 0 ? downMove : 0)
  }

  const smoothedTR: number[] = []
  const smoothedPlusDM: number[] = []
  const smoothedMinusDM: number[] = []

  let sumTR = 0
  let sumPlusDM = 0
  let sumMinusDM = 0

  for (let i = 0; i < period; i++) {
    sumTR += trueRanges[i]
    sumPlusDM += plusDMs[i]
    sumMinusDM += minusDMs[i]
  }

  smoothedTR.push(sumTR)
  smoothedPlusDM.push(sumPlusDM)
  smoothedMinusDM.push(sumMinusDM)

  for (let i = period; i < trueRanges.length; i++) {
    const prevTR = smoothedTR[smoothedTR.length - 1]
    const prevPlusDM = smoothedPlusDM[smoothedPlusDM.length - 1]
    const prevMinusDM = smoothedMinusDM[smoothedMinusDM.length - 1]

    smoothedTR.push(prevTR - prevTR / period + trueRanges[i])
    smoothedPlusDM.push(prevPlusDM - prevPlusDM / period + plusDMs[i])
    smoothedMinusDM.push(prevMinusDM - prevMinusDM / period + minusDMs[i])
  }

  const dxValues: number[] = []

  for (let i = 0; i < smoothedTR.length; i++) {
    const plusDI = smoothedTR[i] > 0 ? (smoothedPlusDM[i] / smoothedTR[i]) * 100 : 0
    const minusDI = smoothedTR[i] > 0 ? (smoothedMinusDM[i] / smoothedTR[i]) * 100 : 0

    const diSum = plusDI + minusDI
    const dx = diSum > 0 ? (Math.abs(plusDI - minusDI) / diSum) * 100 : 0

    dxValues.push(dx)
  }

  const adxValues: number[] = []

  if (dxValues.length >= period) {
    let sumDX = 0
    for (let i = 0; i < period; i++) {
      sumDX += dxValues[i]
    }
    adxValues.push(sumDX / period)

    for (let i = period; i < dxValues.length; i++) {
      const prevADX = adxValues[adxValues.length - 1]
      adxValues.push((prevADX * (period - 1) + dxValues[i]) / period)
    }
  }

  let resultIndex = 0

  for (let i = 0; i < period; i++) {
    results.push({ adx: null, plusDI: null, minusDI: null })
  }

  for (let i = 0; i < adxValues.length; i++) {
    const trIdx = period + i
    const plusDI = smoothedTR[i] > 0 ? (smoothedPlusDM[i] / smoothedTR[i]) * 100 : 0
    const minusDI = smoothedTR[i] > 0 ? (smoothedMinusDM[i] / smoothedTR[i]) * 100 : 0

    results.push({
      adx: adxValues[i],
      plusDI,
      minusDI,
    })
  }

  while (results.length < candles.length) {
    const last = results[results.length - 1]
    results.push({ ...last })
  }

  return results
}
