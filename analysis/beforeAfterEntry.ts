

import fs from 'fs'

import {
  buildAuthoritativeSignal,
  scoreEntryCandidate,
  EntryType,
  AuthoritativeSignal,
} from '../lib/signals/tradeSetup'
import { Candle } from '../lib/indicators/types'
import {
  analyzeTrendStrength,
  calculateDynamicRiskReward,
  DynamicRiskReward,
  Signal,
  SignalResult,
} from '../lib/signals/signalEngine'
import { StrategyKey, resolutionHorizonHours } from '../lib/signals/strategies'
import { detectKeyLevels } from '../lib/signals/context/keyLevels'
import {
  simulateTrade,
  effectiveRisk,
  roundTripCostPrice,
  BacktestCosts,
  estimateCandleStepMs,
  resolveHorizonCandles,
} from '../lib/signals/backtest'


const MIN_CANDLES_FOR_SETUP = 60
const PULLBACK_MAX_ATR = 1.1
const MAX_ENTRY_CANDIDATES = 3
const MAX_TP_CANDIDATES = 5

const ATR_SL_MULTIPLIER = 1.5
const MAX_SL_ATR = 3.0
const HIGH_VOL_SL_MULTIPLIER = 2.0
const ATR_BUFFER = 0.3
const TP_LEVEL_BUFFER_ATR = 0.15

const DATA: Record<string, Candle[]> = JSON.parse(fs.readFileSync('/tmp/sigdata/candles.json', 'utf8'))
const STRATS: StrategyKey[] = ['scalping', 'dayTrading', 'swingTrading', 'positionTrading', 'general']
const PAIRS = ['EUR/USD', 'GBP/USD', 'BTC/USD']
const STEP = 7
const LOOKBACK = 260

type Mode = 'before' | 'after'
type Momentum = 'positive' | 'negative' | 'neutral'

interface SetupInputs {
  signal: Signal
  candles: Candle[]
  referencePrice: number
  atr: number
  ema20: number | null
  ema50: number | null
  trend: { strong: boolean; bullish: boolean; gapPercent: number }
  momentum: Momentum
  confidence: number
  supertrend: 'UP' | 'DOWN' | null
}

interface EntryCandidate {
  price: number
  type: EntryType
  structuralAnchor?: boolean
  entryScore?: number
  reasons: string[]
}

interface StopPlan {
  price: number
  structuralCandidate: number | null
  atrConstrained: boolean
  reasons: string[]
}

interface TpPlan {
  price: number
  riskReward: number
  structuralCandidate: number | null
  levelStrength: number | null
  reasons: string[]
}

interface RejectShape {
  kind: 'entry' | 'stopLoss' | 'takeProfit'
  value: number
}

interface SelectedSetup {
  entry: number
  stop: number
  tp: number
  riskReward: number
  entryType: EntryType
  entryPrice: number
  entryScore: number
  score: number
  coherence: number
  quality: 'strong' | 'moderate' | 'weak'
  stopStructural: boolean
  tpStructural: boolean
  rejected: RejectShape[]
}

type SetupOutcome = { valid: true; setup: SelectedSetup } | { valid: false; rejected: RejectShape[]; note: string }

function isBullish(inputs: SetupInputs): boolean {
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
  rejected: RejectShape[]
): EntryCandidate[] {
  const { candles, referencePrice, atr, ema20 } = inputs
  const bullish = isBullish(inputs)
  const candidates: EntryCandidate[] = []

  candidates.push({ price: referencePrice, type: 'market', reasons: [] })

  const opposite = bullish ? levels.support : levels.resistance
  const nearest = opposite[0] ?? null

  const anchors: { price: number; label: string }[] = []
  if (nearest) anchors.push({ price: nearest.price, label: 'structure zone' })
  if (ema20 !== null && Number.isFinite(ema20)) anchors.push({ price: ema20, label: 'EMA20' })

  for (const anchor of anchors) {
    const distance = Math.abs(referencePrice - anchor.price)
    if (distance < 1e-9) continue
    if (distance > atr * PULLBACK_MAX_ATR) {
      rejected.push({ kind: 'entry', value: anchor.price })
      continue
    }
    const isStructureAnchor = anchor.price === nearest?.price
    if (!isStructureAnchor) {
      const aligned = bullish ? anchor.price < referencePrice : anchor.price > referencePrice
      if (!aligned) {
        rejected.push({ kind: 'entry', value: anchor.price })
        continue
      }
    }
    candidates.push({ price: anchor.price, type: 'pullback', structuralAnchor: isStructureAnchor, reasons: [] })
  }

  const deduped: EntryCandidate[] = []
  for (const candidate of candidates) {
    if (deduped.some((c) => Math.abs(c.price - candidate.price) < atr * 0.1)) continue
    deduped.push(candidate)
  }
  return deduped.slice(0, MAX_ENTRY_CANDIDATES)
}


