import { describe, expect, it } from 'vitest';
import { selectStopLossLevel, generateSignal } from '../signalEngine';
import { Candle } from '../../indicators/types';
import { calculateEMA } from '../../indicators/ema';
import { calculateATR } from '../../indicators/atr';

const ATR_BUFFER = 0.3;
const ATR_SL_MULTIPLIER = 1.5;
const entry = 100;

describe('selectStopLossLevel — side invariants', () => {
  it('BUY with EMA50 above entry by more than 0.5 ATR → valid stop strictly below entry', () => {
    const atr = 1;
    const recentLow = 97;
    const ema50 = entry + 2 * atr;
    const sl = selectStopLossLevel('BUY', entry, atr, ema50, recentLow, entry + 2 * atr);
    expect(sl).toBeLessThan(entry);
    expect(sl).toBeCloseTo(
      Math.max(recentLow - atr * ATR_BUFFER, entry - atr * ATR_SL_MULTIPLIER, entry - atr * 3),
      10
    );
  });

  it('BUY with EMA50 in normal position → full original formula preserved', () => {
    const atr = 1;
    const recentLow = 97;
    const ema50 = entry - 1 * atr;
    const expected = Math.max(
      recentLow - atr * ATR_BUFFER,
      entry - atr * ATR_SL_MULTIPLIER,
      ema50 - atr * 0.5,
      entry - atr * 3
    );
    const sl = selectStopLossLevel('BUY', entry, atr, ema50, recentLow, 103);
    expect(sl).toBeCloseTo(expected, 10);
    expect(sl).toBeLessThan(entry);
  });

  it('SELL with EMA50 below entry by more than 0.5 ATR → valid stop strictly above entry', () => {
    const atr = 1;
    const recentHigh = 103;
    const ema50 = entry - 2 * atr;
    const sl = selectStopLossLevel('SELL', entry, atr, ema50, 97, recentHigh);
    expect(sl).toBeGreaterThan(entry);
    expect(sl).toBeCloseTo(
      Math.min(recentHigh + atr * ATR_BUFFER, entry + atr * ATR_SL_MULTIPLIER, entry + atr * 3),
      10
    );
  });

  it('SELL with EMA50 in normal position → full original formula preserved', () => {
    const atr = 1;
    const recentHigh = 103;
    const ema50 = entry + 1 * atr;
    const expected = Math.min(
      recentHigh + atr * ATR_BUFFER,
      entry + atr * ATR_SL_MULTIPLIER,
      ema50 + atr * 0.5,
      entry + atr * 3
    );
    const sl = selectStopLossLevel('SELL', entry, atr, ema50, 97, recentHigh);
    expect(sl).toBeCloseTo(expected, 10);
    expect(sl).toBeGreaterThan(entry);
  });

  it('Very low volatility → stop is strictly on the valid side and not an epsilon clamp', () => {
    const atr = 0.002;
    const recentLow = entry - 0.01;
    const ema50 = entry + atr; // emaStop = entry (invalid: not strictly below entry)
    const sl = selectStopLossLevel('BUY', entry, atr, ema50, recentLow, entry + 0.01);
    expect(sl).toBeLessThan(entry);
    expect(entry - sl).toBeGreaterThanOrEqual(atr * ATR_SL_MULTIPLIER);
  });

  it('Very high volatility → stop strictly on the valid side with wide distance', () => {
    const atr = 20;
    const recentLow = 60;
    const ema50 = 120; // emaStop = 110 → invalid for BUY
    const sl = selectStopLossLevel('BUY', entry, atr, ema50, recentLow, 130);
    expect(sl).toBeLessThan(entry);
    expect(entry - sl).toBeGreaterThanOrEqual(atr * ATR_SL_MULTIPLIER);
  });

  it('No usable structural or EMA stop candidate → ATR volatility fallback stays valid (BUY)', () => {
    const atr = 1;
    const recentLow = entry + 10 * atr; // structuralStop above entry → invalid
    const ema50 = entry + 2 * atr; // emaStop above entry → invalid
    const sl = selectStopLossLevel('BUY', entry, atr, ema50, recentLow, entry + 12 * atr);
    expect(sl).toBeLessThan(entry);
    expect(sl).toBeCloseTo(entry - atr * ATR_SL_MULTIPLIER, 10);
    expect(sl).not.toBeCloseTo(entry, 10);
  });

  it('No usable structural or EMA stop candidate → ATR volatility fallback stays valid (SELL)', () => {
    const atr = 1;
    const recentHigh = entry - 10 * atr; // structuralStop below entry → invalid
    const ema50 = entry - 2 * atr; // emaStop below entry → invalid
    const sl = selectStopLossLevel('SELL', entry, atr, ema50, entry - 12 * atr, recentHigh);
    expect(sl).toBeGreaterThan(entry);
    expect(sl).toBeCloseTo(entry + atr * ATR_SL_MULTIPLIER, 10);
    expect(sl).not.toBeCloseTo(entry, 10);
  });

  it('ATR cap preserved: extreme single candidate never overshoots entry ± 3 ATR', () => {
    const atr = 10;
    const recentLow = entry - 100; // far below → structural valid
    const ema50 = entry - 50; // far below → valid
    const sl = selectStopLossLevel('BUY', entry, atr, ema50, recentLow, entry + 100);
    expect(sl).toBeGreaterThanOrEqual(entry - atr * 3);
    expect(sl).toBeLessThan(entry);
  });
});

