import { fetchCandles } from '../../lib/server/providerRouter'
import { metrics } from '../../lib/server/metrics'
import { Timeframe } from '../../lib/server/providers/types'
import { runBacktest, BacktestConfig } from '../../lib/signals/backtest'
import { DEFAULT_FAMILY_CAPS, EvidenceFamily } from '../../lib/signals/signalEngine'

const UNLIMITED_CAPS: Record<EvidenceFamily, number> = {
  trend: 999,
  momentum: 999,
  meanReversion: 999,
  volume: 999,
  sentiment: 999,
  volatility: 999,
  priceAction: 999,
}

export async function POST(request: Request): Promise<Response> {
  try {
    const body = await request.json()
    const {
      symbol,
      timeframe,
      limit = 600,
      lookback = 250,
      horizon = 24,
      step = 1,
      configs,
      includeTrades = false,
    } = body

    if (!symbol || !timeframe) {
      return Response.json({ error: 'symbol and timeframe are required' }, { status: 400 })
    }

    metrics.requests.total++

    const candleResult = await fetchCandles(symbol, timeframe as Timeframe, limit)

    const resolvedConfigs: BacktestConfig[] =
      configs && configs.length > 0
        ? configs
        : [
            { name: 'baseline', options: { familyCaps: UNLIMITED_CAPS } },
            { name: 'revised', options: {} },
          ]

    const summaries = runBacktest(candleResult.data, resolvedConfigs, {
      lookback,
      horizon,
      step,
    })

    const payload = summaries.map(s => ({
      ...s,
      trades: includeTrades ? s.trades : s.trades.length,
    }))

    return Response.json({
      symbol,
      timeframe,
      provider: candleResult.provider,
      diagnostics: candleResult.diagnostics,
      configNames: resolvedConfigs.map(c => c.name),
      familyCaps: DEFAULT_FAMILY_CAPS,
      summaries: payload,
      timestamp: Date.now(),
    })
  } catch (error) {
    return Response.json({ error: 'internal server error' }, { status: 500 })
  }
}