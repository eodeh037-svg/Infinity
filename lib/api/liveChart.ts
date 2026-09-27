import { getTwelveData } from './finnhub';
import { CandleResult } from './client';

export const LIVE_CHART_TIMEFRAMES = ['15M', '1H', '4H', '1D', '1W'] as const;

export const LIVE_CHART_INTERVAL_MAP: Record<string, string> = {
  '15M': '15min',
  '1H': '1h',
  '4H': '4h',
  '1D': '1day',
  '1W': '1week',
};

export function resolveChartInterval(timeframe: string): string {
  return LIVE_CHART_INTERVAL_MAP[timeframe] || '4h';
}

export async function fetchLiveChart(symbol: string, timeframe: string): Promise<CandleResult> {
  const decoded = symbol.replace(/_/g, '/');
  const [base, quote] = decoded.split('/');
  return getTwelveData(base, quote, resolveChartInterval(timeframe), '100');
}

let prefetchSlot: { symbol: string; timeframe: string; promise: Promise<CandleResult> } | null = null;

export function startLiveChartPrefetch(symbol: string, timeframe: string): void {
  prefetchSlot = { symbol, timeframe, promise: fetchLiveChart(symbol, timeframe) };
}

export function consumeLiveChartPrefetch(
  symbol: string,
  timeframe: string
): Promise<CandleResult> | null {
  if (prefetchSlot && prefetchSlot.symbol === symbol && prefetchSlot.timeframe === timeframe) {
    const promise = prefetchSlot.promise;
    prefetchSlot = null;
    return promise;
  }
  return null;
}