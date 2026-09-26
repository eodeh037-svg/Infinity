import { Candle } from '../indicators/types'
import { Timeframe } from '../server/providers/types'
import {
  generateSignal,
  Signal,
  SignalResult,
  calculateDynamicRiskReward,
  analyzeTrendStrength,
  TrendStrength,
  DynamicRiskReward,
  ATR_SL_MULTIPLIER,
  MAX_SL_ATR,
  HIGH_VOL_SL_MULTIPLIER,
  ATR_BUFFER,
  TP_LEVEL_BUFFER_ATR,
} from './signalEngine'
import { analyzeMultiTimeframe, MultiTimeframeResult } from './multiTimeframe'
import { StrategyKey, resolvePrimaryTimeframe } from './strategies'
import { detectKeyLevels } from './context/keyLevels'

export type EntryType = 'market' | 'pullback'

export interface EntryPlan {
  price: number
  type: EntryType
  zoneLow: number | null
  zoneHigh: number | null
  structuralAnchor?: boolean
  entryScore?: number
  reasons: string[]
}

export interface StopLossPlan {
  price: number
  structuralCandidate: number | null
  atrConstrained: boolean
  reasons: string[]
}

export interface TakeProfitPlan {
  price: number
  riskReward: number
  structuralCandidate: number | null
  levelStrength: number | null
  reasons: string[]
}

export interface RejectedCandidate {
  kind: 'entry' | 'stopLoss' | 'takeProfit'
  value: number
  reason: string
}

export interface TradeSetupValidation {
  valid: boolean
  structuralQuality: 'strong' | 'moderate' | 'weak'
  coherenceScore: number
  rejected: RejectedCandidate[]
  notes: string[]
}

export interface AuthoritativeSignal {
  signal: Signal
  confidence: number
  entry: number | null
  stopLoss: number | null
  takeProfit: number | null
  riskReward: number | null
  reasons: string[]

  strategy: StrategyKey
  primaryTimeframe: Timeframe
  primaryTimeframeUsedFallback: boolean

  entryPlan: EntryPlan | null
  stopLossPlan: StopLossPlan | null
  takeProfitPlan: TakeProfitPlan | null
  validation: TradeSetupValidation

  timeframeAnalysis: MultiTimeframeResult
  indicators: SignalResult | null
}

const ENTRY_ZONE_ATR = 0.35
const MIN_CANDLES_FOR_SETUP = 60
const PULLBACK_MAX_ATR = 1.1
const MAX_ENTRY_CANDIDATES = 3
const MAX_TP_CANDIDATES = 5

interface SetupInputs {
  signal: Signal
  candles: Candle[]
  referencePrice: number
  atr: number
  ema20: number | null
  ema50: number | null
  trend: TrendStrength
  momentum: 'positive' | 'negative' | 'neutral'
  confidence: number
  supertrend: 'UP' | 'DOWN' | null
}

function isBullishSetup(inputs: SetupInputs): boolean {
  return inputs.signal === 'BUY'
}

function safeAtr(candles: Candle[]): number {
  if (candles.length < 2) return 0
  let sum = 0
  const start = Math.max(1, candles.length - 14)
  let count = 0
  for (let i = start; i < candles.length; i++) {
    sum += candles[i].high - candles[i].low
    count++
  }
  return count > 0 ? sum / count : 0
}

function findNearestSwingLow(candles: Candle[], reference: number): number | null {
  const start = Math.max(2, candles.length - 60)
  const lastIndex = candles.length - 1
  for (let i = lastIndex - 3; i >= start; i--) {
    const low = candles[i].low
    if (
      low < candles[i - 1].low &&
      low < candles[i - 2].low &&
      low < candles[i + 1].low &&
      low < candles[i + 2].low &&
      low < reference
    ) {
      return low
    }
  }
  return null
}

function findNearestSwingHigh(candles: Candle[], reference: number): number | null {
  const start = Math.max(2, candles.length - 60)
  const lastIndex = candles.length - 1
  for (let i = lastIndex - 3; i >= start; i--) {
    const high = candles[i].high
    if (
      high > candles[i - 1].high &&
      high > candles[i - 2].high &&
      high > candles[i + 1].high &&
      high > candles[i + 2].high &&
      high > reference
    ) {
      return high
    }
  }
  return null
}