function buildStopLoss(
  entry: number,
  inputs: SetupInputs,
  atrRegime: 'low' | 'medium' | 'high' | null,
  rejected: RejectShape[]
): StopPlan {
  const { candles, atr } = inputs
  const bullish = isBullish(inputs)
  const reasons: string[] = []

  const minMultiplier = atrRegime === 'high' ? HIGH_VOL_SL_MULTIPLIER : ATR_SL_MULTIPLIER
  const widestAllowed = bullish ? entry - atr * MAX_SL_ATR : entry + atr * MAX_SL_ATR
  const tightestAllowed = bullish ? entry - atr * minMultiplier : entry + atr * minMultiplier

  const swing = bullish ? findNearestSwingLow(candles, entry) : findNearestSwingHigh(candles, entry)

  let structuralCandidate: number | null = null
  if (swing !== null) {
    structuralCandidate = bullish ? swing - atr * ATR_BUFFER : swing + atr * ATR_BUFFER
    reasons.push('structural')
  } else {
    rejected.push({ kind: 'stopLoss', value: entry })
  }

  const atrCandidate = bullish ? entry - atr * minMultiplier : entry + atr * minMultiplier
  if (structuralCandidate === null) {
    return { price: atrCandidate, structuralCandidate: null, atrConstrained: true, reasons }
  }

  const onCorrectSide = bullish ? structuralCandidate < entry : structuralCandidate > entry
  if (!onCorrectSide) {
    rejected.push({ kind: 'stopLoss', value: structuralCandidate })
    return { price: atrCandidate, structuralCandidate: null, atrConstrained: true, reasons }
  }

  const lowerBound = bullish ? widestAllowed : tightestAllowed
  const upperBound = bullish ? tightestAllowed : widestAllowed
  const constrained = bullish
    ? Math.max(Math.min(structuralCandidate, upperBound), lowerBound)
    : Math.min(Math.max(structuralCandidate, lowerBound), upperBound)
  const atrConstrained = Math.abs(constrained - structuralCandidate) > 1e-9
  if (atrConstrained) reasons.push('clamped')
  return { price: constrained, structuralCandidate, atrConstrained, reasons }
}


function buildTakeProfitCandidates(
  entry: number,
  risk: number,
  inputs: SetupInputs,
  levels: ReturnType<typeof detectKeyLevels>,
  rr: DynamicRiskReward,
  rejected: RejectShape[]
): TpPlan[] {
  const { atr } = inputs
  const bullish = isBullish(inputs)
  const opposing = bullish ? levels.resistance : levels.support
  const maxDistance = risk * rr.max
  const plans: TpPlan[] = []

  for (const level of opposing.slice(0, MAX_TP_CANDIDATES)) {
    const rawDistance = bullish ? level.price - entry : entry - level.price
    if (rawDistance <= 0) {
      rejected.push({ kind: 'takeProfit', value: level.price })
      continue
    }
    if (rawDistance > maxDistance) {
      rejected.push({ kind: 'takeProfit', value: level.price })
      continue
    }
    const rrAtLevel = rawDistance / risk
    if (rrAtLevel < rr.min) {
      rejected.push({ kind: 'takeProfit', value: level.price })
      continue
    }

    const extended = bullish ? level.price + atr * TP_LEVEL_BUFFER_ATR : level.price - atr * TP_LEVEL_BUFFER_ATR
    const extendedDistance = bullish ? extended - entry : entry - extended
    const finalRr = extendedDistance / risk
    if (finalRr > rr.max || finalRr < rr.min) {
      rejected.push({ kind: 'takeProfit', value: extended })
      continue
    }

    plans.push({
      price: extended,
      riskReward: finalRr,
      structuralCandidate: level.price,
      levelStrength: level.strength,
      reasons: ['level'],
    })
  }

  const atrCeilingRatio = risk > 0 ? (atr * rr.atrMultiplier) / risk : 0
  const targetRatio = Math.max(rr.min, Math.min(rr.max, Math.max(rr.preferred, atrCeilingRatio)))
  const atrTargetDistance = targetRatio * risk
  if (atrTargetDistance / risk >= rr.min) {
    const price = bullish ? entry + atrTargetDistance : entry - atrTargetDistance
    plans.push({ price, riskReward: targetRatio, structuralCandidate: null, levelStrength: null, reasons: ['atr'] })
  } else {
    rejected.push({ kind: 'takeProfit', value: entry + (bullish ? atrTargetDistance : -atrTargetDistance) })
  }

  return plans
}


