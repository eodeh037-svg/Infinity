import { Candle, generateSignal } from './signalEngine'
import { BacktestConfig } from './backtest'

export const DIAG_HORIZONS = [6, 12, 24, 48]
export const RR_STOPS = [1, 1.25, 1.5, 2]
export const RR_TARGETS = [1, 1.25, 1.5, 1.75, 2]

export type Regime = 'up' | 'down' | 'flat'

export type HorizonAgg = {
  horizon: number
  correct: number
  wrong: number
  flat: number
  directionalAccuracy: number | null
  slFirst: number
  tpFirst: number
  timeout: number
  reach: Record<string, number>
}

export type GroupAgg = {
  n: number
  avgConfidence: number | null
  avgMfeR: number | null
  medMfeR: number | null
  avgMaeR: number | null
  medMaeR: number | null
  engineWinRate24: number | null
  engineExpectancyR24: number | null
  perHorizon: HorizonAgg[]
}

export type ConfidenceBucket = {
  bucket: string
  min: number | null
  max: number | null
  agg: GroupAgg
}

export type RegimeBucket = {
  regime: Regime
  agg: GroupAgg
}

export type DiagnosticReport = {
  configName: string
  candlesUsed: number
  lookback: number
  stride: number
  horizons: number[]
  signals: number
  holds: number
  nullLevels: number
  badSideSl: number
  badSideSlBuy: number
  badSideSlSell: number
  all: GroupAgg
  buy: GroupAgg
  sell: GroupAgg
  confidenceBuckets: ConfidenceBucket[]
  regimeBuckets: RegimeBucket[]
  atrRegimeBuckets: { regime: string; agg: GroupAgg }[]
}

export type TradeFeatures = {
  signal: 'BUY' | 'SELL'
  entry: number
  sl: number
  tp: number
  risk: number
  badSideSl: boolean
  confidence: number
  regime: Regime
  atrRegime: string | null
  fwdHighs: number[]
  fwdLows: number[]
  fwdCloses: number[]
}

function median(values: number[]): number {
  if (values.length === 0) return NaN
  const s = [...values].sort((a, b) => a - b)
  const mid = Math.floor(s.length / 2)
  return s.length % 2 === 1 ? s[mid] : (s[mid - 1] + s[mid]) / 2
}

function round(value: number): number {
  return Math.round(value * 10000) / 10000
}

function classifyRegime(closes: number[], index: number): Regime {
  if (index < 50) return 'flat'
  const window = closes.slice(index - 50, index)
  const n = window.length
  const mean = window.reduce((a, b) => a + b, 0) / n
  let num = 0
  let denom = 0
  const mid = (n - 1) / 2
  for (let k = 0; k < n; k++) {
    num += (k - mid) * (window[k] - mean)
    denom += (k - mid) * (k - mid)
  }
  if (denom === 0) return 'flat'
  const slopePerBar = num / denom
  const std =
    Math.sqrt(window.reduce((a, b) => a + (b - mean) * (b - mean), 0) / n) || 1
  const normSlope = Math.abs(slopePerBar) / (std + 1e-12)
  if (normSlope < 0.0015) return 'flat'
  return slopePerBar > 0 ? 'up' : 'down'
}

export type FeatureSet = {
  features: TradeFeatures[]
  holds: number
  nullLevels: number
  badSideSl: number
  badSideSlBuy: number
  badSideSlSell: number
}

