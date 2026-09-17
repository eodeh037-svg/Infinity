import { MarketCandle, QuoteData, Timeframe, ServerCandleProvider } from './types'

const BIQUOTE_BASE = 'https://biquote.io/api'

const BIQUOTE_INTERVAL_MAP: Record<string, string> = {
  '1min': '1m',
  '5min': '5m',
  '15min': '15m',
  '30min': '30m',
  '1h': '1h',
  '4h': '4h',
  '1day': '1d',
}

export class ServerBiQuoteAdapter implements ServerCandleProvider {
  name = 'biquote'
  supportsCandles = true

  isSupported(symbol: string): boolean {
    return symbol.includes('/')
  }

  async fetchCandles(symbol: string, timeframe: Timeframe, limit: number): Promise<MarketCandle[] | null> {
    if (!this.isSupported(symbol)) return null

    const interval = BIQUOTE_INTERVAL_MAP[timeframe]
    if (!interval) return null

    try {
      const biSymbol = symbol.replace('/', '')
      const params = new URLSearchParams({ interval, limit: String(Math.min(limit, 1000)) })
      const url = `${BIQUOTE_BASE}/${biSymbol}/ohlc?${params.toString()}`
      const response = await fetch(url)
      const data = await response.json()

      if (!response.ok || !data.bars || data.bars.length === 0) return null

      return data.bars
        .map((bar: any) => ({
          time: new Date(bar.openTime).getTime(),
          open: Number(bar.open),
          high: Number(bar.high),
          low: Number(bar.low),
          close: Number(bar.close),
          volume: Number(bar.tickVolume || 0),
          provider: 'biquote',
        }))
        .sort((a: MarketCandle, b: MarketCandle) => a.time - b.time)
        .slice(-limit)
    } catch {
      return null
    }
  }

  async fetchQuote(symbol: string): Promise<QuoteData | null> {
    try {
      const biSymbol = symbol.replace('/', '')
      const url = `${BIQUOTE_BASE}/${biSymbol}`
      const response = await fetch(url)
      const data = await response.json()

      if (!response.ok || !data.bid) return null

      return {
        price: Number(data.mid || 0),
        change: Number(data.dayDiffPercent || 0),
        changePercent: Number(data.dayDiffPercent || 0),
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
