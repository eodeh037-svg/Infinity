import { describe, expect, it } from 'vitest'
import { buildAuthoritativeSignal, AuthoritativeSignal } from '../tradeSetup'
import { Candle } from '../../indicators/types'
import { Timeframe } from '../../server/providers/types'
import { getStrategy } from '../strategies'
import { MAX_SL_ATR, HIGH_VOL_SL_MULTIPLIER, ATR_SL_MULTIPLIER, calculateDynamicRiskReward } from '../signalEngine'

function mulberry32(seed: number): () => number {
  return function () {
    let t = (seed += 0x6d2b79f5)
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

function toCandles(closes: number[], wiggle = 0.35): Candle[] {
  return closes.map((c, i) => {
    const prev = i > 0 ? closes[i - 1] : c
    const range = Math.abs(c - prev) * 0.5 + wiggle
    return {
      open: prev,
      high: Math.max(prev, c) + range,
      low: Math.min(prev, c) - range,
      close: c,
      volume: 1000 + ((i * 37) % 700),
      time: i * 60000,
    }
  })
}

function trendCloses(count: number, step: number, noise: number, seed: number, start = 100): number[] {
  const rand = mulberry32(seed)
  const out: number[] = []
  let v = start
  for (let i = 0; i < count; i++) {
    v += step + (rand() - 0.5) * noise
    out.push(v)
  }
  return out
}

function upCandles(count = 260, seed = 11): Candle[] {
  return toCandles(trendCloses(count, 0.09, 0.5, seed))
}

function downCandles(count = 260, seed = 23): Candle[] {
  return toCandles(trendCloses(count, -0.09, 0.5, seed))
}

function buildCandleMap(
  strategyKey: Parameters<typeof getStrategy>[0],
  factory: () => Candle[],
  overrideTimeframes?: Record<string, Candle[]>
): Record<string, Candle[]> {
  const strategy = getStrategy(strategyKey)
  const map: Record<string, Candle[]> = {}
  for (const tf of strategy.timeframes) {
    map[tf.timeframe] = overrideTimeframes?.[tf.timeframe] ?? factory()
  }
  return map
}

function actionable(result: AuthoritativeSignal) {
  return {
    signal: result.signal,
    confidence: result.confidence,
    entry: result.entry,
    stopLoss: result.stopLoss,
    takeProfit: result.takeProfit,
    riskReward: result.riskReward,
  }
}

describe('authoritative signal — single source of truth', () => {
  it('1/2/3. direction, confidence, entry, SL, TP and R:R all come from one result object', () => {
    const map = buildCandleMap('dayTrading', () => upCandles())
    const result = buildAuthoritativeSignal(map, 'dayTrading', 1000)

    const view = actionable(result)

    expect(view.signal).toBe(result.signal)
    expect(view.confidence).toBe(result.confidence)
    expect(view.entry).toBe(result.entry)
    expect(view.stopLoss).toBe(result.stopLoss)
    expect(view.takeProfit).toBe(result.takeProfit)
    expect(view.riskReward).toBe(result.riskReward)

    expect(result.signal).toBe(result.timeframeAnalysis.overallSignal)
    expect(result.confidence).toBe(result.timeframeAnalysis.overallScore)
  })

  it('4. respects the strategy primary timeframe', () => {
    for (const key of ['general', 'scalping', 'dayTrading', 'swingTrading', 'positionTrading'] as const) {
      const map = buildCandleMap(key, () => upCandles())
      const result = buildAuthoritativeSignal(map, key, 0)
      expect(result.primaryTimeframe).toBe(getStrategy(key).primaryTimeframe)
      expect(result.primaryTimeframeUsedFallback).toBe(false)
    }
  })

  it('5. never selects the timeframe that merely returned the most candles', () => {
    const map = buildCandleMap('swingTrading', () => upCandles(), {
      '1h': upCandles(900),
      '4h': upCandles(600),
      '1day': upCandles(240),
    })

    expect(map['1h'].length).toBeGreaterThan(map['1day'].length)

    const result = buildAuthoritativeSignal(map, 'swingTrading', 0)
    expect(result.primaryTimeframe).toBe('1day')
  })

  it('5b. falls back to highest weighted available timeframe when primary has no data', () => {
    const map: Record<string, Candle[]> = {
      '15min': upCandles(400),
      '1h': upCandles(300),
      '1day': [],
    }
    const result = buildAuthoritativeSignal(map, 'swingTrading', 0)
    expect(result.primaryTimeframeUsedFallback).toBe(true)
    expect(result.primaryTimeframe).toBe('1h')
  })
})

describe('authoritative signal — side invariants', () => {
  it('6/7. BUY: SL < Entry < TP', () => {
    const map = buildCandleMap('dayTrading', () => upCandles())
    const result = buildAuthoritativeSignal(map, 'dayTrading', 1000)

    if (result.signal === 'BUY') {
      expect(result.entry).not.toBeNull()
      expect(result.stopLoss!).toBeLessThan(result.entry!)
      expect(result.takeProfit!).toBeGreaterThan(result.entry!)
    }
  })

  it('8/9. SELL: SL > Entry > TP', () => {
    const map = buildCandleMap('dayTrading', () => downCandles())
    const result = buildAuthoritativeSignal(map, 'dayTrading', 1000)

    if (result.signal === 'SELL') {
      expect(result.entry).not.toBeNull()
      expect(result.stopLoss!).toBeGreaterThan(result.entry!)
      expect(result.takeProfit!).toBeLessThan(result.entry!)
    }
  })

  it('returns a valid BUY setup on a strong uptrend', () => {
    const map = buildCandleMap('dayTrading', () => upCandles())
    const result = buildAuthoritativeSignal(map, 'dayTrading', 1000)
    expect(result.signal).toBe('BUY')
    expect(result.entry).not.toBeNull()
    expect(result.stopLoss).not.toBeNull()
    expect(result.takeProfit).not.toBeNull()
    expect(result.validation.valid).toBe(true)
  })

  it('returns a valid SELL setup on a strong downtrend', () => {
    const map = buildCandleMap('dayTrading', () => downCandles())
    const result = buildAuthoritativeSignal(map, 'dayTrading', 1000)
    expect(result.signal).toBe('SELL')
    expect(result.entry).not.toBeNull()
    expect(result.stopLoss).not.toBeNull()
    expect(result.takeProfit).not.toBeNull()
  })
})

describe('authoritative signal — risk constraints', () => {
  it('10. SL stays within the configured ATR band', () => {
    for (const key of ['dayTrading', 'swingTrading'] as const) {
      for (const factory of [upCandles, downCandles]) {
        const map = buildCandleMap(key, factory)
        const result = buildAuthoritativeSignal(map, key, 1000)
        if (result.entry === null || result.stopLoss === null) continue

        const atr = result.indicators?.atr
        if (!atr) continue

        const distance = Math.abs(result.entry - result.stopLoss)
        const regime = result.indicators?.atrRegime
        const minMultiplier = regime === 'high' ? HIGH_VOL_SL_MULTIPLIER : ATR_SL_MULTIPLIER

        expect(distance).toBeGreaterThanOrEqual(atr * minMultiplier - 1e-6)
        expect(distance).toBeLessThanOrEqual(atr * MAX_SL_ATR + 1e-6)
      }
    }
  })

  it('11/12. TP respects dynamicRiskReward max and min', () => {
    const map = buildCandleMap('dayTrading', () => upCandles())
    const result = buildAuthoritativeSignal(map, 'dayTrading', 1000)

    expect(result.entry).not.toBeNull()
    expect(result.riskReward).not.toBeNull()

    const atr = result.indicators!.atr!
    const trend = { strong: true, bullish: true, gapPercent: 1 }
    const rr = calculateDynamicRiskReward(
      atr,
      result.entry!,
      trend,
      result.signal,
      result.confidence,
      Math.abs(result.entry! - result.stopLoss!)
    )

    expect(result.riskReward!).toBeGreaterThanOrEqual(rr.min - 1e-6)
    expect(result.riskReward!).toBeLessThanOrEqual(rr.max + 1e-6)
  })

  it('15. prefers a structurally anchored TP over a pure ATR extension when a qualifying level exists', () => {
    const map = buildCandleMap('dayTrading', () => upCandles())
    const result = buildAuthoritativeSignal(map, 'dayTrading', 1000)

    if (result.takeProfitPlan) {
      const anchored = result.takeProfitPlan.structuralCandidate !== null
      expect(anchored || result.takeProfitPlan.levelStrength === null).toBe(true)
    }
  })
})

describe('authoritative signal — HOLD behaviour', () => {
  it('13. HOLD stays HOLD and exposes no actionable levels', () => {
    const flat = toCandles(Array.from({ length: 260 }, (_, i) => 100 + Math.sin(i / 3) * 0.05))
    const map = buildCandleMap('dayTrading', () => flat)
    const result = buildAuthoritativeSignal(map, 'dayTrading', 1000)

    if (result.signal === 'HOLD') {
      expect(result.entry).toBeNull()
      expect(result.stopLoss).toBeNull()
      expect(result.takeProfit).toBeNull()
      expect(result.riskReward).toBeNull()
      expect(result.validation.valid).toBe(false)
    }
  })

  it('13b. a BUY direction without a valid setup never produces actionable levels', () => {
    const map = buildCandleMap('dayTrading', () => upCandles())
    const result = buildAuthoritativeSignal(map, 'dayTrading', 1000)

    const hasAll = result.entry !== null && result.stopLoss !== null && result.takeProfit !== null
    if (result.signal !== 'HOLD') {
      expect(hasAll).toBe(true)
    } else {
      expect(hasAll).toBe(false)
    }
  })
})

describe('authoritative signal — determinism and diagnostics', () => {
  it('14. identical market data produces an identical result', () => {
    const a = buildAuthoritativeSignal(buildCandleMap('dayTrading', () => upCandles()), 'dayTrading', 1000)
    const b = buildAuthoritativeSignal(buildCandleMap('dayTrading', () => upCandles()), 'dayTrading', 1000)

    expect(actionable(a)).toEqual(actionable(b))
    expect(a.entryPlan).toEqual(b.entryPlan)
    expect(a.stopLossPlan).toEqual(b.stopLossPlan)
    expect(a.takeProfitPlan).toEqual(b.takeProfitPlan)
  })

  it('10b. exposes explainable plans for entry, SL and TP', () => {
    const map = buildCandleMap('dayTrading', () => upCandles())
    const result = buildAuthoritativeSignal(map, 'dayTrading', 1000)

    expect(result.entryPlan).not.toBeNull()
    expect(result.entryPlan!.reasons.length).toBeGreaterThan(0)
    expect(['market', 'pullback']).toContain(result.entryPlan!.type)

    expect(result.stopLossPlan).not.toBeNull()
    expect(result.stopLossPlan!.reasons.length).toBeGreaterThan(0)

    expect(result.takeProfitPlan).not.toBeNull()
    expect(result.takeProfitPlan!.reasons.length).toBeGreaterThan(0)
    expect(result.takeProfitPlan!.riskReward).toBeGreaterThan(0)
  })

  it('records rejected candidates with reasons', () => {
    const map = buildCandleMap('dayTrading', () => upCandles())
    const result = buildAuthoritativeSignal(map, 'dayTrading', 1000)

    for (const rejection of result.validation.rejected) {
      expect(['entry', 'stopLoss', 'takeProfit']).toContain(rejection.kind)
      expect(rejection.reason.length).toBeGreaterThan(0)
    }
  })
})
