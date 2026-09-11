export type CurrencyPair = {
  symbol: string
  name: string
  category: 'Major' | 'Minor' | 'Exotic' | 'Crypto' | 'Commodities'
  price: number
  change: number
  changePercent: number
  bid: number
  ask: number
  spread: number
  dayHigh: number
  dayLow: number
  flag1: string
  flag2: string
}

export type Trade = {
  id: string
  pair: string
  signal: string
  entry: string
  exitPrice: string | null
  stopLoss: string
  takeProfit: string
  riskReward: string
  confidence: number
  profitLoss: number
  profitLossPercent: number
  status: string
  reasons: string[]
  createdAt: number
  closedAt: number | null
  userId: string
}

export type UserProfile = {
  id: string
  userName: string
  email: string
  plan: 'free' | 'premium'
  accountBalance: number
  totalPL: number
  totalPLPercent: number
  totalTrades: number
  winCount: number
}

export type MarketNews = {
  id: string
  currency: string
  title: string
  time: string
  url?: string
}
