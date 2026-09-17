import { MarketCandle, QuoteData, Timeframe, ServerCandleProvider } from './providers/types'
import { PROVIDER_CONFIG } from './providerConfig'
import { cacheGet, cacheSet, makeCandleKey, makeQuoteKey } from './cache'
import { coalesceRequest } from './coalesce'
import { metrics, recordProviderRequest } from './metrics'
import { EntitlementDeniedError, RateLimitExceededError } from './providers/errors'
import { ServerFinnhubAdapter } from './providers/finnhub'
import { ServerTwelveDataAdapter } from './providers/twelveData'
import { ServerFMPAdapter } from './providers/fmp'
import { ServerAlphaVantageAdapter } from './providers/alphaVantage'
import { ServerBiQuoteAdapter } from './providers/biquote'
import { ServerTiingoAdapter } from './providers/tiingo'
import { ServerEODHDAdapter } from './providers/eodhd'
import { ServerFCSAdapter } from './providers/fcs'
import { ServerFinageAdapter } from './providers/finage'
import { ServerCoinGeckoAdapter } from './providers/coingecko'
import { ServerCryptoCompareAdapter } from './providers/cryptocompare'
import { ServerMassiveAdapter } from './providers/massive'
import { ServerCurrencyAPIAdapter } from './providers/currencyapi'
import { ServerCurrencyDataFeedAdapter } from './providers/currencyDataFeed'

interface ProviderHealth {
  failures: number
  lastFailureTime: number | null
  cooldownUntil: number | null
  isAvailable: boolean
  entitlementDenied: boolean
  rateLimited: boolean
}

const providers: ServerCandleProvider[] = [
  new ServerFinnhubAdapter(),
  new ServerTwelveDataAdapter(),
  new ServerFMPAdapter(),
  new ServerAlphaVantageAdapter(),
  new ServerBiQuoteAdapter(),
  new ServerTiingoAdapter(),
  new ServerEODHDAdapter(),
  new ServerFCSAdapter(),
  new ServerFinageAdapter(),
  new ServerCoinGeckoAdapter(),
  new ServerCryptoCompareAdapter(),
  new ServerMassiveAdapter(),
  new ServerCurrencyAPIAdapter(),
  new ServerCurrencyDataFeedAdapter(),
]

const sortedProviders = [...providers].sort((a, b) => {
  const pa = PROVIDER_CONFIG[a.name]?.priority ?? 99
  const pb = PROVIDER_CONFIG[b.name]?.priority ?? 99
  return pa - pb
})

const health: Map<string, ProviderHealth> = new Map()
providers.forEach(p => {
  health.set(p.name, {
    failures: 0,
    lastFailureTime: null,
    cooldownUntil: null,
    isAvailable: true,
    entitlementDenied: false,
    rateLimited: false,
  })
})

function recordFailure(providerName: string): void {
  const h = health.get(providerName)
  if (!h) return
  const cfg = PROVIDER_CONFIG[providerName]
  h.failures++
  h.lastFailureTime = Date.now()
  if (cfg && h.failures >= cfg.cooldown.failureThreshold) {
    h.cooldownUntil = Date.now() + cfg.cooldown.cooldownMs
    h.isAvailable = false
  }
}

function recordSuccess(providerName: string): void {
  const h = health.get(providerName)
  if (!h) return
  h.failures = 0
  h.isAvailable = true
  h.entitlementDenied = false
  h.rateLimited = false
}

function recordEntitlementDenied(providerName: string): void {
  const h = health.get(providerName)
  if (!h) return
  h.entitlementDenied = true
  h.isAvailable = false
  h.cooldownUntil = Date.now() + 24 * 60 * 60 * 1000
}

function recordRateLimited(providerName: string): void {
  const h = health.get(providerName)
  if (!h) return
  h.rateLimited = true
  h.isAvailable = false
  h.cooldownUntil = Date.now() + 24 * 60 * 60 * 1000
}

