import { MarketCandle, QuoteData, Timeframe, ServerCandleProvider, normalizeTimeframe } from './types'

const TWELVE_KEY = process.env.TWELVE_DATA_API_KEY
const TWELVE_INTERVAL = 12000
let lastTwelveTime = 0

async function throttledFetch(url: string): Promise<Response> {
  const now = Date.now()
  const wait = TWELVE_INTERVAL - (now - lastTwelveTime)
  if (wait > 0) await new Promise(r => setTimeout(r, wait))
  lastTwelveTime = Date.now()
  return fetch(url)
}

export class ServerTwelveDataAdapter implements ServerCandleProvider {
  name = 'twelveData'
  supportsCandles = true

  isSupported(symbol: string): boolean {
    return symbol.includes('/')
  }

  async fetchCandles(symbol: string, timeframe: Timeframe, limit: number): Promise<MarketCandle[] | null> {
    if (!TWELVE_KEY) return null
    if (!this.isSupported(symbol)) return null

    const TAG = '[TwelveData]'
    const interval = normalizeTimeframe(timeframe)
    const params = new URLSearchParams({
      symbol,
      interval,
      outputsize: String(limit),
      apikey: TWELVE_KEY,
    })
    const url = `https://api.twelvedata.com/time_series?${params.toString()}`

    console.log(`${TAG} Request: symbol=${symbol} interval=${interval} limit=${limit}`)

    try {
      const response = await throttledFetch(url)
      const text = await response.text()

      console.log(`${TAG} HTTP ${response.status} for ${symbol} ${timeframe}`)

      let data: any
      try {
        data = JSON.parse(text)
      } catch {
        console.log(`${TAG} Response not JSON: ${text.substring(0, 200)}`)
        return null
      }

      if (!response.ok || data.status === 'error') {
        console.log(`${TAG} API error: ${JSON.stringify(data).substring(0, 300)}`)
        return null
      }
      if (!data.values) {
        console.log(`${TAG} No "values" key in response. Keys: ${Object.keys(data).join(', ')}`)
        return null
      }

      const candles = data.values
        .map((item: any) => ({
          time: new Date(item.datetime).getTime(),
          open: Number(item.open),
          high: Number(item.high),
          low: Number(item.low),
          close: Number(item.close),
          provider: 'twelveData',
        }))
        .sort((a: MarketCandle, b: MarketCandle) => a.time - b.time)

      console.log(`${TAG} Parsed ${candles.length} candles for ${symbol} ${timeframe}`)
      if (candles.length > 0) {
        const first = new Date(candles[0].time).toISOString().split('T')[0]
        const last = new Date(candles[candles.length - 1].time).toISOString().split('T')[0]
        console.log(`${TAG} Range: ${first} → ${last} (${candles.length} candles, requested ${limit})`)
      }

      return candles
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'unknown'
      console.log(`${TAG} Exception for ${symbol} ${timeframe}: ${msg}`)
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