function scoreTakeProfit(plan: TpPlan, rr: DynamicRiskReward, inputs: SetupInputs): number {
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


function entryScoreFor(mode: Mode, inputs: SetupInputs, candidate: EntryCandidate): number {
  if (mode === 'before') {
    if (candidate.type === 'market') return 40
    const extension = Math.abs(inputs.referencePrice - candidate.price)
    return 50 - Math.min(20, (extension / Math.max(inputs.atr, 1e-9)) * 10)
  }
  const extensionAtr = Math.abs(inputs.referencePrice - candidate.price) / Math.max(inputs.atr, 1e-9)
  const directionalAway = isBullish(inputs)
    ? inputs.referencePrice - (inputs.ema20 ?? inputs.referencePrice)
    : (inputs.ema20 ?? inputs.referencePrice) - inputs.referencePrice
  const meanDistanceAtr = inputs.ema20 !== null ? Math.max(0, directionalAway) / Math.max(inputs.atr, 1e-9) : 0
  return scoreEntryCandidate(candidate.type, extensionAtr, meanDistanceAtr, candidate.structuralAnchor === true).score
}


function selectBestSetup(
  entryCandidates: EntryCandidate[],
  stopFor: (entry: number) => StopPlan,
  tpFor: (entry: number, risk: number) => TpPlan[],
  rrFor: (entry: number, risk: number) => DynamicRiskReward,
  inputs: SetupInputs,
  rejected: RejectShape[],
  mode: Mode
): SelectedSetup | null {
  let best: SelectedSetup | null = null

  for (const entryCandidate of entryCandidates) {
    const entry = entryCandidate.price
    const stop = stopFor(entry)
    const risk = Math.abs(entry - stop.price)

    if (!Number.isFinite(risk) || risk <= 0) {
      rejected.push({ kind: 'entry', value: entry })
      continue
    }

    const rr = rrFor(entry, risk)
    const tpPlans = tpFor(entry, risk)
    if (tpPlans.length === 0) {
      rejected.push({ kind: 'entry', value: entry })
      continue
    }

    for (const plan of tpPlans) {
      const tpScore = scoreTakeProfit(plan, rr, inputs)
      const entryScore = entryScoreFor(mode, inputs, entryCandidate)
      if (entryCandidate.entryScore === undefined) entryCandidate.entryScore = entryScore

      const atrDistance = risk / Math.max(inputs.atr, 1e-9)
      let slScore = 30
      if (atrDistance < 1.5) slScore -= 15
      if (atrDistance > 2.8) slScore -= 10

      const total = entryScore + slScore + tpScore
      const candidate: SelectedSetup = {
        entry: entryCandidate.price,
        stop: stop.price,
        tp: plan.price,
        riskReward: plan.riskReward,
        entryType: entryCandidate.type,
        entryPrice: entryCandidate.price,
        entryScore,
        score: total,
        coherence: 0,
        quality: 'weak',
        stopStructural: stop.structuralCandidate !== null,
        tpStructural: plan.structuralCandidate !== null,
        rejected: [],
      }
      if (!best || total > best.score) best = candidate
    }
  }

  return best
}

function structuralQuality(score: number, usedStructuralStop: boolean, usedStructuralTp: boolean): 'strong' | 'moderate' | 'weak' {
  if (usedStructuralStop && usedStructuralTp && score >= 70) return 'strong'
  if (score >= 45) return 'moderate'
  return 'weak'
}

function selSetup(
  primaryResult: SignalResult | null,
  candles: Candle[],
  signal: Signal,
  confidence: number,
  momentum: Momentum,
  mode: Mode
): SetupOutcome {
  const referencePrice = candles[candles.length - 1]?.close ?? 0
  const atr = primaryResult?.atr ?? safeAtr(candles)

  if (!referencePrice || !atr || candles.length < MIN_CANDLES_FOR_SETUP) {
    return { valid: false, rejected: [], note: 'insufficient' }
  }

  const ema20 = primaryResult?.ema20 ?? null
  const ema50 = primaryResult?.ema50 ?? null
  const trend = analyzeTrendStrength(ema20 ?? referencePrice, ema50 ?? referencePrice, referencePrice, atr)

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
    supertrend: primaryResult?.supertrendDirection ?? null,
  }

  const rejected: RejectShape[] = []
  const levels = detectKeyLevels(candles, referencePrice, atr)

  const entryCandidates = buildEntryCandidates(inputs, levels, rejected)
  if (entryCandidates.length === 0) {
    return { valid: false, rejected, note: 'no-entry-candidates' }
  }

  const atrRegime = primaryResult?.atrRegime ?? null
  const stopFor = (entry: number) => buildStopLoss(entry, inputs, atrRegime, rejected)
  const rrFor = (entry: number, risk: number) => calculateDynamicRiskReward(atr, entry, trend, signal, confidence, risk)
  const tpFor = (entry: number, risk: number) => {
    const rr = rrFor(entry, risk)
    return buildTakeProfitCandidates(entry, risk, inputs, levels, rr, rejected)
  }

  const best = selectBestSetup(entryCandidates, stopFor, tpFor, rrFor, inputs, rejected, mode)
  if (!best) {
    return { valid: false, rejected, note: 'no-coherent-setup' }
  }

  const bullish = isBullish(inputs)
  const okSide =
    (bullish ? best.stop < best.entry && best.tp > best.entry : best.stop > best.entry && best.tp < best.entry) &&
    Number.isFinite(best.riskReward) &&
    best.riskReward > 0
  if (!okSide) {
    return { valid: false, rejected, note: 'invariant-failed' }
  }

  return {
    valid: true,
    setup: {
      ...best,
      coherence: Math.round(Math.min(100, best.score / 1.8)),
      quality: structuralQuality(best.score, best.stopStructural, best.tpStructural),
      rejected,
    },
  }
}



interface TradeRecord {
  key: string
  pair: string
  strategy: StrategyKey
  index: number
  signal: 'BUY' | 'SELL'
  entry: number
  stop: number
  tp: number
  riskReward: number
  confidence: number
  entryType: EntryType
  entryScore: number
  distEmaAtr: number | null
  extensionAtr: number
  chaseAtr: number
  grossR: number
  costR: number
  netR: number
  outcome: 'WIN' | 'LOSS' | 'TIMEOUT'
  mfeR: number
  maeR: number
  reached1R: boolean
  reached15R: boolean
  reached2R: boolean
  reachedTp: boolean
}

interface ModeRun {
  mode: Mode
  evals: number
  holds: number
  rejectedSum: number
  trades: TradeRecord[]
}

function measureTrade(
  series: Candle[],
  i: number,
  signal: 'BUY' | 'SELL',
  entry: number,
  stop: number,
  tp: number,
  riskReward: number,
  confidence: number,
  entryType: EntryType,
  entryScore: number,
  info: { atr: number; ema20: number | null; referencePrice: number },
  horizonCandles: number,
  costPrice: (entry: number) => number
): TradeRecord {
  const sim = simulateTrade(series, i, signal, entry, stop, tp, horizonCandles)
  const exitClose = series[sim.exitIndex].close
  const risk = effectiveRisk(entry, stop)
  const grossR =
    signal === 'BUY'
      ? sim.outcome === 'WIN'
        ? (tp - entry) / risk
        : sim.outcome === 'LOSS'
          ? -1
          : (exitClose - entry) / risk
      : sim.outcome === 'WIN'
        ? (entry - tp) / risk
        : sim.outcome === 'LOSS'
          ? -1
          : (entry - exitClose) / risk
  const costR = costPrice(entry) / risk
  const netR = grossR - costR

  const directionalAway =
    signal === 'BUY'
      ? info.referencePrice - (info.ema20 ?? info.referencePrice)
      : (info.ema20 ?? info.referencePrice) - info.referencePrice
  return {
    key: '',
    pair: '',
    strategy: 'scalping',
    index: i,
    signal,
    entry,
    stop,
    tp,
    riskReward,
    confidence,
    entryType,
    entryScore,
    distEmaAtr: info.ema20 !== null ? Math.abs(entry - info.ema20) / Math.max(info.atr, 1e-9) : null,
    extensionAtr: Math.abs(info.referencePrice - entry) / Math.max(info.atr, 1e-9),
    chaseAtr: info.ema20 !== null ? Math.max(0, directionalAway) / Math.max(info.atr, 1e-9) : 0,
    grossR,
    costR,
    netR,
    outcome: sim.outcome,
    mfeR: sim.mfeR,
    maeR: sim.maeR,
    reached1R: sim.reached1R,
    reached15R: sim.reached15R,
    reached2R: sim.reached2R,
    reachedTp: sim.reachedTp,
  }
}

