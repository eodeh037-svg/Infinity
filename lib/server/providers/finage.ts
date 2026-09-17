import { MarketCandle, QuoteData, Timeframe, ServerCandleProvider } from './types'

const FINAGE_KEY = process.env.FINAGE_API_KEY

const FINAGE_TIME_MAP: Record<string, { multiply: number; time: string }> = {
  '1min': { multiply: 1, time: 'minute' },
  '5min': { multiply: 5, time: 'minute' },
  '15min': { multiply: 15, time: 'minute' },
  '30min': { multiply: 30, time: 'minute' },
  '1h': { multiply: 1, time: 'hour' },
  '2h': { multiply: 2, time: 'hour' },
  '4h': { multiply: 4, time: 'hour' },
  '8h': { multiply: 8, time: 'hour' },
  '1day': { multiply: 1, time: 'day' },
  '1week': { multiply: 1, time: 'week' },
  '1month': { multiply: 1, time: 'month' },
}

function toFinageSymbol(symbol: string): string {
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

export class ServerFinageAdapter implements ServerCandleProvider {
  name = 'finage'
  supportsCandles = true

  isSupported(symbol: string): boolean {
    return symbol.includes('/')
  }

  async fetchCandles(symbol: string, timeframe: Timeframe, limit: number): Promise<MarketCandle[] | null> {
    if (!FINAGE_KEY) return null
    if (!this.isSupported(symbol)) return null

    const tf = FINAGE_TIME_MAP[timeframe]
    if (!tf) return null

    try {
      const finageSymbol = toFinageSymbol(symbol)
      const isCrypto = this.isCrypto(symbol)
      const baseUrl = isCrypto ? 'https://api.finage.co.uk/agg/crypto' : 'https://api.finage.co.uk/agg/forex'

      const now = new Date()
      const secondsPerCandle = this.getSecondsPerCandle(timeframe)
      const fromDate = new Date(now.getTime() - limit * secondsPerCandle * 1000)
      const fromStr = fromDate.toISOString().split('T')[0]
      const toStr = now.toISOString().split('T')[0]

      const url = `${baseUrl}/${finageSymbol}/${tf.multiply}/${tf.time}/${fromStr}/${toStr}?apikey=${FINAGE_KEY}`
      const response = await fetchWithTimeout(url)
      const data = await response.json()

      if (!response.ok || !data.results || data.results.length === 0) return null

      return data.results
        .map((item: any) => ({
          time: item.t,
          open: Number(item.o),
          high: Number(item.h),
          low: Number(item.l),
          close: Number(item.c),
          volume: Number(item.v || 0),
          provider: 'finage',
        }))
        .sort((a: MarketCandle, b: MarketCandle) => a.time - b.time)
        .slice(-limit)
    } catch (err) {
      if (err instanceof Error && err.name === 'AbortError') {
        console.error(`[finage] ${symbol}: timeout`)
      }
      return null
    }
  }

  async fetchQuote(symbol: string): Promise<QuoteData | null> {
    if (!FINAGE_KEY) return null
    if (!this.isSupported(symbol)) return null

    try {
      const finageSymbol = toFinageSymbol(symbol)
      const isCrypto = this.isCrypto(symbol)
      const endpoint = isCrypto ? 'crypto' : 'forex'
      const url = `https://api.finage.co.uk/last/${endpoint}/${finageSymbol}?apikey=${FINAGE_KEY}`
      const response = await fetchWithTimeout(url)
      const data = await response.json()

      if (!response.ok || !data.last) return null

      return {
        price: Number(data.last.price || 0),
        change: Number(data.last.change || 0),
        changePercent: Number(data.last.changePercent || 0),
        bid: Number(data.last.bid || 0),
        ask: Number(data.last.ask || 0),
        dayHigh: Number(data.last.high || 0),
        dayLow: Number(data.last.low || 0),
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

  private getSecondsPerCandle(timeframe: Timeframe): number {
    const map: Record<string, number> = {
      '1min': 60, '5min': 300, '15min': 900, '30min': 1800,
      '1h': 3600, '2h': 7200, '4h': 14400, '8h': 28800,
      '1day': 86400, '1week': 604800, '1month': 2592000,
    }
    return map[timeframe] || 86400
  }
}
