import { MarketCandle, QuoteData } from '../api/marketData/types'

const API_BASE = process.env.EXPO_PUBLIC_API_URL || ''

interface ApiResponse<T> {
  data: T
  provider?: string
  cached?: boolean
  timestamp?: number
  error?: string
  diagnostics?: string[]
  count?: number
}

export interface CandleResult {
  data: MarketCandle[]
  provider: string
  diagnostics?: string[]
  error?: string
}

async function apiFetch<T>(path: string, init?: RequestInit): Promise<T> {
  const url = `${API_BASE}${path}`
  const response = await fetch(url, {
    ...init,
    headers: {
      'Content-Type': 'application/json',
      ...init?.headers,
    },
  })
  const json = await response.json()
  if (!response.ok || json.error) {
    throw new Error(json.error || `API error ${response.status}`)
  }
  return json as T
}

export async function fetchCandles(
  symbol: string,
  timeframe: string,
  limit: number
): Promise<CandleResult> {
  try {
    const params = new URLSearchParams({ symbol, timeframe, limit: String(limit) })
    const result = await apiFetch<ApiResponse<MarketCandle[]>>(`/api/market/candles?${params}`)
    return {
      data: result.data || [],
      provider: result.provider || 'unknown',
      diagnostics: result.diagnostics,
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'unknown error'
    console.error(`[fetchCandles] ${symbol} ${timeframe}: ${msg}`)
    return { data: [], provider: 'error', error: msg }
  }
}

export async function fetchQuote(symbol: string): Promise<QuoteData | null> {
  try {
    const params = new URLSearchParams({ symbol })
    const result = await apiFetch<ApiResponse<QuoteData>>(`/api/market/quote?${params}`)
    return result.data || null
  } catch {
    return null
  }
}

export async function fetchSnapshot(
  symbols: string[]
): Promise<{ data: Record<string, QuoteData>; providers: Record<string, string> }> {
  try {
    const params = new URLSearchParams({ symbols: symbols.join(',') })
    return await apiFetch(`/api/market/snapshot?${params}`)
  } catch {
    return { data: {}, providers: {} }
  }
}

export async function fetchNews(): Promise<any[]> {
  try {
    const result = await apiFetch<ApiResponse<any[]>>('/api/market/news')
    return result.data || []
  } catch {
    return []
  }
}

export async function generateSignal(
  symbol: string,
  timeframe: string,
  limit: number
): Promise<{ candles: MarketCandle[]; provider: string }> {
  try {
    const result = await apiFetch<ApiResponse<MarketCandle[]>>('/api/signal/generate', {
      method: 'POST',
      body: JSON.stringify({ symbol, timeframe, limit }),
    })
    return { candles: result.data || [], provider: result.provider || 'unknown' }
  } catch {
    return { candles: [], provider: 'none' }
  }
}

export async function generateMultiTimeframeSignal(
  symbol: string,
  strategy: string,
  limit: number
): Promise<{ candleData: Record<string, MarketCandle[]>; strategy: string }> {
  try {
    const result = await apiFetch<any>('/api/signal/generate', {
      method: 'POST',
      body: JSON.stringify({ symbol, strategy, limit }),
    })
    return { candleData: result.candleData || {}, strategy: result.strategy || strategy }
  } catch {
    return { candleData: {}, strategy }
  }
}

export async function fetchHealth(): Promise<any> {
  try {
    return await apiFetch('/api/health/status')
  } catch {
    return null
  }
}
