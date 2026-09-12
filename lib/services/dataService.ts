import AsyncStorage from '@react-native-async-storage/async-storage'
import { db } from '../firebaseConfig'
import {
  collection,
  doc,
  getDocs,
  getDoc,
  addDoc,
  setDoc,
  updateDoc,
  deleteDoc,
  query,
  where,
  orderBy,
  limit,
  serverTimestamp,
} from 'firebase/firestore'
import { getAuth } from 'firebase/auth'
import { CurrencyPair, Trade, UserProfile, MarketNews } from '../../types'
import { getQuote, getMultipleQuotes } from '../api/finnhub'

const PAIR_META: Record<string, { name: string; category: CurrencyPair['category']; flag1: string; flag2: string }> = {
  'EUR/USD': { name: 'Euro / US Dollar', category: 'Major', flag1: '🇪🇺', flag2: '🇺🇸' },
  'GBP/USD': { name: 'British Pound / US Dollar', category: 'Major', flag1: '🇬🇧', flag2: '🇺🇸' },
  'USD/JPY': { name: 'US Dollar / Japanese Yen', category: 'Major', flag1: '🇺🇸', flag2: '🇯🇵' },
  'USD/CHF': { name: 'US Dollar / Swiss Franc', category: 'Major', flag1: '🇺🇸', flag2: '🇨🇭' },
  'AUD/USD': { name: 'Australian Dollar / US Dollar', category: 'Major', flag1: '🇦🇺', flag2: '🇺🇸' },
  'USD/CAD': { name: 'US Dollar / Canadian Dollar', category: 'Major', flag1: '🇺🇸', flag2: '🇨🇦' },
  'NZD/USD': { name: 'New Zealand Dollar / US Dollar', category: 'Major', flag1: '🇳🇿', flag2: '🇺🇸' },
  'EUR/GBP': { name: 'Euro / British Pound', category: 'Minor', flag1: '🇪🇺', flag2: '🇬🇧' },
  'EUR/JPY': { name: 'Euro / Japanese Yen', category: 'Minor', flag1: '🇪🇺', flag2: '🇯🇵' },
  'GBP/JPY': { name: 'British Pound / Japanese Yen', category: 'Minor', flag1: '🇬🇧', flag2: '🇯🇵' },
  'AUD/NZD': { name: 'Australian Dollar / New Zealand Dollar', category: 'Minor', flag1: '🇦🇺', flag2: '🇳🇿' },
  'USD/SGD': { name: 'US Dollar / Singapore Dollar', category: 'Exotic', flag1: '🇺🇸', flag2: '🇸🇬' },
  'USD/TRY': { name: 'US Dollar / Turkish Lira', category: 'Exotic', flag1: '🇺🇸', flag2: '🇹🇷' },
  'USD/MXN': { name: 'US Dollar / Mexican Peso', category: 'Exotic', flag1: '🇺🇸', flag2: '🇲🇽' },
  'BTC/USD': { name: 'Bitcoin / US Dollar', category: 'Crypto', flag1: '₿', flag2: '🇺🇸' },
  'ETH/USD': { name: 'Ethereum / US Dollar', category: 'Crypto', flag1: 'Ξ', flag2: '🇺🇸' },
  'XAU/USD': { name: 'Gold / US Dollar', category: 'Commodities', flag1: '🥇', flag2: '🇺🇸' },
}

