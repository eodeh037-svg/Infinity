import { MarketCandle, QuoteData, Timeframe } from './marketData/types'
import { fetchCandles, CandleResult } from './client'

export type { MarketCandle, QuoteData, Timeframe } from './marketData/types'

export async function getTwelveData(
  fromSymbol: string,
  toSymbol: string,
  interval: string = '1day',
  outputsize: string = '200'
): Promise<CandleResult> {
  const symbol = `${fromSymbol}/${toSymbol}`
  const limit = parseInt(outputsize) || 100
  return fetchCandles(symbol, interval, limit)
}
