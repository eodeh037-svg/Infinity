import { Candle } from '../indicators/types'
import { Timeframe } from '../server/providers/types'
import { generateSignal, SignalResult, Signal } from './signalEngine'
import { StrategyProfile, StrategyKey, getStrategy, STRATEGY_PROFILES } from './strategies'
import { MarketContext, ContextAssessment } from './context/types'
import { detectTrendRegime } from './context/marketRegime'
import { detectKeyLevels } from './context/keyLevels'
import { detectVolatilityRegime } from './context/volatilityRegime'
import { aggregateContext } from './context/contextAggregator'

export type TimeframeStatus = 'complete' | 'partial' | 'unavailable'

export interface TimeframeAnalysis {
  timeframe: Timeframe
  label: string
  role: string
  weight: number
  signal: Signal
  confidence: number
  status: TimeframeStatus
  candleCount: number
  reasons: string[]
  trend: 'bullish' | 'bearish' | 'neutral'
  momentum: 'positive' | 'negative' | 'neutral'
  structure: 'bullish' | 'bearish' | 'neutral'
  context: MarketContext
}

export interface MultiTimeframeResult {
  strategy: StrategyKey
  strategyLabel: string
  overallSignal: Signal
  overallScore: number
  technicalStrength: 'Strong' | 'Moderate' | 'Weak' | 'Insufficient'
  timeframeAnalyses: TimeframeAnalysis[]
  marketContext: {
    trend: 'bullish' | 'bearish' | 'neutral'
    momentum: 'positive' | 'negative' | 'neutral'
    structure: 'bullish' | 'bearish' | 'neutral'
    volatility: 'low' | 'medium' | 'high' | 'unknown'
  }
  contextAssessment: ContextAssessment
  contextReasoning: string[]
  dataStatus: Record<string, TimeframeStatus>
  reasoning: string[]
}

function deriveTrend(result: SignalResult): 'bullish' | 'bearish' | 'neutral' {
  const ema20 = result.ema20
  const ema50 = result.ema50
  const supertrend = result.supertrendDirection

  if (supertrend === 'UP' && ema20 !== null && ema50 !== null && ema20 > ema50) return 'bullish'
  if (supertrend === 'DOWN' && ema20 !== null && ema50 !== null && ema20 < ema50) return 'bearish'
  if (ema20 !== null && ema50 !== null) {
    if (ema20 > ema50) return 'bullish'
    if (ema20 < ema50) return 'bearish'
  }
  return 'neutral'
}

function deriveMomentum(result: SignalResult): 'positive' | 'negative' | 'neutral' {
  const rsi = result.rsi
  const macdHist = result.macd.histogram

  if (rsi !== null && rsi > 55 && macdHist !== null && macdHist > 0) return 'positive'
  if (rsi !== null && rsi < 45 && macdHist !== null && macdHist < 0) return 'negative'
  return 'neutral'
}

function deriveStructure(result: SignalResult): 'bullish' | 'bearish' | 'neutral' {
  if (result.supertrendDirection === 'UP') return 'bullish'
  if (result.supertrendDirection === 'DOWN') return 'bearish'
  return 'neutral'
}

function analyzeMarketContext(candles: Candle[], result: SignalResult): MarketContext {
  const lastIndex = candles.length - 1

  const regime = detectTrendRegime(result)
  const levels = detectKeyLevels(candles, result.entry, result.atr)
  const volatility = detectVolatilityRegime(candles, [], result.atrPercentile)

  return {
    regime,
    levels,
    volatility,
    session: null,
    newsRisk: null,
    positioning: null,
  }
}

function createEmptyContext(): MarketContext {
  return {
    regime: { regime: 'unclear', strength: 'weak', evidence: [], coverage: 'unavailable' },
    levels: {
      support: [], resistance: [],
      nearestSupport: null, nearestResistance: null,
      priceLocation: 'far_from_key_levels', breakoutState: 'no_breakout',
      coverage: 'unavailable', evidence: [],
    },
    volatility: {
      regime: 'normal', direction: 'stable',
      atrPercentile: 50, atrRatio: 1.0,
      coverage: 'unavailable', evidence: [],
    },
    session: null,
    newsRisk: null,
    positioning: null,
  }
}