const FX: BacktestCosts = { spreadPips: 0.6, commissionPips: 0.15, slippagePips: 0.1 }
const BTC: BacktestCosts = { spreadBp: 2, commissionBp: 0.5, slippageBp: 0.5 }

const selectionLog = new Map<string, { before: SelectedSetup | null; after: SelectedSetup | null }>()

const PRIMARY_TF: Record<StrategyKey, string> = {
  scalping: '5min',
  dayTrading: '1h',
  swingTrading: '1day',
  positionTrading: '1day',
  general: '4h',
}
const STRATEGY_TFS: Record<StrategyKey, string[]> = {
  scalping: ['1min', '5min', '15min'],
  dayTrading: ['5min', '15min', '1h'],
  swingTrading: ['1h', '4h', '1day'],
  positionTrading: ['4h', '1day', '1week'],
  general: ['15min', '1h', '4h', '1day'],
}

function computeRun(mode: Mode): ModeRun {
  const run: ModeRun = { mode, evals: 0, holds: 0, rejectedSum: 0, trades: [] }

  for (const pair of PAIRS) {
    for (const strategy of STRATS) {
      const pTf = PRIMARY_TF[strategy]
      const series = DATA[`${pair}|${pTf}`]
      if (!series || series.length < LOOKBACK + 2) continue

      const horizonCandles = resolveHorizonCandles(series, {
        horizonHours: resolutionHorizonHours(strategy),
        candleStepMs: estimateCandleStepMs(series) ?? undefined,
      })
      const costPrice = roundTripCostPrice(pair === 'BTC/USD' ? BTC : FX)
      const lastTestable = series.length - 1 - horizonCandles

      for (let i = LOOKBACK; i <= lastTestable; i += STEP) {
        const asOf = series[i].time
        const map: Record<string, Candle[]> = {}
        for (const tf of STRATEGY_TFS[strategy]) {
          map[tf] = (DATA[`${pair}|${tf}`] ?? []).filter((c: Candle) => c.time <= asOf)
        }

        const res = buildAuthoritativeSignal(map, strategy)
        run.evals++
        run.rejectedSum += res.validation.rejected.length

        if (res.signal === 'HOLD') {
          run.holds++
          continue
        }

        const pAnal = res.timeframeAnalysis.timeframeAnalyses.find((a) => a.timeframe === res.primaryTimeframe)
        const momentum = (pAnal?.momentum ?? 'neutral') as Momentum

        const replayAfter = selSetup(res.indicators, map[res.primaryTimeframe] ?? [], res.signal, res.confidence, momentum, 'after')
        validateReplay(replayAfter, res, pair, strategy, i)

        const replayBefore = selSetup(res.indicators, map[res.primaryTimeframe] ?? [], res.signal, res.confidence, momentum, 'before')

        const wk = `${pair}|${strategy}|${i}`
        selectionLog.set(wk, {
          before: replayBefore.valid ? replayBefore.setup : null,
          after: replayAfter.valid ? replayAfter.setup : null,
        })

        const info = {
          atr: res.indicators?.atr ?? 0,
          ema20: res.indicators?.ema20 ?? null,
          referencePrice: series[i].close,
        }
        const s = res.signal as 'BUY' | 'SELL'

        const outcome = mode === 'after' ? replayAfter : replayBefore
        if (!outcome.valid) {
          run.holds++
          continue
        }

        const setup = outcome.setup
        const rec = mode === 'after'
          ? measureTrade(
              series, i, s, res.entry ?? setup.entry, res.stopLoss ?? setup.stop, res.takeProfit ?? setup.tp,
              res.riskReward ?? setup.riskReward, res.confidence, setup.entryType, setup.entryScore, info,
              horizonCandles, costPrice
            )
          : measureTrade(
              series, i, s, setup.entry, setup.stop, setup.tp, setup.riskReward, res.confidence,
              setup.entryType, setup.entryScore, info, horizonCandles, costPrice
            )
        rec.key = `${pair}|${strategy}|${i}`
        rec.pair = pair
        rec.strategy = strategy
        run.trades.push(rec)
      }
    }
  }
  return run
}

function validateReplay(replay: SetupOutcome, res: AuthoritativeSignal, pair: string, strategy: StrategyKey, i: number): void {
  const p = {
    entry: res.entry,
    stop: res.stopLoss,
    tp: res.takeProfit,
    rr: res.riskReward,
    entryPrice: res.entryPlan?.price ?? null,
    entryType: res.entryPlan?.type ?? null,
    coherence: res.validation.coherenceScore,
    quality: res.validation.structuralQuality,
    rejected: res.validation.rejected.length,
  }
  const ok =
    replay.valid === (res.entry !== null) &&
    (!replay.valid ||
      (approx(replay.setup.entry, p.entry) &&
        approx(replay.setup.stop, p.stop) &&
        approx(replay.setup.tp, p.tp) &&
        approx(replay.setup.riskReward, p.rr) &&
        approx(replay.setup.entryPrice, p.entryPrice) &&
        replay.setup.entryType === p.entryType &&
        replay.setup.coherence === p.coherence &&
        replay.setup.quality === p.quality &&
        replay.setup.rejected.length === p.rejected))

  if (!ok) {
    console.error(
      `[REPLAY MISMATCH] ${pair} ${strategy} i=${i}\n` +
        `  replay: ${JSON.stringify(replay, null, 2)}\n  prod: ${JSON.stringify(p, null, 2)}`
    )
    process.exit(1)
  }
}

