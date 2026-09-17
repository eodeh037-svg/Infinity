export type Candle = {
  time: number
  open: number
  high: number
  low: number
  close: number
  volume?: number
}

export type IndicatorPoint = {
  time: number
  value: number
}

export type MACDResult = {
  macd: number | null
  signal: number | null
  histogram: number | null
}

export type ADXResult = {
  adx: number | null
  plusDI: number | null
  minusDI: number | null
}

export type BollingerResult = {
  upper: number | null
  middle: number | null
  lower: number | null
  width: number | null
}

export type StochasticResult = {
  k: number | null
  d: number | null
}

export type IchimokuResult = {
  tenkan: number | null
  kijun: number | null
  senkouA: number | null
  senkouB: number | null
  chikou: number | null
}

export type OBVResult = {
  value: number | null
}

export type VWAPResult = {
  value: number | null
  above: boolean | null
}

export type SentimentScore = {
  fearGreedIndex: number
  volatilityScore: number
  momentumScore: number
  volumeScore: number
  rsiScore: number
  sentiment: 'Extreme Fear' | 'Fear' | 'Neutral' | 'Greed' | 'Extreme Greed'
}

export type SupertrendResult = {
  supertrend: number | null
  direction: 'UP' | 'DOWN'
}

export type FundingRateResult = {
  fundingRate: number
  bias: 'bullish' | 'bearish' | 'neutral'
  intensity: number
}

export type MVRVResult = {
  mvrv: number | null
  valuation: 'undervalued' | 'fair' | 'overvalued' | 'extreme_overvalued'
  signal: 'BUY' | 'SELL' | 'HOLD'
  reason: string
}

export type FisherResult = {
  signal: 'BUY' | 'SELL' | 'NONE'
  strength: number
  divergence: 'BULLISH' | 'BEARISH' | 'NONE'
}

export type CMOResult = {
  signal: 'BUY' | 'SELL' | 'NONE'
  strength: number
  momentum: 'increasing' | 'decreasing' | 'flat'
}

export type KeltnerResult = {
  upper: number | null
  middle: number | null
  lower: number | null
  width: number | null
  aboveUpper: boolean
  belowLower: boolean
  squeeze: boolean
  trend: 'bullish' | 'bearish' | 'neutral'
}

export type SARResult = {
  signal: 'BUY' | 'SELL' | 'NONE'
  inTrend: boolean
}

export type StochRSIResult = {
  signal: 'BUY' | 'SELL' | 'NONE'
  overbought: boolean
  oversold: boolean
}

export type ATRPercentileResult = {
  percentile: number
  regime: 'low' | 'medium' | 'high'
  multiplier: number
}