function analyzeSingleTimeframe(
  candles: Candle[],
  timeframe: Timeframe,
  label: string,
  role: string,
  weight: number,
  accountSize: number
): TimeframeAnalysis {
  if (!candles || candles.length < 50) {
    return {
      timeframe, label, role, weight,
      signal: 'HOLD', confidence: 0, status: 'unavailable',
      candleCount: candles?.length ?? 0,
      reasons: ['Insufficient data'],
      trend: 'neutral', momentum: 'neutral', structure: 'neutral',
      context: createEmptyContext(),
    }
  }

  const result = generateSignal(candles, accountSize)

  const status: TimeframeStatus = candles.length >= 200 ? 'complete' : 'partial'

  const context = analyzeMarketContext(candles, result)

  return {
    timeframe, label, role, weight,
    signal: result.signal,
    confidence: result.confidence,
    status,
    candleCount: candles.length,
    reasons: result.reasons.slice(0, 3),
    trend: deriveTrend(result),
    momentum: deriveMomentum(result),
    structure: deriveStructure(result),
    context,
  }
}

function aggregateSignals(
  analyses: TimeframeAnalysis[],
  strategy: StrategyProfile
): { signal: Signal; score: number; strength: MultiTimeframeResult['technicalStrength']; reasons: string[] } {
  const available = analyses.filter(a => a.status !== 'unavailable')

  if (available.length === 0) {
    return { signal: 'HOLD', score: 0, strength: 'Insufficient', reasons: ['No timeframe data available'] }
  }

  if (available.length < strategy.minTimeframesRequired) {
    return {
      signal: 'HOLD', score: 0, strength: 'Insufficient',
      reasons: [`Only ${available.length}/${strategy.minTimeframesRequired} timeframes available`],
    }
  }

  let buyScore = 0
  let sellScore = 0
  let totalWeight = 0

  for (const a of available) {
    const signalWeight = a.weight * (a.confidence / 100)
    totalWeight += a.weight

    if (a.signal === 'BUY') {
      buyScore += signalWeight
    } else if (a.signal === 'SELL') {
      sellScore += signalWeight
    }
  }

  if (totalWeight === 0) {
    return { signal: 'HOLD', score: 0, strength: 'Weak', reasons: ['All timeframes have zero weight'] }
  }

  const normalizedBuy = buyScore / totalWeight
  const normalizedSell = sellScore / totalWeight
  const scoreDifference = Math.abs(normalizedBuy - normalizedSell)
  const maxScore = Math.max(normalizedBuy, normalizedSell)

  const bullishCount = available.filter(a => a.trend === 'bullish').length
  const bearishCount = available.filter(a => a.trend === 'bearish').length
  const trendAlignment = Math.abs(bullishCount - bearishCount) / available.length

  let signal: Signal
  const reasons: string[] = []

  if (scoreDifference <= (1 - strategy.holdThresholds.minAgreement) && maxScore < 0.5) {
    signal = 'HOLD'
    reasons.push('Mixed signals across timeframes')
  } else if (trendAlignment > 0.6 && scoreDifference < 0.15) {
    signal = 'HOLD'
    reasons.push('Timeframes agree on direction but momentum is weak')
  } else {
    signal = normalizedBuy >= normalizedSell ? 'BUY' : 'SELL'
  }

  if (signal === 'BUY') {
    if (bullishCount === available.length) {
      reasons.push('All timeframes aligned bullish')
    } else if (bullishCount > bearishCount) {
      reasons.push(`${bullishCount}/${available.length} timeframes bullish`)
    }
  } else if (signal === 'SELL') {
    if (bearishCount === available.length) {
      reasons.push('All timeframes aligned bearish')
    } else if (bearishCount > bullishCount) {
      reasons.push(`${bearishCount}/${available.length} timeframes bearish`)
    }
  }

  const higherTimeframes = available.slice(-2)
  const lowerTimeframes = available.slice(0, -2)

  if (higherTimeframes.length > 0 && lowerTimeframes.length > 0) {
    const higherBullish = higherTimeframes.filter(a => a.trend === 'bullish').length
    const higherBearish = higherTimeframes.filter(a => a.trend === 'bearish').length

    if (signal === 'BUY' && higherBearish > higherBullish) {
      reasons.push('Note: Higher timeframes lean bearish')
    } else if (signal === 'SELL' && higherBullish > higherBearish) {
      reasons.push('Note: Higher timeframes lean bullish')
    }
  }

  const score = Math.round((normalizedBuy + normalizedSell) * 50)
  const strength = calculateStrength(scoreDifference, available.length, trendAlignment)

  return { signal, score, strength, reasons }
}