function buildEntryCandidates(
  inputs: SetupInputs,
  levels: ReturnType<typeof detectKeyLevels>,
  rejected: RejectedCandidate[]
): EntryPlan[] {
  const { signal, candles, referencePrice, atr, ema20 } = inputs
  const bullish = isBullishSetup(inputs)
  const candidates: EntryPlan[] = []

  candidates.push({
    price: referencePrice,
    type: 'market',
    zoneLow: null,
    zoneHigh: null,
    reasons: [`Market entry at current ${bullish ? 'ask' : 'bid'} (${referencePrice.toFixed(6)})`],
  })

  const oppositeLevels = bullish ? levels.support : levels.resistance
  const nearest = oppositeLevels[0] ?? null

  const emaAnchor = bullish ? ema20 : ema20
  const anchors: { price: number; label: string }[] = []

  if (nearest) {
    anchors.push({ price: nearest.price, label: `${bullish ? 'support' : 'resistance'} zone` })
  }
  if (emaAnchor !== null && Number.isFinite(emaAnchor)) {
    anchors.push({ price: emaAnchor, label: 'EMA20 retest' })
  }

  for (const anchor of anchors) {
    const distance = Math.abs(referencePrice - anchor.price)
    if (distance < 1e-9) continue

    if (distance > atr * PULLBACK_MAX_ATR) {
      rejected.push({
        kind: 'entry',
        value: anchor.price,
        reason: `Pullback to ${anchor.label} is ${(distance / atr).toFixed(2)} ATR away — beyond pullback tolerance`,
      })
      continue
    }

    const isStructureAnchor = anchor.price === nearest?.price
    if (!isStructureAnchor) {
      const structureAligned = bullish
        ? anchor.price < referencePrice
        : anchor.price > referencePrice
      if (!structureAligned) {
        rejected.push({
          kind: 'entry',
          value: anchor.price,
          reason: `${anchor.label} is not on the pullback side of price`,
        })
        continue
      }
    }

    candidates.push({
      price: anchor.price,
      type: 'pullback',
      zoneLow: bullish ? anchor.price - atr * ENTRY_ZONE_ATR : anchor.price,
      zoneHigh: bullish ? anchor.price + atr * ENTRY_ZONE_ATR : anchor.price + atr * ENTRY_ZONE_ATR,
      structuralAnchor: isStructureAnchor,
      reasons: [`Pullback entry at ${anchor.label} (${anchor.price.toFixed(6)})`],
    })
  }

  const deduped: EntryPlan[] = []
  for (const candidate of candidates) {
    const duplicate = deduped.find(
      c => Math.abs(c.price - candidate.price) < atr * 0.1
    )
    if (duplicate) continue
    deduped.push(candidate)
  }

  if (candles.length === 0) {
    rejected.push({ kind: 'entry', value: referencePrice, reason: 'No candle data' })
  }

  return deduped.slice(0, MAX_ENTRY_CANDIDATES)
}