const FALLBACK_QUOTES: Record<string, { price: number; change: number; changePercent: number; bid: number; ask: number; dayHigh: number; dayLow: number }> = {
  'EUR/USD': { price: 1.08472, change: 0.00230, changePercent: 0.21, bid: 1.08464, ask: 1.08480, dayHigh: 1.08910, dayLow: 1.08210 },
  'GBP/USD': { price: 1.26341, change: -0.00408, changePercent: -0.32, bid: 1.26330, ask: 1.26352, dayHigh: 1.26900, dayLow: 1.26100 },
  'USD/JPY': { price: 149.823, change: 0.345, changePercent: 0.23, bid: 149.810, ask: 149.836, dayHigh: 150.200, dayLow: 149.400 },
  'USD/CHF': { price: 0.89234, change: 0.00080, changePercent: 0.09, bid: 0.89220, ask: 0.89248, dayHigh: 0.89500, dayLow: 0.89000 },
  'AUD/USD': { price: 0.65213, change: 0.00117, changePercent: 0.18, bid: 0.65200, ask: 0.65226, dayHigh: 0.65500, dayLow: 0.65000 },
  'USD/CAD': { price: 1.36124, change: -0.00178, changePercent: -0.13, bid: 1.36110, ask: 1.36138, dayHigh: 1.36500, dayLow: 1.35900 },
  'NZD/USD': { price: 0.59874, change: -0.00090, changePercent: -0.15, bid: 0.59860, ask: 0.59888, dayHigh: 0.60100, dayLow: 0.59700 },
  'EUR/GBP': { price: 0.85862, change: 0.00120, changePercent: 0.14, bid: 0.85850, ask: 0.85874, dayHigh: 0.86100, dayLow: 0.85700 },
  'EUR/JPY': { price: 162.543, change: 0.420, changePercent: 0.26, bid: 162.530, ask: 162.556, dayHigh: 163.000, dayLow: 162.100 },
  'GBP/JPY': { price: 189.321, change: -0.210, changePercent: -0.11, bid: 189.300, ask: 189.342, dayHigh: 190.000, dayLow: 189.000 },
  'AUD/NZD': { price: 1.08912, change: 0.00340, changePercent: 0.31, bid: 1.08900, ask: 1.08924, dayHigh: 1.09200, dayLow: 1.08600 },
  'USD/SGD': { price: 1.34210, change: 0.00150, changePercent: 0.11, bid: 1.34200, ask: 1.34220, dayHigh: 1.34500, dayLow: 1.34000 },
  'USD/TRY': { price: 34.5621, change: 0.1234, changePercent: 0.36, bid: 34.5600, ask: 34.5642, dayHigh: 34.7000, dayLow: 34.4000 },
  'USD/MXN': { price: 17.2345, change: -0.0456, changePercent: -0.26, bid: 17.2340, ask: 17.2350, dayHigh: 17.3000, dayLow: 17.1500 },
  'BTC/USD': { price: 67543.21, change: 1234.56, changePercent: 1.86, bid: 67540.00, ask: 67546.42, dayHigh: 68000.00, dayLow: 66500.00 },
  'ETH/USD': { price: 3456.78, change: -23.45, changePercent: -0.67, bid: 3456.50, ask: 3457.06, dayHigh: 3500.00, dayLow: 3420.00 },
  'XAU/USD': { price: 2345.67, change: 12.34, changePercent: 0.53, bid: 2345.50, ask: 2345.84, dayHigh: 2360.00, dayLow: 2330.00 },
}

const pairsCache = new Map<string, { data: CurrencyPair[]; timestamp: number }>()
const PAIRS_CACHE_TTL = 120000
const PAIRS_STORAGE_KEY = '@infinity_pairs'
const PAIRS_STORAGE_TTL = 300000
const QUOTES_STORAGE_KEY = '@infinity_quotes'
const QUOTES_STORAGE_TTL = 300000

async function loadPairsFromStorage(category: string): Promise<CurrencyPair[] | null> {
  try {
    const raw = await AsyncStorage.getItem(PAIRS_STORAGE_KEY)
    if (!raw) return null
    const stored = JSON.parse(raw)
    const data = stored[category]
    if (!data) return null
    if (Date.now() - data.timestamp > PAIRS_STORAGE_TTL) return null
    return data.pairs
  } catch {
    return null
  }
}

async function savePairsToStorage(category: string, pairs: CurrencyPair[]): Promise<void> {
  try {
    const raw = await AsyncStorage.getItem(PAIRS_STORAGE_KEY)
    const stored = raw ? JSON.parse(raw) : {}
    stored[category] = { pairs, timestamp: Date.now() }
    await AsyncStorage.setItem(PAIRS_STORAGE_KEY, JSON.stringify(stored))
  } catch {}
}

async function loadQuoteFromStorage(symbol: string): Promise<{ price: number; change: number; changePercent: number; bid: number; ask: number; dayHigh: number; dayLow: number } | null> {
  try {
    const raw = await AsyncStorage.getItem(QUOTES_STORAGE_KEY)
    if (!raw) return null
    const stored = JSON.parse(raw)
    const data = stored[symbol]
    if (!data) return null
    if (Date.now() - data.timestamp > QUOTES_STORAGE_TTL) return null
    return data.quote
  } catch {
    return null
  }
}

