import { MarketCandle, QuoteData, Timeframe, ServerCandleProvider } from './types'

const FMP_KEY = process.env.FMP_API_KEY
const FMP_MAX_CANDLES = 5000

const FMP_INTERVAL_MAP: Record<string, string> = {
  '1min': '1min',
  '5min': '5min',
  '15min': '15min',
  '30min': '30min',
  '1h': '1hour',
  '4h': '4hour',
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

function isWeekend(dateStr: string): boolean {
  const d = new Date(dateStr)
  const day = d.getUTCDay()
  return day === 0 || day === 6
}

function calculateFromDate(limit: number, timeframe: Timeframe): Date {
  const now = new Date()
  if (timeframe === '1day') {
    const tradingDaysNeeded = Math.ceil(limit * 1.4)
    return new Date(now.getTime() - tradingDaysNeeded * 86400000)
  }
  if (timeframe === '1week') {
    return new Date(now.getTime() - limit * 7 * 86400000)
  }
  if (timeframe === '1month') {
    return new Date(now.getTime() - limit * 30 * 86400000)
  }
  const secondsPerCandleMap: Record<string, number> = {
    '1min': 60, '5min': 300, '15min': 900, '30min': 1800,
    '1h': 3600, '4h': 14400,
  }
  const seconds = secondsPerCandleMap[timeframe] || 86400
  return new Date(now.getTime() - limit * seconds * 1000)
}

export class ServerFMPAdapter implements ServerCandleProvider {
  name = 'fmp'
  supportsCandles = true

  isSupported(symbol: string): boolean {
    return symbol.includes('/')
  }

  async fetchCandles(symbol: string, timeframe: Timeframe, limit: number): Promise<MarketCandle[] | null> {
    if (!FMP_KEY) return null
    if (!this.isSupported(symbol)) return null

    const TAG = '[FMP]'
    const fmpInterval = FMP_INTERVAL_MAP[timeframe]

    console.log(`${TAG} Request: symbol=${symbol} timeframe=${timeframe} limit=${limit} fmpInterval=${fmpInterval ?? 'EOD'}`)

    if (fmpInterval) {
      try {
        return await this.fetchIntraday(symbol, fmpInterval, timeframe, limit)
      } catch (err) {
        if (err instanceof Error && err.message.includes('Restricted Endpoint')) {
          console.log(`${TAG} ${symbol} ${timeframe}: Restricted Endpoint (plan limitation)`)
          return null
        }
        if (err instanceof Error && err.name === 'AbortError') {
          console.log(`${TAG} ${symbol} ${timeframe}: request timeout`)
          return null
        }
        console.log(`${TAG} ${symbol} ${timeframe}: ${err instanceof Error ? err.message : 'unknown error'}`)
        return null
      }
    }

    return this.fetchEOD(symbol, timeframe, limit)
  }

  private async fetchIntraday(symbol: string, fmpInterval: string, timeframe: Timeframe, limit: number): Promise<MarketCandle[] | null> {
    if (!FMP_KEY) return null

    const TAG = '[FMP]'
    const fmpSymbol = symbol.replace('/', '')
    const now = new Date()
    const fromDate = calculateFromDate(limit, timeframe)
    const fromStr = fromDate.toISOString().split('T')[0]
    const toStr = now.toISOString().split('T')[0]

    const params = new URLSearchParams({
      symbol: fmpSymbol,
      interval: fmpInterval,
      from: fromStr,
      to: toStr,
      apikey: FMP_KEY,
    })
    const url = `https://financialmodelingprep.com/stable/historical-chart/${fmpInterval}?${params.toString()}`

    console.log(`${TAG} Intraday URL: /historical-chart/${fmpInterval}?symbol=${fmpSymbol}&from=${fromStr}&to=${toStr}`)
    console.log(`${TAG} Date range: ${fromStr} → ${toStr} (requested ${limit} candles at ${fmpInterval})`)

    const response = await fetchWithTimeout(url)
    const text = await response.text()

    console.log(`${TAG} HTTP ${response.status} for ${symbol} ${timeframe}`)

    if (text.includes('Restricted Endpoint')) {
      throw new Error('Restricted Endpoint')
    }

    let data: any[]
    try {
      data = JSON.parse(text)
    } catch {
      console.log(`${TAG} Response not JSON: ${text.substring(0, 200)}`)
      return null
    }

    if (!response.ok) {
      console.log(`${TAG} HTTP error ${response.status}: ${JSON.stringify(data).substring(0, 300)}`)
      return null
    }
    if (!Array.isArray(data) || data.length === 0) {
      console.log(`${TAG} Empty array returned for ${symbol} ${timeframe} (from=${fromStr} to=${toStr})`)
      return null
    }

    const candles = data
      .map((item: any) => ({
        time: new Date(item.date).getTime(),
        open: Number(item.open),
        high: Number(item.high),
        low: Number(item.low),
        close: Number(item.close),
        volume: Number(item.volume || 0),
        provider: 'fmp',
      }))
      .sort((a: MarketCandle, b: MarketCandle) => a.time - b.time)
      .slice(-limit)

    console.log(`${TAG} Parsed ${candles.length} candles for ${symbol} ${timeframe}`)
    if (candles.length > 0) {
      const first = new Date(candles[0].time).toISOString().split('T')[0]
      const last = new Date(candles[candles.length - 1].time).toISOString().split('T')[0]
      console.log(`${TAG} Range: ${first} → ${last} (${candles.length} candles, requested ${limit})`)
    }

    return candles
  }

  private async fetchEOD(symbol: string, timeframe: Timeframe, limit: number): Promise<MarketCandle[] | null> {
    if (!FMP_KEY) return null

    const fmpSymbol = symbol.replace('/', '')
    const fromDate = calculateFromDate(limit, timeframe)
    const now = new Date()
    const fromStr = fromDate.toISOString().split('T')[0]
    const toStr = now.toISOString().split('T')[0]

    const params = new URLSearchParams({
      symbol: fmpSymbol,
      from: fromStr,
      to: toStr,
      apikey: FMP_KEY,
    })
    const url = `https://financialmodelingprep.com/stable/historical-price-eod/full?${params.toString()}`
    const response = await fetchWithTimeout(url)
    const data = await response.json()

    if (!response.ok) return null
    if (!Array.isArray(data) || data.length === 0) return null

    const filtered = data.filter((item: any) => {
      if (!item.date) return false
      if (isWeekend(item.date)) return false
      return true
    })

    return filtered
      .map((item: any) => ({
        time: new Date(item.date).getTime(),
        open: Number(item.open),
        high: Number(item.high),
        low: Number(item.low),
        close: Number(item.close),
        volume: Number(item.volume || 0),
        provider: 'fmp',
      }))
      .sort((a: MarketCandle, b: MarketCandle) => a.time - b.time)
      .slice(-limit)
  }

  async fetchQuote(symbol: string): Promise<QuoteData | null> {
    if (!FMP_KEY) return null
    try {
      const fmpSymbol = symbol.replace('/', '')
      const url = `https://financialmodelingprep.com/stable/quote/${fmpSymbol}?apikey=${FMP_KEY}`
      const response = await fetchWithTimeout(url)
      const data = await response.json()
      if (!response.ok) return null
      if (Array.isArray(data)) {
        if (!data[0]) return null
        const q = data[0]
        return {
          price: Number(q.price || 0),
          change: Number(q.change || 0),
          changePercent: Number(q.changesPercentage || 0),
          bid: Number(q.bid || 0),
          ask: Number(q.ask || 0),
          dayHigh: Number(q.dayHigh || 0),
          dayLow: Number(q.dayLow || 0),
        }
      }
      if (data.error) return null
      return {
        price: Number(data.price || 0),
        change: Number(data.change || 0),
        changePercent: Number(data.changesPercentage || 0),
        bid: Number(data.bid || 0),
        ask: Number(data.ask || 0),
        dayHigh: Number(data.dayHigh || 0),
        dayLow: Number(data.dayLow || 0),
      }
    } catch {
      return null
    }
  }
}
