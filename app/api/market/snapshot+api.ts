import { fetchSnapshot } from '../../../lib/server/providerRouter'
import { metrics } from '../../../lib/server/metrics'

export async function GET(request: Request): Promise<Response> {
  try {
    const url = new URL(request.url)
    const symbolsParam = url.searchParams.get('symbols')

    if (!symbolsParam) {
      return Response.json({ error: 'symbols parameter is required' }, { status: 400 })
    }

    const symbols = symbolsParam.split(',').map(s => s.trim()).filter(Boolean)

    if (symbols.length === 0) {
      return Response.json({ error: 'no valid symbols provided' }, { status: 400 })
    }

    if (symbols.length > 100) {
      return Response.json({ error: 'maximum 100 symbols per request' }, { status: 400 })
    }

    metrics.requests.total++
    const result = await fetchSnapshot(symbols)

    return Response.json({
      data: result.data,
      providers: result.providers,
      timestamp: Date.now(),
    })
  } catch (error) {
    return Response.json({ error: 'internal server error' }, { status: 500 })
  }
}