export function collectFeatures(
  candles: Candle[],
  horizonList: number[],
  stride: number
): FeatureSet {
  const lookback = 250
  const maxH = Math.max(...horizonList)
  const features: TradeFeatures[] = []
  let holds = 0
  let nullLevels = 0
  let badSideSl = 0
  let badSideSlBuy = 0
  let badSideSlSell = 0

  for (let i = lookback; i <= candles.length - 1 - maxH; i += stride) {
    const window = candles.slice(0, i + 1)
    const result = generateSignal(window, 0)
    if (result.signal === 'HOLD') {
      holds++
      continue
    }
    if (result.stopLoss === null || result.takeProfit === null) {
      nullLevels++
      continue
    }
    const risk = Math.abs(result.entry - result.stopLoss)
    if (!Number.isFinite(risk) || risk <= 0) {
      nullLevels++
      continue
    }
    const badSide = result.signal === 'BUY' ? result.stopLoss >= result.entry : result.stopLoss <= result.entry
    if (badSide) {
      badSideSl++
      if (result.signal === 'BUY') badSideSlBuy++
      else badSideSlSell++
    }

    const fwdHighs: number[] = []
    const fwdLows: number[] = []
    const fwdCloses: number[] = []
    for (let j = i + 1; j <= candles.length - 1 && j <= i + maxH; j++) {
      fwdHighs.push(candles[j].high)
      fwdLows.push(candles[j].low)
      fwdCloses.push(candles[j].close)
    }

    const closes = candles.map(c => c.close)
    features.push({
      signal: result.signal,
      entry: result.entry,
      sl: result.stopLoss,
      tp: result.takeProfit,
      risk,
      badSideSl: badSide,
      confidence: result.confidence,
      regime: classifyRegime(closes, i),
      atrRegime: result.atrRegime,
      fwdHighs,
      fwdLows,
      fwdCloses,
    })
  }

  return { features, holds, nullLevels, badSideSl, badSideSlBuy, badSideSlSell }
}

function aggregate(features: TradeFeatures[], horizonList: number[]): GroupAgg {
  const n = features.length
  const perHorizon: HorizonAgg[] = horizonList.map(horizon => {
    let correct = 0
    let wrong = 0
    let flat = 0
    let slFirst = 0
    let tpFirst = 0
    let timeout = 0
    const reach: Record<string, number> = { '0.5': 0, '1.0': 0, '1.5': 0, '2.0': 0 }

    for (const f of features) {
      const idxH = horizon - 1
      if (idxH >= f.fwdCloses.length) continue
      const closeH = f.fwdCloses[idxH]
      if (closeH === f.entry) {
        flat++
      } else if (f.signal === 'BUY' ? closeH > f.entry : closeH < f.entry) {
        correct++
      } else {
        wrong++
      }

      let maxFav = 0
      let maxAdv = 0
      let hitSl = false
      let hitTp = false
      for (let k = 0; k <= idxH && k < f.fwdCloses.length; k++) {
        if (f.signal === 'BUY') {
          maxFav = Math.max(maxFav, (f.fwdHighs[k] - f.entry) / f.risk)
          maxAdv = Math.max(maxAdv, (f.entry - f.fwdLows[k]) / f.risk)
        } else {
          maxFav = Math.max(maxFav, (f.entry - f.fwdLows[k]) / f.risk)
          maxAdv = Math.max(maxAdv, (f.fwdHighs[k] - f.entry) / f.risk)
        }
        const slHit = f.signal === 'BUY' ? f.fwdLows[k] <= f.sl : f.fwdHighs[k] >= f.sl
        const tpHit = f.signal === 'BUY' ? f.fwdHighs[k] >= f.tp : f.fwdLows[k] <= f.tp
        if (slHit && tpHit) {
          hitSl = true
          break
        }
        if (tpHit) {
          hitTp = true
          break
        }
        if (slHit) {
          hitSl = true
          break
        }
      }
      if (hitSl) slFirst++
      else if (hitTp) tpFirst++
      else timeout++

      for (const rKey of Object.keys(reach)) {
        const r = Number(rKey)
        if (maxFav >= r) reach[rKey]++
      }
    }

    const closed = correct + wrong
    return {
      horizon,
      correct,
      wrong,
      flat,
      directionalAccuracy: closed > 0 ? round(correct / closed) : null,
      slFirst,
      tpFirst,
      timeout,
      reach: Object.fromEntries(Object.entries(reach).map(([k, v]) => [k, n > 0 ? round(v / n) : 0])),
    }
  })

  const mfeAll: number[] = []
  const maeAll: number[] = []
  for (const f of features) {
    let maxFav = 0
    let maxAdv = 0
    for (let k = 0; k < f.fwdCloses.length; k++) {
      if (f.signal === 'BUY') {
        maxFav = Math.max(maxFav, (f.fwdHighs[k] - f.entry) / f.risk)
        maxAdv = Math.max(maxAdv, (f.entry - f.fwdLows[k]) / f.risk)
      } else {
        maxFav = Math.max(maxFav, (f.entry - f.fwdLows[k]) / f.risk)
        maxAdv = Math.max(maxAdv, (f.fwdHighs[k] - f.entry) / f.risk)
      }
    }
    mfeAll.push(maxFav)
    maeAll.push(maxAdv)
  }

  const agg = {
    n,
    avgConfidence:
      n > 0 ? round(features.reduce((a, f) => a + f.confidence, 0) / n) : null,
    avgMfeR: mfeAll.length > 0 ? round(mfeAll.reduce((a, b) => a + b, 0) / mfeAll.length) : null,
    medMfeR: mfeAll.length > 0 ? round(median(mfeAll)) : null,
    avgMaeR: maeAll.length > 0 ? round(maeAll.reduce((a, b) => a + b, 0) / maeAll.length) : null,
    medMaeR: maeAll.length > 0 ? round(median(maeAll)) : null,
    engineWinRate24: null as number | null,
    engineExpectancyR24: null as number | null,
    perHorizon,
  }

  const h24 = perHorizon.find(h => h.horizon === 24)
  if (h24) {
    agg.engineWinRate24 = h24.tpFirst + h24.slFirst > 0 ? round(h24.tpFirst / (h24.tpFirst + h24.slFirst)) : null
  }
  return agg
}

