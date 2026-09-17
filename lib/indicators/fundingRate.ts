import { Candle } from './types'

export function calculateFundingRate(
  candles: Candle[],
  lookback: number = 24
): {
  fundingRate: number
  bias: 'bullish' | 'bearish' | 'neutral'
  intensity: number
} {
  if (candles.length < 2) {
    return { fundingRate: 0, bias: 'neutral', intensity: 0 }
  }

  const recentCandles = candles.slice(-lookback)
  const current = candles[candles.length - 1]

  const priceChange = recentCandles[recentCandles.length - 1].close - recentCandles[0].close
  const avgPrice = recentCandles.reduce((a, c) => a + c.close, 0) / recentCandles.length
  const priceChangePercent = avgPrice > 0 ? (priceChange / avgPrice) * 100 : 0

  const volatility = calculateVolatility(recentCandles)
  const volatilityRatio = volatility > 0 ? Math.abs(priceChangePercent) / volatility : 0

  let fundingRate: number
  let bias: 'bullish' | 'bearish' | 'neutral'
  let intensity: number

  if (priceChangePercent > 0) {
    fundingRate = Math.min(priceChangePercent / 100, 0.1)
    bias = 'bearish'
    intensity = Math.min(volatilityRatio, 1.0)
  } else if (priceChangePercent < 0) {
    fundingRate = Math.max(priceChangePercent / 100, -0.1)
    bias = 'bullish'
    intensity = Math.min(volatilityRatio, 1.0)
  } else {
    fundingRate = 0
    bias = 'neutral'
    intensity = 0
  }

  return { fundingRate, bias, intensity }
}

function calculateVolatility(candles: Candle[]): number {
  const closes = candles.map(c => c.close)
  const changes = closes.slice(1).map((c, i) => c - closes[i])
  const avgChange = changes.reduce((a, b) => a + b, 0) / changes.length
  const variance = changes.reduce((a, c) => a + (c - avgChange) ** 2, 0) / changes.length
  return Math.sqrt(variance)
}

export function analyzeFundingSignal(
  fundingRate: number,
  bias: string,
  intensity: number
): {
  score: number
  reason: string
} {
  if (bias === 'bullish' && intensity > 0.5) {
    return { score: 2, reason: `Funding rate bearish (${fundingRate.toFixed(4)}) with high intensity — contrarian long` }
  } else if (bias === 'bearish' && intensity > 0.5) {
    return { score: -2, reason: `Funding rate bullish (${fundingRate.toFixed(4)}) with high intensity — contrarian short` }
  } else if (bias === 'bullish') {
    return { score: 1, reason: `Funding rate bearish (${fundingRate.toFixed(4)}) — mild bullish bias` }
  } else if (bias === 'bearish') {
    return { score: -1, reason: `Funding rate bullish (${fundingRate.toFixed(4)}) — mild bearish bias` }
  }
  return { score: 0, reason: 'Neutral funding rate' }
}
