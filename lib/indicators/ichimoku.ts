import { Candle, IchimokuResult } from './types'

function highestHigh(candles: Candle[], start: number, period: number): number {
  let max = -Infinity
  for (let i = start; i < start + period && i < candles.length; i++) {
    if (candles[i].high > max) max = candles[i].high
  }
  return max
}

function lowestLow(candles: Candle[], start: number, period: number): number {
  let min = Infinity
  for (let i = start; i < start + period && i < candles.length; i++) {
    if (candles[i].low < min) min = candles[i].low
  }
  return min
}

export function calculateIchimoku(
  candles: Candle[]
): IchimokuResult[] {
  const results: IchimokuResult[] = []

  const tenkanPeriod = 9
  const kijunPeriod = 26
  const senkouBPeriod = 52
  const projectionPeriod = 26

  const rawTenkan: (number | null)[] = []
  const rawKijun: (number | null)[] = []

  for (let i = 0; i < candles.length; i++) {
    let tenkan: number | null = null
    let kijun: number | null = null

    if (i >= tenkanPeriod - 1) {
      const hh = highestHigh(candles, i - tenkanPeriod + 1, tenkanPeriod)
      const ll = lowestLow(candles, i - tenkanPeriod + 1, tenkanPeriod)
      tenkan = (hh + ll) / 2
    }

    if (i >= kijunPeriod - 1) {
      const hh = highestHigh(candles, i - kijunPeriod + 1, kijunPeriod)
      const ll = lowestLow(candles, i - kijunPeriod + 1, kijunPeriod)
      kijun = (hh + ll) / 2
    }

    rawTenkan.push(tenkan)
    rawKijun.push(kijun)
  }

  for (let i = 0; i < candles.length; i++) {
    const tenkan = rawTenkan[i]
    const kijun = rawKijun[i]

    let senkouA: number | null = null
    let senkouB: number | null = null

    if (tenkan !== null && kijun !== null) {
      senkouA = (tenkan + kijun) / 2
    }

    if (i >= senkouBPeriod - 1) {
      const hh = highestHigh(candles, i - senkouBPeriod + 1, senkouBPeriod)
      const ll = lowestLow(candles, i - senkouBPeriod + 1, senkouBPeriod)
      senkouB = (hh + ll) / 2
    }

    const chikou = candles[i].close

    results.push({ tenkan, kijun, senkouA, senkouB, chikou })
  }

  return results
}

export function getCloudAtCandle(
  ichimokuResults: IchimokuResult[],
  index: number,
  projectionPeriod: number = 26
): { senkouA: number | null; senkouB: number | null } {
  const sourceIndex = index - projectionPeriod
  if (sourceIndex < 0 || sourceIndex >= ichimokuResults.length) {
    return { senkouA: null, senkouB: null }
  }
  return {
    senkouA: ichimokuResults[sourceIndex].senkouA,
    senkouB: ichimokuResults[sourceIndex].senkouB,
  }
}
