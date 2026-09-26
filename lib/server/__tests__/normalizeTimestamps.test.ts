import { describe, it, expect } from 'vitest';

import { normalizeProviderCandles, timestampRejectReason } from '../providers/normalizeTimestamps';

const baseCandle = { open: 1.1, high: 1.11, low: 1.09, close: 1.105, volume: 100 };

describe('timestampRejectReason (Part 4 regression tests)', () => {
  it('converts epoch-seconds values to milliseconds', () => {
    expect(timestampRejectReason(1700000000)).toBeNull();
    expect(
      normalizeProviderCandles([{ ...baseCandle, time: 1700000000 }], 'test').candles[0].time
    ).toBe(1700000000000);
  });

  it('keeps millisecond timestamps unchanged', () => {
    const report = normalizeProviderCandles([{ ...baseCandle, time: 1700000000000 }], 'test');
    expect(report.convertedSeconds).toBe(0);
    expect(report.candles[0].time).toBe(1700000000000);
  });

  it('rejects microsecond/nanosecond-scale timestamps instead of guessing', () => {
    expect(timestampRejectReason(1700000000000000)).toBe('implausible_precision');
    expect(timestampRejectReason(17000000000000000000)).toBe('implausible_precision');
  });

  it('rejects timestamps outside the valid window (pre-2000 and post-now+1day)', () => {
    expect(timestampRejectReason(915148800)).toBe('outside_window');
    const now = Date.UTC(2026, 0, 1);
    const future = Math.floor((now + 11 * 24 * 60 * 60 * 1000) / 1000);
    expect(timestampRejectReason(future, { now })).toBe('outside_window');
  });

  it('rejects non-finite, zero, and string timestamps', () => {
    expect(timestampRejectReason(0)).toBe('not_a_number');
    expect(timestampRejectReason(Number.NaN)).toBe('not_a_number');
    const report = normalizeProviderCandles([{ ...baseCandle, time: 1700000000 }], 'test');
    expect(report.candles[0].time).toBe(1700000000000);
  });

  it('deduplicates repeated timestamps and sorts ascending', () => {
    const report = normalizeProviderCandles(
      [
        { ...baseCandle, time: 1700000003 },
        { ...baseCandle, time: 1700000001 },
        { ...baseCandle, time: 1700000003 },
        { ...baseCandle, time: 1700000002 },
      ],
      'test'
    );
    expect(report.candles.map((c) => c.time)).toEqual([
      1700000001000, 1700000002000, 1700000003000,
    ]);
  });

  it('reports per-provider warnings and counts for diagnostics', () => {
    const report = normalizeProviderCandles(
      [
        { ...baseCandle, time: 1700000000 },
        { ...baseCandle, time: 1700000000000000 },
      ],
      'twelveData'
    );
    expect(report.rejected).toBe(1);
    expect(report.convertedSeconds).toBe(1);
    expect(report.warnings[0]).toContain('twelveData');
    expect(report.warnings[0]).toContain('implausible_precision');
  });
});
