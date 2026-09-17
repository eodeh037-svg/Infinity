import { MarketCandle, QuoteData, Timeframe, ServerCandleProvider } from './types'

const COINGECKO_KEY = process.env.COINGECKO_API_KEY
const COINGECKO_BASE = 'https://api.coingecko.com/api/v3'

const COINGECKO_DAYS_MAP: Record<string, number> = {
  '1min': 1,
  '5min': 1,
  '15min': 7,
  '30min': 7,
  '1h': 30,
  '4h': 90,
  '1day': 365,
}

const COINGECKO_IDS: Record<string, string> = {
  'BTC': 'bitcoin',
  'ETH': 'ethereum',
  'SOL': 'solana',
  'DOGE': 'dogecoin',
  'XRP': 'ripple',
  'ADA': 'cardano',
  'DOT': 'polkadot',
  'AVAX': 'avalanche-2',
  'MATIC': 'matic-network',
  'LTC': 'litecoin',
  'LINK': 'chainlink',
  'UNI': 'uniswap',
  'ATOM': 'cosmos',
}

async function fetchWithTimeout(url: string, headers: Record<string, string> = {}, timeoutMs = 10000): Promise<Response> {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), timeoutMs)
  try {
    return await fetch(url, { headers, signal: controller.signal })
  } finally {
    clearTimeout(timer)
  }
}

export class ServerCoinGeckoAdapter implements ServerCandleProvider {
  name = 'coingecko'
  supportsCandles = true

  isSupported(symbol: string): boolean {
    const base = symbol.split('/')[0].toUpperCase()
    return !!COINGECKO_IDS[base]
  }

  async fetchCandles(symbol: string, timeframe: Timeframe, limit: number): Promise<MarketCandle[] | null> {
    if (!this.isSupported(symbol)) return null

    const base = symbol.split('/')[0].toUpperCase()
    const coinId = COINGECKO_IDS[base]
    if (!coinId) return null

    const days = COINGECKO_DAYS_MAP[timeframe]
    if (!days) return null

    try {
      const headers: Record<string, string> = {
        'User-Agent': 'Infinity/1.0 (https://github.com/infinity)',
        'Accept': 'application/json',
      }
      if (COINGECKO_KEY) {
        headers['x-cg-demo-api-key'] = COINGECKO_KEY
      }

      const url = `${COINGECKO_BASE}/coins/${coinId}/ohlc?vs_currency=usd&days=${days}`
      const response = await fetchWithTimeout(url, headers)
      const data = await response.json()

      if (!response.ok || !Array.isArray(data) || data.length === 0) return null

      return data
        .map((item: any[]) => ({
          time: item[0],
          open: Number(item[1]),
          high: Number(item[2]),
          low: Number(item[3]),
          close: Number(item[4]),
          provider: 'coingecko',
        }))
        .sort((a: MarketCandle, b: MarketCandle) => a.time - b.time)
        .slice(-limit)
    } catch (err) {
      if (err instanceof Error && err.name === 'AbortError') {
        console.error(`[coingecko] ${symbol}: timeout`)
      }
      return null
    }
  }

  async fetchQuote(symbol: string): Promise<QuoteData | null> {
    if (!this.isSupported(symbol)) return null

    const base = symbol.split('/')[0].toUpperCase()
    const coinId = COINGECKO_IDS[base]
    if (!coinId) return null

    try {
      const headers: Record<string, string> = {
        'User-Agent': 'Infinity/1.0 (https://github.com/infinity)',
        'Accept': 'application/json',
      }
      if (COINGECKO_KEY) {
        headers['x-cg-demo-api-key'] = COINGECKO_KEY
      }

      const url = `${COINGECKO_BASE}/simple/price?ids=${coinId}&vs_currencies=usd&include_24hr_change=true`
      const response = await fetchWithTimeout(url, headers)
      const data = await response.json()

      if (!response.ok || !data[coinId]) return null

      const price = data[coinId].usd
      const change24h = data[coinId].usd_24h_change || 0

      return {
        price: Number(price || 0),
        change: Number(change24h || 0),
        changePercent: Number(change24h || 0),
        bid: Number(price || 0),
        ask: Number(price || 0),
        dayHigh: Number(price || 0),
        dayLow: Number(price || 0),
      }
    } catch {
      return null
    }
  }
}
