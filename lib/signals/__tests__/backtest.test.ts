import { describe, expect, it } from 'vitest';

import {
  estimateCandleStepMs,
  resolveHorizonCandles,
  roundTripCostPrice,
  effectiveRisk,
  simulateTrade,
  runBacktest,
  BacktestCosts,
} from '../backtest';
import { Candle } from '../../indicators/types';
import { resolutionHorizonHours } from '../strategies';

function candle(time: number, open: number, high: number, low: number, close: number): Candle {
  return { time, open, high, low, close, volume: 100 };
}

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

function toCandles(closes: number[], stepMs: number, startMs = 0): Candle[] {
  return closes.map((c, i) => {
    const prev = i > 0 ? closes[i - 1] : c;
    const range = Math.abs(c - prev) * 0.5 + 0.35;
    return {
      open: prev,
      high: Math.max(prev, c) + range,
      low: Math.min(prev, c) - range,
      close: c,
      volume: 1000,
      time: startMs + i * stepMs,
    };
  });
}

describe('Part 2 — strategy-aware wall-clock horizons', () => {
  it('maps each strategy to a natural hold period in hours', () => {
    expect(resolutionHorizonHours('scalping')).toBe(6);
    expect(resolutionHorizonHours('dayTrading')).toBe(24);
    expect(resolutionHorizonHours('swingTrading')).toBe(168);
    expect(resolutionHorizonHours('general')).toBe(72);
  });

  it('converts a strategy horizon into primary-timeframe candles', () => {
    const series = Array.from({ length: 10 }, (_, i) => candle(i * 300000, 1, 1, 1, 1));
    expect(
      resolveHorizonCandles(series, { horizonHours: resolutionHorizonHours('scalping') })
    ).toBe(72);
  });
});

describe('Part 5 — wall-clock horizon helpers', () => {
  it('estimateCandleStepMs derives the mean step across regular candles', () => {
    const series = Array.from({ length: 20 }, (_, i) => candle(i * 3600000, 1, 1, 1, 1));
    expect(estimateCandleStepMs(series)).toBe(3600000);
  });

  it('estimateCandleStepMs tolerates weekend-style gaps via the mean of positive deltas', () => {
    const series = [
      candle(0, 1, 1, 1, 1),
      candle(3600000, 1, 1, 1, 1),
      candle(10800000, 1, 1, 1, 1),
    ];
    expect(estimateCandleStepMs(series)).toBe(5400000);
  });

  it('estimateCandleStepMs returns null for empty/singleton series', () => {
    expect(estimateCandleStepMs([])).toBeNull();
    expect(estimateCandleStepMs([candle(0, 1, 1, 1, 1)])).toBeNull();
  });

  it('resolveHorizonCandles falls back to the candle-count horizon when horizonHours is absent', () => {
    expect(resolveHorizonCandles(Array.from({ length: 5 }, (_, i) => candle(i, 1, 1, 1, 1)))).toBe(
      24
    );
  });

  it('resolveHorizonCandles converts hours into candles from the estimated step', () => {
    const series = Array.from({ length: 10 }, (_, i) => candle(i * 3600000, 1, 1, 1, 1));
    expect(resolveHorizonCandles(series, { horizonHours: 24 })).toBe(24);
  });

  it('resolveHorizonCandles honours an explicit candleStepMs conversion', () => {
    const series = Array.from({ length: 10 }, (_, i) => candle(i * 3600000, 1, 1, 1, 1));
    expect(resolveHorizonCandles(series, { horizonHours: 24, candleStepMs: 300000 })).toBe(288);
  });

  it('resolveHorizonCandles never resolves to fewer than one candle', () => {
    const series = Array.from({ length: 4 }, (_, i) => candle(i * 864000000, 1, 1, 1, 1));
    expect(resolveHorizonCandles(series, { horizonHours: 24 })).toBe(1);
  });
});

