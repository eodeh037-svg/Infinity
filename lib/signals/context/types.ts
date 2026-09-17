import { Signal } from '../signalEngine'

// ─── Trend Regime ───────────────────────────────────────

export type MarketTrendRegime = 'uptrend' | 'downtrend' | 'range' | 'unclear'

export type TrendStrength = 'strong' | 'moderate' | 'weak'

export interface TrendRegimeResult {
  regime: MarketTrendRegime
  strength: TrendStrength
  evidence: string[]
  coverage: 'full' | 'partial' | 'unavailable'
}

// ─── Key Levels ─────────────────────────────────────────

export type PriceLocation =
  | 'near_support'
  | 'near_resistance'
  | 'between_levels'
  | 'breaking_resistance'
  | 'breaking_support'
  | 'far_from_key_levels'

export type BreakoutState =
  | 'breakout_up'
  | 'breakout_down'
  | 'false_breakout_risk'
  | 'no_breakout'

export interface PriceLevel {
  price: number
  distancePercent: number
  strength: number
  touches: number
  zone: [number, number]
}

export interface KeyLevelsResult {
  support: PriceLevel[]
  resistance: PriceLevel[]
  nearestSupport: number | null
  nearestResistance: number | null
  priceLocation: PriceLocation
  breakoutState: BreakoutState
  coverage: 'full' | 'partial' | 'unavailable'
  evidence: string[]
}

// ─── Volatility Regime ──────────────────────────────────

export type VolatilityRegime = 'very_low' | 'low' | 'normal' | 'high' | 'extreme'

export type VolatilityDirection = 'expanding' | 'contracting' | 'stable'

export interface VolatilityRegimeResult {
  regime: VolatilityRegime
  direction: VolatilityDirection
  atrPercentile: number
  atrRatio: number
  coverage: 'full' | 'partial' | 'unavailable'
  evidence: string[]
}

// ─── Market Context (composite) ─────────────────────────

export interface MarketContext {
  regime: TrendRegimeResult
  levels: KeyLevelsResult
  volatility: VolatilityRegimeResult
  session: null
  newsRisk: null
  positioning: null
}

// ─── Context Assessment ─────────────────────────────────

export type ContextAlignment = 'supportive' | 'neutral' | 'conflicting'

export interface ContextAssessment {
  alignment: ContextAlignment
  confidenceAdjustment: number
  warnings: string[]
  coverage: {
    regime: 'full' | 'partial' | 'unavailable'
    levels: 'full' | 'partial' | 'unavailable'
    volatility: 'full' | 'partial' | 'unavailable'
  }
  evidence: string[]
}

// ─── Strategy Context Configuration ─────────────────────

export interface ContextConfig {
  regimeWeight: number
  levelsWeight: number
  volatilityWeight: number
  holdThreshold: number
  maxAdjustment: number
}

// ─── Analysis Input ─────────────────────────────────────

export interface ContextInput {
  signal: Signal
  technicalConfidence: number
  context: MarketContext
  config: ContextConfig
}
