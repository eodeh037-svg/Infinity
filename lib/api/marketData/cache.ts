type CacheKey = string

interface CandleData {
  candles: import('./types').MarketCandle[]
  timestamp: number
  provider: string
}

interface InFlightResult {
  data: import('./types').MarketCandle[]
  providerName: string
}

const CANDLE_TTL = 300000
const candleCache = new Map<CacheKey, CandleData>()
const inFlightRequests = new Map<string, Promise<InFlightResult>>()

export function getCacheKey(symbol: string, timeframe: string, limit: number): CacheKey {
  return `${symbol}:${timeframe}:${limit}`
}

export function getCachedCandles(key: CacheKey): import('./types').MarketCandle[] | null {
  const cached = candleCache.get(key)
  if (cached && Date.now() - cached.timestamp < CANDLE_TTL) {
    return cached.candles
  }
  return null
}

export function setCachedCandles(key: CacheKey, candles: import('./types').MarketCandle[], provider: string): void {
  candleCache.set(key, { candles, timestamp: Date.now(), provider })
}

export function getCachedProvider(key: CacheKey): string | null {
  const cached = candleCache.get(key)
  if (cached) return cached.provider
  return null
}

export function getInFlightRequest(key: string): Promise<InFlightResult> | undefined {
  return inFlightRequests.get(key)
}

export function setInFlightRequest(key: string, promise: Promise<InFlightResult>): void {
  inFlightRequests.set(key, promise)
  promise.finally(() => {
    inFlightRequests.delete(key)
  })
}

export function clearCandleCache(): void {
  candleCache.clear()
}
