import { MarketCandle, QuoteData, Timeframe, ServerCandleProvider } from './types'

const TIINGO_KEY = process.env.TIINGO_API_KEY

const TIINGO_INTERVAL_MAP: Record<string, string> = {
  '1min': '1min',
  '5min': '5min',
  '15min': '15min',
  '1h': '1hour',
  '4h': '1hour',
  '1day': '1day',
  '1week': 'daily',
  '1month': 'daily',
}

function toTiingoSymbol(symbol: string): string {
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

export class ServerTiingoAdapter implements ServerCandleProvider {
  name = 'tiingo'
  supportsCandles = true

  isSupported(symbol: string): boolean {
    return symbol.includes('/')
  }

  async fetchCandles(symbol: string, timeframe: Timeframe, limit: number): Promise<MarketCandle[] | null> {
    if (!TIINGO_KEY) return null
    if (!this.isSupported(symbol)) return null

    const interval = TIINGO_INTERVAL_MAP[timeframe]
    if (!interval) return null

    try {
      const tiingoSymbol = toTiingoSymbol(symbol)
      const isCrypto = this.isCrypto(symbol)
      const baseUrl = isCrypto
        ? 'https://api.tiingo.com/tiingo/crypto/prices'
        : 'https://api.tiingo.com/tiingo/fx/prices'

      const now = new Date()
      const secondsPerCandle = this.getSecondsPerCandle(timeframe)
      const startDate = new Date(now.getTime() - limit * secondsPerCandle * 1000)
      const startDateStr = startDate.toISOString().split('T')[0]

      const params = new URLSearchParams({
        tickers: tiingoSymbol,
        startDate: startDateStr,
        resampleFreq: interval,
        token: TIINGO_KEY,
      })

      const url = `${baseUrl}?${params.toString()}`
      const response = await fetchWithTimeout(url)
      const data = await response.json()

      if (!response.ok || !Array.isArray(data) || data.length === 0) return null

      const tickerData = data.find((d: any) => d.ticker?.toLowerCase() === tiingoSymbol.toLowerCase())
      if (!tickerData) return null

      const candles = tickerData.priceData || data
      if (!Array.isArray(candles) || candles.length === 0) return null

      return candles
        .map((item: any) => ({
          time: new Date(item.date).getTime(),
          open: Number(item.open),
          high: Number(item.high),
          low: Number(item.low),
          close: Number(item.close),
          volume: Number(item.volume || 0),
          provider: 'tiingo',
        }))
        .sort((a: MarketCandle, b: MarketCandle) => a.time - b.time)
        .slice(-limit)
    } catch (err) {
      if (err instanceof Error && err.name === 'AbortError') {
        console.error(`[tiingo] ${symbol}: timeout`)
      }
      return null
    }
  }

  async fetchQuote(symbol: string): Promise<QuoteData | null> {
    if (!TIINGO_KEY) return null
    if (!this.isSupported(symbol)) return null

    try {
      const tiingoSymbol = toTiingoSymbol(symbol)
      const isCrypto = this.isCrypto(symbol)
      const topUrl = isCrypto
        ? `https://api.tiingo.com/tiingo/crypto/top?tickers=${tiingoSymbol}&token=${TIINGO_KEY}`
        : `https://api.tiingo.com/tiingo/fx/${tiingoSymbol}/top?token=${TIINGO_KEY}`

      const response = await fetchWithTimeout(topUrl)
      const data = await response.json()

      if (!response.ok) return null

      if (isCrypto) {
        const top = Array.isArray(data) ? data[0] : data
        if (!top?.bid) return null
        return {
          price: Number(top.mid || 0),
          change: 0,
          changePercent: 0,
          bid: Number(top.bid || 0),
          ask: Number(top.ask || 0),
          dayHigh: Number(top.bid || 0),
          dayLow: Number(top.bid || 0),
        }
      }

      if (!data?.bid) return null
      return {
        price: Number(data.mid || 0),
        change: 0,
        changePercent: 0,
        bid: Number(data.bid || 0),
        ask: Number(data.ask || 0),
        dayHigh: Number(data.bid || 0),
        dayLow: Number(data.bid || 0),
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