function buildStopLoss(
  entry: number,
  inputs: SetupInputs,
  atrRegime: 'low' | 'medium' | 'high' | null,
  rejected: RejectedCandidate[]
): StopLossPlan {
  const { signal, candles, atr } = inputs
  const bullish = isBullishSetup(inputs)
  const reasons: string[] = []

  const minMultiplier = atrRegime === 'high' ? HIGH_VOL_SL_MULTIPLIER : ATR_SL_MULTIPLIER
  const widestAllowed = bullish ? entry - atr * MAX_SL_ATR : entry + atr * MAX_SL_ATR
  const tightestAllowed = bullish ? entry - atr * minMultiplier : entry + atr * minMultiplier

  const swing = bullish
    ? findNearestSwingLow(candles, entry)
    : findNearestSwingHigh(candles, entry)

  let structuralCandidate: number | null = null
  if (swing !== null) {
    structuralCandidate = bullish
      ? swing - atr * ATR_BUFFER
      : swing + atr * ATR_BUFFER
    reasons.push(
      `Structural invalidation beyond ${bullish ? 'swing low' : 'swing high'} ${swing.toFixed(6)} with ${ATR_BUFFER} ATR buffer`
    )
  } else {
    rejected.push({
      kind: 'stopLoss',
      value: entry,
      reason: 'No confirmed swing point on the invalidation side — using ATR constraint only',
    })
  }

  const atrCandidate = bullish ? entry - atr * minMultiplier : entry + atr * minMultiplier

  if (structuralCandidate === null) {
    reasons.push(`Stop constrained to ${minMultiplier.toFixed(1)} ATR volatility distance`)
    return {
      price: atrCandidate,
      structuralCandidate: null,
      atrConstrained: true,
      reasons,
    }
  }

  const onCorrectSide = bullish ? structuralCandidate < entry : structuralCandidate > entry
  if (!onCorrectSide) {
    rejected.push({
      kind: 'stopLoss',
      value: structuralCandidate,
      reason: 'Structural candidate sits on the wrong side of entry',
    })
    return {
      price: atrCandidate,
      structuralCandidate: null,
      atrConstrained: true,
      reasons,
    }
  }

  const lowerBound = bullish ? widestAllowed : tightestAllowed
  const upperBound = bullish ? tightestAllowed : widestAllowed
  const constrained = bullish
    ? Math.max(Math.min(structuralCandidate, upperBound), lowerBound)
    : Math.min(Math.max(structuralCandidate, lowerBound), upperBound)

  const atrConstrained = Math.abs(constrained - structuralCandidate) > 1e-9
  if (atrConstrained) {
    reasons.push(
      `Clamped into ${minMultiplier.toFixed(1)}–${MAX_SL_ATR.toFixed(1)} ATR volatility band`
    )
  }

  return {
    price: constrained,
    structuralCandidate,
    atrConstrained,
    reasons,
  }
}

function buildTakeProfitCandidates(
  entry: number,
  risk: number,
  inputs: SetupInputs,
  levels: ReturnType<typeof detectKeyLevels>,
  rr: DynamicRiskReward,
  rejected: RejectedCandidate[]
): TakeProfitPlan[] {
  const { signal, atr, momentum } = inputs
  const bullish = isBullishSetup(inputs)
  const opposing = bullish ? levels.resistance : levels.support
  const maxDistance = risk * rr.max

  const plans: TakeProfitPlan[] = []

  for (const level of opposing.slice(0, MAX_TP_CANDIDATES)) {
    const rawDistance = bullish ? level.price - entry : entry - level.price
    if (rawDistance <= 0) {
      rejected.push({
        kind: 'takeProfit',
        value: level.price,
        reason: 'Target is not beyond entry',
      })
      continue
    }

    if (rawDistance > maxDistance) {
      rejected.push({
        kind: 'takeProfit',
        value: level.price,
        reason: `Beyond max R:R of ${rr.max.toFixed(2)} (would need ${(rawDistance / risk).toFixed(2)}R)`,
      })
      continue
    }

    const rrAtLevel = rawDistance / risk
    if (rrAtLevel < rr.min) {
      rejected.push({
        kind: 'takeProfit',
        value: level.price,
        reason: `Below min R:R of ${rr.min.toFixed(2)} (only ${rrAtLevel.toFixed(2)}R)`,
      })
      continue
    }

    const extended = bullish ? level.price + atr * TP_LEVEL_BUFFER_ATR : level.price - atr * TP_LEVEL_BUFFER_ATR
    const extendedDistance = bullish ? extended - entry : entry - extended
    const finalRr = extendedDistance / risk

    if (finalRr > rr.max) {
      rejected.push({
        kind: 'takeProfit',
        value: extended,
        reason: `Buffered target exceeds max R:R of ${rr.max.toFixed(2)}`,
      })
      continue
    }
    if (finalRr < rr.min) {
      rejected.push({
        kind: 'takeProfit',
        value: extended,
        reason: `Buffered target below min R:R of ${rr.min.toFixed(2)}`,
      })
      continue
    }

    const reasons = [`${bullish ? 'Resistance' : 'Support'} zone at ${level.price.toFixed(6)} (strength ${(level.strength * 100).toFixed(0)}%)`]
    if (momentum === (bullish ? 'positive' : 'negative')) {
      reasons.push('Momentum supports extending to this target')
    }

    plans.push({
      price: extended,
      riskReward: finalRr,
      structuralCandidate: level.price,
      levelStrength: level.strength,
      reasons,
    })
  }

  const atrCeilingRatio = risk > 0 ? (atr * rr.atrMultiplier) / risk : 0
  const targetRatio = Math.max(rr.min, Math.min(rr.max, Math.max(rr.preferred, atrCeilingRatio)))
  const atrTargetDistance = targetRatio * risk
  if (atrTargetDistance / risk >= rr.min) {
    const price = bullish ? entry + atrTargetDistance : entry - atrTargetDistance
    plans.push({
      price,
      riskReward: targetRatio,
      structuralCandidate: null,
      levelStrength: null,
      reasons: ['ATR extension target — no qualifying structure level in range'],
    })
  } else {
    rejected.push({
      kind: 'takeProfit',
      value: entry + (bullish ? atrTargetDistance : -atrTargetDistance),
      reason: `ATR extension below min R:R of ${rr.min.toFixed(2)}`,
    })
  }

  return plans
}

