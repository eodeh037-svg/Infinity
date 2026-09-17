import { MarketCandle, QuoteData, Timeframe, ServerCandleProvider, normalizeTimeframe } from './types'
import { RateLimitExceededError } from './errors'

const ALPHA_KEY = process.env.ALPHA_VANTAGE_API_KEY

async function fetchWithTimeout(url: string, timeoutMs = 15000): Promise<Response> {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), timeoutMs)
  try {
    return await fetch(url, { signal: controller.signal })
  } finally {
    clearTimeout(timer)
  }
}

export class ServerAlphaVantageAdapter implements ServerCandleProvider {
  name = 'alphaVantage'
  supportsCandles = true

  isSupported(symbol: string): boolean {
    return symbol.includes('/')
  }

  async fetchCandles(symbol: string, timeframe: Timeframe, limit: number): Promise<MarketCandle[] | null> {
    if (!ALPHA_KEY) return null
    if (!this.isSupported(symbol)) return null

    try {
      const interval = normalizeTimeframe(timeframe)
      const parts = symbol.split('/')
      const functionName = this.getFunctionName(interval)
      const intervalParam = this.getIntervalParam(interval)

      const params = new URLSearchParams({
        function: functionName,
        from_symbol: parts[0],
        to_symbol: parts[1],
        interval: intervalParam,
        outputsize: limit <= 100 ? 'compact' : 'full',
        apikey: ALPHA_KEY,
      })
      const url = `https://www.alphavantage.co/query?${params.toString()}`
      const response = await fetchWithTimeout(url)
      const data = await response.json()

      if (data['Note'] || data['Information']) {
        const message = data['Note'] || data['Information']
        throw new RateLimitExceededError('alphaVantage', message)
      }
      if (data.error) return null

      const timeSeriesKey = Object.keys(data).find(k => k.includes('Time Series'))
      if (!timeSeriesKey) return null

      const timeSeries = data[timeSeriesKey]
      const entries = Object.entries(timeSeries).map(([date, vals]: [string, any]) => ({
        time: new Date(date).getTime(),
        open: Number(vals['1. open']),
        high: Number(vals['2. high']),
        low: Number(vals['3. low']),
        close: Number(vals['4. close']),
        provider: 'alphaVantage',
      }))

      return entries
        .sort((a: MarketCandle, b: MarketCandle) => a.time - b.time)
        .slice(-limit)
    } catch (err) {
      if (err instanceof RateLimitExceededError) throw err
      if (err instanceof Error && err.name === 'AbortError') {
        console.error(`[alphaVantage] ${symbol}: timeout`)
      }
      return null
    }
  }

  async fetchQuote(symbol: string): Promise<QuoteData | null> {
    if (!ALPHA_KEY) return null

    try {
      const parts = symbol.split('/')
      const params = new URLSearchParams({
        function: 'CURRENCY_EXCHANGE_RATE',
        from_currency: parts[0],
        to_currency: parts[1],
        apikey: ALPHA_KEY,
      })
      const url = `https://www.alphavantage.co/query?${params.toString()}`
      const response = await fetchWithTimeout(url)
      const data = await response.json()

      if (data['Note'] || data['Information']) {
        const message = data['Note'] || data['Information']
        throw new RateLimitExceededError('alphaVantage', message)
      }
      if (data.error) return null
      const rate = data['Realtime Currency Exchange Rate']
      if (!rate) return null
      return {
        price: Number(rate['5. Exchange Rate']),
        change: Number(rate['9. Change']) || 0,
        changePercent: Number(rate['10. Change Percent']) || 0,
        bid: Number(rate['3. BID']) || 0,
        ask: Number(rate['4. ASK']) || 0,
        dayHigh: Number(rate['8. High Day Rate']) || 0,
        dayLow: Number(rate['7. Low Day Rate']) || 0,
      }
    } catch (err) {
      if (err instanceof RateLimitExceededError) throw err
      return null
    }
  }

  private getFunctionName(interval: string): string {
    switch (interval) {
      case '1min': case '5min': case '15min': case '30min':
      case '1h': case '2h': case '4h': case '8h':
        return 'FX_INTRADAY'
      case '1day': return 'FX_DAILY'
      case '1week': return 'FX_WEEKLY'
      case '1month': return 'FX_MONTHLY'
      default: return 'FX_DAILY'
    }
  }

  private getIntervalParam(interval: string): string {
    switch (interval) {
      case '1min': return '1min'
      case '5min': return '5min'
      case '15min': return '15min'
      case '30min': return '30min'
      case '1h': case '2h': case '4h': case '8h': return '60min'
      case '1day': return 'daily'
      case '1week': return 'weekly'
      case '1month': return 'monthly'
      default: return 'daily'
    }
  }
}