describe('generateSignal — end-to-end SL/TP side invariants', () => {
  function mulberry32(seed: number): () => number {
    return function () {
      let t = (seed += 0x6d2b79f5);
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  function buildCloses(rand: () => number): number[] {
    const segments: { n: number; step: number; noise: number }[] = [
      { n: 240, step: 0.02, noise: 0.05 },
      { n: 220, step: -0.018, noise: 0.05 },
      { n: 240, step: 0.002, noise: 0.002 },
      { n: 200, step: 0.03, noise: 8.0 },
      { n: 220, step: -0.015, noise: 0.06 },
    ];
    const closes: number[] = [];
    let v = 100;
    for (const seg of segments) {
      for (let i = 0; i < seg.n; i++) {
        v += seg.step + (rand() - 0.5) * seg.noise;
        closes.push(v);
      }
      const j = closes.length - 1;
      closes.push(closes[j] - seg.noise * rand() * 2);
      closes.push(closes[j] + seg.noise * 2 + seg.noise * rand());
      closes.push(closes[j] + seg.noise * 4 + seg.noise * rand());
    }
    return closes;
  }

  function toCandles(closes: number[]): Candle[] {
    return closes.map((c, i) => {
      const prev = i > 0 ? closes[i - 1] : c;
      const o = prev;
      const range = Math.abs(c - o) * 0.5 + 0.001;
      return {
        open: o,
        high: Math.max(o, c) + range * (0.5 + ((i * 7) % 5) / 10),
        low: Math.min(o, c) - range * (0.5 + ((i * 11) % 4) / 10),
        close: c,
        volume: 900 + ((i * 31) % 600),
        time: i * 60000,
      };
    });
  }

  it('every generated BUY/SELL has strictly valid SL/TP sides across all regimes', () => {
    const rand = mulberry32(42);
    const closes = buildCloses(rand);
    const candles = toCandles(closes);
    const ema50s = calculateEMA(closes, 50);
    const atrs = calculateATR(candles, 14);

    let buys = 0;
    let sells = 0;
    let buyEmaFar = 0;
    let lowVol = 0;
    let highVol = 0;
    const problems: string[] = [];

    for (let i = 300; i < candles.length - 1; i += 3) {
      const r = generateSignal(candles.slice(0, i + 1), 0);
      if (r.stopLoss === null || r.takeProfit === null) continue;
      const entry = r.entry;
      const atr = atrs[i];
      const ema50 = ema50s[i];

      if (r.signal === 'BUY') {
        buys++;
        if (r.stopLoss >= entry) problems.push(`BUY sl(${r.stopLoss}) >= entry(${entry}) at ${i}`);
        if (r.takeProfit <= entry)
          problems.push(`BUY tp(${r.takeProfit}) <= entry(${entry}) at ${i}`);
        if (ema50 !== null && atr !== null && ema50 > entry + atr * 0.5) buyEmaFar++;
      } else if (r.signal === 'SELL') {
        sells++;
        if (r.stopLoss <= entry) problems.push(`SELL sl(${r.stopLoss}) <= entry(${entry}) at ${i}`);
        if (r.takeProfit >= entry)
          problems.push(`SELL tp(${r.takeProfit}) >= entry(${entry}) at ${i}`);
      }
      if (atr !== null && entry > 0) {
        if (atr / entry < 0.005) lowVol++;
        else if (atr / entry > 0.03) highVol++;
      }
    }

    expect(problems).toEqual([]);
    expect(buys).toBeGreaterThan(0);
    expect(sells).toBeGreaterThan(0);
    expect(buyEmaFar).toBeGreaterThan(0);
    expect(lowVol).toBeGreaterThan(0);
    expect(highVol).toBeGreaterThan(0);
  });

  it('BUY dip below EMA50 (regression: previously produced wrong-side SL) stays valid', () => {
    const rand = mulberry32(7);
    const closes = buildCloses(rand);
    const candles = toCandles(closes);
    const ema50s = calculateEMA(closes, 50);
    const atrs = calculateATR(candles, 14);

    let exercised = 0;
    for (let i = 300; i < candles.length - 1; i += 3) {
      const slice = candles.slice(0, i + 1);
      const r = generateSignal(slice, 0);
      if (r.signal !== 'BUY' || r.stopLoss === null) continue;
      const ema50 = ema50s[i];
      const atr = atrs[i];
      if (ema50 === null || atr === null) continue;
      if (ema50 <= r.entry + atr * 0.5) continue;
      exercised++;
      expect(r.stopLoss).toBeLessThan(r.entry);
      expect(r.takeProfit).toBeGreaterThan(r.entry);
    }
    expect(exercised).toBeGreaterThan(0);
  });
});
