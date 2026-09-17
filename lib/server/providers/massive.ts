import { MarketCandle, QuoteData, Timeframe, ServerCandleProvider } from './types'

const MASSIVE_KEY = process.env.MASSIVE_API_KEY
const BASE_URL = 'https://api.massive.com'

const MASSIVE_TIMESPAN_MAP: Record<string, { multiplier: number; timespan: string } | null> = {
  '1min': { multiplier: 1, timespan: 'minute' },
  '5min': { multiplier: 5, timespan: 'minute' },
  '15min': { multiplier: 15, timespan: 'minute' },
  '30min': { multiplier: 30, timespan: 'minute' },
  '1h': { multiplier: 60, timespan: 'minute' },
  '1day': { multiplier: 1, timespan: 'day' },
  '1week': null,
  '1month': null,
}

function toMassiveTicker(symbol: string): string {
  const pair = symbol.replace('/', '').toUpperCase()
  return `C:${pair}`
}

function getSecondsPerCandle(timeframe: Timeframe): number {
  const map: Record<string, number> = {
    '1min': 60, '5min': 300, '15min': 900, '30min': 1800,
    '1h': 3600, '1day': 86400, '1week': 604800, '1month': 2592000,
  }
  return map[timeframe] || 86400
}

async function fetchWithTimeout(url: string, timeoutMs = 10000): Promise<Response> {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), timeoutMs)
  try {
    return await fetch(url, { signal: controller.signal })
  } finally {
    clearTimeout(timer)
  }
}

export class ServerMassiveAdapter implements ServerCandleProvider {
  name = 'massive'
  supportsCandles = true

  isSupported(symbol: string): boolean {
    if (!symbol.includes('/')) return false
    const tf = MASSIVE_TIMESPAN_MAP['1day']
    return tf !== null && tf !== undefined
  }

  isTimeframeSupported(timeframe: Timeframe): boolean {
    return MASSIVE_TIMESPAN_MAP[timeframe] !== null && MASSIVE_TIMESPAN_MAP[timeframe] !== undefined
  }

  async fetchCandles(symbol: string, timeframe: Timeframe, limit: number): Promise<MarketCandle[] | null> {
    if (!MASSIVE_KEY) return null
    if (!this.isSupported(symbol)) return null

    const tfConfig = MASSIVE_TIMESPAN_MAP[timeframe]
    if (!tfConfig) return null

    try {
      const ticker = toMassiveTicker(symbol)
      const secondsPerCandle = getSecondsPerCandle(timeframe)
      const now = Date.now()
      const fromDate = new Date(now - limit * secondsPerCandle * 1000)
      const fromStr = fromDate.toISOString().split('T')[0]
      const toStr = new Date(now).toISOString().split('T')[0]

      const params = new URLSearchParams({
        adjusted: 'true',
        sort: 'asc',
        limit: String(Math.min(limit, 50000)),
        apiKey: MASSIVE_KEY,
      })

      const url = `${BASE_URL}/v2/aggs/ticker/${ticker}/range/${tfConfig.multiplier}/${tfConfig.timespan}/${fromStr}/${toStr}?${params.toString()}`
      const response = await fetchWithTimeout(url)
      const data = await response.json()

      if (!response.ok || data.status === 'ERROR' || !data.results || !Array.isArray(data.results)) {
        return null
      }

      return data.results
        .map((r: any) => ({
          time: Number(r.t),
          open: Number(r.o),
          high: Number(r.h),
          low: Number(r.l),
          close: Number(r.c),
          volume: Number(r.v || 0),
          provider: 'massive',
        }))
        .sort((a: MarketCandle, b: MarketCandle) => a.time - b.time)
        .slice(-limit)
    } catch (err) {
      if (err instanceof Error && err.name === 'AbortError') {
        console.error(`[massive] ${symbol}: timeout`)
      }
      return null
    }
  }

  async fetchQuote(symbol: string): Promise<QuoteData | null> {
    if (!MASSIVE_KEY) return null
    if (!this.isSupported(symbol)) return null

    try {
      const ticker = toMassiveTicker(symbol)
      const url = `${BASE_URL}/v2/aggs/ticker/${ticker}/prev?apiKey=${MASSIVE_KEY}`
      const response = await fetchWithTimeout(url)
      const data = await response.json()

      if (!response.ok || data.status === 'ERROR' || !data.results || data.results.length === 0) {
        return null
      }

      const r = data.results[0]
      return {
        price: Number(r.c),
        change: Number(r.c) - Number(r.o),
        changePercent: ((Number(r.c) - Number(r.o)) / Number(r.o)) * 100,
        bid: Number(r.c),
        ask: Number(r.c),
        dayHigh: Number(r.h),
        dayLow: Number(r.l),
      }
    } catch {
      return null
    }
  }
}
