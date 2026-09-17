import { metrics } from './metrics'

const STORE_KEY = '__INFINITY_COALESCE_STORE__'
if (!(globalThis as any)[STORE_KEY]) {
  ;(globalThis as any)[STORE_KEY] = new Map<string, Promise<any>>()
}
const inFlight: Map<string, Promise<any>> = (globalThis as any)[STORE_KEY]

export async function coalesceRequest<T>(key: string, fn: () => Promise<T>): Promise<T> {
  const existing = inFlight.get(key)
  if (existing) {
    metrics.requests.coalesced++
    return existing as Promise<T>
  }

  const promise = fn().finally(() => {
    inFlight.delete(key)
  })
  inFlight.set(key, promise)
  return promise
}

export function isInFlight(key: string): boolean {
  return inFlight.has(key)
}

export function inFlightSize(): number {
  return inFlight.size
}
