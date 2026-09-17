import { getMetrics } from '../../../lib/server/metrics'
import { getProviderHealth, getProviderRegistry } from '../../../lib/server/providerRouter'
import { cacheSize, cacheEvictExpired } from '../../../lib/server/cache'
import { inFlightSize } from '../../../lib/server/coalesce'

export async function GET(): Promise<Response> {
  try {
    const evicted = cacheEvictExpired()
    const registry = getProviderRegistry()
    const providerHealth = getProviderHealth()

    const providers: Record<string, any> = {}
    for (const entry of registry) {
      const health = providerHealth[entry.name]
      providers[entry.name] = {
        enabled: entry.enabled,
        priority: entry.priority,
        assetClass: entry.assetClass,
        hasKey: entry.hasKey,
        needsKey: entry.needsKey,
        providerKeyConfigured: entry.needsKey ? entry.hasKey : true,
        failures: health?.failures ?? 0,
        lastFailureTime: health?.lastFailureTime ?? null,
        cooldownUntil: health?.cooldownUntil ?? null,
        isAvailable: health?.isAvailable ?? true,
        entitlementDenied: health?.entitlementDenied ?? false,
        rateLimited: health?.rateLimited ?? false,
      }
    }

    return Response.json({
      providers,
      cache: {
        size: cacheSize(),
        evicted,
      },
      inFlight: inFlightSize(),
      metrics: getMetrics(),
      timestamp: Date.now(),
    })
  } catch (error) {
    return Response.json({ error: 'internal server error' }, { status: 500 })
  }
}
