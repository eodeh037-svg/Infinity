import { Candle } from './types'

export function calculateMVRV(
  candles: Candle[],
  maPeriod: number = 365
): {
  mvrv: number | null
  valuation: 'undervalued' | 'fair' | 'overvalued' | 'extreme_overvalued'
  signal: 'BUY' | 'SELL' | 'HOLD'
  reason: string
} {
  if (candles.length < maPeriod) {
    const fallbackPeriod = Math.min(100, candles.length)
    return calculateMVRVShort(candles, fallbackPeriod)
  }

  const closes = candles.map(c => c.close)
  const realizedPrice = closes.slice(-maPeriod).reduce((a, c) => a + c, 0) / maPeriod
  const currentPrice = closes[closes.length - 1]

  if (realizedPrice <= 0) return { mvrv: null, valuation: 'fair', signal: 'HOLD', reason: 'Invalid data' }

  const mvrv = currentPrice / realizedPrice

  let valuation: 'undervalued' | 'fair' | 'overvalued' | 'extreme_overvalued'
  let signal: 'BUY' | 'SELL' | 'HOLD'
  let reason: string

  if (mvrv < 1.0) {
    valuation = 'undervalued'
    signal = 'BUY'
    reason = `MVRV below 1.0 — holders are underwater, strong buy zone`
  } else if (mvrv < 1.5) {
    valuation = 'fair'
    signal = 'HOLD'
    reason = `MVRV ${mvrv.toFixed(2)} — fair value, hold position`
  } else if (mvrv < 3.5) {
    valuation = 'overvalued'
    signal = 'SELL'
    reason = `MVRV ${mvrv.toFixed(2)} — overvalued, consider taking profits`
  } else {
    valuation = 'extreme_overvalued'
    signal = 'SELL'
    reason = `MVRV ${mvrv.toFixed(2)} — extreme overvaluation, market top risk`
  }

  return { mvrv, valuation, signal, reason }
}

function calculateMVRVShort(
  candles: Candle[],
  period: number
 ): { mvrv: number | null; valuation: 'undervalued' | 'fair' | 'overvalued' | 'extreme_overvalued'; signal: 'BUY' | 'SELL' | 'HOLD'; reason: string } {
   const closes = candles.map(c => c.close)
   const ma = closes.slice(-period).reduce((a, c) => a + c, 0) / period
   const current = closes[closes.length - 1]

   if (ma <= 0) return { mvrv: null, valuation: 'fair', signal: 'HOLD', reason: 'Insufficient data' }

    const ratio = current / ma
    const priceRelation = ratio < 0.9 ? 'below' : ratio > 1.2 ? 'above' : 'at'
    return {
      mvrv: ratio,
      valuation: ratio < 0.9 ? 'undervalued' : ratio > 1.2 ? 'overvalued' : 'fair',
      signal: ratio < 0.9 ? 'BUY' : ratio > 1.2 ? 'SELL' : 'HOLD',
      reason: `Price ${priceRelation} ${period}-period MA (ratio: ${ratio.toFixed(2)})`,
    }
}

