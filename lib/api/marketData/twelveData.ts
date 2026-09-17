import { CandleProvider, MarketCandle, QuoteData, Timeframe } from './providers'
import { normalizeTimeframe } from './types'

const TWELVE_KEY = process.env.EXPO_PUBLIC_TWELVE_DATA_API_KEY
const TWELVE_INTERVAL = 12000
let lastTwelveTime = 0

async function throttledFetch(url: string): Promise<Response> {
  const now = Date.now()
  const wait = TWELVE_INTERVAL - (now - lastTwelveTime)
  if (wait > 0) await new Promise(r => setTimeout(r, wait))
  lastTwelveTime = Date.now()
  return fetch(url)
}

export class TwelveDataAdapter implements CandleProvider {
  name = 'twelveData'
  priority = 2

  convertSymbol(symbol: string): string {
    return symbol
  }

  isSupported(symbol: string): boolean {
    return symbol.includes('/')
  }

  async fetchCandles(symbol: string, timeframe: Timeframe, limit: number): Promise<MarketCandle[] | null> {
    if (!TWELVE_KEY) return null
    if (!this.isSupported(symbol)) return null

    try {
      const interval = normalizeTimeframe(timeframe)
      const params = new URLSearchParams({
        symbol,
        interval,
        outputsize: String(limit),
        apikey: TWELVE_KEY,
      })
      const url = `https://api.twelvedata.com/time_series?${params.toString()}`
      const response = await throttledFetch(url)
      const data = await response.json()

      if (!response.ok || data.status === 'error') return null
      if (!data.values) return null

      return data.values
        .map((item: any) => ({
          time: new Date(item.datetime).getTime(),
          open: Number(item.open),
          high: Number(item.high),
          low: Number(item.low),
          close: Number(item.close),
          provider: 'twelveData',
        }))
        .sort((a: MarketCandle, b: MarketCandle) => a.time - b.time)
    } catch {
      return null
    }
  }

  async fetchQuote(symbol: string): Promise<QuoteData | null> {
    if (!TWELVE_KEY) return null
    try {
      const params = new URLSearchParams({ symbol, apikey: TWELVE_KEY })
      const url = `https://api.twelvedata.com/quote?${params.toString()}`
      const response = await throttledFetch(url)
      const data = await response.json()
      if (!response.ok || data.status === 'error') return null
      return {
        price: Number(data.close || data.previous_close || 0),
        change: Number(data.change || 0),
        changePercent: Number(data.percent_change || 0),
        bid: Number(data.bid || 0),
        ask: Number(data.ask || 0),
        dayHigh: Number(data.high || 0),
        dayLow: Number(data.low || 0),
      }
    } catch {
      return null
    }
  }
}