function scoreTakeProfit(
  plan: TakeProfitPlan,
  rr: DynamicRiskReward,
  inputs: SetupInputs
): number {
  let score = 0
  if (plan.structuralCandidate !== null) {
    score += 40
    score += (plan.levelStrength ?? 0) * 30
  } else {
    score += 15
  }

  const center = (rr.preferred - rr.min) / Math.max(rr.max - rr.min, 0.001)
  const normalized = (plan.riskReward - rr.min) / Math.max(rr.max - rr.min, 0.001)
  score += Math.max(0, 30 - Math.abs(normalized - center) * 30)

  const { momentum } = inputs
  if (momentum === (inputs.signal === 'BUY' ? 'positive' : 'negative')) score += 10

  return score
}

export type EntryScore = {
  score: number
  extensionPenalty: number
  meanPenalty: number
  closenessBonus: number
  structuralBonus: number
}

export function scoreEntryCandidate(
  type: EntryType,
  extensionAtr: number,
  meanDistanceAtr: number,
  isStructuralAnchor: boolean
): EntryScore {
  let score = 30
  let extensionPenalty = 0
  let meanPenalty = 0
  let closenessBonus = 0
  let structuralBonus = 0

  if (type === 'market') {
    score += 10
    const stretch = Math.max(0, meanDistanceAtr - 1.0)
    meanPenalty = Math.min(15, Math.round(stretch * 10))
    score -= meanPenalty
  } else {
    score += 20
    extensionPenalty = Math.min(20, Math.max(0, Math.round(extensionAtr * 10)))
    score -= extensionPenalty
    const closeness = Math.max(0, 1 - extensionAtr / PULLBACK_MAX_ATR)
    closenessBonus = Math.round(closeness * 5)
    score += closenessBonus
    if (isStructuralAnchor) {
      structuralBonus = 5
      score += 5
    }
  }

  return { score: Math.max(0, score), extensionPenalty, meanPenalty, closenessBonus, structuralBonus }
}

