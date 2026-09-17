import { Signal } from '../signalEngine'
import {
  MarketContext,
  ContextAssessment,
  ContextConfig,
  ContextAlignment,
} from './types'

export function aggregateContext(
  signal: Signal,
  technicalConfidence: number,
  context: MarketContext,
  config: ContextConfig
): ContextAssessment {
  if (signal === 'HOLD') {
    return {
      alignment: 'neutral',
      confidenceAdjustment: 0,
      warnings: [],
      coverage: {
        regime: context.regime.coverage,
        levels: context.levels.coverage,
        volatility: context.volatility.coverage,
      },
      evidence: ['Technical signal is HOLD — context does not modify'],
    }
  }

  const regimeScore = evaluateRegimeAlignment(signal, context)
  const levelsScore = evaluateLevelsAlignment(signal, context)
  const volatilityScore = evaluateVolatilityAlignment(context)

  const weightedScore =
    regimeScore * config.regimeWeight +
    levelsScore * config.levelsWeight +
    volatilityScore * config.volatilityWeight

  const alignment = classifyAlignment(weightedScore)
  const confidenceAdjustment = calculateAdjustment(alignment, weightedScore, config)
  const warnings = generateWarnings(signal, context, alignment)
  const evidence = collectEvidence(signal, context, alignment)

  return {
    alignment,
    confidenceAdjustment,
    warnings,
    coverage: {
      regime: context.regime.coverage,
      levels: context.levels.coverage,
      volatility: context.volatility.coverage,
    },
    evidence,
  }
}

function evaluateRegimeAlignment(signal: Signal, context: MarketContext): number {
  const { regime, strength } = context.regime

  if (regime === 'unclear' || regime === 'range') return 0

  const isBullish = signal === 'BUY'
  const isUptrend = regime === 'uptrend'

  if (isBullish === isUptrend) {
    if (strength === 'strong') return 1.0
    if (strength === 'moderate') return 0.6
    return 0.3
  }

  if (strength === 'strong') return -1.0
  if (strength === 'moderate') return -0.6
  return -0.3
}

function evaluateLevelsAlignment(signal: Signal, context: MarketContext): number {
  const { priceLocation, breakoutState } = context.levels

  if (context.levels.coverage === 'unavailable') return 0

  const isBuy = signal === 'BUY'

  if (breakoutState === 'false_breakout_risk') {
    return isBuy ? -0.5 : -0.5
  }

  if (breakoutState === 'breakout_up') {
    return isBuy ? 0.7 : -0.3
  }

  if (breakoutState === 'breakout_down') {
    return isBuy ? -0.3 : 0.7
  }

  if (priceLocation === 'near_support') {
    return isBuy ? 0.6 : -0.6
  }

  if (priceLocation === 'near_resistance') {
    return isBuy ? -0.6 : 0.6
  }

  if (priceLocation === 'between_levels') {
    return 0.1
  }

  return 0
}

function evaluateVolatilityAlignment(context: MarketContext): number {
  const { regime, direction } = context.volatility

  if (context.volatility.coverage === 'unavailable') return 0

  if (regime === 'extreme') {
    return direction === 'expanding' ? -0.5 : -0.3
  }

  if (regime === 'high') {
    return direction === 'expanding' ? -0.3 : -0.1
  }

  if (regime === 'very_low') {
    return direction === 'contracting' ? -0.2 : 0.1
  }

  return 0
}

function classifyAlignment(weightedScore: number): ContextAlignment {
  if (weightedScore > 0.15) return 'supportive'
  if (weightedScore < -0.15) return 'conflicting'
  return 'neutral'
}

function calculateAdjustment(
  alignment: ContextAlignment,
  weightedScore: number,
  config: ContextConfig
): number {
  const max = config.maxAdjustment

  if (alignment === 'supportive') {
    const magnitude = Math.min(1, Math.abs(weightedScore))
    return Math.round(Math.min(max, 3 + magnitude * 5))
  }

  if (alignment === 'conflicting') {
    const magnitude = Math.min(1, Math.abs(weightedScore))
    return Math.round(Math.max(-max, -(3 + magnitude * 5)))
  }

  return 0
}

function generateWarnings(
  signal: Signal,
  context: MarketContext,
  alignment: ContextAlignment
): string[] {
  const warnings: string[] = []

  if (alignment !== 'conflicting') return warnings

  const { regime } = context.regime
  const { priceLocation, breakoutState } = context.levels
  const { regime: volRegime, direction: volDir } = context.volatility

  if (regime === 'uptrend' && signal === 'SELL') {
    warnings.push('Higher-timeframe trend opposes the signal')
  }
  if (regime === 'downtrend' && signal === 'BUY') {
    warnings.push('Higher-timeframe trend opposes the signal')
  }

  if (signal === 'BUY' && priceLocation === 'near_resistance') {
    warnings.push('Price is approaching a strong resistance zone')
  }
  if (signal === 'SELL' && priceLocation === 'near_support') {
    warnings.push('Price is approaching a strong support zone')
  }

  if (breakoutState === 'false_breakout_risk') {
    warnings.push('Potential false breakout detected — exercise caution')
  }

  if (volRegime === 'extreme' && volDir === 'expanding') {
    warnings.push('Volatility is extreme and expanding — elevated risk')
  }

  return warnings
}

function collectEvidence(
  signal: Signal,
  context: MarketContext,
  alignment: ContextAlignment
): string[] {
  const evidence: string[] = []

  evidence.push(`Regime: ${context.regime.regime} (${context.regime.strength})`)
  evidence.push(`Price location: ${context.levels.priceLocation}`)
  evidence.push(`Volatility: ${context.volatility.regime}, ${context.volatility.direction}`)
  evidence.push(`Context alignment: ${alignment}`)

  return evidence
}
