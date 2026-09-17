import { MarketCandle, QuoteData, Timeframe, ServerCandleProvider } from './types'

const CRYPTOCOMPARE_KEY = process.env.CRYPTOCOMPARE_API_KEY

const CC_ENDPOINT_MAP: Record<string, { endpoint: string; aggregate: number }> = {
  '1min': { endpoint: 'histominute', aggregate: 1 },
  '5min': { endpoint: 'histominute', aggregate: 5 },
  '15min': { endpoint: 'histominute', aggregate: 15 },
  '30min': { endpoint: 'histominute', aggregate: 30 },
  '1h': { endpoint: 'histohour', aggregate: 1 },
  '2h': { endpoint: 'histohour', aggregate: 2 },
  '4h': { endpoint: 'histohour', aggregate: 4 },
  '8h': { endpoint: 'histohour', aggregate: 8 },
  '1day': { endpoint: 'histoday', aggregate: 1 },
  '1week': { endpoint: 'histoday', aggregate: 7 },
  '1month': { endpoint: 'histoday', aggregate: 30 },
}

function isCryptoCompareSupported(symbol: string): boolean {
  const base = symbol.split('/')[0].toUpperCase()
  const supported = ['BTC', 'ETH', 'SOL', 'DOGE', 'XRP', 'ADA', 'DOT', 'AVAX', 'MATIC', 'LTC', 'LINK', 'UNI', 'ATOM']
  return supported.includes(base)
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

export class ServerCryptoCompareAdapter implements ServerCandleProvider {
  name = 'cryptocompare'
  supportsCandles = true

  isSupported(symbol: string): boolean {
    return isCryptoCompareSupported(symbol)
  }

  async fetchCandles(symbol: string, timeframe: Timeframe, limit: number): Promise<MarketCandle[] | null> {
    if (!CRYPTOCOMPARE_KEY) return null
    if (!this.isSupported(symbol)) return null

    const cc = CC_ENDPOINT_MAP[timeframe]
    if (!cc) return null

    try {
      const base = symbol.split('/')[0].toUpperCase()
      const quote = symbol.split('/')[1]?.toUpperCase() || 'USD'

      const params = new URLSearchParams({
        fsym: base,
        tsym: quote,
        limit: String(Math.min(limit, 2000)),
        aggregate: String(cc.aggregate),
        api_key: CRYPTOCOMPARE_KEY,
      })

      const url = `https://min-api.cryptocompare.com/data/v2/${cc.endpoint}?${params.toString()}`
      const response = await fetchWithTimeout(url)
      const data = await response.json()

      if (data.Response !== 'Success' || !data.Data?.Data || data.Data.Data.length === 0) return null

      return data.Data.Data
        .map((item: any) => ({
          time: item.time * 1000,
          open: Number(item.open),
          high: Number(item.high),
          low: Number(item.low),
          close: Number(item.close),
          volume: Number(item.volumefrom || 0),
          provider: 'cryptocompare',
        }))
        .sort((a: MarketCandle, b: MarketCandle) => a.time - b.time)
        .slice(-limit)
    } catch (err) {
      if (err instanceof Error && err.name === 'AbortError') {
        console.error(`[cryptocompare] ${symbol}: timeout`)
      }
      return null
    }
  }

  async fetchQuote(symbol: string): Promise<QuoteData | null> {
    if (!CRYPTOCOMPARE_KEY) return null
    if (!this.isSupported(symbol)) return null

    try {
      const base = symbol.split('/')[0].toUpperCase()
      const quote = symbol.split('/')[1]?.toUpperCase() || 'USD'

      const params = new URLSearchParams({
        fsyms: base,
        tsyms: quote,
        api_key: CRYPTOCOMPARE_KEY,
      })

      const url = `https://min-api.cryptocompare.com/data/pricemultifull?${params.toString()}`
      const response = await fetchWithTimeout(url)
      const data = await response.json()

      const raw = data.RAW?.[base]?.[quote]
      if (!raw) return null

      return {
        price: Number(raw.PRICE || 0),
        change: Number(raw.CHANGE24HOUR || 0),
        changePercent: Number(raw.CHANGEPCT24HOUR || 0),
        bid: Number(raw.BID || 0),
        ask: Number(raw.ASK || 0),
        dayHigh: Number(raw.HIGH24HOUR || 0),
        dayLow: Number(raw.LOW24HOUR || 0),
      }
    } catch {
      return null
    }
  }
}
