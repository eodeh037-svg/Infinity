import { Candle } from '../../indicators/types'
import { PriceLevel, KeyLevelsResult, PriceLocation, BreakoutState } from './types'

const SWING_LOOKBACK = 60
const MIN_TOUCHES = 2
const ZONE_CLUSTER_RATIO = 0.0015
const NEAR_LEVEL_THRESHOLD = 0.002
const BREAKOUT_THRESHOLD = 0.001
const BREAKOUT_LOOKBACK = 5

export function detectKeyLevels(
  candles: Candle[],
  entry: number,
  atr: number | null
): KeyLevelsResult {
  if (candles.length < 20) {
    return emptyResult('Insufficient candle data for key level detection')
  }

  const lastIndex = candles.length - 1
  const lookback = Math.min(SWING_LOOKBACK, lastIndex - 2)
  const start = Math.max(2, lastIndex - lookback)

  const swingHighs = findSwingHighs(candles, start, lastIndex)
  const swingLows = findSwingLows(candles, start, lastIndex)

  if (swingHighs.length === 0 && swingLows.length === 0) {
    return {
      support: [],
      resistance: [],
      nearestSupport: null,
      nearestResistance: null,
      priceLocation: 'far_from_key_levels',
      breakoutState: 'no_breakout',
      coverage: 'partial',
      evidence: ['No meaningful swing points detected'],
    }
  }

  const clusterThreshold = atr !== null && entry > 0
    ? atr * 2
    : entry * ZONE_CLUSTER_RATIO

  const resistanceZones = clusterLevels(swingHighs, clusterThreshold, lastIndex, candles)
    .filter(level => level.price > entry)

  const supportZones = clusterLevels(swingLows, clusterThreshold, lastIndex, candles)
    .filter(level => level.price < entry)

  const nearestSupport = supportZones.length > 0 ? supportZones[0].price : null
  const nearestResistance = resistanceZones.length > 0 ? resistanceZones[0].price : null

  const priceLocation = classifyPriceLocation(
    entry, nearestSupport, nearestResistance, NEAR_LEVEL_THRESHOLD
  )

  const breakoutState = detectBreakout(
    candles, lastIndex, resistanceZones, supportZones, entry
  )

  const evidence: string[] = []
  if (supportZones.length > 0) {
    evidence.push(`${supportZones.length} support zone(s) detected`)
  }
  if (resistanceZones.length > 0) {
    evidence.push(`${resistanceZones.length} resistance zone(s) detected`)
  }
  if (priceLocation !== 'far_from_key_levels') {
    evidence.push(`Price location: ${formatPriceLocation(priceLocation)}`)
  }
  if (breakoutState !== 'no_breakout') {
    evidence.push(`Breakout state: ${breakoutState}`)
  }

  return {
    support: supportZones,
    resistance: resistanceZones,
    nearestSupport,
    nearestResistance,
    priceLocation,
    breakoutState,
    coverage: 'full',
    evidence,
  }
}

function findSwingHighs(
  candles: Candle[],
  start: number,
  end: number
): number[] {
  const points: number[] = []
  for (let i = start; i < end - 2; i++) {
    const high = candles[i].high
    if (
      high > candles[i - 1].high &&
      high > candles[i - 2].high &&
      high > candles[i + 1].high &&
      high > candles[i + 2].high
    ) {
      points.push(high)
    }
  }
  return points
}

function findSwingLows(
  candles: Candle[],
  start: number,
  end: number
): number[] {
  const points: number[] = []
  for (let i = start; i < end - 2; i++) {
    const low = candles[i].low
    if (
      low < candles[i - 1].low &&
      low < candles[i - 2].low &&
      low < candles[i + 1].low &&
      low < candles[i + 2].low
    ) {
      points.push(low)
    }
  }
  return points
}

function clusterLevels(
  rawPrices: number[],
  clusterThreshold: number,
  lastIndex: number,
  candles: Candle[]
): PriceLevel[] {
  if (rawPrices.length === 0) return []

  const sorted = [...rawPrices].sort((a, b) => a - b)
  const clusters: number[][] = []

  let currentCluster = [sorted[0]]
  for (let i = 1; i < sorted.length; i++) {
    if (sorted[i] - sorted[i - 1] <= clusterThreshold) {
      currentCluster.push(sorted[i])
    } else {
      clusters.push(currentCluster)
      currentCluster = [sorted[i]]
    }
  }
  clusters.push(currentCluster)

  return clusters
    .filter(cluster => cluster.length >= MIN_TOUCHES)
    .map(cluster => {
      const price = cluster.reduce((a, b) => a + b, 0) / cluster.length
      const touches = cluster.length
      const zoneWidth = clusterThreshold
      const zone: [number, number] = [price - zoneWidth / 2, price + zoneWidth / 2]

      const recencyScore = calculateRecencyScore(cluster, lastIndex, candles)
      const spacingScore = calculateSpacingScore(cluster)
      const strength = Math.min(1, (touches / 4) * 0.4 + recencyScore * 0.3 + spacingScore * 0.3)

      return { price, distancePercent: 0, strength, touches, zone }
    })
    .sort((a, b) => b.strength - a.strength)
}

