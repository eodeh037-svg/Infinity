import { fetchCandles } from '../../../lib/server/providerRouter'
import { metrics } from '../../../lib/server/metrics'
import { Timeframe } from '../../../lib/server/providers/types'

const VALID_TIMEFRAMES = new Set(['1min', '5min', '15min', '30min', '1h', '2h', '4h', '8h', '1day', '1week', '1month'])

export async function GET(request: Request): Promise<Response> {
  try {
    const url = new URL(request.url)
    const symbol = url.searchParams.get('symbol')
    const timeframe = url.searchParams.get('timeframe')
    const limit = parseInt(url.searchParams.get('limit') || '100', 10)

    if (!symbol || !timeframe) {
      return Response.json({ error: 'symbol and timeframe are required' }, { status: 400 })
    }

    if (!VALID_TIMEFRAMES.has(timeframe)) {
      return Response.json({ error: 'invalid timeframe' }, { status: 400 })
    }

    if (limit < 1 || limit > 1000) {
      return Response.json({ error: 'limit must be between 1 and 1000' }, { status: 400 })
    }

    metrics.requests.total++
    const result = await fetchCandles(symbol, timeframe as Timeframe, limit)

    return Response.json({
      data: result.data,
      provider: result.provider,
      cached: result.provider === 'cache',
      diagnostics: result.diagnostics,
      count: result.data.length,
      timestamp: Date.now(),
    })
  } catch (error) {
    return Response.json({ error: 'internal server error' }, { status: 500 })
  }
}