function calculateStrength(
  scoreDifference: number,
  timeframeCount: number,
  trendAlignment: number
): MultiTimeframeResult['technicalStrength'] {
  if (scoreDifference > 0.4 && trendAlignment > 0.6 && timeframeCount >= 3) return 'Strong'
  if (scoreDifference > 0.25 && timeframeCount >= 2) return 'Moderate'
  if (scoreDifference > 0.1) return 'Weak'
  return 'Weak'
}

export function analyzeMultiTimeframe(
  candleData: Record<Timeframe, Candle[]>,
  strategyKey: StrategyKey,
  accountSize: number = 0
): MultiTimeframeResult {
  const strategy = getStrategy(strategyKey)
  const TAG = '[SignalEngine]'

  console.log(`${TAG} Strategy: ${strategy.label}`)
  console.log(`${TAG} Timeframes: ${strategy.timeframes.map(tf => tf.label).join(', ')}`)

  const analyses: TimeframeAnalysis[] = []

  for (const tfConfig of strategy.timeframes) {
    const candles = candleData[tfConfig.timeframe] ?? []
    const analysis = analyzeSingleTimeframe(
      candles, tfConfig.timeframe, tfConfig.label, tfConfig.role, tfConfig.weight, accountSize
    )
    analyses.push(analysis)

    const statusIcon = analysis.status === 'unavailable' ? '✗' : analysis.signal === 'BUY' ? '↑' : analysis.signal === 'SELL' ? '↓' : '→'
    console.log(`${TAG} ${tfConfig.label} → ${analysis.signal} (${analysis.status}, ${analysis.candleCount} candles)`)
    console.log(`${TAG} ${tfConfig.label} Context → Regime: ${analysis.context.regime.regime}, Levels: ${analysis.context.levels.priceLocation}, Vol: ${analysis.context.volatility.regime}`)
  }

  const { signal, score, strength, reasons } = aggregateSignals(analyses, strategy)

  const available = analyses.filter(a => a.status !== 'unavailable')
  const bullTrend = available.filter(a => a.trend === 'bullish').length
  const bearTrend = available.filter(a => a.trend === 'bearish').length
  const bullMom = available.filter(a => a.momentum === 'positive').length
  const bearMom = available.filter(a => a.momentum === 'negative').length
  const bullStruct = available.filter(a => a.structure === 'bullish').length
  const bearStruct = available.filter(a => a.structure === 'bearish').length

  const trend: 'bullish' | 'bearish' | 'neutral' = bullTrend > bearTrend ? 'bullish' : bearTrend > bullTrend ? 'bearish' : 'neutral'
  const momentum: 'positive' | 'negative' | 'neutral' = bullMom > bearMom ? 'positive' : bearMom > bullMom ? 'negative' : 'neutral'
  const structure: 'bullish' | 'bearish' | 'neutral' = bullStruct > bearStruct ? 'bullish' : bearStruct > bullStruct ? 'bearish' : 'neutral'

  const volCandles = candleData[strategy.timeframes[strategy.timeframes.length - 1].timeframe] ?? []
  const lastAtr = volCandles.length > 14 ? volCandles.slice(-14).reduce((sum, c) => {
    const range = c.high - c.low
    return sum + range
  }, 0) / 14 : 0
  const lastClose = volCandles.length > 0 ? volCandles[volCandles.length - 1].close : 0
  const atrPct = lastClose > 0 ? (lastAtr / lastClose) * 100 : 0
  const volatility: 'low' | 'medium' | 'high' = atrPct < 0.3 ? 'low' : atrPct < 0.8 ? 'medium' : 'high'

  const dataStatus: Record<string, TimeframeStatus> = {}
  for (const a of analyses) {
    dataStatus[a.timeframe] = a.status
  }

  const marketCtx = { trend, momentum, structure, volatility }

  // Aggregate context across timeframes
  const contextResult = aggregateContextAcrossTimeframes(analyses, signal, strategy)

  const fullReasons = [
    ...reasons,
    `Trend: ${trend}, Momentum: ${momentum}, Structure: ${structure}`,
    ...contextResult.contextReasoning,
  ]

  console.log(`${TAG} Overall → ${signal}`)
  console.log(`${TAG} Technical Strength → ${strength}`)
  console.log(`${TAG} Context Alignment → ${contextResult.contextAssessment.alignment}`)
  console.log(`${TAG} Context Adjustment → ${contextResult.contextAssessment.confidenceAdjustment}`)

  return {
    strategy: strategyKey,
    strategyLabel: strategy.label,
    overallSignal: signal,
    overallScore: score,
    technicalStrength: strength,
    timeframeAnalyses: analyses,
    marketContext: marketCtx,
    contextAssessment: contextResult.contextAssessment,
    contextReasoning: contextResult.contextReasoning,
    dataStatus,
    reasoning: fullReasons,
  }
}

