import { MarketCandle } from './types';

export const MIN_CANDLE_MS = Date.UTC(2000, 0, 1);
export const MAX_FUTURE_LOOKAHEAD_MS = 24 * 60 * 60 * 1000;
const SECONDS_BASE = 100000000000;
const MILLIS_BASE_HIGH = 4000000000000;

export interface TimestampNormalizationReport {
  candles: MarketCandle[];
  rejected: number;
  convertedSeconds: number;
  warnings: string[];
}

export type TimestampRejectReason =
  'not_a_number' | 'non_positive' | 'implausible_precision' | 'outside_window';

export function timestampRejectReason(
  raw: number,
  opts: { now?: number } = {}
): TimestampRejectReason | null {
  const now = opts.now ?? Date.now();
  if (!Number.isFinite(raw) || raw <= 0)
    return raw === 0 || Number.isNaN(raw) ? 'not_a_number' : 'non_positive';

  const ms = raw < SECONDS_BASE ? raw * 1000 : raw;
  if (ms > MILLIS_BASE_HIGH) return 'implausible_precision';
  if (ms < MIN_CANDLE_MS || ms > now + MAX_FUTURE_LOOKAHEAD_MS) return 'outside_window';
  return null;
}

export function normalizeProviderCandles(
  candles: MarketCandle[],
  providerName: string,
  opts: { now?: number } = {}
): TimestampNormalizationReport {
  const warnings: string[] = [];
  const normalized: MarketCandle[] = [];
  let convertedSeconds = 0;
  let rejected = 0;

  for (const candle of candles) {
    const raw = typeof candle.time === 'number' ? candle.time : Number.NaN;
    const reason = timestampRejectReason(raw, opts);

    if (reason) {
      rejected++;
      warnings.push(`${providerName}: removed candle at ts=${raw} (${reason})`);
      continue;
    }

    const time = raw < SECONDS_BASE ? raw * 1000 : raw;
    if (time !== raw) convertedSeconds++;
    normalized.push({ ...candle, time });
  }

  const seen = new Set<number>();
  const deduped: MarketCandle[] = [];
  for (const candle of normalized) {
    if (!seen.has(candle.time)) {
      seen.add(candle.time);
      deduped.push(candle);
    }
  }

  deduped.sort((a, b) => a.time - b.time);

  return { candles: deduped, rejected, convertedSeconds, warnings };
}