describe('Part 11 — configurable round-trip costs', () => {
  const fx: BacktestCosts = {
    spreadPips: 0.6,
    commissionPips: 0.2,
    slippagePips: 0.2,
    pipSize: 0.0001,
  };

  it('converts FX pips into absolute round-trip price cost', () => {
    expect(roundTripCostPrice(fx)(1.1)).toBeCloseTo(0.0001, 12);
  });

  it('expresses FX cost in R using the effective risk', () => {
    const costPrice = roundTripCostPrice(fx);
    const risk = effectiveRisk(1.1, 1.1 - 0.00074);
    expect(costPrice(1.1) / risk).toBeCloseTo(0.0001 / 0.00074, 6);
  });

  it('converts basis points into entry-relative price cost (crypto)', () => {
    const crypto: BacktestCosts = { spreadBp: 2, commissionBp: 1, slippageBp: 1 };
    expect(roundTripCostPrice(crypto)(40000)).toBe(16);
    expect(roundTripCostPrice(crypto)(40000) / 1000).toBe(0.016);
  });

  it('defaults to a zero-cost model when no costs are supplied', () => {
    expect(roundTripCostPrice()(123)).toBe(0);
  });

  it('uses the default pip size of 0.0001', () => {
    const costs: BacktestCosts = { spreadPips: 1 };
    expect(roundTripCostPrice(costs)(1.0)).toBe(0.0001);
  });
});

describe('Part 13 — evaluation methodology without lookahead', () => {
  const entryIndex = 100;
  const entry = 100;
  const stopLoss = 95;
  const takeProfit = 103;

  it('never evaluates the entry candle itself (entry candle TP touch is not a win)', () => {
    const candles: Candle[] = [];
    for (let i = 0; i <= 106; i++) {
      if (i === entryIndex) candles.push(candle(i, 100, 110, 96, 102));
      else if (i > entryIndex) candles.push(candle(i, 102, 102.5, 101.5, 102));
      else candles.push(candle(i, 100, 101, 99, 100));
    }
    const sim = simulateTrade(candles, entryIndex, 'BUY', entry, stopLoss, takeProfit, 5);
    expect(sim.outcome).toBe('TIMEOUT');
  });

  it('treats a same-bar SL+TP touch as a LOSS (conservative priority)', () => {
    const candles: Candle[] = [];
    for (let i = 0; i <= 106; i++) {
      if (i === entryIndex) candles.push(candle(i, 100, 101, 99, 100));
      else if (i === entryIndex + 1) candles.push(candle(i, 100, 104, 94, 101));
      else candles.push(candle(i, 101, 101.5, 100.5, 101));
    }
    const sim = simulateTrade(candles, entryIndex, 'BUY', entry, stopLoss, takeProfit, 5);
    expect(sim.outcome).toBe('LOSS');
    expect(sim.exitIndex).toBe(entryIndex + 1);
  });
});

