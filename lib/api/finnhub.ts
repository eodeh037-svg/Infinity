import { Candle } from '../indicators/types'

const FINNHUB_KEY = process.env.EXPO_PUBLIC_FINNHUB_API_KEY
const TWELVE_KEY = process.env.EXPO_PUBLIC_TWELVE_DATA_API_KEY

type QuoteData = {
  price: number
  change: number
  changePercent: number
  bid: number
  ask: number
  dayHigh: number
  dayLow: number
}

const quoteCache = new Map<string, { data: QuoteData; timestamp: number }>()
const candleCache = new Map<string, { data: Candle[]; timestamp: number }>()

const QUOTE_CACHE_TTL = 60000
const CANDLE_CACHE_TTL = 300000

let lastFinnhubTime = 0
let lastTwelveTime = 0
const FINNHUB_INTERVAL = 1000
const TWELVE_INTERVAL = 12000

function toFinnhubSymbol(pair: string): string {
  return `OANDA:${pair.replace('/', '_')}`
}

const RESOLUTION_MAP: Record<string, string> = {
  '1min': '1',
  '5min': '5',
  '15min': '15',
  '30min': '30',
  '1h': '60',
  '4h': '240',
  '1day': 'D',
  '1week': 'W',
  '1month': 'M',
}

function getCandleTimeRange(interval: string, outputsize: number): { from: number; to: number } {
  const to = Math.floor(Date.now() / 1000)
  const res = RESOLUTION_MAP[interval] || 'D'
  let secondsPerCandle: number

  switch (res) {
    case '1': secondsPerCandle = 60; break
    case '5': secondsPerCandle = 300; break
    case '15': secondsPerCandle = 900; break
    case '30': secondsPerCandle = 1800; break
    case '60': secondsPerCandle = 3600; break
    case '240': secondsPerCandle = 14400; break
    case 'D': secondsPerCandle = 86400; break
    case 'W': secondsPerCandle = 604800; break
    case 'M': secondsPerCandle = 2592000; break
    default: secondsPerCandle = 86400; break
  }

  const from = to - (secondsPerCandle * outputsize)
  return { from, to }
}

function getCachedQuote(symbol: string): QuoteData | null {
  const cached = quoteCache.get(symbol)
  if (cached && Date.now() - cached.timestamp < QUOTE_CACHE_TTL) {
    return cached.data
  }
  return null
}

function setCachedQuote(symbol: string, data: QuoteData) {
  quoteCache.set(symbol, { data, timestamp: Date.now() })
}

function getCachedCandles(key: string): Candle[] | null {
  const cached = candleCache.get(key)
  if (cached && Date.now() - cached.timestamp < CANDLE_CACHE_TTL) {
    return cached.data
  }
  return null
}

function setCachedCandles(key: string, data: Candle[]) {
  candleCache.set(key, { data, timestamp: Date.now() })
}

async function throttledFetch(url: string, provider: 'finnhub' | 'twelve'): Promise<Response> {
  const now = Date.now()
  if (provider === 'finnhub') {
    const wait = FINNHUB_INTERVAL - (now - lastFinnhubTime)
    if (wait > 0) await new Promise(r => setTimeout(r, wait))
    lastFinnhubTime = Date.now()
  } else {
    const wait = TWELVE_INTERVAL - (now - lastTwelveTime)
    if (wait > 0) await new Promise(r => setTimeout(r, wait))
    lastTwelveTime = Date.now()
  }
  return fetch(url)
}

async function fetchFinnhubCandles(
  symbol: string,
  interval: string,
  outputsize: number
): Promise<Candle[] | null> {
  if (!FINNHUB_KEY) return null

  try {
    const finnhubSymbol = toFinnhubSymbol(symbol)
    const resolution = RESOLUTION_MAP[interval] || 'D'
    const { from, to } = getCandleTimeRange(interval, outputsize)

    const params = new URLSearchParams({
      symbol: finnhubSymbol,
      resolution,
      from: String(from),
      to: String(to),
      token: FINNHUB_KEY,
    })

    const url = `https://finnhub.io/api/v1/forex/candle?${params.toString()}`
    const response = await throttledFetch(url, 'finnhub')
    const data = await response.json()

    if (data.s === 'no_data' || !data.t || data.t.length === 0) return null
    if (!response.ok || data.error) return null

    return data.t.map((timestamp: number, i: number) => ({
      time: timestamp * 1000,
      open: Number(data.o[i]),
      high: Number(data.h[i]),
      low: Number(data.l[i]),
      close: Number(data.c[i]),
    })).sort((a: Candle, b: Candle) => a.time - b.time)
  } catch {
    return null
  }
}

