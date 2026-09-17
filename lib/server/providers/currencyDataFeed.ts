import { MarketCandle, QuoteData, Timeframe, ServerCandleProvider } from './types'

const CDF_KEY = process.env.CURRENCY_DATA_FEED_API_KEY
const BASE_URL = 'https://currencydatafeed.com/api/v2'

async function fetchWithTimeout(url: string, timeoutMs = 10000): Promise<Response> {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), timeoutMs)
  try {
    return await fetch(url, { signal: controller.signal })
  } finally {
    clearTimeout(timer)
  }
}

export class ServerCurrencyDataFeedAdapter implements ServerCandleProvider {
  name = 'currencyDataFeed'
  supportsCandles = false

  isSupported(symbol: string): boolean {
    if (!symbol.includes('/')) return false
    const parts = symbol.split('/')
    return parts.length === 2 && parts[0].length === 3 && parts[1].length === 3
  }

  async fetchCandles(_symbol: string, _timeframe: Timeframe, _limit: number): Promise<MarketCandle[] | null> {
    return null
  }

  async fetchQuote(symbol: string): Promise<QuoteData | null> {
    if (!CDF_KEY) return null
    if (!this.isSupported(symbol)) return null

    try {
      const pair = symbol.replace('/', '')
      const url = `${BASE_URL}/live-rates?token=${CDF_KEY}&symbol=${pair}`
      const response = await fetchWithTimeout(url)
      const data = await response.json()

      if (!response.ok || !data?.success || !data?.data) return null

      const rate = Number(data.data.price || data.data.rate)
      if (!rate || rate <= 0) return null

      return {
        price: rate,
        change: Number(data.data.change || 0),
        changePercent: Number(data.data.change_percent || 0),
        bid: Number(data.data.bid || rate),
        ask: Number(data.data.ask || rate),
        dayHigh: Number(data.data.high || rate),
        dayLow: Number(data.data.low || rate),
      }
    } catch {
      return null
    }
  }
}
