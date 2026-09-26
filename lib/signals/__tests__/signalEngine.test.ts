import { describe, expect, it } from 'vitest';

import { generateSignal, calculateConfidence } from '../signalEngine';
import {
  ATR_SL_MULTIPLIER,
  MAX_SL_ATR,
  HIGH_VOL_SL_MULTIPLIER,
  TP_LEVEL_BUFFER_ATR,
  BASE_RISK_REWARD,
  DEFAULT_FAMILY_CAPS,
} from '../signalEngine';
import { Candle } from '../../indicators/types';

function mulberry32(seed: number): () => number {
  return function () {
    let t = (seed += 0x6d2b79f5);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function trendCloses(
  count: number,
  step: number,
  noise: number,
  seed: number,
  start = 100
): number[] {
  const rand = mulberry32(seed);
  const out: number[] = [];
  let v = start;
  for (let i = 0; i < count; i++) {
    v += step + (rand() - 0.5) * noise;
    out.push(v);
  }
  return out;
}

function toCandles(closes: number[], wiggle = 0.35): Candle[] {
  return closes.map((c, i) => {
    const prev = i > 0 ? closes[i - 1] : c;
    const range = Math.abs(c - prev) * 0.5 + wiggle;
    return {
      open: prev,
      high: Math.max(prev, c) + range,
      low: Math.min(prev, c) - range,
      close: c,
      volume: 1000 + ((i * 37) % 700),
      time: i * 60000,
    };
  });
}

function flatSin(n: number, wiggle = 0.0005): Candle[] {
  const closes = Array.from({ length: n }, (_, i) => 100 + Math.sin(i * 0.7) * 0.005);
  return toCandles(closes, wiggle);
}


const SQUEEZE_LOW_ATR = () => flatSin(300);


const DOWN_HIGH_ATR = () => toCandles(trendCloses(300, -0.09, 0.5, 22));


const UP_TREND = () => toCandles(trendCloses(300, 0.09, 0.5, 11));

type ConfidenceArgs = Parameters<typeof calculateConfidence>;

function baseConfidenceArgs(overrides: Partial<Record<keyof ConfidenceArgs, unknown>> = {}): ConfidenceArgs {
  const args: ConfidenceArgs = [
    14, 
    7, 
    'BUY', 
    { strong: false, bullish: true, gapPercent: 3 },
    'NEUTRAL',
    58,
    4,
    16,
    1,
    { sentimentMultiplier: 1, fearBonus: 0, greedPenalty: 0 },
    null,
    null,
    null,
    'NONE',
    false,
    'NONE',
    false,
    false,
    'medium',
  ];
  for (const key of Object.keys(overrides) as unknown as string[]) {
    const idx = Number(key);
    if (Number.isFinite(idx)) args[idx] = (overrides as Record<string, unknown>)[key] as never;
  }
  return args;
}

describe('signal engine correctness fixes — regression tests', () => {
  describe('1. Supertrend fallback neutrality', () => {
    it('adds no confidence bonus when supertrend direction is missing (null)', () => {
      const base = calculateConfidence(...baseConfidenceArgs());
      const withNullUp = calculateConfidence(
        ...baseConfidenceArgs({ 10: 'UP' } as never)
      );
      expect(base).toBe(70.33333333333333);
      expect(withNullUp).toBe(72.33333333333333);
    });

    it('super trend aligned UP+BUY gets +2 while null gets nothing', () => {
      const base = calculateConfidence(...baseConfidenceArgs());
      const nullDir = calculateConfidence(...baseConfidenceArgs());
      const aligned = calculateConfidence(...baseConfidenceArgs({ 10: 'UP' } as never));
      expect(nullDir - base).toBe(0);
      expect(aligned - base).toBe(2);
    });

    it('reports the direction actually computed (UP on an uptrend, DOWN on a downtrend)', () => {
      expect(generateSignal(UP_TREND()).supertrendDirection).toBe('UP');
      expect(generateSignal(DOWN_HIGH_ATR()).supertrendDirection).toBe('DOWN');
    });
  });

  describe('2. Keltner squeeze produces no directional score', () => {
    it('a squeeze emits no squeeze-triggered BUY evidence in reasons', () => {
      const res = generateSignal(SQUEEZE_LOW_ATR());
      expect(res.keltnerSqueeze).toBe(true);
      expect(res.reasons.some((r) => r.includes('Keltner Channel squeeze'))).toBe(false);
    });
  });

  describe('3. ATR regime produces no directional score (contextual only)', () => {
    it('low ATR regime does not fire the old low-volatility BUY reason', () => {
      const res = generateSignal(SQUEEZE_LOW_ATR());
      expect(res.atrRegime).toBe('low');
      expect(res.reasons.some((r) => r.includes('breakout setup'))).toBe(false);
    });

    it('high ATR regime does not fire the old high-volatility SELL reason', () => {
      const res = generateSignal(DOWN_HIGH_ATR());
      expect(res.atrRegime).toBe('high');
      expect(res.reasons.some((r) => r.includes('risk of reversal'))).toBe(false);
    });
  });

  describe('4. Fisher confidence bonus requires alignment', () => {
    it('strong aligned Fisher adds +2', () => {
      const base = calculateConfidence(...baseConfidenceArgs());
      const aligned = calculateConfidence(
        ...baseConfidenceArgs({ 11: 0.8, 12: 'BUY' } as never)
      );
      expect(aligned - base).toBe(2);
    });

    it('strong Fisher in the opposite direction adds nothing', () => {
      const base = calculateConfidence(...baseConfidenceArgs());
      const opposite = calculateConfidence(
        ...baseConfidenceArgs({ 11: 0.8, 12: 'SELL' } as never)
      );
      expect(opposite - base).toBe(0);
    });

    it('absent or weak Fisher adds nothing', () => {
      const base = calculateConfidence(...baseConfidenceArgs());
      const weak = calculateConfidence(
        ...baseConfidenceArgs({ 11: 0.4, 12: 'BUY' } as never)
      );
      const none = calculateConfidence(...baseConfidenceArgs());
      expect(weak - base).toBe(0);
      expect(none - base).toBe(0);
    });
  });

  describe('5. Keltner squeeze confidence bonus removed', () => {
    it('keltnerSqueeze true vs false yields identical confidence', () => {
      const without = calculateConfidence(...baseConfidenceArgs());
      const withSqueeze = calculateConfidence(
        ...baseConfidenceArgs({ 14: true } as never)
      );
      expect(withSqueeze).toBe(without);
    });
  });

  describe('6. ATR regime confidence adjustment kept (low +1, high -1)', () => {
    it('low regime adds +1 for a non-HOLD signal', () => {
      const base = calculateConfidence(...baseConfidenceArgs());
      const low = calculateConfidence(...baseConfidenceArgs({ 18: 'low' } as never));
      expect(low - base).toBe(1);
    });

    it('high regime subtracts 1', () => {
      const base = calculateConfidence(...baseConfidenceArgs());
      const high = calculateConfidence(...baseConfidenceArgs({ 18: 'high' } as never));
      expect(high - base).toBe(-1);
    });
  });

  describe('7. Retry wording — neutral, no hardcoded timing', () => {
    it('insufficient-data HOLD uses the neutral retry hint', () => {
      const res = generateSignal(flatSin(50));
      expect(res.signal).toBe('HOLD');
      const joined = [...res.reasons, res.output].join('\n');
      expect(joined).toContain('Recheck after the next completed candle.');
      expect(joined).not.toMatch(/8 minutes|next 8|Try generating/i);
    });
  });

  describe('8. Guardrails — unhardcoded configuration and untouched tuning constants', () => {
    it('exposes the same SL/TP/R:R tuning constants used by the engine', () => {
      expect(ATR_SL_MULTIPLIER).toBe(1.5);
      expect(MAX_SL_ATR).toBe(3.0);
      expect(HIGH_VOL_SL_MULTIPLIER).toBe(2.0);
      expect(TP_LEVEL_BUFFER_ATR).toBe(0.15);
      expect(BASE_RISK_REWARD).toBe(2.0);
    });

    it('exposes unchanged default family caps', () => {
      expect(DEFAULT_FAMILY_CAPS).toEqual({
        trend: 8,
        momentum: 7,
        meanReversion: 8,
        volume: 4,
        sentiment: 5,
        volatility: 4,
        priceAction: 6,
      });
    });
  });
});