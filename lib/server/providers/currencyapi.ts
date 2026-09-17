import { MarketCandle, QuoteData, Timeframe, ServerCandleProvider } from './types'

const CURRENCYAPI_KEY = process.env.CURRENCYAPI_API_KEY
const BASE_URL = 'https://api.currencyapi.com'

async function fetchWithTimeout(url: string, timeoutMs = 10000): Promise<Response> {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), timeoutMs)
  try {
    return await fetch(url, { signal: controller.signal })
  } finally {
    clearTimeout(timer)
  }
}

export class ServerCurrencyAPIAdapter implements ServerCandleProvider {
  name = 'currencyapi'
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
    if (!CURRENCYAPI_KEY) return null
    if (!this.isSupported(symbol)) return null

    try {
      const [base, quote] = symbol.split('/').map(s => s.toUpperCase())

      const response = await fetchWithTimeout(
        `${BASE_URL}/v3/latest?base_currency=${base}&currencies=${quote}`,
        { headers: { apikey: CURRENCYAPI_KEY } } as any
      )
      const data = await response.json()

      if (!response.ok || !data?.data?.[quote]) return null

      const rate = Number(data.data[quote].value)
      if (!rate || rate <= 0) return null

      return {
        price: rate,
        change: 0,
        changePercent: 0,
        bid: rate,
        ask: rate,
        dayHigh: rate,
        dayLow: rate,
      }
    } catch {
      return null
    }
  }
}