function calculateRecencyScore(
  cluster: number[],
  lastIndex: number,
  candles: Candle[]
): number {
  let mostRecentIndex = -1
  for (let i = candles.length - 1; i >= 0; i--) {
    const price = candles[i].close
    const isNear = cluster.some(level => Math.abs(price - level) / level < 0.002)
    if (isNear) {
      mostRecentIndex = i
      break
    }
  }

  if (mostRecentIndex < 0) return 0.3
  const recencyRatio = 1 - (lastIndex - mostRecentIndex) / candles.length
  return Math.max(0.1, recencyRatio)
}

function calculateSpacingScore(cluster: number[]): number {
  if (cluster.length < 2) return 0.5
  const sorted = [...cluster]
  const gaps: number[] = []
  for (let i = 1; i < sorted.length; i++) {
    gaps.push(sorted[i] - sorted[i - 1])
  }
  if (gaps.length === 0) return 0.5
  const avgGap = gaps.reduce((a, b) => a + b, 0) / gaps.length
  const maxGap = Math.max(...gaps)
  if (maxGap === 0) return 0.5
  const consistency = 1 - (maxGap - avgGap) / maxGap
  return Math.max(0.2, consistency)
}

function classifyPriceLocation(
  entry: number,
  nearestSupport: number | null,
  nearestResistance: number | null,
  threshold: number
): PriceLocation {
  const distToSupport = nearestSupport !== null
    ? Math.abs(entry - nearestSupport) / entry
    : Infinity
  const distToResistance = nearestResistance !== null
    ? Math.abs(entry - nearestResistance) / entry
    : Infinity

  const nearSupport = distToSupport < threshold
  const nearResistance = distToResistance < threshold

  if (nearSupport && nearResistance) {
    return distToSupport < distToResistance ? 'near_support' : 'near_resistance'
  }
  if (nearSupport) return 'near_support'
  if (nearResistance) return 'near_resistance'

  if (nearestSupport !== null && nearestResistance !== null) {
    return 'between_levels'
  }
  if (nearestSupport !== null || nearestResistance !== null) {
    return 'far_from_key_levels'
  }
  return 'far_from_key_levels'
}

function detectBreakout(
  candles: Candle[],
  lastIndex: number,
  resistanceZones: PriceLevel[],
  supportZones: PriceLevel[],
  entry: number
): BreakoutState {
  if (lastIndex < BREAKOUT_LOOKBACK) return 'no_breakout'

  const recentCandles = candles.slice(lastIndex - BREAKOUT_LOOKBACK, lastIndex + 1)
  const currentClose = candles[lastIndex].close
  const previousClose = candles[lastIndex - 1].close

  // Check resistance breakout
  for (const zone of resistanceZones) {
    const zoneTop = zone.zone[1]
    const wasBelow = previousClose < zoneTop
    const brokeAbove = currentClose > zoneTop

    if (wasBelow && brokeAbove) {
      // Check if price closed back below (false breakout)
      const movedAboveThenBack = recentCandles.some(
        c => c.high > zoneTop && c.close < zoneTop
      )
      if (movedAboveThenBack) return 'false_breakout_risk'
      return 'breakout_up'
    }

    // Check false breakout: price was above, moved below, came back
    const wasAbove = previousClose > zone.zone[0]
    const brokeBelow = currentClose < zone.zone[0]
    if (wasAbove && brokeBelow) {
      const movedBelowThenBack = recentCandles.some(
        c => c.low < zone.zone[0] && c.close > zone.zone[0]
      )
      if (movedBelowThenBack) return 'false_breakout_risk'
    }
  }

  // Check support breakout
  for (const zone of supportZones) {
    const zoneBottom = zone.zone[0]
    const wasAbove = previousClose > zoneBottom
    const brokeBelow = currentClose < zoneBottom

    if (wasAbove && brokeBelow) {
      const movedBelowThenBack = recentCandles.some(
        c => c.low < zoneBottom && c.close > zoneBottom
      )
      if (movedBelowThenBack) return 'false_breakout_risk'
      return 'breakout_down'
    }
  }

  return 'no_breakout'
}

function formatPriceLocation(location: PriceLocation): string {
  const map: Record<PriceLocation, string> = {
    near_support: 'Near Support',
    near_resistance: 'Near Resistance',
    between_levels: 'Between Levels',
    breaking_resistance: 'Breaking Resistance',
    breaking_support: 'Breaking Support',
    far_from_key_levels: 'Far from Key Levels',
  }
  return map[location]
}

function emptyResult(reason: string): KeyLevelsResult {
  return {
    support: [],
    resistance: [],
    nearestSupport: null,
    nearestResistance: null,
    priceLocation: 'far_from_key_levels',
    breakoutState: 'no_breakout',
    coverage: 'unavailable',
    evidence: [reason],
  }
}