function aggregateContextAcrossTimeframes(
  analyses: TimeframeAnalysis[],
  signal: Signal,
  strategy: StrategyProfile
): { contextAssessment: ContextAssessment; contextReasoning: string[] } {
  const available = analyses.filter(a => a.status !== 'unavailable')

  if (available.length === 0) {
    return {
      contextAssessment: {
        alignment: 'neutral',
        confidenceAdjustment: 0,
        warnings: [],
        coverage: { regime: 'unavailable', levels: 'unavailable', volatility: 'unavailable' },
        evidence: ['No timeframe data available for context assessment'],
      },
      contextReasoning: [],
    }
  }

  // Use the highest-weighted timeframe's context as the primary context
  // but consider consensus across timeframes
  const sortedByWeight = [...available].sort((a, b) => b.weight - a.weight)
  const primaryContext = sortedByWeight[0].context

  // Check regime consensus across timeframes
  const regimeCounts = { uptrend: 0, downtrend: 0, range: 0, unclear: 0 }
  for (const a of available) {
    regimeCounts[a.context.regime.regime]++
  }

  const dominantRegime = (Object.entries(regimeCounts) as [string, number][])
    .sort((a, b) => b[1] - a[1])[0]

  // Check if higher timeframes agree with the signal direction
  const higherTFs = sortedByWeight.slice(0, Math.min(2, sortedByWeight.length))
  const higherTFRegimes = higherTFs.map(a => a.context.regime.regime)

  const contextReasoning: string[] = []

  // Evaluate primary context
  const primaryAssessment = aggregateContext(
    signal,
    sortedByWeight[0].confidence,
    primaryContext,
    strategy.contextConfig
  )

  // Adjust based on multi-timeframe consensus
  let finalAdjustment = primaryAssessment.confidenceAdjustment
  let finalAlignment = primaryAssessment.alignment

  // If higher timeframes have strong conflicting regime, increase caution
  const higherTFConflict = higherTFs.some(a => {
    const regime = a.context.regime.regime
    if (signal === 'BUY' && regime === 'downtrend' && a.context.regime.strength === 'strong') return true
    if (signal === 'SELL' && regime === 'uptrend' && a.context.regime.strength === 'strong') return true
    return false
  })

  if (higherTFConflict) {
    finalAdjustment = Math.min(finalAdjustment, -5)
    if (finalAlignment !== 'conflicting') {
      finalAlignment = 'conflicting'
      contextReasoning.push('Higher-timeframe context conflicts with signal direction')
    }
  }

  // If most timeframes agree on context alignment, boost slightly
  const supportiveCount = available.filter(a => {
    const regime = a.context.regime.regime
    if (signal === 'BUY' && regime === 'uptrend') return true
    if (signal === 'SELL' && regime === 'downtrend') return true
    return false
  }).length

  if (supportiveCount > available.length * 0.6 && finalAlignment === 'neutral') {
    finalAlignment = 'supportive'
    finalAdjustment = Math.max(finalAdjustment, 2)
    contextReasoning.push('Most timeframes show confirming context')
  }

  // Generate context reasoning
  if (primaryContext.regime.coverage !== 'unavailable') {
    contextReasoning.push(`Regime: ${primaryContext.regime.regime} (${primaryContext.regime.strength})`)
  }
  if (primaryContext.levels.coverage !== 'unavailable' && primaryContext.levels.evidence.length > 0) {
    contextReasoning.push(`Price: ${primaryContext.levels.priceLocation}`)
  }
  if (primaryContext.volatility.coverage !== 'unavailable') {
    contextReasoning.push(`Volatility: ${primaryContext.volatility.regime}, ${primaryContext.volatility.direction}`)
  }

  const contextAssessment: ContextAssessment = {
    alignment: finalAlignment,
    confidenceAdjustment: finalAdjustment,
    warnings: primaryAssessment.warnings,
    coverage: primaryAssessment.coverage,
    evidence: [
      ...primaryAssessment.evidence,
      `Regime consensus: ${dominantRegime[0]} (${dominantRegime[1]}/${available.length} timeframes)`,
    ],
  }

  return { contextAssessment, contextReasoning }
}
