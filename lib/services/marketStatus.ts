import { CurrencyPair } from '../../types'

export type AssetType = 'forex' | 'crypto' | 'commodities'

export type MarketStatus = {
  isOpen: boolean
  assetType: AssetType
  nextOpen: Date | null
  nextClose: Date | null
  message: string
}

export function getAssetType(pair: CurrencyPair): AssetType {
  switch (pair.category) {
    case 'Major':
    case 'Minor':
    case 'Exotic':
      return 'forex'
    case 'Crypto':
      return 'crypto'
    case 'Commodities':
      return 'commodities'
    default:
      return 'forex'
  }
}

function getNextForexOpen(now: Date): Date {
  const utcDay = now.getUTCDay()
  const utcHour = now.getUTCHours()

  if (utcDay === 6) {
    const daysUntilSunday = 6 - utcDay
    const next = new Date(now)
    next.setUTCDate(now.getUTCDate() + daysUntilSunday)
    next.setUTCHours(22, 0, 0, 0)
    return next
  }

  if (utcDay === 0 && utcHour < 22) {
    const next = new Date(now)
    next.setUTCHours(22, 0, 0, 0)
    return next
  }

  if (utcDay === 5 && utcHour >= 22) {
    const next = new Date(now)
    next.setUTCDate(now.getUTCDate() + 2)
    next.setUTCHours(22, 0, 0, 0)
    return next
  }

  const next = new Date(now)
  next.setUTCDate(now.getUTCDate() + 1)
  next.setUTCHours(22, 0, 0, 0)
  return next
}

function getNextForexClose(now: Date): Date {
  const utcDay = now.getUTCDay()
  const utcHour = now.getUTCHours()

  if (utcDay === 5 && utcHour < 22) {
    const next = new Date(now)
    next.setUTCHours(22, 0, 0, 0)
    return next
  }

  const daysUntilFriday = (5 - utcDay + 7) % 7
  if (daysUntilFriday === 0 && utcHour >= 22) {
    const next = new Date(now)
    next.setUTCDate(now.getUTCDate() + 7)
    next.setUTCHours(22, 0, 0, 0)
    return next
  }

  const next = new Date(now)
  next.setUTCDate(now.getUTCDate() + daysUntilFriday)
  next.setUTCHours(22, 0, 0, 0)
  return next
}

function isForexOpen(now: Date): boolean {
  const utcDay = now.getUTCDay()
  const utcHour = now.getUTCHours()

  if (utcDay === 6) return false
  if (utcDay === 0 && utcHour < 22) return false
  if (utcDay === 5 && utcHour >= 22) return false

  return true
}

export function getMarketStatus(assetType: AssetType): MarketStatus {
  if (assetType === 'crypto') {
    return {
      isOpen: true,
      assetType: 'crypto',
      nextOpen: null,
      nextClose: null,
      message: 'Crypto markets are open 24/7',
    }
  }

  if (assetType === 'commodities') {
    return {
      isOpen: true,
      assetType: 'commodities',
      nextOpen: null,
      nextClose: null,
      message: 'Commodities markets are available',
    }
  }

  const now = new Date()
  const open = isForexOpen(now)

  if (open) {
    const nextClose = getNextForexClose(now)
    return {
      isOpen: true,
      assetType: 'forex',
      nextOpen: null,
      nextClose,
      message: 'Forex market is open',
    }
  }

  const nextOpen = getNextForexOpen(now)
  const options: Intl.DateTimeFormatOptions = {
    weekday: 'short',
    hour: '2-digit',
    minute: '2-digit',
    timeZone: 'UTC',
    timeZoneName: 'short',
  }
  const formatted = nextOpen.toLocaleString('en-US', options)

  return {
    isOpen: false,
    assetType: 'forex',
    nextOpen,
    nextClose: null,
    message: `Forex market is closed. Reopens ${formatted}`,
  }
}