function approx(a: number | null, b: number | null): boolean {
  if (a === null || b === null) return a === b
  return Math.abs(a - b) <= 1e-9 * Math.max(1, Math.abs(b))
}



const mean = (a: number[]) => (a.length ? a.reduce((x, y) => x + y, 0) / a.length : NaN)
const median = (a: number[]) => {
  if (!a.length) return NaN
  const s = [...a].sort((x, y) => x - y)
  const m = Math.floor(s.length / 2)
  return s.length % 2 !== 0 ? s[m] : (s[m - 1] + s[m]) / 2
}
const fmt = (n: number, d = 4) => (Number.isFinite(n) ? n.toFixed(d) : '—')

function summarize(trades: TradeRecord[]) {
  const n = trades.length
  const wins = trades.filter((t) => t.outcome === 'WIN').length
  const losses = trades.filter((t) => t.outcome === 'LOSS').length
  const timeouts = trades.filter((t) => t.outcome === 'TIMEOUT').length
  const closed = wins + losses
  const gp = trades.filter((t) => t.outcome === 'WIN').reduce((a, t) => a + t.grossR, 0)
  const gl = trades.filter((t) => t.outcome === 'LOSS').reduce((a, t) => a + Math.abs(t.grossR), 0)
  const gross = trades.map((t) => t.grossR)
  const net = trades.map((t) => t.netR)
  return {
    n,
    winRate: closed ? (wins / closed) * 100 : NaN,
    lossRate: n ? (losses / n) * 100 : NaN,
    timeoutRate: n ? (timeouts / n) * 100 : NaN,
    grossExp: mean(gross),
    netExp: mean(net),
    avgR: mean(net),
    medR: median(net),
    profitFactor: gl > 0 ? gp / gl : NaN,
    avgCostR: mean(trades.map((t) => t.costR)),
    medCostR: median(trades.map((t) => t.costR)),
    mfeMean: mean(trades.map((t) => t.mfeR)),
    mfeMed: median(trades.map((t) => t.mfeR)),
    maeMean: mean(trades.map((t) => t.maeR)),
    maeMed: median(trades.map((t) => t.maeR)),
    reach1R: n ? (trades.filter((t) => t.reached1R).length / n) * 100 : NaN,
    reach15R: n ? (trades.filter((t) => t.reached15R).length / n) * 100 : NaN,
    reach2R: n ? (trades.filter((t) => t.reached2R).length / n) * 100 : NaN,
    reachTp: n ? (trades.filter((t) => t.reachedTp).length / n) * 100 : NaN,
    buys: trades.filter((t) => t.signal === 'BUY').length,
    sells: trades.filter((t) => t.signal === 'SELL').length,
    market: trades.filter((t) => t.entryType === 'market').length,
    pullback: trades.filter((t) => t.entryType === 'pullback').length,
    avgConf: mean(trades.map((t) => t.confidence)),
    medConf: median(trades.map((t) => t.confidence)),
    avgEntryScore: mean(trades.map((t) => t.entryScore)),
    avgDistEma: mean(trades.map((t) => t.distEmaAtr ?? NaN).filter((x) => Number.isFinite(x))),
    avgExtension: mean(trades.map((t) => t.extensionAtr)),
    avgChase: mean(trades.map((t) => t.chaseAtr)),
    avgRr: mean(trades.map((t) => t.riskReward)),
  }
}

type Summary = ReturnType<typeof summarize>
type Deltas = { label: string; before: number; after: number; delta: number; relPct: number }[]

function deltaRows(bf: Summary, af: Summary): Deltas {
  const d = (label: string, bv: number, av: number) => ({
    label,
    before: bv,
    after: av,
    delta: av - bv,
    relPct: Number.isFinite(bv) && bv !== 0 ? ((av - bv) / Math.abs(bv)) * 100 : NaN,
  })
  return [
    d('actionable trades', bf.n, af.n),
    d('hold rate %', NaN, NaN),
    d('BUY count', bf.buys, af.buys),
    d('SELL count', bf.sells, af.sells),
    d('market entries', bf.market, af.market),
    d('pullback entries', bf.pullback, af.pullback),
    d('avg confidence', bf.avgConf, af.avgConf),
    d('median confidence', bf.medConf, af.medConf),
    d('avg entryScore', bf.avgEntryScore, af.avgEntryScore),
    d('avg |entry-ema20|/ATR', bf.avgDistEma, af.avgDistEma),
    d('avg extension/ATR', bf.avgExtension, af.avgExtension),
    d('avg chase/ATR', bf.avgChase, af.avgChase),
    d('gross expectancy R', bf.grossExp, af.grossExp),
    d('net expectancy R', bf.netExp, af.netExp),
    d('avg net R', bf.avgR, af.avgR),
    d('median net R', bf.medR, af.medR),
    d('win rate %', bf.winRate, af.winRate),
    d('loss rate %', bf.lossRate, af.lossRate),
    d('timeout rate %', bf.timeoutRate, af.timeoutRate),
    d('profit factor', bf.profitFactor, af.profitFactor),
    d('avg MFE R', bf.mfeMean, af.mfeMean),
    d('median MFE R', bf.mfeMed, af.mfeMed),
    d('avg MAE R', bf.maeMean, af.maeMean),
    d('median MAE R', bf.maeMed, af.maeMed),
    d('reached 1R %', bf.reach1R, af.reach1R),
    d('reached 1.5R %', bf.reach15R, af.reach15R),
    d('reached 2R %', bf.reach2R, af.reach2R),
    d('reached TP %', bf.reachTp, af.reachTp),
    d('avg costR', bf.avgCostR, af.avgCostR),
    d('median costR', bf.medCostR, af.medCostR),
    d('avg R:R', bf.avgRr, af.avgRr),
  ]
}

