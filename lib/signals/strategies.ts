import { Timeframe } from '../server/providers/types'
import { ContextConfig } from './context/types'

export type StrategyKey = 'general' | 'scalping' | 'dayTrading' | 'swingTrading' | 'positionTrading'

export interface TimeframeWeight {
  timeframe: Timeframe
  weight: number
  label: string
  role: string
}

export interface StrategyProfile {
  key: StrategyKey
  label: string
  description: string
  timeframes: TimeframeWeight[]
  minTimeframesRequired: number
  holdThresholds: {
    minAgreement: number
    maxDisagreement: number
  }
  contextConfig: ContextConfig
}

export const STRATEGY_PROFILES: Record<StrategyKey, StrategyProfile> = {
  general: {
    key: 'general',
    label: 'General',
    description: 'Broad market assessment across multiple timeframes',
    timeframes: [
      { timeframe: '15min', weight: 0.15, label: '15M', role: 'short-term momentum' },
      { timeframe: '1h', weight: 0.25, label: '1H', role: 'intraday direction' },
      { timeframe: '4h', weight: 0.30, label: '4H', role: 'intermediate trend' },
      { timeframe: '1day', weight: 0.30, label: '1D', role: 'higher-timeframe context' },
    ],
    minTimeframesRequired: 2,
    holdThresholds: {
      minAgreement: 0.55,
      maxDisagreement: 0.40,
    },
    contextConfig: {
      regimeWeight: 0.35,
      levelsWeight: 0.35,
      volatilityWeight: 0.30,
      holdThreshold: 2,
      maxAdjustment: 8,
    },
  },
  scalping: {
    key: 'scalping',
    label: 'Scalping',
    description: 'Very short-term momentum and micro-structure analysis',
    timeframes: [
      { timeframe: '1min', weight: 0.25, label: '1M', role: 'tick-level structure' },
      { timeframe: '5min', weight: 0.35, label: '5M', role: 'micro momentum' },
      { timeframe: '15min', weight: 0.40, label: '15M', role: 'short-term trend' },
    ],
    minTimeframesRequired: 2,
    holdThresholds: {
      minAgreement: 0.60,
      maxDisagreement: 0.35,
    },
    contextConfig: {
      regimeWeight: 0.20,
      levelsWeight: 0.40,
      volatilityWeight: 0.40,
      holdThreshold: 2,
      maxAdjustment: 6,
    },
  },
  dayTrading: {
    key: 'dayTrading',
    label: 'Day Trading',
    description: 'Intraday momentum with higher-timeframe context',
    timeframes: [
      { timeframe: '5min', weight: 0.20, label: '5M', role: 'entry timing' },
      { timeframe: '15min', weight: 0.30, label: '15M', role: 'intraday structure' },
      { timeframe: '1h', weight: 0.50, label: '1H', role: 'intraday trend' },
    ],
    minTimeframesRequired: 2,
    holdThresholds: {
      minAgreement: 0.55,
      maxDisagreement: 0.40,
    },
    contextConfig: {
      regimeWeight: 0.30,
      levelsWeight: 0.35,
      volatilityWeight: 0.35,
      holdThreshold: 2,
      maxAdjustment: 8,
    },
  },
  swingTrading: {
    key: 'swingTrading',
    label: 'Swing Trading',
    description: 'Multi-session setups with trend confirmation',
    timeframes: [
      { timeframe: '1h', weight: 0.20, label: '1H', role: 'entry/setup behavior' },
      { timeframe: '4h', weight: 0.35, label: '4H', role: 'intermediate trend' },
      { timeframe: '1day', weight: 0.45, label: '1D', role: 'higher-timeframe trend' },
    ],
    minTimeframesRequired: 2,
    holdThresholds: {
      minAgreement: 0.55,
      maxDisagreement: 0.40,
    },
    contextConfig: {
      regimeWeight: 0.45,
      levelsWeight: 0.30,
      volatilityWeight: 0.25,
      holdThreshold: 2,
      maxAdjustment: 10,
    },
  },
  positionTrading: {
    key: 'positionTrading',
    label: 'Position Trading',
    description: 'Long-term trend and market structure analysis',
    timeframes: [
      { timeframe: '4h', weight: 0.20, label: '4H', role: 'medium-term structure' },
      { timeframe: '1day', weight: 0.40, label: '1D', role: 'primary trend' },
      { timeframe: '1week', weight: 0.40, label: '1W', role: 'long-term context' },
    ],
    minTimeframesRequired: 2,
    holdThresholds: {
      minAgreement: 0.50,
      maxDisagreement: 0.45,
    },
    contextConfig: {
      regimeWeight: 0.50,
      levelsWeight: 0.30,
      volatilityWeight: 0.20,
      holdThreshold: 2,
      maxAdjustment: 10,
    },
  },
}

export const STRATEGY_LIST = Object.values(STRATEGY_PROFILES)

export function getStrategy(key: StrategyKey): StrategyProfile {
  return STRATEGY_PROFILES[key] ?? STRATEGY_PROFILES.general
}

export function getStrategyTimeframes(key: StrategyKey): Timeframe[] {
  return getStrategy(key).timeframes.map(tf => tf.timeframe)
}