async function saveQuoteToStorage(symbol: string, quote: { price: number; change: number; changePercent: number; bid: number; ask: number; dayHigh: number; dayLow: number }): Promise<void> {
  try {
    const raw = await AsyncStorage.getItem(QUOTES_STORAGE_KEY)
    const stored = raw ? JSON.parse(raw) : {}
    stored[symbol] = { quote, timestamp: Date.now() }
    await AsyncStorage.setItem(QUOTES_STORAGE_KEY, JSON.stringify(stored))
  } catch {}
}

export function getCurrentUser() {
  return getAuth().currentUser
}

export function getCurrentUserId(): string {
  const user = getCurrentUser()
  return user?.uid ?? 'anonymous'
}

export function getCurrentUserName(): string {
  const user = getCurrentUser()
  return user?.displayName ?? user?.email?.split('@')[0] ?? 'Trader'
}

export function getCurrentUserEmail(): string {
  const user = getCurrentUser()
  return user?.email ?? ''
}

export async function getCurrencyPairs(category?: string): Promise<CurrencyPair[]> {
  const cacheKey = category || 'all'
  const cached = pairsCache.get(cacheKey)
  if (cached && Date.now() - cached.timestamp < PAIRS_CACHE_TTL) {
    return cached.data
  }

  const storedPairs = await loadPairsFromStorage(cacheKey)
  if (storedPairs) {
    pairsCache.set(cacheKey, { data: storedPairs, timestamp: Date.now() })
    return storedPairs
  }

  const symbols = Object.keys(PAIR_META)
  const filtered = category && category !== 'All'
    ? symbols.filter(s => PAIR_META[s].category === category)
    : symbols

  try {
    const quotes = await getMultipleQuotes(filtered)

    const result = filtered.map(symbol => {
      const meta = PAIR_META[symbol]
      const quote = quotes[symbol] || FALLBACK_QUOTES[symbol]
      return {
        symbol,
        name: meta.name,
        category: meta.category,
        price: quote?.price ?? 0,
        change: quote?.change ?? 0,
        changePercent: quote?.changePercent ?? 0,
        bid: quote?.bid ?? 0,
        ask: quote?.ask ?? 0,
        spread: quote?.ask && quote?.bid ? Number(((quote.ask - quote.bid) * (symbol.includes('JPY') ? 100 : 10000)).toFixed(1)) : 0,
        dayHigh: quote?.dayHigh ?? 0,
        dayLow: quote?.dayLow ?? 0,
        flag1: meta.flag1,
        flag2: meta.flag2,
      }
    })

    pairsCache.set(cacheKey, { data: result, timestamp: Date.now() })
    savePairsToStorage(cacheKey, result)
    return result
  } catch (error) {
    console.error('Failed to fetch quotes, using fallback:', error)
    return filtered.map(symbol => {
      const meta = PAIR_META[symbol]
      const fallback = FALLBACK_QUOTES[symbol]
      return {
        symbol,
        name: meta.name,
        category: meta.category,
        price: fallback?.price ?? 0,
        change: fallback?.change ?? 0,
        changePercent: fallback?.changePercent ?? 0,
        bid: fallback?.bid ?? 0,
        ask: fallback?.ask ?? 0,
        spread: 0,
        dayHigh: fallback?.dayHigh ?? 0,
        dayLow: fallback?.dayLow ?? 0,
        flag1: meta.flag1,
        flag2: meta.flag2,
      }
    })
  }
}