function selectBestSetup(
  entryCandidates: EntryPlan[],
  stopFor: (entry: number) => StopLossPlan,
  tpFor: (entry: number, risk: number) => TakeProfitPlan[],
  rrFor: (entry: number, risk: number) => DynamicRiskReward,
  inputs: SetupInputs,
  rejected: RejectedCandidate[]
): { entry: EntryPlan; stop: StopLossPlan; takeProfit: TakeProfitPlan; score: number; notes: string[] } | null {
  const notes: string[] = []
  let best: { entry: EntryPlan; stop: StopLossPlan; takeProfit: TakeProfitPlan; score: number } | null = null

  for (const entryCandidate of entryCandidates) {
    const entry = entryCandidate.price
    const stop = stopFor(entry)
    const risk = Math.abs(entry - stop.price)

    if (!Number.isFinite(risk) || risk <= 0) {
      rejected.push({ kind: 'entry', value: entry, reason: 'Stop loss produced zero risk distance' })
      continue
    }

    const rr = rrFor(entry, risk)
    const tpPlans = tpFor(entry, risk)

    if (tpPlans.length === 0) {
      rejected.push({ kind: 'entry', value: entry, reason: 'No valid take-profit target for this entry' })
      continue
    }

    for (const plan of tpPlans) {
      const tpScore = scoreTakeProfit(plan, rr, inputs)

      const extensionAtr = Math.abs(inputs.referencePrice - entry) / Math.max(inputs.atr, 1e-9)
      const directionalAway = isBullishSetup(inputs)
        ? inputs.referencePrice - (inputs.ema20 ?? inputs.referencePrice)
        : (inputs.ema20 ?? inputs.referencePrice) - inputs.referencePrice
      const meanDistanceAtr =
        inputs.ema20 !== null ? Math.max(0, directionalAway) / Math.max(inputs.atr, 1e-9) : 0
      const scored = scoreEntryCandidate(
        entryCandidate.type,
        extensionAtr,
        meanDistanceAtr,
        entryCandidate.structuralAnchor === true
      )
      const entryScore = scored.score
      if (entryCandidate.entryScore === undefined) entryCandidate.entryScore = entryScore

      const atrDistance = risk / Math.max(inputs.atr, 1e-9)
      let slScore = 30
      if (atrDistance < 1.5) slScore -= 15
      if (atrDistance > 2.8) slScore -= 10

      const total = entryScore + slScore + tpScore
      if (!best || total > best.score) {
        best = { entry: entryCandidate, stop, takeProfit: plan, score: total }
      }
    }
  }

  if (!best) {
    notes.push('No coherent entry/SL/TP combination satisfied the structural and R:R constraints')
    return null
  }

  if (best) {
    const ranking = entryCandidates
      .map(c => `${c.type}@${c.price.toFixed(6)} → ${c.entryScore ?? 0}/60`)
      .join(' · ')
    notes.push(`Entry candidates scored: ${ranking}`)
    if (best.entry.type === 'pullback') {
      notes.push('Pullback entry preferred over chasing price at market')
    } else {
      notes.push('Market entry selected — no in-range pullback anchor on the entry side')
    }
  }

  return best ? { ...best, notes } : null
}

function structuralQuality(score: number, usedStructuralStop: boolean, usedStructuralTp: boolean): 'strong' | 'moderate' | 'weak' {
  if (usedStructuralStop && usedStructuralTp && score >= 70) return 'strong'
  if (score >= 45) return 'moderate'
  return 'weak'
}

