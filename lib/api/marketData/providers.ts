export { MarketCandle, QuoteData, Timeframe } from './types'
import { MarketCandle, QuoteData, Timeframe } from './types'

export interface CandleProvider {
  name: string
  priority: number

  fetchCandles(symbol: string, timeframe: Timeframe, limit: number): Promise<MarketCandle[] | null>
  fetchQuote(symbol: string): Promise<QuoteData | null>
  isSupported(symbol: string): boolean
  convertSymbol(symbol: string): string
}

export type ProviderStatus = {
  name: string
  failures: number
  lastFailureTime: number | null
  cooldownUntil: number | null
  isAvailable: boolean
}