function isProviderAvailable(providerName: string): boolean {
  const h = health.get(providerName)
  if (!h) return false
  if (h.entitlementDenied) return false
  if (h.rateLimited) {
    if (h.cooldownUntil && Date.now() >= h.cooldownUntil) {
      h.rateLimited = false
      h.isAvailable = true
      return true
    }
    return false
  }
  if (!h.isAvailable && h.cooldownUntil && Date.now() < h.cooldownUntil) return false
  if (!h.isAvailable && h.cooldownUntil && Date.now() >= h.cooldownUntil) {
    h.isAvailable = true
  }
  return true
}

function hasRequiredKey(providerName: string): boolean {
  const cfg = PROVIDER_CONFIG[providerName]
  if (!cfg?.envKey) return true
  return !!process.env[cfg.envKey]
}

function getProviderFailureReason(providerName: string): string | null {
  const h = health.get(providerName)
  if (!h) return null
  if (h.entitlementDenied) return 'entitlement_denied'
  if (h.rateLimited) return 'rate_limited'
  if (!h.isAvailable && h.cooldownUntil && Date.now() < h.cooldownUntil) return 'on_cooldown'
  return null
}

const DISPLAY_NAME: Record<string, string> = {
  finnhub: 'Finnhub',
  twelveData: 'Twelve Data',
  fmp: 'FMP',
  alphaVantage: 'Alpha Vantage',
  biquote: 'BiQuote',
  tiingo: 'Tiingo',
  eodhd: 'EODHD',
  fcs: 'FCS',
  finage: 'Finage',
  coingecko: 'CoinGecko',
  cryptocompare: 'CryptoCompare',
  massive: 'Massive',
  currencyapi: 'CurrencyAPI',
  currencyDataFeed: 'Currency Data Feed',
}

function displayName(name: string): string {
  return DISPLAY_NAME[name] ?? name
}

function nextProviderName(currentName: string): string | null {
  const idx = sortedProviders.findIndex(p => p.name === currentName)
  if (idx < 0 || idx >= sortedProviders.length - 1) return null
  return displayName(sortedProviders[idx + 1].name)
}