export async function getCurrencyPair(symbol: string): Promise<CurrencyPair | undefined> {
  const meta = PAIR_META[symbol]
  if (!meta) return undefined

  const cached = getCachedQuote(symbol)
  if (cached) {
    const isJPY = symbol.includes('JPY')
    return {
      symbol,
      name: meta.name,
      category: meta.category,
      price: cached.price,
      change: cached.change,
      changePercent: cached.changePercent,
      bid: cached.bid,
      ask: cached.ask,
      spread: cached.ask && cached.bid ? Number(((cached.ask - cached.bid) * (isJPY ? 100 : 10000)).toFixed(1)) : 0,
      dayHigh: cached.dayHigh,
      dayLow: cached.dayLow,
      flag1: meta.flag1,
      flag2: meta.flag2,
    }
  }

  const storedQuote = await loadQuoteFromStorage(symbol)
  if (storedQuote) {
    const isJPY = symbol.includes('JPY')
    setCachedQuote(symbol, storedQuote)
    return {
      symbol,
      name: meta.name,
      category: meta.category,
      price: storedQuote.price,
      change: storedQuote.change,
      changePercent: storedQuote.changePercent,
      bid: storedQuote.bid,
      ask: storedQuote.ask,
      spread: storedQuote.ask && storedQuote.bid ? Number(((storedQuote.ask - storedQuote.bid) * (isJPY ? 100 : 10000)).toFixed(1)) : 0,
      dayHigh: storedQuote.dayHigh,
      dayLow: storedQuote.dayLow,
      flag1: meta.flag1,
      flag2: meta.flag2,
    }
  }

  try {
    const quote = await getQuote(symbol)
    const isJPY = symbol.includes('JPY')
    saveQuoteToStorage(symbol, quote)
    return {
      symbol,
      name: meta.name,
      category: meta.category,
      price: quote.price,
      change: quote.change,
      changePercent: quote.changePercent,
      bid: quote.bid,
      ask: quote.ask,
      spread: quote.ask && quote.bid ? Number(((quote.ask - quote.bid) * (isJPY ? 100 : 10000)).toFixed(1)) : 0,
      dayHigh: quote.dayHigh,
      dayLow: quote.dayLow,
      flag1: meta.flag1,
      flag2: meta.flag2,
    }
  } catch (error) {
    console.error(`Failed to fetch quote for ${symbol}:`, error)
    const fallback = FALLBACK_QUOTES[symbol]
    const isJPY = symbol.includes('JPY')
    return {
      symbol,
      name: meta.name,
      category: meta.category,
      price: fallback?.price ?? 0,
      change: fallback?.change ?? 0,
      changePercent: fallback?.changePercent ?? 0,
      bid: fallback?.bid ?? 0,
      ask: fallback?.ask ?? 0,
      spread: fallback?.ask && fallback?.bid ? Number(((fallback.ask - fallback.bid) * (isJPY ? 100 : 10000)).toFixed(1)) : 0,
      dayHigh: fallback?.dayHigh ?? 0,
      dayLow: fallback?.dayLow ?? 0,
      flag1: meta.flag1,
      flag2: meta.flag2,
    }
  }
}

function getCachedQuote(symbol: string) {
  const cached = quoteCache.get(symbol)
  if (cached && Date.now() - cached.timestamp < 60000) {
    return cached.data
  }
  return null
}

function setCachedQuote(symbol: string, data: any) {
  quoteCache.set(symbol, { data, timestamp: Date.now() })
}

const quoteCache = new Map<string, { data: any; timestamp: number }>()

export async function isUsernameTaken(userName: string): Promise<boolean> {
  const q = query(collection(db, 'users'), where('userName', '==', userName.trim()))
  const snap = await getDocs(q)
  return !snap.empty
}

export async function getUserProfile(): Promise<UserProfile> {
  const userId = getCurrentUserId()

  const defaultProfile: UserProfile = {
    id: userId,
    userName: getCurrentUserName(),
    email: getCurrentUserEmail(),
    plan: 'free',
    accountBalance: 0,
    totalPL: 0,
    totalPLPercent: 0,
    totalTrades: 0,
    winCount: 0,
  }

  try {
    const userRef = doc(db, 'users', userId)
    const userSnap = await getDoc(userRef)

    if (userSnap.exists()) {
      return userSnap.data() as UserProfile
    }

    await setDoc(userRef, defaultProfile)
    return defaultProfile
  } catch (error) {
    console.error('Failed to load user profile:', error)
    return defaultProfile
  }
}

export async function updateBalance(amount: number): Promise<void> {
  const userId = getCurrentUserId()
  try {
    const userRef = doc(db, 'users', userId)
    const userSnap = await getDoc(userRef)

    if (userSnap.exists()) {
      const data = userSnap.data() as UserProfile
      await updateDoc(userRef, {
        accountBalance: data.accountBalance + amount,
      })
    }
  } catch (error) {
    console.error('Failed to update balance:', error)
  }
}

export async function saveTrade(trade: Omit<Trade, 'id'>): Promise<string> {
  const docRef = await addDoc(collection(db, 'trades'), {
    pair: trade.pair,
    signal: trade.signal,
    entry: trade.entry,
    exitPrice: null,
    stopLoss: trade.stopLoss,
    takeProfit: trade.takeProfit,
    riskReward: trade.riskReward,
    confidence: Number(trade.confidence),
    profitLoss: 0,
    profitLossPercent: 0,
    status: trade.status,
    reasons: trade.reasons,
    createdAt: serverTimestamp(),
    closedAt: null,
    userId: trade.userId,
  })
  return docRef.id
}

