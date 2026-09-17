import { MarketCandle, QuoteData, Timeframe, ServerCandleProvider } from './types'

const FCS_KEY = process.env.FCS_API_KEY
const FCS_ACCESS_KEY = process.env.FCS_ACCESS_KEY

const FCS_INTERVAL_MAP: Record<string, string> = {
  '1min': '1m',
  '5min': '5m',
  '15min': '15m',
  '30min': '30m',
  '1h': '1h',
  '2h': '2h',
  '4h': '4h',
  '8h': '1D',
  '1day': '1D',
  '1week': '1W',
  '1month': '1M',
}

function toFcsSymbol(symbol: string): string {
  return symbol.replace('/', '')
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

export class ServerFCSAdapter implements ServerCandleProvider {
  name = 'fcs'
  supportsCandles = true

  isSupported(symbol: string): boolean {
    return symbol.includes('/')
  }

  async fetchCandles(symbol: string, timeframe: Timeframe, limit: number): Promise<MarketCandle[] | null> {
    if (!FCS_KEY || !FCS_ACCESS_KEY) return null
    if (!this.isSupported(symbol)) return null

    const interval = FCS_INTERVAL_MAP[timeframe]
    if (!interval) return null

    try {
      const fcsSymbol = toFcsSymbol(symbol)
      const isCrypto = this.isCrypto(symbol)
      const endpoint = isCrypto ? 'crypto' : 'forex'

      const params = new URLSearchParams({
        symbol: fcsSymbol,
        period: interval,
        key: FCS_KEY,
        access_key: FCS_ACCESS_KEY,
      })

      const url = `https://api-v4.fcsapi.com/${endpoint}/history?${params.toString()}`
      const response = await fetchWithTimeout(url)
      const data = await response.json()

      if (!response.ok || !data.status || !data.response) return null

      const entries = Object.values(data.response) as any[]
      if (!entries || entries.length === 0) return null

      return entries
        .map((item: any) => ({
          time: (item.t || 0) * 1000,
          open: Number(item.o),
          high: Number(item.h),
          low: Number(item.l),
          close: Number(item.c),
          volume: Number(item.v || 0),
          provider: 'fcs',
        }))
        .filter((c: MarketCandle) => c.time > 0)
        .sort((a: MarketCandle, b: MarketCandle) => a.time - b.time)
        .slice(-limit)
    } catch (err) {
      if (err instanceof Error && err.name === 'AbortError') {
        console.error(`[fcs] ${symbol}: timeout`)
      }
      return null
    }
  }

  async fetchQuote(symbol: string): Promise<QuoteData | null> {
    if (!FCS_KEY || !FCS_ACCESS_KEY) return null
    if (!this.isSupported(symbol)) return null

    try {
      const fcsSymbol = toFcsSymbol(symbol)
      const isCrypto = this.isCrypto(symbol)
      const endpoint = isCrypto ? 'crypto' : 'forex'

      const params = new URLSearchParams({
        symbol: fcsSymbol,
        key: FCS_KEY,
        access_key: FCS_ACCESS_KEY,
      })

      const url = `https://api-v4.fcsapi.com/${endpoint}/latest?${params.toString()}`
      const response = await fetchWithTimeout(url)
      const data = await response.json()

      if (!response.ok || !data.status || !data.response) return null

      const quote = data.response
      return {
        price: Number(quote.c || 0),
        change: 0,
        changePercent: 0,
        bid: Number(quote.bid || quote.c || 0),
        ask: Number(quote.ask || quote.c || 0),
        dayHigh: Number(quote.high || quote.h || 0),
        dayLow: Number(quote.low || quote.l || 0),
      }
    } catch {
      return null
    }
  }

  private isCrypto(symbol: string): boolean {
    const base = symbol.split('/')[0].toUpperCase()
    const cryptoBases = ['BTC', 'ETH', 'SOL', 'DOGE', 'XRP', 'ADA', 'DOT', 'AVAX', 'MATIC', 'LTC', 'LINK', 'UNI', 'ATOM']
    return cryptoBases.includes(base)
  }
}
