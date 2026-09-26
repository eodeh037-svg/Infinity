import { describe, expect, it } from 'vitest';

import { scoreEntryCandidate, buildAuthoritativeSignal } from '../tradeSetup';
import { getStrategy } from '../strategies';
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

function upCandles(count = 260, seed = 11): Candle[] {
  return toCandles(trendCloses(count, 0.09, 0.5, seed));
}

function buildCandleMap(strategyKey: Parameters<typeof getStrategy>[0], factory: () => Candle[]) {
  const strategy = getStrategy(strategyKey);
  const map: Record<string, Candle[]> = {};
  for (const tf of strategy.timeframes) {
    map[tf.timeframe] = factory();
  }
  return map;
}

describe('Part 7/10 — entry candidate scoring', () => {
  it('scores an unextended market entry at 40/60 (base 30 + market 10)', () => {
    const scored = scoreEntryCandidate('market', 0, 0, false);
    expect(scored.score).toBe(40);
    expect(scored.meanPenalty).toBe(0);
    expect(scored.extensionPenalty).toBe(0);
  });

  it('penalizes a market entry extended beyond 1.0 ATR from the mean', () => {
    expect(scoreEntryCandidate('market', 0, 1.5, false).score).toBe(35);
    expect(scoreEntryCandidate('market', 0, 3.0, false).score).toBe(25);
  });

  it('caps the market chase penalty at 15 points', () => {
    const scored = scoreEntryCandidate('market', 0, 10, false);
    expect(scored.score).toBe(25);
    expect(scored.meanPenalty).toBe(15);
  });

  it('does not penalize a market entry inside the mean (no chasing)', () => {
    expect(scoreEntryCandidate('market', 0, 0.6, false).score).toBe(40);
    expect(scoreEntryCandidate('market', 0, 1.0, false).score).toBe(40);
  });

  it('award pullback entries for low extension with a closeness reward', () => {
    const scored = scoreEntryCandidate('pullback', 0.2, 0, true);
    expect(scored.score).toBe(57);
    expect(scored.extensionPenalty).toBe(2);
    expect(scored.closenessBonus).toBe(4);
    expect(scored.structuralBonus).toBe(5);
  });

  it('degrades pullback scores as the anchor moves beyond tolerance', () => {
    expect(scoreEntryCandidate('pullback', 0.5, 0, false).score).toBe(48);
    expect(scoreEntryCandidate('pullback', 1.1, 0, false).score).toBe(39);
    expect(scoreEntryCandidate('pullback', 5.0, 0, false).score).toBe(30);
  });

  it('always ranks a close structural pullback above an extended market entry', () => {
    const market = scoreEntryCandidate('market', 0, 2.2, false);
    const pullback = scoreEntryCandidate('pullback', 0.2, 0, true);
    expect(pullback.score).toBeGreaterThan(market.score);
  });

  it('never returns a negative score', () => {
    expect(scoreEntryCandidate('market', 0, 100, false).score).toBeGreaterThanOrEqual(0);
    expect(scoreEntryCandidate('pullback', 100, 0, false).score).toBeGreaterThanOrEqual(0);
  });

  it('exposes the winning entryScore and scoring diagnostics through the authoritative signal', () => {
    const result = buildAuthoritativeSignal(
      buildCandleMap('dayTrading', () => upCandles()),
      'dayTrading',
      1000
    );

    if (result.entryPlan) {
      expect(result.entryPlan.entryScore).toBeTypeOf('number');
      expect(result.entryPlan.entryScore).toBeGreaterThanOrEqual(0);
      expect(result.entryPlan.entryScore).toBeLessThanOrEqual(60);
      expect(result.validation.notes.join('\n')).toContain('Entry candidates scored');
    }
    expect(result.reasons.length).toBeGreaterThan(0);
  });

  it('returns deterministic scores for identical conditions', () => {
    const a = scoreEntryCandidate('pullback', 0.3, 0, true);
    const b = scoreEntryCandidate('pullback', 0.3, 0, true);
    expect(a).toEqual(b);
  });
});
