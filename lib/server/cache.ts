import { TIMEFRAME_TTL, QUOTE_TTL, SNAPSHOT_TTL, NEWS_TTL } from './providerConfig'
import { SIGNAL_ENGINE_VERSION } from '../signals/signalEngine'

interface CacheEntry<T> {
  data: T
  timestamp: number
  ttl: number
}

const STORE_KEY = '__INFINITY_CACHE_STORE__'
if (!(globalThis as any)[STORE_KEY]) {
  ;(globalThis as any)[STORE_KEY] = new Map<string, CacheEntry<any>>()
}
const store: Map<string, CacheEntry<any>> = (globalThis as any)[STORE_KEY]

function getTTL(key: string, overrideTtl?: number): number {
  if (overrideTtl != null) return overrideTtl
  if (key.startsWith('quote:')) return QUOTE_TTL
  if (key.startsWith('snapshot:')) return SNAPSHOT_TTL
  if (key === 'news') return NEWS_TTL
  const parts = key.split(':')
  if (parts.length >= 2) {
    const tf = parts[1]
    if (TIMEFRAME_TTL[tf] != null) return TIMEFRAME_TTL[tf]
  }
  return 300000
}

export function cacheGet<T>(key: string): T | null {
  const entry = store.get(key)
  if (entry && Date.now() - entry.timestamp < entry.ttl) {
    return entry.data as T
  }
  if (entry) {
    store.delete(key)
  }
  return null
}

export function cacheSet<T>(key: string, data: T, ttl?: number): void {
  store.set(key, { data, timestamp: Date.now(), ttl: getTTL(key, ttl) })
}

export function cacheHas(key: string): boolean {
  const entry = store.get(key)
  if (!entry) return false
  if (Date.now() - entry.timestamp >= entry.ttl) {
    store.delete(key)
    return false
  }
  return true
}

export function cacheDelete(key: string): void {
  store.delete(key)
}

export function cacheSize(): number {
  return store.size
}

export function cacheClear(): void {
  store.clear()
}

export function cacheEvictExpired(): number {
  const now = Date.now()
  let evicted = 0
  store.forEach((entry, key) => {
    if (now - entry.timestamp >= entry.ttl) {
      store.delete(key)
      evicted++
    }
  })
  return evicted
}

export function makeCandleKey(symbol: string, timeframe: string, limit: number): string {
  return `candles:${symbol}:${timeframe}:${limit}`
}

export function makeQuoteKey(symbol: string): string {
  return `quote:${symbol}`
}

export function makeSnapshotKey(symbols: string[]): string {
  return `snapshot:${[...symbols].sort().join(',')}`
}

export function makeSignalKey(symbol: string, strategy: string, limit: number): string {
  return `signal:${SIGNAL_ENGINE_VERSION}:${symbol}:${strategy}:${limit}`
}