export async function fetchCandles(
  symbol: string,
  timeframe: Timeframe,
  limit: number
): Promise<{ data: MarketCandle[]; provider: string; diagnostics?: string[] }> {
  const cacheKey = makeCandleKey(symbol, timeframe, limit)
  const cached = cacheGet<MarketCandle[]>(cacheKey)
  if (cached) {
    metrics.cache.hits++
    return { data: cached, provider: 'cache' }
  }
  metrics.cache.misses++

  return coalesceRequest(cacheKey, async () => {
    const mergedCandles = new Map<number, MarketCandle>()
    const diagnostics: string[] = []
    const providersUsed: string[] = []
    const providerCandleCounts = new Map<string, number>()
    let lastFailedProvider: string | null = null
    const TAG = '[ProviderRouter]'

    for (const provider of sortedProviders) {
      const cfg = PROVIDER_CONFIG[provider.name]
      const dName = displayName(provider.name)

      if (!cfg?.enabled) {
        diagnostics.push(`${provider.name}: disabled`)
        continue
      }
      if (cfg.envKey && !hasRequiredKey(provider.name)) {
        diagnostics.push(`${provider.name}: missing_credentials`)
        continue
      }
      const failureReason = getProviderFailureReason(provider.name)
      if (failureReason) {
        console.log(`${TAG} ⏭️ Skipping ${dName}`)
        console.log(`${TAG}    Reason: ${failureReason}`)
        diagnostics.push(`${provider.name}: ${failureReason}`)
        continue
      }
      if (!provider.isSupported(symbol)) {
        diagnostics.push(`${provider.name}: unsupported symbol "${symbol}"`)
        continue
      }
      if (!provider.supportsCandles) {
        console.log(`${TAG} ⏭️ Skipping ${dName}`)
        console.log(`${TAG}    Reason: OHLC candles unsupported`)
        diagnostics.push(`${provider.name}: unsupported capability`)
        continue
      }

      if (mergedCandles.size >= limit) {
        diagnostics.push(`${provider.name}: skipped (already have ${mergedCandles.size} candles)`)
        continue
      }

      if (lastFailedProvider) {
        console.log(`${TAG}    Trying next provider: ${dName}`)
      }

      const start = Date.now()
      try {
        const candles = await provider.fetchCandles(symbol, timeframe, limit)
        const latency = Date.now() - start

        if (candles && candles.length > 0) {
          let newCount = 0
          for (const candle of candles) {
            if (!mergedCandles.has(candle.time)) {
              mergedCandles.set(candle.time, candle)
              newCount++
            }
          }

          recordProviderRequest(provider.name, latency, true)
          recordSuccess(provider.name)
          metrics.requests.providerCalls++

          if (newCount > 0) {
            providersUsed.push(provider.name)
            providerCandleCounts.set(provider.name, newCount)

            if (lastFailedProvider) {
              console.log(`${TAG} 🔄 Fallback: ${displayName(lastFailedProvider)} → ${dName}`)
            }

            if (newCount < candles.length) {
              console.log(`${TAG} ⚠️ ${dName} returned ${candles.length} candles, ${newCount} new for ${symbol} ${timeframe}`)
              console.log(`${TAG}    ${dName} → filled ${newCount} missing candles`)
              console.log(`${TAG}    Coverage: ${mergedCandles.size}/${limit}`)
            } else {
              console.log(`${TAG} ✅ ${dName} → ${candles.length}/${limit}`)
              console.log(`${TAG}    ${symbol} ${timeframe}`)
            }
          } else {
            console.log(`${TAG} ⚠️ ${dName} returned ${candles.length} candles, all duplicates for ${symbol} ${timeframe}`)
          }

          diagnostics.push(`${provider.name}: ${candles.length} candles, ${newCount} new (${latency}ms)`)

          if (mergedCandles.size >= limit) {
            break
          }
        } else {
          recordProviderRequest(provider.name, latency, false)
          recordFailure(provider.name)
          console.log(`${TAG} ❌ ${dName} failed for ${symbol} ${timeframe}`)
          console.log(`${TAG}    Reason: returned empty response`)
          lastFailedProvider = provider.name
          diagnostics.push(`${provider.name}: returned null/empty (${latency}ms)`)
        }
      } catch (err) {
        const latency = Date.now() - start
        recordProviderRequest(provider.name, latency, false)

        if (err instanceof EntitlementDeniedError) {
          recordEntitlementDenied(provider.name)
          console.log(`${TAG} ❌ ${dName} failed for ${symbol} ${timeframe}`)
          console.log(`${TAG}    Reason: entitlement_denied`)
          lastFailedProvider = provider.name
          diagnostics.push(`${provider.name}: entitlement_denied (${latency}ms)`)
        } else if (err instanceof RateLimitExceededError) {
          recordRateLimited(provider.name)
          console.log(`${TAG} ❌ ${dName} failed for ${symbol} ${timeframe}`)
          console.log(`${TAG}    Reason: rate_limited`)
          lastFailedProvider = provider.name
          diagnostics.push(`${provider.name}: rate_limited (${latency}ms)`)
        } else {
          recordFailure(provider.name)
          const msg = err instanceof Error ? err.message : 'unknown'
          console.log(`${TAG} ❌ ${dName} failed for ${symbol} ${timeframe}`)
          console.log(`${TAG}    Reason: ${msg}`)
          lastFailedProvider = provider.name
          diagnostics.push(`${provider.name}: error ${msg} (${latency}ms)`)
        }
      }
    }

    const result = Array.from(mergedCandles.values())
      .sort((a, b) => a.time - b.time)
      .slice(-limit)

    const providerLabel = providersUsed.length > 0
      ? providersUsed.join('+')
      : 'none'

    if (result.length > 0) {
      cacheSet(cacheKey, result)
    }

    if (result.length === 0) {
      console.log(`${TAG} ❌ All eligible providers failed`)
      console.log(`${TAG}    ${symbol} ${timeframe} → 0/${limit} candles`)
      console.error(`[providerRouter] All providers failed for ${symbol} ${timeframe} limit=${limit}: ${diagnostics.join(' | ')}`)
    } else if (providersUsed.length === 1) {
      console.log(`${TAG} ✅ Final: ${displayName(providersUsed[0])}`)
      console.log(`${TAG}    ${symbol} ${timeframe} → ${result.length}/${limit}`)
    } else {
      console.log(`${TAG} ✅ Final merged result`)
      for (const pName of providersUsed) {
        const count = providerCandleCounts.get(pName) ?? 0
        console.log(`${TAG}    ${displayName(pName)} → ${count}/${limit}`)
      }
      console.log(`${TAG}    Final → ${result.length}/${limit}`)
    }

    return { data: result, provider: providerLabel, diagnostics }
  })
}