function engineExpectancy(features: TradeFeatures[], horizonList: number[]): number | null {
  const h = 24
  const idxH = h - 1
  const rsum: number[] = []
  for (const f of features) {
    if (idxH >= f.fwdCloses.length) continue
    let hitSl = false
    let hitTp = false
    for (let k = 0; k <= idxH; k++) {
      const slHit = f.signal === 'BUY' ? f.fwdLows[k] <= f.sl : f.fwdHighs[k] >= f.sl
      const tpHit = f.signal === 'BUY' ? f.fwdHighs[k] >= f.tp : f.fwdLows[k] <= f.tp
      if (slHit && tpHit) { hitSl = true; break }
      if (tpHit) { hitTp = true; break }
      if (slHit) { hitSl = true; break }
    }
    let r: number
    if (hitTp) {
      r = f.signal === 'BUY' ? (f.tp - f.entry) / f.risk : (f.entry - f.tp) / f.risk
    } else if (hitSl) {
      r = -1
    } else {
      const exitClose = f.fwdCloses[idxH]
      r = f.signal === 'BUY' ? (exitClose - f.entry) / f.risk : (f.entry - exitClose) / f.risk
    }
    rsum.push(r)
  }
  return rsum.length > 0 ? round(rsum.reduce((a, b) => a + b, 0) / rsum.length) : null
}

function assembleReport(
  featureSet: FeatureSet,
  config: BacktestConfig,
  horizonList: number[],
  stride: number
): DiagnosticReport {
  const { features, holds, nullLevels, badSideSl, badSideSlBuy, badSideSlSell } = featureSet

  const all = aggregate(features, horizonList)
  all.engineExpectancyR24 = engineExpectancy(features, horizonList)
  const buy = aggregate(features.filter(f => f.signal === 'BUY'), horizonList)
  buy.engineExpectancyR24 = engineExpectancy(features.filter(f => f.signal === 'BUY'), horizonList)
  const sell = aggregate(features.filter(f => f.signal === 'SELL'), horizonList)
  sell.engineExpectancyR24 = engineExpectancy(features.filter(f => f.signal === 'SELL'), horizonList)

  const bucketRanges: { bucket: string; min: number | null; max: number | null }[] = [
    { bucket: '<70', min: null, max: 70 },
    { bucket: '70-79', min: 70, max: 80 },
    { bucket: '80-89', min: 80, max: 90 },
    { bucket: '90-99', min: 90, max: 100 },
  ]
  const confidenceBuckets: ConfidenceBucket[] = bucketRanges.map(br => {
    const subset = features.filter(
      f => (br.min === null || f.confidence >= br.min) && (br.max === null || f.confidence < br.max)
    )
    const agg = aggregate(subset, horizonList)
    agg.engineExpectancyR24 = engineExpectancy(subset, horizonList)
    return { ...br, agg }
  })

  const regimeBuckets: RegimeBucket[] = (['up', 'down', 'flat'] as Regime[]).map(reg => {
    const subset = features.filter(f => f.regime === reg)
    const agg = aggregate(subset, horizonList)
    agg.engineExpectancyR24 = engineExpectancy(subset, horizonList)
    return { regime: reg, agg }
  })

  const atrRegimeBuckets: { regime: string; agg: GroupAgg }[] = (
    ['low', 'medium', 'high'] as const
  ).map(reg => {
    const subset = features.filter(f => f.atrRegime === reg)
    const agg = aggregate(subset, horizonList)
    agg.engineExpectancyR24 = engineExpectancy(subset, horizonList)
    return { regime: reg, agg }
  })

  return {
    configName: config.name,
    candlesUsed: 0,
    lookback: 250,
    stride,
    horizons: horizonList,
    signals: features.length,
    holds,
    nullLevels,
    badSideSl,
    badSideSlBuy,
    badSideSlSell,
    all,
    buy,
    sell,
    confidenceBuckets,
    regimeBuckets,
    atrRegimeBuckets,
  }
}

