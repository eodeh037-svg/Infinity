import { View, Text, ScrollView, Pressable, RefreshControl, ActivityIndicator } from 'react-native'
import { useState, useEffect, useCallback, useLayoutEffect } from 'react'
import { SafeAreaView } from 'react-native-safe-area-context'
import { Ionicons } from '@expo/vector-icons'
import { router } from 'expo-router'
import {
  getCurrencyPairs,
  getUserProfile,
  getUserOpenTrades,
  getMarketNews,
  getGreeting,
  isMarketOpen,
  formatPrice,
  waitForAuth,
} from '../../lib/services/dataService'
import { CurrencyPair, UserProfile, Trade, MarketNews } from '../../types'

function formatDollar(amount: number): string {
  if (amount < 0) return `-$${Math.abs(amount).toFixed(2)}`
  return `$${amount.toFixed(2)}`
}

export default function HomeScreen() {
  const [user, setUser] = useState<UserProfile | null>(null)
  const [pairs, setPairs] = useState<CurrencyPair[]>([])
  const [openTrades, setOpenTrades] = useState<Trade[]>([])
  const [news, setNews] = useState<MarketNews[]>([])
  const [loading, setLoading] = useState(false)
  const [refreshing, setRefreshing] = useState(false)

  useLayoutEffect(() => {
    loadData()
  }, [])

  async function loadData() {
    try {
      setLoading(true)
      await waitForAuth()
      const [userData, newsData, tradesData, pairsData] = await Promise.all([
        getUserProfile(),
        getMarketNews(),
        getUserOpenTrades(),
        getCurrencyPairs('Major'),
      ])
      setUser(userData)
      setNews(newsData)
      setOpenTrades(tradesData)
      setPairs(pairsData)
    } catch (error) {
      console.log(error)
    } finally {
      setLoading(false)
      setRefreshing(false)
    }
  }

  const onRefresh = useCallback(() => {
    setRefreshing(true)
    loadData()
  }, [])

  const bestPair = pairs.length > 0 ? pairs.reduce((a, b) => a.changePercent > b.changePercent ? a : b) : null
  const worstPair = pairs.length > 0 ? pairs.reduce((a, b) => a.changePercent < b.changePercent ? a : b) : null
  const marketOpen = isMarketOpen()

  if (loading) {
    return <View className="flex-1 items-center justify-center bg-[#0A0A12]">
      <ActivityIndicator size="large" color="#8B5CF6" />
      <Text className="text-white mt-4">Loading hang tight...</Text>
    </View>
  }

  return (
    <SafeAreaView className="flex-1 bg-[#0A0A12]">
      <ScrollView
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#8B5CF6" />
        }
      >
        <View className="px-5 pt-4">
          <View className="mb-6 flex-row items-center justify-between">
            <View className="flex-row items-center gap-3">
              <View className="h-10 w-10 items-center justify-center rounded-full bg-[#8B5CF6]">
                <Text className="text-[16px] font-bold text-white">∞</Text>
              </View>
              <View>
                <Text className="text-[11px] text-[#64646E]">Infinity</Text>
                <Text className="text-[11px] text-[#64646E]">
                  {getGreeting()},
                </Text>
                <Text className="text-[18px] font-bold text-white">
                  {user?.userName ?? 'Trader'}
                </Text>
              </View>
            </View>

            <View className="flex-row items-center gap-3">
              <View
                className={`flex-row items-center gap-1.5 rounded-full px-3 py-1.5 ${
                  marketOpen ? 'bg-[#22C55E]/20' : 'bg-[#EF4444]/20'
                }`}
              >
                <View
                  className={`h-1.5 w-1.5 rounded-full ${
                    marketOpen ? 'bg-[#22C55E]' : 'bg-[#EF4444]'
                  }`}
                />
                <Text
                  className={`text-[11px] font-medium ${
                    marketOpen ? 'text-[#22C55E]' : 'text-[#EF4444]'
                  }`}
                >
                  {marketOpen ? 'Market Open' : 'Market Closed'}
                </Text>
              </View>

              <Pressable className="relative">
                <Ionicons name="notifications-outline" size={22} color="#FFF" />
                <View className="absolute -right-1 -top-1 h-2 w-2 rounded-full bg-[#8B5CF6]" />
              </Pressable>
            </View>
          </View>

          <View className="mb-6 rounded-2xl border border-[#1C1C2E] bg-[#0D0D14] p-5">
            <View className="mb-4 flex-row items-center justify-between">
              <View>
                <Text className="text-[12px] text-[#64646E]">Account Balance</Text>
                <Text className={`text-[28px] font-bold ${(user?.accountBalance ?? 0) >= 0 ? 'text-white' : 'text-[#EF4444]'}`}>
                  {formatDollar(user?.accountBalance ?? 0)}
                </Text>
              </View>
              <View className="items-end">
                <Text className="text-[12px] text-[#64646E]">Total P/L</Text>
                <Text className={`text-[18px] font-bold ${(user?.totalPL ?? 0) >= 0 ? 'text-[#22C55E]' : 'text-[#EF4444]'}`}>
                  {formatDollar(user?.totalPL ?? 0)}
                </Text>
              </View>
            </View>

            <View className="flex-row items-center justify-between border-t border-[#1C1C2E] pt-3">
              <View className="flex-row items-center gap-2">
                <View className="h-2 w-2 rounded-full bg-[#64646E]" />
                <Text className="text-[12px] text-[#64646E]">
                  Open positions: {openTrades.length}
                </Text>
              </View>
              <View className="flex-row items-center gap-1.5 rounded-md border border-[#1C1C2E] px-2 py-1">
                <Ionicons name="flash" size={12} color="#8B5CF6" />
                <Text className="text-[11px] text-[#64646E]">
                  {user?.plan === 'premium' ? 'Premium Plan' : 'Free Plan'}
                </Text>
              </View>
            </View>
          </View>

          <View className="mb-6">
            <Text className="mb-3 text-[13px] font-semibold uppercase tracking-wider text-[#64646E]">
              Today's AI Insights
            </Text>
            <View className="flex-row gap-3">
              {bestPair && (
                <Pressable
                  onPress={() => router.push(`/pair/${bestPair.symbol.replace('/', '_')}`)}
                  className="flex-1 rounded-xl border border-[#1C1C2E] bg-[#0D0D14] p-4"
                >
                  <View className="mb-2 flex-row items-center gap-1">
                    <Text className="text-[10px] text-[#22C55E]">↗↗</Text>
                    <Text className="text-[10px] font-semibold text-[#22C55E]">
                      BEST PAIR
                    </Text>
                  </View>
                  <Text className="text-[18px] font-bold text-white">
                    {bestPair.symbol}
                  </Text>
                  <Text className="mb-2 text-[13px] text-[#64646E]">
                    {formatPrice(bestPair.price)}
                  </Text>
                  <View className="flex-row items-center gap-2">
                    <View className="rounded-md bg-[#22C55E]/20 px-2 py-0.5">
                      <Text className="text-[11px] font-bold text-[#22C55E]">BUY</Text>
                    </View>
                    <Text className="text-[12px] text-[#64646E]">
                      {bestPair.changePercent >= 0 ? '+' : ''}{bestPair.changePercent.toFixed(2)}%
                    </Text>
                  </View>
                </Pressable>
              )}

              {worstPair && (
                <Pressable
                  onPress={() => router.push(`/pair/${worstPair.symbol.replace('/', '_')}`)}
                  className="flex-1 rounded-xl border border-[#1C1C2E] bg-[#0D0D14] p-4"
                >
                  <View className="mb-2 flex-row items-center gap-1">
                    <Text className="text-[10px] text-[#EF4444]">↘↘</Text>
                    <Text className="text-[10px] font-semibold text-[#EF4444]">
                      WORST PAIR
                    </Text>
                  </View>
                  <Text className="text-[18px] font-bold text-white">
                    {worstPair.symbol}
                  </Text>
                  <Text className="mb-2 text-[13px] text-[#64646E]">
                    {formatPrice(worstPair.price)}
                  </Text>
                  <View className="flex-row items-center gap-2">
                    <View className="rounded-md bg-[#EF4444]/20 px-2 py-0.5">
                      <Text className="text-[11px] font-bold text-[#EF4444]">SELL</Text>
                    </View>
                    <Text className="text-[12px] text-[#64646E]">
                      {worstPair.changePercent >= 0 ? '+' : ''}{worstPair.changePercent.toFixed(2)}%
                    </Text>
                  </View>
                </Pressable>
              )}
            </View>
          </View>

          <View className="mb-6">
            <Text className="mb-3 text-[13px] font-semibold uppercase tracking-wider text-[#64646E]">
              Open Positions
            </Text>
            {openTrades.length > 0 ? (
              openTrades.map(trade => (
                <Pressable
                  key={trade.id}
                  className="mb-2 rounded-xl border border-[#1C1C2E] bg-[#0D0D14] p-4"
                >
                  <View className="flex-row items-center justify-between">
                    <View className="flex-row items-center gap-2">
                      <Text className="text-[15px] font-semibold text-white">{trade.pair}</Text>
                      <View className={`rounded-md px-2 py-0.5 ${trade.signal === 'BUY' ? 'bg-[#22C55E]/20' : 'bg-[#EF4444]/20'}`}>
                        <Text className={`text-[11px] font-bold ${trade.signal === 'BUY' ? 'text-[#22C55E]' : 'text-[#EF4444]'}`}>
                          {trade.signal}
                        </Text>
                      </View>
                    </View>
                    <Text className="text-[12px] text-[#64646E]">
                      Entry: {trade.entry}
                    </Text>
                  </View>
                </Pressable>
              ))
            ) : (
              <View className="rounded-xl border border-[#1C1C2E] bg-[#0D0D14] py-8 items-center">
                <Text className="text-[13px] text-[#64646E]">No open positions</Text>
              </View>
            )}
          </View>

          <View className="mb-6">
            <Text className="mb-3 text-[13px] font-semibold uppercase tracking-wider text-[#64646E]">
              Market Summary
            </Text>
            <View className="rounded-xl border border-[#1C1C2E] bg-[#0D0D14]">
              {pairs.slice(0, 4).map((pair) => (
                <Pressable
                  key={pair.symbol}
                  onPress={() => router.push(`/pair/${pair.symbol.replace('/', '_')}`)}
                  className="flex-row items-center justify-between border-b border-[#1C1C2E] px-4 py-3.5"
                >
                  <View className="flex-row items-center gap-2">
                    <Text className="text-sm">{pair.flag1}</Text>
                    <Text className="text-[14px] font-medium text-white">
                      {pair.symbol}
                    </Text>
                  </View>

                  <View className="flex-row items-center gap-4">
                    <Text className="text-[14px] text-white">
                      {formatPrice(pair.price)}
                    </Text>
                    <Text
                      className={`text-[13px] font-medium ${
                        pair.changePercent >= 0 ? 'text-[#22C55E]' : 'text-[#EF4444]'
                      }`}
                    >
                      {pair.changePercent >= 0 ? '+' : ''}{pair.changePercent.toFixed(2)}%
                    </Text>
                  </View>
                </Pressable>
              ))}
            </View>
          </View>

          <View className="mb-8">
            <Text className="mb-3 text-[13px] font-semibold uppercase tracking-wider text-[#64646E]">
              Market News
            </Text>
            <View className="rounded-xl border border-[#1C1C2E] bg-[#0D0D14]">
              {news.map((item) => (
                <View
                  key={item.id}
                  className="flex-row items-start gap-3 border-b border-[#1C1C2E] p-4"
                >
                  <View className="mt-0.5 rounded-md bg-[#8B5CF6]/20 px-2 py-1">
                    <Text className="text-[10px] font-bold text-[#8B5CF6]">
                      {item.currency}
                    </Text>
                  </View>
                  <View className="flex-1">
                    <Text className="text-[13px] leading-5 text-white">
                      {item.title}
                    </Text>
                    <Text className="mt-1 text-[11px] text-[#64646E]">
                      {item.time}
                    </Text>
                  </View>
                </View>
              ))}
            </View>
          </View>
        </View>
      </ScrollView>
    </SafeAreaView>
  )
}