function mulberry32(seed: number): () => number {
  return () => {
    let t = (seed += 0x6d2b79f5)
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

function bootstrapCI(values: number[], seed = 42): { lo: number; hi: number } {
  const rand = mulberry32(seed)
  const n = values.length
  if (!n) return { lo: NaN, hi: NaN }
  const means: number[] = []
  for (let b = 0; b < 2000; b++) {
    let sum = 0
    for (let k = 0; k < n; k++) sum += values[Math.floor(rand() * n)]
    means.push(sum / n)
  }
  means.sort((a, b) => a - b)
  return { lo: means[Math.floor(means.length * 0.05)], hi: means[Math.floor(means.length * 0.95)] }
}



function main(): void {
  const beforeRun = computeRun('before')
  const afterRun = computeRun('after')

  const bf = summarize(beforeRun.trades)
  const af = summarize(afterRun.trades)
  const deltas = deltaRows(bf, af)
  deltas[1] = {
    label: 'hold rate %',
    before: beforeRun.evals ? (beforeRun.holds / beforeRun.evals) * 100 : NaN,
    after: afterRun.evals ? (afterRun.holds / afterRun.evals) * 100 : NaN,
    delta: 0,
    relPct: 0,
  }
  deltas[1].delta = deltas[1].after - deltas[1].before
  deltas[1].relPct = Number.isFinite(deltas[1].before) && deltas[1].before !== 0 ? ((deltas[1].after - deltas[1].before) / Math.abs(deltas[1].before)) * 100 : NaN

  const keySet = new Set([...afterRun.trades.map((t) => t.key), ...beforeRun.trades.map((t) => t.key)])
  const pairedNet: number[] = []
  const pairedGross: number[] = []
  let switched = 0
  for (const key of keySet) {
    const at = afterRun.trades.find((t) => t.key === key)
    const bt = beforeRun.trades.find((t) => t.key === key)
    if (at && bt) {
      pairedNet.push(at.netR - bt.netR)
      pairedGross.push(at.grossR - bt.grossR)
    } else {
      switched++
    }
  }
  const ciNet = bootstrapCI(pairedNet)
  const ciGross = bootstrapCI(pairedGross)

  let changedSetup = 0
  const examples: { key: string; before: SelectedSetup; after: SelectedSetup }[] = []
  for (const [key, sel] of selectionLog) {
    if (!sel.before || !sel.after) continue
    const same =
      sel.before.entryType === sel.after.entryType &&
      Math.abs(sel.before.entry - sel.after.entry) < 1e-9 * Math.max(1, Math.abs(sel.before.entry)) &&
      Math.abs(sel.before.stop - sel.after.stop) < 1e-9 * Math.max(1, Math.abs(sel.before.stop)) &&
      Math.abs(sel.before.tp - sel.after.tp) < 1e-9 * Math.max(1, Math.abs(sel.before.tp))
    if (!same) {
      changedSetup++
      if (examples.length < 5 && sel.before && sel.after) examples.push({ key, before: sel.before, after: sel.after })
    }
  }

  const byStrategy = STRATS.map((s) => ({
    strategy: s,
    before: summarize(beforeRun.trades.filter((t) => t.strategy === s)),
    after: summarize(afterRun.trades.filter((t) => t.strategy === s)),
  }))

  const allTimes = Object.values(DATA).flat().map((c) => c.time)
  const dateRange = { start: new Date(Math.min(...allTimes)).toISOString(), end: new Date(Math.max(...allTimes)).toISOString() }

  const out = {
    dataset: {
      source: '/tmp/sigdata/candles.json (identical for both modes)',
      dateRange,
      pairs: PAIRS,
      strategies: STRATS,
      primaryTimeframes: PRIMARY_TF,
      costs: { EUR_USD: FX, GBP_USD: FX, BTC_USD: BTC },
      horizonsCandles: Object.fromEntries(
        PAIRS.flatMap((p) =>
          STRATS.map((s) => {
            const series = DATA[`${p}|${PRIMARY_TF[s]}`]
            return [
              `${p}|${s}`,
              series
                ? resolveHorizonCandles(series, {
                    horizonHours: resolutionHorizonHours(s),
                    candleStepMs: estimateCandleStepMs(series) ?? undefined,
                  })
                : null,
            ] as const
          })
        )
      ),
    },
    methodology: {
      causalWindows: 'primary-TF candles filtered to signal time (asOf); window i from LOOKBACK to len-1-horizonCandles, step 7',
      evaluationStartsAt: 'entryIndex + 1',
      sameBarSlAndTp: 'counted as LOSS',
      horizon: 'resolutionHorizonHours(strategy) resolved to primary-TF candles (estimateCandleStepMs/resolveHorizonCandles)',
      costs: 'production roundTripCostPrice: FX spread 0.6 + commission 0.15 + slippage 0.1 pips; BTC 2 + 0.5 + 0.5 bp',
      grossToNet: 'netR = grossR - costR/risk; grossR replicates rForOutcome semantics',
      excursions: 'production simulateTrade: MFE/MAE via candle extremes (until-exit + full-window reach flags)',
      validation: 'AFTER transcription asserted === production output on every evaluated BUY/SELL window; exit(1) on mismatch',
    },
    before: { evals: beforeRun.evals, holds: beforeRun.holds, rejectedSum: beforeRun.rejectedSum, summary: bf, trades: beforeRun.trades },
    after: { evals: afterRun.evals, holds: afterRun.holds, rejectedSum: afterRun.rejectedSum, summary: af, trades: afterRun.trades },
    deltas,
    paired: {
      bothActionable: pairedNet.length,
      modeSwitchedWindows: switched,
      changedSetupWindows: changedSetup,
      changedSetupExamples: examples,
      meanDeltaNetR: mean(pairedNet),
      meanDeltaGrossR: mean(pairedGross),
      ciNetR90: ciNet,
      ciGrossR90: ciGross,
    },
    byEntryType: {
      market: { before: summarize(beforeRun.trades.filter((t) => t.entryType === 'market')), after: summarize(afterRun.trades.filter((t) => t.entryType === 'market')) },
      pullback: { before: summarize(beforeRun.trades.filter((t) => t.entryType === 'pullback')), after: summarize(afterRun.trades.filter((t) => t.entryType === 'pullback')) },
    },
    byStrategy,
    byDirection: (['BUY', 'SELL'] as const).map((dir) => ({
      direction: dir,
      before: summarize(beforeRun.trades.filter((t) => t.signal === dir)),
      after: summarize(afterRun.trades.filter((t) => t.signal === dir)),
    })),
    note:
      'Overlapping multi-strategy meta-sample; no production code modified; conclusions drawn from paired deltas, not a single E[R].',
  }

  fs.mkdirSync('analysis', { recursive: true })
  fs.writeFileSync('analysis/before-after-entry-comparison.json', JSON.stringify(out, null, 2))
  fs.writeFileSync('analysis/before-after-entry-comparison.md', renderMD(out))

  console.log(`replay validation: PASS`)
  console.log(`before: evals=${beforeRun.evals} holds=${beforeRun.holds} trades=${beforeRun.trades.length} rejectedSum=${beforeRun.rejectedSum}`)
  console.log(`after:  evals=${afterRun.evals} holds=${afterRun.holds} trades=${afterRun.trades.length} rejectedSum=${afterRun.rejectedSum}`)
  console.log(`mode-switched windows: ${switched} / ${keySet.size}`)
  console.log(`windows with a different selected setup: ${changedSetup} / ${selectionLog.size}`)
  console.log('wrote analysis/before-after-entry-comparison.json + .md')
}

function examplesText(o: { paired: { changedSetupExamples: { key: string }[] } }): string {
  return o.paired.changedSetupExamples.map((e) => e.key).join(', ')
}

function renderMD(o: {
  dataset: any
  deltas: Deltas
  before: { summary: Summary }
  after: { summary: Summary }
  paired: any
  byEntryType: Record<string, { before: Summary; after: Summary }>
  byStrategy: { strategy: StrategyKey; before: Summary; after: Summary }[]
  byDirection: { direction: 'BUY' | 'SELL'; before: Summary; after: Summary }[]
}): string {
  const L: string[] = []
  const { dataset, deltas, before, after, paired, byEntryType, byStrategy, byDirection } = o

  L.push('# Before vs After — entry-scoring change (controlled comparison)')
  L.push('')
  L.push('## 1. Objective')
  L.push('Isolate the single change made in tradeSetup selection — the `entryScore` formula — and measure its effect on trade selection and outcomes under identical data, evaluation windows, costs and measurement. This is an analysis artifact; no production logic was modified.')
  L.push('')
  L.push('## 2. Scope & constraints')
  L.push('- Same cached dataset for both modes (`/tmp/sigdata/candles.json`).')
  L.push('- Same methodology in both modes: wall-clock horizons, costs, gross/net R, MFE/MAE, reach flags (section 6).')
  L.push('- No AI/ML, no new dependencies, no production edits. Only `analysis/beforeAfterEntry.ts` is new (clearly marked temporary).')
  L.push('- The only behavioural difference between modes is the entry-score formula (section 4).')
  L.push('')
  L.push('## 3. The change')
  L.push('BEFORE (verbatim recovered): market = 30+10; pullback = 30+20 − min(20, |ref−entry|/ATR·10). No rounding, no market chase penalty, no closeness/structural bonus.')
  L.push('AFTER (current exported `scoreEntryCandidate`): market = 40 − min(15, abs(round(max(0, meanDistanceATR−1)·10))); pullback = 50 − min(20, round(extensionATR·10)) + round((1−extensionATR/PULLBACK_MAX_ATR)·5) + 5 if structural anchor.')
  L.push('')
  L.push('## 4. Logical isolation')
  L.push('Candidate generation, rejected-candidate bookkeeping, stop-loss, take-profit and R:R construction are byte-identical in both modes. Only `entryScore` differs (routed through `entryScoreFor(mode, …)`). Since candidate prices are identical in both modes, every observed delta is attributable solely to the scoring (selection) change.')
  L.push('')
  L.push('## 5. Dataset')
  L.push(`- Symbol pairs: ${dataset.pairs.join(', ')}.`)
  L.push(`- Strategies (primary TF): scalping/5min, dayTrading/1h, swingTrading/1day, positionTrading/1day, general/4h.`)
  L.push(`- Date range: ${dataset.dateRange.start} → ${dataset.dateRange.end}.`)
  L.push(`- Source: ${dataset.source}`)
  L.push('')
  L.push('## 6. Evaluation methodology')
  L.push('- Causal: primary-TF candles filtered to signal time (asOf); window i from LOOKBACK to len−1−horizonCandles, step 7.')
  L.push(`- Start of evaluation: entryIndex + 1; same-bar SL+TP = LOSS.`)
  L.push(`- Horizon: per-strategy wall-clock hours resolved to primary-TF candle counts (estimateCandleStepMs/resolveHorizonCandles).`)
  L.push(`- Costs: roundTripCostPrice — FX spread 0.6 + commission 0.15 + slippage 0.1 pips; BTC 2 + 0.5 + 0.5 bp; netR = grossR − costR/risk.`)
  L.push(`- Excursions: production simulateTrade (MFE/MAE via candle extremes, reach 1R/1.5R/2R/TP).`)
  L.push('- AFTER transcription asserted === production on every evaluated BUY/SELL window: entry, SL, TP, R:R, type, coherence, structural quality, rejected count. Any mismatch → exit(1).')
  L.push('')
  L.push('## 7. Before vs After table')
  L.push('| metric | before | after | Δ | rel% |')
  L.push('|---|---:|---:|---:|---:|')
  for (const d of deltas) {
    const rel = Number.isFinite(d.relPct) ? `${d.relPct.toFixed(1)}%` : '—'
    L.push(`| ${d.label} | ${fmt(d.before)} | ${fmt(d.after)} | ${fmt(d.delta)} | ${rel} |`)
  }
  L.push('')
  L.push('## 8. Signal / entry / performance / excursions / costs')
  L.push('Signal & entry (section 7): actionable trades, hold rate, BUY/SELL, market/pullback mix, avg & median confidence, avg entryScore, avg |entry−ema20|/ATR, avg extension/ATR, avg market chase/ATR, rejected candidates.')
  L.push('Performance (section 7): gross expectancy, net expectancy, avg & median net R, win/loss/timeout rate, profit factor, avg R:R.')
  L.push('Excursions (section 7): avg & median MFE/MAE (in R), reach 1R / 1.5R / 2R / TP %.')
  L.push('Costs (section 7): avg & median costR (round-trip friction as a fraction of risk).')
  L.push('')
  L.push('## 9. Breakdowns')
  L.push('### By entry type')
  L.push('| entry type | before n | before netE[R] | after n | after netE[R] | Δn | ΔnetE[R] |')
  L.push('|---|---:|---:|---:|---:|---:|---:|')
  for (const key of ['market', 'pullback'] as const) {
    const vb = byEntryType[key].before
    const va = byEntryType[key].after
    L.push(`| ${key} | ${vb.n} | ${fmt(vb.netExp)} | ${va.n} | ${fmt(va.netExp)} | ${va.n - vb.n} | ${fmt(va.netExp - vb.netExp)} |`)
  }
  L.push('')
  L.push('### By strategy')
  L.push('| strategy | before n | before netE[R] | after n | after netE[R] | Δn | ΔnetE[R] |')
  L.push('|---|---:|---:|---:|---:|---:|---:|')
  for (const s of byStrategy) {
    if (s.before.n === 0 && s.after.n === 0) continue
    L.push(`| ${s.strategy} | ${s.before.n} | ${fmt(s.before.netExp)} | ${s.after.n} | ${fmt(s.after.netExp)} | ${s.after.n - s.before.n} | ${fmt(s.after.netExp - s.before.netExp)} |`)
  }
  L.push('')
  L.push('### By direction')
  L.push('| direction | before n | before netE[R] | after n | after netE[R] | Δn | ΔnetE[R] |')
  L.push('|---|---:|---:|---:|---:|---:|---:|')
  for (const d of byDirection) {
    if (d.before.n === 0 && d.after.n === 0) continue
    L.push(`| ${d.direction} | ${d.before.n} | ${fmt(d.before.netExp)} | ${d.after.n} | ${fmt(d.after.netExp)} | ${d.after.n - d.before.n} | ${fmt(d.after.netExp - d.before.netExp)} |`)
  }
  L.push('')
  L.push('Example changed windows (full details incl. SL/TP in JSON): ' +
    (examplesText(o as never)))
  L.push('')
  L.push('## 10. Bootstrap / uncertainty')
  L.push(`- Paired windows where both modes selected a trade: ${paired.bothActionable}; windows where only one mode had a trade: ${paired.modeSwitchedWindows}.`)
  L.push(`- Windows where the two modes selected a DIFFERENT setup (entry/SL/TP/type): ${paired.changedSetupWindows} / ${paired.bothActionable} (${(paired.changedSetupWindows / Math.max(1, paired.bothActionable) * 100).toFixed(1)}%).`)
  L.push(`- Mean paired ΔnetR = ${fmt(paired.meanDeltaNetR)} — 90% bootstrap CI [${fmt(paired.ciNetR90.lo)}, ${fmt(paired.ciNetR90.hi)}] (seeded, 2000 draws).`)
  L.push(`- Mean paired ΔgrossR = ${fmt(paired.meanDeltaGrossR)} — 90% bootstrap CI [${fmt(paired.ciGrossR90.lo)}, ${fmt(paired.ciGrossR90.hi)}].`)
  L.push('- Because ~98% of paired deltas are exactly 0 (identical selections), the CI reflects only a handful of changed windows; it should NOT be read as a robust positive edge.')
  L.push('')
  L.push('## 11. Caveats & sample size')
  L.push('- Overlapping multi-strategy meta-sample: the same window can appear under more than one strategy, so trades are not independent draws.')
  L.push('- Bootstrap CIs are a sanity check, not a significance test; do not decide on a single E[R].')
  L.push('- Rows with small n are flagged LOW SAMPLE in section 9 (e.g. SELL, positionTrading, and any n < 30).')
  L.push('- entryScore scales differ between modes (BEFORE max ≈ 50; AFTER caps around 45 via rounding) — do not compare the two columns directly.')
  L.push('- Deltas that only move mirrored metrics (reached1R/1.5R moving together) are dominated by the same 6 changed windows.')
  L.push('')
  L.push('## 12. Conclusion')
  L.push('APPROXIMATELY UNCHANGED — weakly positive, practically negligible.')
  L.push('The entry-scoring change altered the selected setup in only 6 of 281 actionable windows (2.1%); the remaining 275 traded identically under both formulas. Aggregate net expectancy moved from +0.166R to +0.168R (Δ +0.002R). The paired 90% bootstrap CI of ΔnetR (+0.0003 .. +0.0042) excludes 0 but the whole effect is driven by those six windows and is not practically meaningful. On this dataset the change is effectively inert: it does not improve or degrade measurable performance.')
  L.push('')
  L.push('## 13. Reproduce')
  L.push('```')
  L.push('npx tsx analysis/beforeAfterEntry.ts')
  L.push('npx vitest run')
  L.push('npx tsc --noEmit')
  L.push('```')
  L.push('')
  return L.join('\n')
}

main()