export function runDiagnostic(
  candles: Candle[],
  config: BacktestConfig,
  horizonList: number[] = DIAG_HORIZONS,
  stride: number = 1
): DiagnosticReport {
  const featureSet = collectFeatures(candles, horizonList, stride)
  const report = assembleReport(featureSet, config, horizonList, stride)
  report.candlesUsed = candles.length
  return report
}

export function runDiagnosticFromFeatures(
  featureSet: FeatureSet,
  candlesUsed: number,
  config: BacktestConfig,
  horizonList: number[] = DIAG_HORIZONS,
  stride: number = 1
): DiagnosticReport {
  const report = assembleReport(featureSet, config, horizonList, stride)
  report.candlesUsed = candlesUsed
  return report
}

export function runRRGrid(
  features: TradeFeatures[],
  horizon: number = 24,
  stops: number[] = RR_STOPS,
  targets: number[] = RR_TARGETS
): { w: number; k: number; n: number; slFirst: number; tpFirst: number; timeout: number; winRate: number | null; expectancyR: number | null }[] {
  const results: { w: number; k: number; n: number; slFirst: number; tpFirst: number; timeout: number; winRate: number | null; expectancyR: number | null }[] = []
  const idxH = horizon - 1

  for (const w of stops) {
    for (const k of targets) {
      let slFirst = 0
      let tpFirst = 0
      let timeout = 0
      const rs: number[] = []

      for (const f of features) {
        if (idxH >= f.fwdCloses.length) continue
        const sl = f.signal === 'BUY' ? f.entry - w * f.risk : f.entry + w * f.risk
        const tp = f.signal === 'BUY' ? f.entry + k * f.risk : f.entry - k * f.risk

        let hitSl = false
        let hitTp = false
        for (let j = 0; j <= idxH; j++) {
          const slHit = f.signal === 'BUY' ? f.fwdLows[j] <= sl : f.fwdHighs[j] >= sl
          const tpHit = f.signal === 'BUY' ? f.fwdHighs[j] >= tp : f.fwdLows[j] <= tp
          if (slHit && tpHit) { hitSl = true; break }
          if (tpHit) { hitTp = true; break }
          if (slHit) { hitSl = true; break }
        }

        let r: number
        if (hitTp) {
          r = k
          tpFirst++
        } else if (hitSl) {
          r = -1
          slFirst++
        } else {
          const exitClose = f.fwdCloses[idxH]
          r = f.signal === 'BUY' ? (exitClose - f.entry) / f.risk : (f.entry - exitClose) / f.risk
          timeout++
        }
        rs.push(r)
      }

      const closed = tpFirst + slFirst
      results.push({
        w,
        k,
        n: slFirst + tpFirst + timeout,
        slFirst,
        tpFirst,
        timeout,
        winRate: closed > 0 ? round(tpFirst / closed) : null,
        expectancyR: rs.length > 0 ? round(rs.reduce((a, b) => a + b, 0) / rs.length) : null,
      })
    }
  }

  return results
}