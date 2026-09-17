export interface ProviderConfig {
  name: string
  enabled: boolean
  concurrency: number
  priority: number
  envKey?: string
  assetClass: 'forex' | 'crypto' | 'both'
  rateLimit: {
    requestsPerMinute: number
    requestsPerDay?: number
  }
  cooldown: {
    failureThreshold: number
    cooldownMs: number
  }
  timeout: number
}

export const PROVIDER_CONFIG: Record<string, ProviderConfig> = {
  twelveData: {
    name: 'twelveData',
    enabled: true,
    concurrency: 2,
    priority: 1,
    envKey: 'TWELVE_DATA_API_KEY',
    assetClass: 'forex',
    rateLimit: { requestsPerMinute: 8, requestsPerDay: 800 },
    cooldown: { failureThreshold: 3, cooldownMs: 300000 },
    timeout: 15000,
  },
  fmp: {
    name: 'fmp',
    enabled: true,
    concurrency: 5,
    priority: 2,
    envKey: 'FMP_API_KEY',
    assetClass: 'forex',
    rateLimit: { requestsPerMinute: 5, requestsPerDay: 250 },
    cooldown: { failureThreshold: 3, cooldownMs: 300000 },
    timeout: 10000,
  },
  biquote: {
    name: 'biquote',
    enabled: true,
    concurrency: 15,
    priority: 3,
    assetClass: 'both',
    rateLimit: { requestsPerMinute: 15000 },
    cooldown: { failureThreshold: 5, cooldownMs: 60000 },
    timeout: 10000,
  },
  fcs: {
    name: 'fcs',
    enabled: true,
    concurrency: 2,
    priority: 4,
    envKey: 'FCS_API_KEY',
    assetClass: 'both',
    rateLimit: { requestsPerMinute: 10, requestsPerDay: 500 },
    cooldown: { failureThreshold: 3, cooldownMs: 300000 },
    timeout: 15000,
  },
  finage: {
    name: 'finage',
    enabled: true,
    concurrency: 3,
    priority: 5,
    envKey: 'FINAGE_API_KEY',
    assetClass: 'both',
    rateLimit: { requestsPerMinute: 5, requestsPerDay: 1000 },
    cooldown: { failureThreshold: 3, cooldownMs: 300000 },
    timeout: 15000,
  },
  coingecko: {
    name: 'coingecko',
    enabled: true,
    concurrency: 5,
    priority: 6,
    assetClass: 'crypto',
    rateLimit: { requestsPerMinute: 30, requestsPerDay: 10000 },
    cooldown: { failureThreshold: 3, cooldownMs: 300000 },
    timeout: 10000,
  },
  cryptocompare: {
    name: 'cryptocompare',
    enabled: true,
    concurrency: 5,
    priority: 7,
    envKey: 'CRYPTOCOMPARE_API_KEY',
    assetClass: 'crypto',
    rateLimit: { requestsPerMinute: 2000, requestsPerDay: 100000 },
    cooldown: { failureThreshold: 3, cooldownMs: 300000 },
    timeout: 15000,
  },
  tiingo: {
    name: 'tiingo',
    enabled: true,
    concurrency: 3,
    priority: 8,
    envKey: 'TIINGO_API_KEY',
    assetClass: 'both',
    rateLimit: { requestsPerMinute: 1, requestsPerDay: 1000 },
    cooldown: { failureThreshold: 3, cooldownMs: 300000 },
    timeout: 15000,
  },
  eodhd: {
    name: 'eodhd',
    enabled: true,
    concurrency: 2,
    priority: 9,
    envKey: 'EODHD_API_KEY',
    assetClass: 'both',
    rateLimit: { requestsPerMinute: 1, requestsPerDay: 20 },
    cooldown: { failureThreshold: 3, cooldownMs: 600000 },
    timeout: 15000,
  },
  massive: {
    name: 'massive',
    enabled: true,
    concurrency: 5,
    priority: 10,
    envKey: 'MASSIVE_API_KEY',
    assetClass: 'forex',
    rateLimit: { requestsPerMinute: 5, requestsPerDay: 1000 },
    cooldown: { failureThreshold: 3, cooldownMs: 300000 },
    timeout: 15000,
  },
  currencyapi: {
    name: 'currencyapi',
    enabled: true,
    concurrency: 5,
    priority: 11,
    envKey: 'CURRENCYAPI_API_KEY',
    assetClass: 'forex',
    rateLimit: { requestsPerMinute: 10, requestsPerDay: 1000 },
    cooldown: { failureThreshold: 3, cooldownMs: 300000 },
    timeout: 10000,
  },
  currencyDataFeed: {
    name: 'currencyDataFeed',
    enabled: true,
    concurrency: 5,
    priority: 12,
    envKey: 'CURRENCY_DATA_FEED_API_KEY',
    assetClass: 'forex',
    rateLimit: { requestsPerMinute: 10, requestsPerDay: 1000 },
    cooldown: { failureThreshold: 3, cooldownMs: 300000 },
    timeout: 10000,
  },
  finnhub: {
    name: 'finnhub',
    enabled: true,
    concurrency: 10,
    priority: 13,
    envKey: 'FINNHUB_API_KEY',
    assetClass: 'forex',
    rateLimit: { requestsPerMinute: 60 },
    cooldown: { failureThreshold: 5, cooldownMs: 300000 },
    timeout: 10000,
  },
  alphaVantage: {
    name: 'alphaVantage',
    enabled: true,
    concurrency: 3,
    priority: 14,
    envKey: 'ALPHA_VANTAGE_API_KEY',
    assetClass: 'forex',
    rateLimit: { requestsPerMinute: 5, requestsPerDay: 500 },
    cooldown: { failureThreshold: 3, cooldownMs: 300000 },
    timeout: 15000,
  },
}

export const TIMEFRAME_TTL: Record<string, number> = {
  '1min': 15000,
  '5min': 30000,
  '15min': 60000,
  '30min': 120000,
  '1h': 300000,
  '4h': 900000,
  '1day': 3600000,
  '1week': 14400000,
  '1month': 86400000,
}

export const QUOTE_TTL = 5000
export const SNAPSHOT_TTL = 10000
export const NEWS_TTL = 300000