async function fetchTwelveDataCandles(
  fromSymbol: string,
  toSymbol: string,
  interval: string,
  outputsize: string
): Promise<Candle[]> {
  if (!TWELVE_KEY) throw new Error('Twelve Data API key is missing')

  const symbol = `${fromSymbol}/${toSymbol}`
  const params = new URLSearchParams({
    symbol,
    interval,
    outputsize,
    apikey: TWELVE_KEY,
  })

  const url = `https://api.twelvedata.com/time_series?${params.toString()}`
  const response = await throttledFetch(url, 'twelve')
  const data = await response.json()

  if (!response.ok || data.status === 'error') {
    throw new Error(data.message || `Twelve Data request failed: ${response.status}`)
  }

  if (!data.values) throw new Error('No candle data returned')

  return data.values
    .map((item: any) => ({
      time: new Date(item.datetime).getTime(),
      open: Number(item.open),
      high: Number(item.high),
      low: Number(item.low),
      close: Number(item.close),
    }))
    .sort((a: Candle, b: Candle) => a.time - b.time)
}

async function fetchFinnhubQuote(symbol: string): Promise<QuoteData | null> {
  if (!FINNHUB_KEY) return null

  try {
    const finnhubSymbol = toFinnhubSymbol(symbol)
    const params = new URLSearchParams({
      symbol: finnhubSymbol,
      token: FINNHUB_KEY,
    })

    const url = `https://finnhub.io/api/v1/quote?${params.toString()}`
    const response = await throttledFetch(url, 'finnhub')
    const data = await response.json()

    if (!response.ok || data.error || !data.c) return null

    return {
      price: Number(data.c || 0),
      change: Number(data.d || 0),
      changePercent: Number(data.dp || 0),
      bid: Number(data.c || 0),
      ask: Number(data.c || 0),
      dayHigh: Number(data.h || 0),
      dayLow: Number(data.l || 0),
    }
  } catch {
    return null
  }
}

async function fetchTwelveDataQuote(symbol: string): Promise<QuoteData> {
  if (!TWELVE_KEY) throw new Error('Twelve Data API key is missing')

  const params = new URLSearchParams({
    symbol,
    apikey: TWELVE_KEY,
  })

  const url = `https://api.twelvedata.com/quote?${params.toString()}`
  const response = await throttledFetch(url, 'twelve')
  const data = await response.json()

  if (!response.ok || data.status === 'error') {
    throw new Error(data.message || 'Twelve Data quote request failed')
  }

  return {
    price: Number(data.close || data.previous_close || 0),
    change: Number(data.change || 0),
    changePercent: Number(data.percent_change || 0),
    bid: Number(data.bid || 0),
    ask: Number(data.ask || 0),
    dayHigh: Number(data.high || 0),
    dayLow: Number(data.low || 0),
  }
}

export async function getTwelveData(
  fromSymbol: string,
  toSymbol: string,
  interval = '1day',
  outputsize = '100'
): Promise<Candle[]> {
  const cacheKey = `${fromSymbol}/${toSymbol}_${interval}_${outputsize}`

  const cached = getCachedCandles(cacheKey)
  if (cached) return cached

  const symbol = `${fromSymbol}/${toSymbol}`
  const outputsizeNum = parseInt(outputsize) || 100

  let candles = await fetchFinnhubCandles(symbol, interval, outputsizeNum)

  if (!candles) {
    candles = await fetchTwelveDataCandles(fromSymbol, toSymbol, interval, outputsize)
  }

  setCachedCandles(cacheKey, candles)
  return candles
}

export async function getQuote(symbol: string): Promise<QuoteData> {
  const cached = getCachedQuote(symbol)
  if (cached) return cached

  let result = await fetchFinnhubQuote(symbol)

  if (!result) {
    result = await fetchTwelveDataQuote(symbol)
  }

  setCachedQuote(symbol, result)
  return result
}

export async function getMultipleQuotes(
  symbols: string[]
): Promise<Record<string, QuoteData>> {
  const result: Record<string, QuoteData> = {}
  const uncachedSymbols: string[] = []

  for (const sym of symbols) {
    const cached = getCachedQuote(sym)
    if (cached) {
      result[sym] = cached
    } else {
      uncachedSymbols.push(sym)
    }
  }

  if (uncachedSymbols.length === 0) return result

  const results = await Promise.allSettled(uncachedSymbols.map(sym => getQuote(sym)))

  const failedSymbols: string[] = []

  results.forEach((res, i) => {
    if (res.status === 'fulfilled' && res.value) {
      result[uncachedSymbols[i]] = res.value
    } else {
      failedSymbols.push(uncachedSymbols[i])
    }
  })

  if (failedSymbols.length > 0) {
    console.warn(`Could not fetch quotes for: ${failedSymbols.join(', ')}`)
  }

  return result
}

export function clearCandleCache() {
  candleCache.clear()
}

export function clearQuoteCache() {
  quoteCache.clear()
}
