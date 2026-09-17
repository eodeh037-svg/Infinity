import { MarketCandle, MarketDataResult, QuoteData, Timeframe } from './types'
import { CandleProvider, ProviderStatus } from './providers'
import { getCacheKey, getCachedCandles, setCachedCandles, getInFlightRequest, setInFlightRequest, getCachedProvider, clearCandleCache } from './cache'
import { FinnhubAdapter } from './finnhub'
import { TwelveDataAdapter } from './twelveData'
import { FMPAdapter } from './fmp'
import { AlphaVantageAdapter } from './alphaVantage'
import { BiQuoteAdapter } from './biquote'

const MAX_CONCURRENT_FETCHES = 15

const PROVIDERS: CandleProvider[] = [
  new FinnhubAdapter(),
  new TwelveDataAdapter(),
  new FMPAdapter(),
  new AlphaVantageAdapter(),
  new BiQuoteAdapter(),
]

const providerStatuses: Map<string, ProviderStatus> = new Map()

PROVIDERS.forEach(p => {
  providerStatuses.set(p.name, {
    name: p.name,
    failures: 0,
    lastFailureTime: null,
    cooldownUntil: null,
    isAvailable: true,
  })
})

function getSortedProviders(): CandleProvider[] {
  return [...PROVIDERS].sort((a, b) => a.priority - b.priority)
}

function recordFailure(providerName: string): void {
  const status = providerStatuses.get(providerName)
  if (status) {
    status.failures++
    status.lastFailureTime = Date.now()
    if (status.failures >= 5) {
      status.cooldownUntil = Date.now() + 300000
      status.isAvailable = false
    }
  }
}

function recordSuccess(providerName: string): void {
  const status = providerStatuses.get(providerName)
  if (status) {
    status.failures = 0
    status.isAvailable = true
  }
}

async function fetchSingleSymbol(
  symbol: string,
  timeframe: Timeframe,
  limit: number,
  provider: CandleProvider,
  attempt: number = 0
): Promise<{ candles: MarketCandle[] | null; providerName: string }> {
  const status = providerStatuses.get(provider.name)
  if (status && !status.isAvailable && status.cooldownUntil && Date.now() < status.cooldownUntil) {
    return { candles: null, providerName: provider.name }
  }

  try {
    const candles = await provider.fetchCandles(symbol, timeframe, limit)
    if (candles && candles.length > 0) {
      recordSuccess(provider.name)
      return { candles, providerName: provider.name }
    }
    recordFailure(provider.name)
    return { candles: null, providerName: provider.name }
  } catch {
    recordFailure(provider.name)
    return { candles: null, providerName: provider.name }
  }
}

class ConcurrencyLimiter {
  private running = 0
  private queue: (() => void)[] = []

  async run<T>(fn: () => Promise<T>): Promise<T> {
    while (this.running >= MAX_CONCURRENT_FETCHES) {
      await new Promise<void>(r => this.queue.push(r))
    }
    this.running++
    try {
      return await fn()
    } finally {
      this.running--
      if (this.queue.length > 0) {
        this.queue.shift()!()
      }
    }
  }
}

const concurrencyLimiter = new ConcurrencyLimiter()

export async function getMarketData(
  symbols: string[],
  timeframe: Timeframe = '4h',
  limit: number = 100
): Promise<MarketDataResult> {
  const result: MarketDataResult = {
    data: {},
    providers: {},
    unavailable: [],
  }

  const providerList = getSortedProviders()

  const uncachedSymbols: string[] = []

  for (const symbol of symbols) {
    const cacheKey = getCacheKey(symbol, timeframe, limit)
    const cached = getCachedCandles(cacheKey)

    if (cached) {
      result.data[symbol] = cached
      result.providers[symbol] = getCachedProvider(cacheKey) || 'unknown'
      continue
    }

    const inFlight = getInFlightRequest(cacheKey)
    if (inFlight) {
      const inFlightResult = await inFlight
      result.data[symbol] = inFlightResult.data
      result.providers[symbol] = 'dedup'
      continue
    }

    uncachedSymbols.push(symbol)
  }

  const fetchResults = await Promise.all(
    uncachedSymbols.map(symbol => {
      const cacheKey = getCacheKey(symbol, timeframe, limit)
      const fetchPromise = concurrencyLimiter.run(() =>
        fetchSymbolWithFallback(symbol, timeframe, limit, providerList)
      )
      setInFlightRequest(cacheKey, fetchPromise as Promise<{ data: MarketCandle[]; providerName: string }>)
      return fetchPromise.then(candles => ({ symbol, candles }))
    })
  )

  for (const { symbol, candles } of fetchResults) {
    const cacheKey = getCacheKey(symbol, timeframe, limit)
    if (candles.data && candles.data.length > 0) {
      setCachedCandles(cacheKey, candles.data, candles.providerName)
      result.data[symbol] = candles.data
      result.providers[symbol] = candles.providerName
    } else {
      result.unavailable.push(symbol)
    }
  }

  return result
}

async function fetchSymbolWithFallback(
  symbol: string,
  timeframe: Timeframe,
  limit: number,
  providerList: CandleProvider[]
): Promise<{ data: MarketCandle[]; providerName: string }> {
  let bestResult: { data: MarketCandle[]; providerName: string } | null = null

  for (const provider of providerList) {
    const status = providerStatuses.get(provider.name)
    if (status && !status.isAvailable && status.cooldownUntil && Date.now() < status.cooldownUntil) {
      continue
    }

    const result = await fetchSingleSymbol(symbol, timeframe, limit, provider)

    if (result.candles && result.candles.length > 0) {
      if (!bestResult || result.candles.length > bestResult.data.length) {
        bestResult = { data: result.candles, providerName: result.providerName }
      }
      if (result.candles.length >= limit) {
        return bestResult
      }
    }
  }

  return bestResult || { data: [], providerName: 'none' }
}

export async function getQuote(symbol: string): Promise<QuoteData | null> {
  for (const provider of getSortedProviders()) {
    const result = await provider.fetchQuote(symbol)
    if (result) return result
  }
  return null
}

export async function getMultipleQuotes(symbols: string[]): Promise<Record<string, QuoteData>> {
  const results: Record<string, QuoteData> = {}
  const settled = await Promise.allSettled(symbols.map(s => getQuote(s)))
  settled.forEach((result, i) => {
    if (result.status === 'fulfilled' && result.value) {
      results[symbols[i]] = result.value
    }
  })
  return results
}

export function getProviderStatuses(): Map<string, ProviderStatus> {
  return new Map(providerStatuses)
}

export function clearAllCaches(): void {
  clearCandleCache()
}

export { PROVIDERS }