describe('Part 12 — MFE/MAE tracking in R', () => {
  const entryIndex = 100;
  const entry = 100;
  const stopLoss = 95;
  const takeProfit = 103;

  it('records until-exit MFE/MAE and the TP reach flag', () => {
    const candles: Candle[] = [];
    for (let i = 0; i <= 106; i++) {
      if (i === entryIndex) candles.push(candle(i, 100, 101, 99, 100));
      else if (i === entryIndex + 1) candles.push(candle(i, 100, 103.5, 99, 102));
      else candles.push(candle(i, 102, 102.5, 101.5, 102));
    }
    const sim = simulateTrade(candles, entryIndex, 'BUY', entry, stopLoss, takeProfit, 5);
    expect(sim.outcome).toBe('WIN');
    expect(sim.reachedTp).toBe(true);
    expect(sim.mfeR).toBeCloseTo(0.7, 6);
    expect(sim.mfeFullR).toBe(sim.mfeR);
    expect(sim.reached1R).toBe(false);
  });

  it('records adverse excursion > 1R on a stop-out', () => {
    const candles: Candle[] = [];
    for (let i = 0; i <= 106; i++) {
      if (i === entryIndex) candles.push(candle(i, 100, 101, 99, 100));
      else if (i === entryIndex + 1) candles.push(candle(i, 100, 102, 94, 101));
      else candles.push(candle(i, 101, 101.5, 100.5, 101));
    }
    const sim = simulateTrade(candles, entryIndex, 'BUY', entry, stopLoss, takeProfit, 5);
    expect(sim.outcome).toBe('LOSS');
    expect(sim.maeR).toBeCloseTo(1.2, 6);
    expect(sim.mfeR).toBeCloseTo(0.4, 6);
    expect(sim.reached1R).toBe(false);
  });

  it('computes full-window MFE beyond the exit so reach flags capture exit-timing waste', () => {
    const candles: Candle[] = [];
    for (let i = 0; i <= 106; i++) {
      if (i === entryIndex) candles.push(candle(i, 100, 101, 99, 100));
      else if (i === entryIndex + 1) candles.push(candle(i, 100, 102, 94, 101));
      else if (i === entryIndex + 2) candles.push(candle(i, 101, 112, 100, 111));
      else candles.push(candle(i, 111, 111.5, 110.5, 111));
    }
    const sim = simulateTrade(candles, entryIndex, 'BUY', entry, stopLoss, takeProfit, 5);
    expect(sim.outcome).toBe('LOSS');
    expect(sim.mfeR).toBeCloseTo(0.4, 6);
    expect(sim.mfeFullR).toBeCloseTo(2.4, 6);
    expect(sim.reached1R).toBe(true);
    expect(sim.reached15R).toBe(true);
    expect(sim.reached2R).toBe(true);
  });

  it('resolves a timeout to the horizon boundary candle', () => {
    const candles: Candle[] = [];
    for (let i = 0; i <= 106; i++) {
      if (i === entryIndex) candles.push(candle(i, 100, 101, 99, 100));
      else if (i > entryIndex) candles.push(candle(i, 100.5, 102, 98, 101));
      else candles.push(candle(i, 100, 101, 99, 100));
    }
    const sim = simulateTrade(candles, entryIndex, 'BUY', entry, stopLoss, takeProfit, 5);
    expect(sim.outcome).toBe('TIMEOUT');
    expect(sim.exitIndex).toBe(entryIndex + 5);
  });
});

describe('Part 5/11/12 — runBacktest integration', () => {
  it('produces NET/GROSS R, cost R, MFE/MAE and wall-clock horizonCandles in the summary', () => {
    const closes = trendCloses(320, 0.09, 0.5, 11, 100);
    const series = toCandles(closes, 7200000);

    const [summary] = runBacktest(
      series,
      [
        {
          name: 'baseline',
          options: {
            familyCaps: {
              trend: 999,
              momentum: 999,
              meanReversion: 999,
              volume: 999,
              sentiment: 999,
              volatility: 999,
              priceAction: 999,
            },
          },
        },
      ],
      { lookback: 220, step: 20, horizonHours: 24, costs: roundTripCosts }
    );

    expect(summary.horizonCandles).toBe(12);
    expect(summary.wins + summary.losses + summary.timeouts).toBe(summary.signals);
    expect(summary.expectancyGrossR).not.toBeNull();
    expect(summary.avgCostR).not.toBeNull();
    expect(summary.avgCostR!).toBeGreaterThan(0);

    for (const trade of summary.trades) {
      expect(trade.grossR - trade.costR).toBeCloseTo(trade.r, 10);
      expect(trade.costR).toBeGreaterThan(0);
      expect(trade.mfeR).toBeGreaterThanOrEqual(0);
      expect(trade.maeR).toBeGreaterThanOrEqual(0);
      expect(trade.mfeFullR).toBeGreaterThanOrEqual(trade.mfeR);
    }
  });
});

const roundTripCosts: BacktestCosts = { spreadPips: 0.6, commissionPips: 0.2, slippagePips: 0.2 };