function buildTradeSetup(
  primaryResult: SignalResult,
  candles: Candle[],
  signal: Signal,
  confidence: number,
  momentum: 'positive' | 'negative' | 'neutral'
): {
  entry: number | null
  stopLoss: number | null
  takeProfit: number | null
  riskReward: number | null
  entryPlan: EntryPlan | null
  stopLossPlan: StopLossPlan | null
  takeProfitPlan: TakeProfitPlan | null
  validation: TradeSetupValidation
  reasons: string[]
} {
  const emptyValidation: TradeSetupValidation = {
    valid: false,
    structuralQuality: 'weak',
    coherenceScore: 0,
    rejected: [],
    notes: [],
  }

  const referencePrice = candles[candles.length - 1]?.close ?? 0
  const atr = primaryResult.atr ?? safeAtr(candles)

  if (!referencePrice || !atr || candles.length < MIN_CANDLES_FOR_SETUP) {
    return {
      entry: null, stopLoss: null, takeProfit: null, riskReward: null,
      entryPlan: null, stopLossPlan: null, takeProfitPlan: null,
      validation: { ...emptyValidation, notes: ['Insufficient data to construct a trade setup'] },
      reasons: ['Insufficient data to construct a trade setup'],
    }
  }

  const ema20 = primaryResult.ema20
  const ema50 = primaryResult.ema50
  const trend = analyzeTrendStrength(
    ema20 ?? referencePrice,
    ema50 ?? referencePrice,
    referencePrice,
    atr
  )

  const inputs: SetupInputs = {
    signal,
    candles,
    referencePrice,
    atr,
    ema20,
    ema50,
    trend,
    momentum,
    confidence,
    supertrend: primaryResult.supertrendDirection,
  }

  const rejected: RejectedCandidate[] = []
  const levels = detectKeyLevels(candles, referencePrice, atr)

  const entryCandidates = buildEntryCandidates(inputs, levels, rejected)
  const atrRegime = primaryResult.atrRegime

  const stopFor = (entry: number) => buildStopLoss(entry, inputs, atrRegime, rejected)

  const rrFor = (entry: number, risk: number) =>
    calculateDynamicRiskReward(atr, entry, trend, signal, confidence, risk)

  const tpFor = (entry: number, risk: number) => {
    const rr = rrFor(entry, risk)
    return buildTakeProfitCandidates(entry, risk, inputs, levels, rr, rejected)
  }

  const best = selectBestSetup(entryCandidates, stopFor, tpFor, rrFor, inputs, rejected)

  if (!best) {
    return {
      entry: null, stopLoss: null, takeProfit: null, riskReward: null,
      entryPlan: null, stopLossPlan: null, takeProfitPlan: null,
      validation: {
        valid: false,
        structuralQuality: 'weak',
        coherenceScore: 0,
        rejected,
        notes: ['No valid trade setup found'],
      },
      reasons: ['No structurally valid trade setup for the current conditions'],
    }
  }

  const validInvariants = signal === 'BUY'
    ? best.stop.price < best.entry.price && best.takeProfit.price > best.entry.price
    : best.stop.price > best.entry.price && best.takeProfit.price < best.entry.price

  if (!validInvariants) {
    return {
      entry: null, stopLoss: null, takeProfit: null, riskReward: null,
      entryPlan: null, stopLossPlan: null, takeProfitPlan: null,
      validation: {
        valid: false,
        structuralQuality: 'weak',
        coherenceScore: 0,
        rejected,
        notes: ['Setup failed side-invariant validation'],
      },
      reasons: ['Setup failed structural validation'],
    }
  }

  const quality = structuralQuality(
    best.score,
    best.stop.structuralCandidate !== null,
    best.takeProfit.structuralCandidate !== null
  )

  const setupReasons = [
    ...best.entry.reasons,
    ...best.stop.reasons,
    ...best.takeProfit.reasons,
    `Selected setup: ${best.entry.type} entry, R:R 1:${best.takeProfit.riskReward.toFixed(2)}`,
    ...best.notes,
  ]

  return {
    entry: best.entry.price,
    stopLoss: best.stop.price,
    takeProfit: best.takeProfit.price,
    riskReward: best.takeProfit.riskReward,
    entryPlan: best.entry,
    stopLossPlan: best.stop,
    takeProfitPlan: best.takeProfit,
    validation: {
      valid: true,
      structuralQuality: quality,
      coherenceScore: Math.round(Math.min(100, best.score / 1.8)),
      rejected,
      notes: best.notes,
    },
    reasons: setupReasons,
  }
}

