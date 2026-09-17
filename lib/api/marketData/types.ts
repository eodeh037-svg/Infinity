export interface MarketCandle {
  time: number
  open: number
  high: number
  low: number
  close: number
  volume?: number
  provider?: string
}

export interface ProviderResult {
  success: boolean
  data?: MarketCandle[]
  error?: string
  provider: string
}

export interface MarketDataResult {
  data: Record<string, MarketCandle[]>
  providers: Record<string, string>
  unavailable: string[]
}

export interface QuoteData {
  price: number
  change: number
  changePercent: number
  bid: number
  ask: number
  dayHigh: number
  dayLow: number
}

export type Timeframe = '1min' | '5min' | '15min' | '30min' | '1h' | '2h' | '4h' | '8h' | '1day' | '1week' | '1month'

export const TIMEFRAME_MAP: Record<string, string> = {
  '1min': '1',
  '5min': '5',
  '15min': '15',
  '30min': '30',
  '1h': '1h',
  '2h': '2h',
  '4h': '4h',
  '8h': '8h',
  '1day': '1day',
  '1week': '1week',
  '1month': '1month',
}

export const RESOLUTION_MAP: Record<string, string> = {
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

export function normalizeTimeframe(interval: string): string {
  const lower = interval.toLowerCase()
  for (const [key, value] of Object.entries(TIMEFRAME_MAP)) {
    if (key.toLowerCase() === lower || interval === value) {
      return key
    }
  }
  return interval
}

export function toFinnhubSymbol(symbol: string): string {
  return `OANDA:${symbol.replace('/', '_')}`
}