export async function fetchQuote(symbol: string): Promise<{ data: QuoteData; provider: string } | null> {
  const cacheKey = makeQuoteKey(symbol)
  const cached = cacheGet<QuoteData>(cacheKey)
  if (cached) {
    metrics.cache.hits++
    return { data: cached, provider: 'cache' }
  }
  metrics.cache.misses++

  return coalesceRequest(cacheKey, async () => {
    for (const provider of sortedProviders) {
      const cfg = PROVIDER_CONFIG[provider.name]
      if (!cfg?.enabled) continue
      if (cfg.envKey && !hasRequiredKey(provider.name)) continue
      const failureReason = getProviderFailureReason(provider.name)
      if (failureReason) continue

      const start = Date.now()
      try {
        const quote = await provider.fetchQuote(symbol)
        const latency = Date.now() - start

        if (quote) {
          recordProviderRequest(provider.name, latency, true)
          recordSuccess(provider.name)
          metrics.requests.providerCalls++
          cacheSet(cacheKey, quote)
          return { data: quote, provider: provider.name }
        } else {
          recordProviderRequest(provider.name, latency, false)
          recordFailure(provider.name)
        }
      } catch (err) {
        const latency = Date.now() - start
        recordProviderRequest(provider.name, latency, false)

        if (err instanceof EntitlementDeniedError) {
          recordEntitlementDenied(provider.name)
        } else if (err instanceof RateLimitExceededError) {
          recordRateLimited(provider.name)
        } else {
          recordFailure(provider.name)
        }
      }
    }
    return null
  })
}

export async function fetchSnapshot(
  symbols: string[]
): Promise<{ data: Record<string, QuoteData>; providers: Record<string, string> }> {
  const result: { data: Record<string, QuoteData>; providers: Record<string, string> } = {
    data: {},
    providers: {},
  }

  const results = await Promise.allSettled(
    symbols.map(async (symbol) => {
      const r = await fetchQuote(symbol)
      return { symbol, result: r }
    })
  )

  for (const settled of results) {
    if (settled.status === 'fulfilled' && settled.value.result) {
      const { symbol, result: r } = settled.value
      result.data[symbol] = r.data
      result.providers[symbol] = r.provider
    }
  }

  return result
}

export function getProviderHealth() {
  const result: Record<string, any> = {}
  health.forEach((h, name) => {
    result[name] = {
      failures: h.failures,
      lastFailureTime: h.lastFailureTime,
      cooldownUntil: h.cooldownUntil,
      isAvailable: h.isAvailable,
      entitlementDenied: h.entitlementDenied,
      rateLimited: h.rateLimited,
    }
  })
  return result
}

export function getProviderRegistry() {
  return sortedProviders.map(p => {
    const cfg = PROVIDER_CONFIG[p.name]
    const envKey = cfg?.envKey ?? null
    const hasKey = envKey ? !!process.env[envKey] : false
    return {
      name: p.name,
      enabled: cfg?.enabled ?? false,
      priority: cfg?.priority ?? 99,
      assetClass: cfg?.assetClass ?? 'forex',
      envKey,
      hasKey,
      needsKey: !!envKey,
      isAvailable: isProviderAvailable(p.name),
      adapter: p,
    }
  })
}

export function getActiveProviders(): ServerCandleProvider[] {
  return sortedProviders.filter(p => {
    const cfg = PROVIDER_CONFIG[p.name]
    if (!cfg?.enabled) return false
    if (cfg.envKey && !hasRequiredKey(p.name)) return false
    if (!isProviderAvailable(p.name)) return false
    return true
  })
}
