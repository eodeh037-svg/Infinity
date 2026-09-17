import { fetchCandles } from '../../lib/server/providerRouter'
import { metrics } from '../../lib/server/metrics'
import { Timeframe } from '../../lib/server/providers/types'
import {
  collectFeatures,
  runDiagnosticFromFeatures,
  runRRGrid,
  DIAG_HORIZONS,
} from '../../lib/signals/diagnostic'
import { BacktestConfig } from '../../lib/signals/backtest'

export async function POST(request: Request): Promise<Response> {
  try {
    const body = await request.json()
    const {
      symbol,
      timeframe,
      limit = 1800,
      horizons = DIAG_HORIZONS,
      stride = 1,
      rrHorizon = 24,
      configs,
    } = body

    if (!symbol || !timeframe) {
      return Response.json({ error: 'symbol and timeframe are required' }, { status: 400 })
    }

    metrics.requests.total++

    const candleResult = await fetchCandles(symbol, timeframe as Timeframe, limit)
    const resolvedConfig: BacktestConfig =
      configs && configs[0] ? configs[0] : { name: 'baseline', options: {} }

    const featureSet = collectFeatures(candleResult.data, horizons, stride)
    const report = runDiagnosticFromFeatures(
      featureSet,
      candleResult.data.length,
      resolvedConfig,
      horizons,
      stride
    )
    const rrGrid = runRRGrid(featureSet.features, rrHorizon)

    return Response.json({
      symbol,
      timeframe,
      provider: candleResult.provider,
      diagnostics: candleResult.diagnostics,
      report,
      rrGrid,
      timestamp: Date.now(),
    })
  } catch (error) {
    return Response.json({ error: 'internal server error' }, { status: 500 })
  }
}