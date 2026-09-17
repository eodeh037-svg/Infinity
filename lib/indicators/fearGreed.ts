import { IndicatorPoint } from './types'

export type SentimentScore = {
  fearGreedIndex: number
  volatilityScore: number
  momentumScore: number
  volumeScore: number
  rsiScore: number
  sentiment: 'Extreme Fear' | 'Fear' | 'Neutral' | 'Greed' | 'Extreme Greed'
}

export function calculateFearGreed(
  closes: number[],
  volumes: number[],
  rsiValues: (number | null)[],
  atrValues: (number | null)[],
  lastIndex: number,
  lookback: number = 30
): SentimentScore {
  const start = Math.max(0, lastIndex - lookback)
  const recentCloses = closes.slice(start, lastIndex + 1)
  const recentVolumes = volumes.slice(start, lastIndex + 1)
  const recentRSI = rsiValues.slice(start, lastIndex + 1)
  const recentATR: number[] = atrValues.slice(start, lastIndex + 1).filter((v): v is number => v !== null)

  if (recentCloses.length < 5) {
    return {
      fearGreedIndex: 50,
      volatilityScore: 50,
      momentumScore: 50,
      volumeScore: 50,
      rsiScore: 50,
      sentiment: 'Neutral',
    }
  }

  // Volatility Score: higher volatility = more fear
  const avgATR = recentATR.reduce((a, b) => a + (b || 0), 0) / recentATR.length
  const currentATR = recentATR[recentATR.length - 1] || 0
  const avgClose = recentCloses.reduce((a, b) => a + b, 0) / recentCloses.length
  const volatilityRatio = avgClose > 0 ? (avgATR / avgClose) * 100 : 0
  const volatilityScore = Math.min(100, Math.max(0, 50 + (volatilityRatio - 2) * 10))

  // Momentum Score: price direction and strength
  const priceChange = recentCloses[recentCloses.length - 1] - recentCloses[0]
  const priceChangePercent = avgClose > 0 ? (priceChange / recentCloses[0]) * 100 : 0
  const momentumScore = Math.min(100, Math.max(0, 50 + priceChangePercent * 2))

  // Volume Score: higher volume = more conviction
  const avgVolume = recentVolumes.reduce((a, b) => a + (b || 0), 0) / recentVolumes.length
  const currentVolume = recentVolumes[recentVolumes.length - 1] || 0
  const volumeRatio = avgVolume > 0 ? currentVolume / avgVolume : 1
  const volumeScore = Math.min(100, Math.max(0, 50 + (volumeRatio - 1) * 50))

  // RSI Score: extreme RSI = fear/greed
  const validRSI = recentRSI.filter((r): r is number => r !== null)
  const avgRSI = validRSI.length > 0
    ? validRSI.reduce((a, b) => a + b, 0) / validRSI.length
    : 50
  const rsiScore = Math.min(100, Math.max(0, avgRSI))

  // Composite Fear & Greed Index
  const fearGreedIndex = Math.round(
    volatilityScore * 0.25 +
    momentumScore * 0.25 +
    volumeScore * 0.20 +
    rsiScore * 0.15 +
    50 * 0.15
  )

  // Sentiment label
  let sentiment: SentimentScore['sentiment']
  if (fearGreedIndex < 20) sentiment = 'Extreme Fear'
  else if (fearGreedIndex < 40) sentiment = 'Fear'
  else if (fearGreedIndex < 60) sentiment = 'Neutral'
  else if (fearGreedIndex < 80) sentiment = 'Greed'
  else sentiment = 'Extreme Greed'

  return {
    fearGreedIndex: Math.min(100, Math.max(0, fearGreedIndex)),
    volatilityScore: Math.round(volatilityScore),
    momentumScore: Math.round(momentumScore),
    volumeScore: Math.round(volumeScore),
    rsiScore: Math.round(rsiScore),
    sentiment,
  }
}

export function analyzeSentimentImpact(
  score: SentimentScore
): {
  sentimentMultiplier: number
  fearBonus: number
  greedPenalty: number
  sentimentReason: string
} {
  let sentimentMultiplier = 1.0
  let fearBonus = 0
  let greedPenalty = 0
  let sentimentReason = ''

  if (score.fearGreedIndex < 20) {
    sentimentMultiplier = 1.15
    fearBonus = 3
    sentimentReason = 'Extreme Fear - potential reversal opportunity'
  } else if (score.fearGreedIndex < 40) {
    sentimentMultiplier = 1.05
    fearBonus = 1
    sentimentReason = 'Fear - bullish contrarian signal'
  } else if (score.fearGreedIndex > 80) {
    sentimentMultiplier = 0.85
    greedPenalty = -3
    sentimentReason = 'Extreme Greed - potential bubble, caution'
  } else if (score.fearGreedIndex > 60) {
    sentimentMultiplier = 0.95
    greedPenalty = -1
    sentimentReason = 'Greed - bearish contrarian signal'
  } else {
    sentimentReason = 'Neutral sentiment'
  }

  return { sentimentMultiplier, fearBonus, greedPenalty, sentimentReason }
}