export async function closeTrade(
  tradeId: string,
  exitPrice: string,
  profitLoss: number,
  profitLossPercent: number
): Promise<void> {
  const tradeRef = doc(db, 'trades', tradeId)
  await updateDoc(tradeRef, {
    exitPrice,
    profitLoss: Number(profitLoss),
    profitLossPercent: Number(profitLossPercent),
    status: 'closed',
    closedAt: serverTimestamp(),
  })

  const userId = getCurrentUserId()
  const userRef = doc(db, 'users', userId)
  const userSnap = await getDoc(userRef)

  if (userSnap.exists()) {
    const data = userSnap.data() as UserProfile
    await updateDoc(userRef, {
      accountBalance: data.accountBalance + profitLoss,
      totalPL: data.totalPL + profitLoss,
      totalTrades: data.totalTrades + 1,
      winCount: profitLoss > 0 ? data.winCount + 1 : data.winCount,
    })
  }
}

export async function deleteTrade(tradeId: string): Promise<void> {
  await deleteDoc(doc(db, 'trades', tradeId))
}

export async function getUserTrades(tradeLimit = 50): Promise<Trade[]> {
  const userId = getCurrentUserId()
  try {
    const q = query(
      collection(db, 'trades'),
      where('userId', '==', userId)
    )

    const snapshot = await getDocs(q)
    const trades = snapshot.docs.map(d => ({
      id: d.id,
      ...d.data(),
      createdAt: d.data().createdAt?.toMillis?.() ?? Date.now(),
      closedAt: d.data().closedAt?.toMillis?.() ?? null,
    })) as Trade[]

    return trades.sort((a, b) => (b.createdAt ?? 0) - (a.createdAt ?? 0)).slice(0, tradeLimit)
  } catch (error) {
    console.error('Failed to load trades:', error)
    return []
  }
}

export async function getUserOpenTrades(): Promise<Trade[]> {
  const userId = getCurrentUserId()
  try {
    const q = query(
      collection(db, 'trades'),
      where('userId', '==', userId),
      where('status', '==', 'open')
    )

    const snapshot = await getDocs(q)
    const trades = snapshot.docs.map(d => ({
      id: d.id,
      ...d.data(),
      createdAt: d.data().createdAt?.toMillis?.() ?? Date.now(),
    })) as Trade[]

    return trades.sort((a, b) => (b.createdAt ?? 0) - (a.createdAt ?? 0))
  } catch (error) {
    console.error('Failed to load open trades:', error)
    return []
  }
}

export async function getMarketNews(): Promise<MarketNews[]> {
  try {
    const key = process.env.EXPO_PUBLIC_FINNHUB_API_KEY
    if (!key) throw new Error('No Finnhub API key')

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
        currency,
        title: item.headline,
        time: formatTimeAgo(item.datetime),
        url: item.url || '',
      })

      if (results.length >= 10) break
    }

    return results
  } catch (error) {
    console.error('Failed to fetch news:', error)
    return [
      { id: '1', currency: 'USD', title: 'Unable to load news — pull to refresh', time: 'now', url: '' },
    ]
  }
}

function formatTimeAgo(unix: number): string {
  if (!unix) return 'now'
  const diff = Math.floor(Date.now() / 1000) - unix
  if (diff < 60) return 'just now'
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`
  return `${Math.floor(diff / 86400)}d ago`
}

export function getGreeting(): string {
  const hour = new Date().getHours()
  if (hour < 12) return 'Good morning'
  if (hour < 18) return 'Good afternoon'
  return 'Good evening'
}

export function isMarketOpen(): boolean {
  const now = new Date()
  const day = now.getUTCDay()
  const hour = now.getUTCHours()
  if (day === 0 || day === 6) return false
  if (hour >= 22 || hour < 0) return false
  return true
}

export function formatPrice(price: number): string {
  if (!Number.isFinite(price)) return '0.00000'
  if (Math.abs(price) >= 1000) return price.toFixed(2)
  if (Math.abs(price) >= 100) return price.toFixed(3)
  if (Math.abs(price) >= 1) return price.toFixed(5)
  return price.toFixed(5)
}
