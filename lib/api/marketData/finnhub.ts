import { CandleProvider, MarketCandle, QuoteData, Timeframe } from './providers'
import { RESOLUTION_MAP, toFinnhubSymbol, normalizeTimeframe } from './types'

const FINNHUB_KEY = process.env.EXPO_PUBLIC_FINNHUB_API_KEY
const FINNHUB_INTERVAL = 1000
let lastFinnhubTime = 0

async function throttledFetch(url: string): Promise<Response> {
  const now = Date.now()
  const wait = FINNHUB_INTERVAL - (now - lastFinnhubTime)
  if (wait > 0) await new Promise(r => setTimeout(r, wait))
  lastFinnhubTime = Date.now()
  return fetch(url)
}

function getCandleTimeRange(interval: string, outputsize: number): { from: number; to: number } {
  const to = Math.floor(Date.now() / 1000)
  const res = RESOLUTION_MAP[interval] || 'D'
  const secondsPerCandleMap: Record<string, number> = {
    '1': 60, '5': 300, '15': 900, '30': 1800,
    '60': 3600, '240': 14400, 'D': 86400, 'W': 604800, 'M': 2592000,
  }
  const secondsPerCandle = secondsPerCandleMap[res] || 86400
  const from = to - (secondsPerCandle * outputsize)
  return { from, to }
}

export class FinnhubAdapter implements CandleProvider {
  name = 'finnhub'
  priority = 1

  convertSymbol(symbol: string): string {
    return toFinnhubSymbol(symbol)
  }

  isSupported(symbol: string): boolean {
    return symbol.includes('/')
  }

  async fetchCandles(symbol: string, timeframe: Timeframe, limit: number): Promise<MarketCandle[] | null> {
    if (!FINNHUB_KEY) return null
    if (!this.isSupported(symbol)) return null

    try {
      const finnhubSymbol = this.convertSymbol(symbol)
      const resolution = RESOLUTION_MAP[timeframe] || 'D'
      const { from, to } = getCandleTimeRange(timeframe, limit)
      const params = new URLSearchParams({
        symbol: finnhubSymbol,
        resolution,
        from: String(from),
        to: String(to),
        token: FINNHUB_KEY,
      })
      const url = `https://finnhub.io/api/v1/forex/candle?${params.toString()}`
      const response = await throttledFetch(url)
      const data = await response.json()

      if (data.s === 'no_data' || !data.t || data.t.length === 0) return null
      if (!response.ok || data.error) return null

      return data.t.map((timestamp: number, i: number) => ({
        time: timestamp * 1000,
        open: Number(data.o[i]),
        high: Number(data.h[i]),
        low: Number(data.l[i]),
        close: Number(data.c[i]),
        provider: 'finnhub',
      })).sort((a: MarketCandle, b: MarketCandle) => a.time - b.time)
    } catch {
      return null
    }
  }

  async fetchQuote(symbol: string): Promise<QuoteData | null> {
    if (!FINNHUB_KEY) return null
    try {
      const finnhubSymbol = this.convertSymbol(symbol)
      const params = new URLSearchParams({ symbol: finnhubSymbol, token: FINNHUB_KEY })
      const url = `https://finnhub.io/api/v1/quote?${params.toString()}`
      const response = await throttledFetch(url)
      const data = await response.json()
      if (!response.ok || data.error || !data.c) return null
      return {
        price: Number(data.c || 0),
        change: Number(data.d || 0),
        changePercent: Number(data.dp || 0),
        bid: Number(data.c || 0),
        ask: Number(data.c || 0),
        dayHigh: Number(data.h || 0),
        dayLow: Number(data.l || 0),
      }
    } catch {
      return null
    }
  }
}
