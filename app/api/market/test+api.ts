import { getProviderRegistry, getProviderHealth } from '../../../lib/server/providerRouter'
import { Timeframe } from '../../../lib/server/providers/types'
import { EntitlementDeniedError, RateLimitExceededError } from '../../../lib/server/providers/errors'

interface ProviderResult {
  name: string
  enabled: boolean
  priority: number
  assetClass: string
  hasKey: boolean
  needsKey: boolean
  supported: boolean
  testSymbol: string
  candles: number
  requested: number
  status: 'success' | 'partial' | 'failed' | 'unsupported' | 'disabled' | 'missing_credentials' | 'rate_limited' | 'entitlement_denied'
  latency: number
  error: string | null
  rawResponse?: string
}

export async function GET(request: Request): Promise<Response> {
  const url = new URL(request.url)
  const limit = parseInt(url.searchParams.get('limit') || '50', 10)

  const registry = getProviderRegistry()
  const providerHealth = getProviderHealth()
  const results: ProviderResult[] = []

  for (const entry of registry) {
    const needsKey = entry.needsKey
    const health = providerHealth[entry.name]

    if (!entry.enabled) {
      results.push({
        name: entry.name, enabled: false, priority: entry.priority, assetClass: entry.assetClass,
        hasKey: entry.hasKey, needsKey, supported: false, testSymbol: '', candles: 0, requested: 0,
        status: 'disabled', latency: 0, error: 'provider disabled',
      })
      continue
    }

    if (needsKey && !entry.hasKey) {
      const testSymbol = entry.assetClass === 'crypto' ? 'BTC/USD' : 'EUR/USD'
      results.push({
        name: entry.name, enabled: true, priority: entry.priority, assetClass: entry.assetClass,
        hasKey: false, needsKey: true, supported: true, testSymbol, candles: 0, requested: 0,
        status: 'missing_credentials', latency: 0, error: `missing ${entry.envKey}`,
      })
      continue
    }

    if (health?.entitlementDenied) {
      const testSymbol = entry.assetClass === 'crypto' ? 'BTC/USD' : 'EUR/USD'
      results.push({
        name: entry.name, enabled: true, priority: entry.priority, assetClass: entry.assetClass,
        hasKey: entry.hasKey, needsKey, supported: true, testSymbol, candles: 0, requested: 0,
        status: 'entitlement_denied', latency: 0,
        error: 'account does not have access to this resource',
      })
      continue
    }

    if (health?.rateLimited) {
      const testSymbol = entry.assetClass === 'crypto' ? 'BTC/USD' : 'EUR/USD'
      results.push({
        name: entry.name, enabled: true, priority: entry.priority, assetClass: entry.assetClass,
        hasKey: entry.hasKey, needsKey, supported: true, testSymbol, candles: 0, requested: 0,
        status: 'rate_limited', latency: 0,
        error: 'daily rate limit reached - cooldown active',
      })
      continue
    }

    const testSymbol = entry.assetClass === 'crypto' ? 'BTC/USD' : 'EUR/USD'

    if (!entry.adapter.isSupported(testSymbol)) {
      results.push({
        name: entry.name, enabled: true, priority: entry.priority, assetClass: entry.assetClass,
        hasKey: entry.hasKey, needsKey, supported: false, testSymbol, candles: 0, requested: 0,
        status: 'unsupported', latency: 0, error: `provider does not support ${testSymbol}`,
      })
      continue
    }

    if (!entry.adapter.supportsCandles) {
      results.push({
        name: entry.name, enabled: true, priority: entry.priority, assetClass: entry.assetClass,
        hasKey: entry.hasKey, needsKey, supported: true, testSymbol, candles: 0, requested: 0,
        status: 'unsupported', latency: 0, error: 'OHLC candles unsupported on current plan',
      })
      continue
    }

    const originalFetch = globalThis.fetch
    let capturedBody = ''

    globalThis.fetch = async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
      const response = await originalFetch(input, init)
      const clone = response.clone()
      try {
        const text = await clone.text()
        capturedBody = text.substring(0, 500)
      } catch {}
      return response
    }

    const start = Date.now()
    try {
      const candles = await entry.adapter.fetchCandles(testSymbol, '1day' as Timeframe, limit)
      const latency = Date.now() - start
      const count = candles?.length || 0

      let status: ProviderResult['status'] = 'failed'
      let error: string | null = null

      if (count === 0) {
        if (capturedBody.includes("don't have access") || capturedBody.includes('entitlement')) {
          status = 'entitlement_denied'
          error = 'endpoint requires paid subscription'
        } else if (capturedBody.includes('rate limit') || capturedBody.includes('25 requests') || capturedBody.includes('Note') || capturedBody.includes('Information')) {
          status = 'rate_limited'
          error = 'daily rate limit reached'
        } else if (capturedBody.includes('Legacy Endpoint')) {
          error = 'deprecated endpoint'
        } else if (capturedBody.includes('no_data')) {
          error = 'provider returned no_data'
        } else if (latency > 4000) {
          status = 'failed'
          error = 'timeout'
        } else if (capturedBody.includes('"error"')) {
          error = capturedBody.substring(0, 200)
        } else {
          error = 'returned 0 candles'
        }
      } else if (count < limit) {
        status = 'partial'
      } else {
        status = 'success'
      }

      results.push({
        name: entry.name, enabled: true, priority: entry.priority, assetClass: entry.assetClass,
        hasKey: entry.hasKey, needsKey, supported: true, testSymbol, candles: count, requested: limit,
        status, latency, error, rawResponse: count === 0 ? capturedBody : undefined,
      })
    } catch (err) {
      const latency = Date.now() - start
      let status: ProviderResult['status'] = 'failed'
      let error: string | null = null

      if (err instanceof EntitlementDeniedError) {
        status = 'entitlement_denied'
        error = 'account does not have access to this resource'
      } else if (err instanceof RateLimitExceededError) {
        status = 'rate_limited'
        error = 'daily rate limit reached'
      } else {
        error = err instanceof Error ? err.message : 'unknown error'
      }

      results.push({
        name: entry.name, enabled: true, priority: entry.priority, assetClass: entry.assetClass,
        hasKey: entry.hasKey, needsKey, supported: true, testSymbol, candles: 0, requested: limit,
        status, latency, error,
      })
    } finally {
      globalThis.fetch = originalFetch
    }
  }

  return Response.json({
    totalProviders: results.length,
    summary: {
      success: results.filter(r => r.status === 'success').length,
      partial: results.filter(r => r.status === 'partial').length,
      failed: results.filter(r => r.status === 'failed').length,
      unsupported: results.filter(r => r.status === 'unsupported').length,
      disabled: results.filter(r => r.status === 'disabled').length,
      missing_credentials: results.filter(r => r.status === 'missing_credentials').length,
      rate_limited: results.filter(r => r.status === 'rate_limited').length,
      entitlement_denied: results.filter(r => r.status === 'entitlement_denied').length,
    },
    providers: results,
    env: {
      FINNHUB_API_KEY: !!process.env.FINNHUB_API_KEY,
      TWELVE_DATA_API_KEY: !!process.env.TWELVE_DATA_API_KEY,
      FMP_API_KEY: !!process.env.FMP_API_KEY,
      ALPHA_VANTAGE_API_KEY: !!process.env.ALPHA_VANTAGE_API_KEY,
      TIINGO_API_KEY: !!process.env.TIINGO_API_KEY,
      EODHD_API_KEY: !!process.env.EODHD_API_KEY,
      FCS_API_KEY: !!process.env.FCS_API_KEY,
      FINAGE_API_KEY: !!process.env.FINAGE_API_KEY,
      COINGECKO_API_KEY: !!process.env.COINGECKO_API_KEY,
      CRYPTOCOMPARE_API_KEY: !!process.env.CRYPTOCOMPARE_API_KEY,
    },
    timestamp: Date.now(),
  })
}
