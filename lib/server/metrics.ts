interface ProviderMetrics {
  requests: number
  successes: number
  failures: number
  totalLatency: number
}

export const metrics = {
  requests: { total: 0, cached: 0, coalesced: 0, providerCalls: 0 },
  cache: { hits: 0, misses: 0, evictions: 0 },
  providers: new Map<string, ProviderMetrics>(),
  fallbacks: { total: 0 },
  symbols: { available: 0, unavailable: 0 },
}

export function recordProviderRequest(providerName: string, latencyMs: number, success: boolean): void {
  let p = metrics.providers.get(providerName)
  if (!p) {
    p = { requests: 0, successes: 0, failures: 0, totalLatency: 0 }
    metrics.providers.set(providerName, p)
  }
  p.requests++
  p.totalLatency += latencyMs
  if (success) p.successes++
  else p.failures++
}

export function getMetrics() {
  const providers: Record<string, any> = {}
  metrics.providers.forEach((v, k) => {
    providers[k] = {
      requests: v.requests,
      successes: v.successes,
      failures: v.failures,
      avgLatencyMs: v.requests > 0 ? Math.round(v.totalLatency / v.requests) : 0,
    }
  })
  return {
    requests: { ...metrics.requests },
    cache: { ...metrics.cache },
    providers,
    fallbacks: { ...metrics.fallbacks },
    symbols: { ...metrics.symbols },
  }
}

export function resetMetrics(): void {
  metrics.requests = { total: 0, cached: 0, coalesced: 0, providerCalls: 0 }
  metrics.cache = { hits: 0, misses: 0, evictions: 0 }
  metrics.providers.clear()
  metrics.fallbacks = { total: 0 }
  metrics.symbols = { available: 0, unavailable: 0 }
}
