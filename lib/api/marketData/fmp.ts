import { CandleProvider, MarketCandle, QuoteData, Timeframe } from './providers'
import { normalizeTimeframe } from './types'

const FMP_KEY = process.env.EXPO_PUBLIC_FMP_API_KEY

export class FMPAdapter implements CandleProvider {
  name = 'fmp'
  priority = 3

  convertSymbol(symbol: string): string {
    return symbol.replace('/', '')
  }

  isSupported(symbol: string): boolean {
    return symbol.includes('/')
  }

  async fetchCandles(symbol: string, timeframe: Timeframe, limit: number): Promise<MarketCandle[] | null> {
    if (!FMP_KEY) return null
    if (!this.isSupported(symbol)) return null

    try {
      const interval = normalizeTimeframe(timeframe)
      const fmpSymbol = this.convertSymbol(symbol)
      const now = new Date()
      const fromDate = new Date(now.getTime() - limit * 86400000)
      const fromStr = fromDate.toISOString().split('T')[0]
      const toStr = now.toISOString().split('T')[0]

      const params = new URLSearchParams({
        from: fromStr,
        to: toStr,
        apikey: FMP_KEY,
      })
      const url = `https://financialmodelingprep.com/api/v3/historical-price-full/${fmpSymbol}?${params.toString()}`
      const response = await fetch(url)
      const data = await response.json()

      if (!response.ok || data.error) return null
      if (!data?.historical || data.historical.length === 0) return null

      return data.historical
        .map((item: any) => ({
          time: new Date(item.date).getTime(),
          open: Number(item.open),
          high: Number(item.high),
          low: Number(item.low),
          close: Number(item.close),
          provider: 'fmp',
        }))
        .sort((a: MarketCandle, b: MarketCandle) => a.time - b.time)
        .slice(-limit)
    } catch {
      return null
    }
  }

  async fetchQuote(symbol: string): Promise<QuoteData | null> {
    if (!FMP_KEY) return null
    try {
      const fmpSymbol = this.convertSymbol(symbol)
      const url = `https://financialmodelingprep.com/api/v3/quote/${fmpSymbol}?apikey=${FMP_KEY}`
      const response = await fetch(url)
      const data = await response.json()
      if (!response.ok || data.error) return null
      if (!data[0]) return null
      const quote = data[0]
      return {
        price: Number(quote.price || 0),
        change: Number(quote.changes || 0),
        changePercent: Number(quote.changesPercentage || 0),
        bid: Number(quote.bid || 0),
        ask: Number(quote.ask || 0),
        dayHigh: Number(quote.dayHigh || 0),
        dayLow: Number(quote.dayLow || 0),
      }
    } catch {
      return null
    }
  }
}
