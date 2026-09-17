import { MarketCandle, QuoteData, Timeframe, ServerCandleProvider } from './types'

const EODHD_KEY = process.env.EODHD_API_KEY

const EODHD_INTERVAL_MAP: Record<string, string> = {
  '1min': '1m',
  '5min': '5m',
  '1h': '1h',
}

const EODHD_EOD_MAP: Record<string, string> = {
  '1day': 'd',
  '1week': 'w',
  '1month': 'm',
}

function toEodhdSymbol(symbol: string, isCrypto: boolean): string {
  const pair = symbol.replace('/', '')
  return isCrypto ? `${pair}.CC` : `${pair}.FOREX`
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

export class ServerEODHDAdapter implements ServerCandleProvider {
  name = 'eodhd'
  supportsCandles = true

  isSupported(symbol: string): boolean {
    return symbol.includes('/')
  }

  async fetchCandles(symbol: string, timeframe: Timeframe, limit: number): Promise<MarketCandle[] | null> {
    if (!EODHD_KEY) return null
    if (!this.isSupported(symbol)) return null

    const eodPeriod = EODHD_EOD_MAP[timeframe]
    if (eodPeriod) {
      return this.fetchEod(symbol, eodPeriod, limit)
    }

    const intradayInterval = EODHD_INTERVAL_MAP[timeframe]
    if (intradayInterval) {
      return this.fetchIntraday(symbol, timeframe, intradayInterval, limit)
    }

    return null
  }

  private async fetchEod(symbol: string, period: string, limit: number): Promise<MarketCandle[] | null> {
    if (!EODHD_KEY) return null

    try {
      const isCrypto = this.isCrypto(symbol)
      const eodhdSymbol = toEodhdSymbol(symbol, isCrypto)

      const maxDays = this.getEodMaxDays(period)
      const fromDate = new Date(Date.now() - Math.min(limit, maxDays) * 86400000)
      const toDate = new Date()
      const fromStr = fromDate.toISOString().split('T')[0]
      const toStr = toDate.toISOString().split('T')[0]

      const params = new URLSearchParams({
        period,
        from: fromStr,
        to: toStr,
        fmt: 'json',
        api_token: EODHD_KEY,
      })

      const url = `https://eodhd.com/api/eod/${eodhdSymbol}?${params.toString()}`
      const response = await fetchWithTimeout(url)
      const data = await response.json()

      if (!response.ok) return null
      if (!Array.isArray(data) || data.length === 0) return null

      return data
        .map((item: any) => ({
          time: new Date(item.date).getTime(),
          open: Number(item.open),
          high: Number(item.high),
          low: Number(item.low),
          close: Number(item.close),
          volume: Number(item.volume || 0),
          provider: 'eodhd',
        }))
        .filter((c: MarketCandle) => c.time > 0)
        .sort((a: MarketCandle, b: MarketCandle) => a.time - b.time)
        .slice(-limit)
    } catch (err) {
      if (err instanceof Error && err.name === 'AbortError') {
        console.error(`[eodhd] ${symbol}: timeout (eod)`)
      }
      return null
    }
  }

  private async fetchIntraday(symbol: string, timeframe: Timeframe, interval: string, limit: number): Promise<MarketCandle[] | null> {
    if (!EODHD_KEY) return null

    try {
      const isCrypto = this.isCrypto(symbol)
      const eodhdSymbol = toEodhdSymbol(symbol, isCrypto)

      const now = Math.floor(Date.now() / 1000)
      const maxRange = this.getMaxRangeSeconds(interval)
      const from = now - Math.min(limit * this.getSecondsPerCandle(timeframe), maxRange)

      const params = new URLSearchParams({
        from: String(from),
        to: String(now),
        interval,
        fmt: 'json',
        api_token: EODHD_KEY,
      })

      const url = `https://eodhd.com/api/intraday/${eodhdSymbol}?${params.toString()}`
      const response = await fetchWithTimeout(url)
      const data = await response.json()

      if (!response.ok) return null
      if (!Array.isArray(data) || data.length === 0) return null

      return data
        .map((item: any) => ({
          time: (item.timestamp || item.time || 0) * 1000,
          open: Number(item.open),
          high: Number(item.high),
          low: Number(item.low),
          close: Number(item.close),
          volume: Number(item.volume || 0),
          provider: 'eodhd',
        }))
        .filter((c: MarketCandle) => c.time > 0)
        .sort((a: MarketCandle, b: MarketCandle) => a.time - b.time)
        .slice(-limit)
    } catch (err) {
      if (err instanceof Error && err.name === 'AbortError') {
        console.error(`[eodhd] ${symbol}: timeout (intraday)`)
      }
      return null
    }
  }

  async fetchQuote(symbol: string): Promise<QuoteData | null> {
    if (!EODHD_KEY) return null
    if (!this.isSupported(symbol)) return null

    try {
      const isCrypto = this.isCrypto(symbol)
      const eodhdSymbol = toEodhdSymbol(symbol, isCrypto)
      const url = `https://eodhd.com/api/real-time/${eodhdSymbol}?api_token=${EODHD_KEY}&fmt=json`
      const response = await fetchWithTimeout(url)
      const data = await response.json()

      if (!response.ok || !data.close) return null

      return {
        price: Number(data.close || 0),
        change: Number(data.change || 0),
        changePercent: Number(data.change_p || 0),
        bid: Number(data.bid || 0),
        ask: Number(data.ask || 0),
        dayHigh: Number(data.high || 0),
        dayLow: Number(data.low || 0),
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

  private getEodMaxDays(period: string): number {
    const map: Record<string, number> = {
      'd': 365,
      'w': 365 * 2,
      'm': 365 * 5,
    }
    return map[period] || 365
  }

  private getSecondsPerCandle(timeframe: Timeframe): number {
    const map: Record<string, number> = {
      '1min': 60, '5min': 300, '15min': 900, '30min': 1800,
      '1h': 3600, '2h': 7200, '4h': 14400, '8h': 28800,
      '1day': 86400, '1week': 604800, '1month': 2592000,
    }
    return map[timeframe] || 86400
  }

  private getMaxRangeSeconds(interval: string): number {
    const map: Record<string, number> = {
      '1m': 120 * 86400,
      '5m': 600 * 86400,
      '1h': 7200 * 86400,
    }
    return map[interval] || 600 * 86400
  }
}
