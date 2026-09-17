import { cacheGet, cacheSet } from '../../../lib/server/cache'
import { metrics } from '../../../lib/server/metrics'

const NEWS_TTL = 300000

interface MarketNews {
  id: string
  headline: string
  source: string
  url: string
  summary: string
  sentiment: string
  timestamp: string
  currency: string
}

export async function GET(): Promise<Response> {
  try {
    metrics.requests.total++

    const cached = cacheGet<MarketNews[]>('news')
    if (cached) {
      metrics.cache.hits++
      return Response.json({ data: cached, cached: true, timestamp: Date.now() })
    }
    metrics.cache.misses++

    const key = process.env.FINNHUB_API_KEY
    if (!key) {
      return Response.json({ error: 'news service unavailable' }, { status: 503 })
    }

    const [forexRes, generalRes] = await Promise.all([
      fetch(`https://finnhub.io/api/v1/news?category=forex&token=${key}`),
      fetch(`https://finnhub.io/api/v1/news?category=general&token=${key}`),
    ])

    const forexData = forexRes.ok ? await forexRes.json() : []
    const generalData = generalRes.ok ? await generalRes.json() : []

    const all = [...(Array.isArray(forexData) ? forexData : []), ...(Array.isArray(generalData) ? generalData : [])]

    const seen = new Set<string>()
    const results: MarketNews[] = []

    for (const item of all) {
      if (!item?.headline || seen.has(String(item.id))) continue
      seen.add(String(item.id))

      const match = (item.headline as string).match(/\b(EUR|GBP|USD|JPY|AUD|CAD|CHF|NZD|CNY|INR|MXN|TRY|SGD|HKD|ZAR|BRL|KRW)\b/)
      const currency = match ? match[1] : (item.source || 'FX').slice(0, 4).toUpperCase()

      results.push({
        id: String(item.id),
        headline: item.headline,
        source: item.source || '',
        url: item.url || '',
        summary: item.summary || '',
        sentiment: item.sentiment || 'neutral',
        timestamp: item.datetime ? new Date(item.datetime * 1000).toISOString() : new Date().toISOString(),
        currency,
      })
    }

    results.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime())

    cacheSet('news', results, NEWS_TTL)

    return Response.json({ data: results, cached: false, timestamp: Date.now() })
  } catch (error) {
    return Response.json({ error: 'internal server error' }, { status: 500 })
  }
}

