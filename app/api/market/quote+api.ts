import { fetchQuote } from '../../../lib/server/providerRouter'
import { metrics } from '../../../lib/server/metrics'

export async function GET(request: Request): Promise<Response> {
  try {
    const url = new URL(request.url)
    const symbol = url.searchParams.get('symbol')

    if (!symbol) {
      return Response.json({ error: 'symbol is required' }, { status: 400 })
    }

    metrics.requests.total++
    const result = await fetchQuote(symbol)

    if (!result) {
      return Response.json({ error: 'quote unavailable' }, { status: 404 })
    }

    return Response.json({
      data: result.data,
      provider: result.provider,
      cached: result.provider === 'cache',
      timestamp: Date.now(),
    })
  } catch (error) {
    return Response.json({ error: 'internal server error' }, { status: 500 })
  }
}