export function buildAuthoritativeSignal(
  candleData: Record<string, Candle[]>,
  strategyKey: StrategyKey,
  accountSize: number = 0
): AuthoritativeSignal {
  const timeframeAnalysis = analyzeMultiTimeframe(
    candleData as Record<Timeframe, Candle[]>,
    strategyKey,
    accountSize
  )

  const { timeframe: primaryTimeframe, usedFallback } = resolvePrimaryTimeframe(
    strategyKey,
    candleData as Record<Timeframe, Candle[] | undefined>
  )

  const primaryCandles = candleData[primaryTimeframe] ?? []
  const signal = timeframeAnalysis.overallSignal

  const primaryAnalysis = timeframeAnalysis.timeframeAnalyses.find(
    a => a.timeframe === primaryTimeframe
  ) ?? null

  const confidence = timeframeAnalysis.overallScore

  const baseReasons = timeframeAnalysis.reasoning

  if (signal === 'HOLD') {
    return {
      signal: 'HOLD',
      confidence,
      entry: null,
      stopLoss: null,
      takeProfit: null,
      riskReward: null,
      reasons: baseReasons,
      strategy: strategyKey,
      primaryTimeframe,
      primaryTimeframeUsedFallback: usedFallback,
      entryPlan: null,
      stopLossPlan: null,
      takeProfitPlan: null,
      validation: {
        valid: false,
        structuralQuality: 'weak',
        coherenceScore: 0,
        rejected: [],
        notes: ['HOLD — no actionable trade setup'],
      },
      timeframeAnalysis,
      indicators: null,
    }
  }

  if (primaryCandles.length === 0) {
    return {
      signal: 'HOLD',
      confidence: 0,
      entry: null,
      stopLoss: null,
      takeProfit: null,
      riskReward: null,
      reasons: [...baseReasons, 'Primary timeframe has no candle data — cannot construct trade levels'],
      strategy: strategyKey,
      primaryTimeframe,
      primaryTimeframeUsedFallback: usedFallback,
      entryPlan: null,
      stopLossPlan: null,
      takeProfitPlan: null,
      validation: {
        valid: false,
        structuralQuality: 'weak',
        coherenceScore: 0,
        rejected: [],
        notes: ['Primary timeframe unavailable'],
      },
      timeframeAnalysis,
      indicators: null,
    }
  }

  const indicators = generateSignal(primaryCandles, accountSize)
  const setup = buildTradeSetup(indicators, primaryCandles, signal, confidence, primaryAnalysis?.momentum ?? 'neutral')

  const setupActionable = setup.entry !== null && setup.stopLoss !== null && setup.takeProfit !== null

  const TAG = '[AuthoritativeSignal]'
  console.log(
    `${TAG} ${signal} @ ${primaryTimeframe} (fallback=${usedFallback}) ` +
      `entry=${setup.entry?.toFixed(6) ?? 'n/a'} sl=${setup.stopLoss?.toFixed(6) ?? 'n/a'} ` +
      `tp=${setup.takeProfit?.toFixed(6) ?? 'n/a'} rr=${setup.riskReward?.toFixed(2) ?? 'n/a'} ` +
      `quality=${setup.validation.structuralQuality} coherent=${setup.validation.coherenceScore}`
  )
  if (setup.entryPlan) {
    console.log(`${TAG}   entry: ${setup.entryPlan.reasons.join('; ')}`)
  }
  if (setup.stopLossPlan) {
    console.log(`${TAG}   sl: ${setup.stopLossPlan.reasons.join('; ')}`)
  }
  if (setup.takeProfitPlan) {
    console.log(
      `${TAG}   tp: ${setup.takeProfitPlan.reasons.join('; ')} (rr ${setup.takeProfitPlan.riskReward.toFixed(2)})`
    )
  }
  for (const rejection of setup.validation.rejected) {
    console.log(`${TAG}   rejected ${rejection.kind} ${rejection.value.toFixed(6)} — ${rejection.reason}`)
  }

  return {
    signal: setupActionable ? signal : 'HOLD',
    confidence,
    entry: setupActionable ? setup.entry : null,
    stopLoss: setupActionable ? setup.stopLoss : null,
    takeProfit: setupActionable ? setup.takeProfit : null,
    riskReward: setupActionable ? setup.riskReward : null,
    reasons: setupActionable ? [...baseReasons, ...setup.reasons] : [...baseReasons, ...setup.reasons],
    strategy: strategyKey,
    primaryTimeframe,
    primaryTimeframeUsedFallback: usedFallback,
    entryPlan: setup.entryPlan,
    stopLossPlan: setup.stopLossPlan,
    takeProfitPlan: setup.takeProfitPlan,
    validation: setup.validation,
    timeframeAnalysis,
    indicators,
  }
}
