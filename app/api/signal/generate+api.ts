import { fetchCandles } from '../../../lib/server/providerRouter'
import { metrics } from '../../../lib/server/metrics'
import { cacheGet, cacheSet, makeSignalKey } from '../../../lib/server/cache'
import { TIMEFRAME_TTL } from '../../../lib/server/providerConfig'
import { Timeframe } from '../../../lib/server/providers/types'
import { StrategyKey, getStrategyTimeframes } from '../../../lib/signals/strategies'

function getStrategyCacheTTL(timeframes: Timeframe[]): number {
  let minTTL = Infinity
  for (const tf of timeframes) {
    const ttl = TIMEFRAME_TTL[tf]
    if (ttl != null && ttl < minTTL) minTTL = ttl
  }
  return minTTL < Infinity ? minTTL : 60000
}

export async function POST(request: Request): Promise<Response> {
  try {
    const body = await request.json()
    const { symbol, timeframe, limit, strategy } = body

    if (!symbol) {
      return Response.json({ error: 'symbol is required' }, { status: 400 })
    }

    metrics.requests.total++

    if (strategy) {
      const strategyKey = strategy as StrategyKey
      const timeframes = getStrategyTimeframes(strategyKey)
      const candleLimit = limit || 250

      const cacheKey = makeSignalKey(symbol, strategyKey, candleLimit)
      const cached = cacheGet<any>(cacheKey)
      if (cached) {
        return Response.json({ ...cached, cached: true })
      }

      const candleData: Record<string, any[]> = {}
      const fetchPromises = timeframes.map(async (tf) => {
        const result = await fetchCandles(symbol, tf as Timeframe, candleLimit)
        candleData[tf] = result.data
      })

      await Promise.allSettled(fetchPromises)

      const response = {
        candleData,
        strategy: strategyKey,
        timestamp: Date.now(),
      }

      const ttl = getStrategyCacheTTL(timeframes)
      cacheSet(cacheKey, response, ttl)

      return Response.json(response)
    }

    if (!timeframe) {
      return Response.json({ error: 'timeframe or strategy is required' }, { status: 400 })
    }

    const candleLimit = limit || 150
    const result = await fetchCandles(symbol, timeframe as Timeframe, candleLimit)

    return Response.json({
      candles: result.data,
      provider: result.provider,
      cached: result.provider === 'cache',
      timestamp: Date.now(),
    })
  } catch (error) {
    return Response.json({ error: 'internal server error' }, { status: 500 })
  }
}

