import { View, Text, ScrollView, Pressable, ActivityIndicator } from 'react-native'
import { useState, useEffect, useRef } from 'react'
import { SafeAreaView } from 'react-native-safe-area-context'
import { Ionicons } from '@expo/vector-icons'
import { router, useLocalSearchParams } from 'expo-router'
import { getCurrencyPair } from '../../lib/services/dataService'
import { getTwelveData } from '../../lib/api/finnhub'
import { Candle } from '../../lib/indicators/types'
import CandleChart from '../../component/CandleChart'

const TIMEFRAMES = ['15M', '1H', '4H', '1D', '1W']

const INTERVAL_MAP: Record<string, string> = {
  '15M': '15min',
  '1H': '1h',
  '4H': '4h',
  '1D': '1day',
  '1W': '1week',
}

export default function ChartScreen() {
  const { symbol } = useLocalSearchParams<{ symbol: string }>()
  const [selectedTimeframe, setSelectedTimeframe] = useState('4H')
  const [candles, setCandles] = useState<Candle[]>([])
  const [loading, setLoading] = useState(true)
  const [pairName, setPairName] = useState('')
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null)

  useEffect(() => {
    loadChartData()
    startAutoRefresh()
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current)
    }
  }, [symbol, selectedTimeframe])

  function startAutoRefresh() {
    if (intervalRef.current) clearInterval(intervalRef.current)
    intervalRef.current = setInterval(loadChartData, 60000)
  }

  async function loadChartData() {
    if (!symbol) return
    try {
      const decoded = symbol.replace(/_/g, '/')
      const [base, quote] = decoded.split('/')
      const interval = INTERVAL_MAP[selectedTimeframe] || '4h'
      const data = await getTwelveData(base, quote, interval, '100')
      setCandles(data)
      setPairName(decoded)
    } catch (error) {
      console.error('Failed to load chart data:', error)
    } finally {
      setLoading(false)
    }
  }

  const lastCandle = candles[candles.length - 1]
  const previousCandle = candles[candles.length - 2]
  const priceChange = lastCandle && previousCandle ? lastCandle.close - previousCandle.close : 0
  const priceChangePercent = previousCandle ? (priceChange / previousCandle.close) * 100 : 0
  const isPositive = priceChange >= 0

  return (
    <SafeAreaView className="flex-1 bg-[#0A0A12]">
      <ScrollView showsVerticalScrollIndicator={false}>
        <View className="px-4 pt-4">
          <View className="mb-4 flex-row items-center justify-between">
            <Pressable
              onPress={() => router.back()}
              className="h-10 w-10 items-center justify-center rounded-full bg-[#1C1C2E]"
            >
              <Ionicons name="chevron-back" size={20} color="#FFF" />
            </Pressable>

            <View className="items-center">
              <Text className="text-[16px] font-bold text-white">
                {pairName}
              </Text>
              {lastCandle && (
                <View className="flex-row items-center gap-2">
                  <Text className="text-[14px] font-semibold text-white">
                    {lastCandle.close.toFixed(5)}
                  </Text>
                  <Text className={`text-[12px] font-medium ${isPositive ? 'text-[#22C55E]' : 'text-[#EF4444]'}`}>
                    {isPositive ? '+' : ''}{priceChangePercent.toFixed(2)}%
                  </Text>
                </View>
              )}
            </View>

            <View className="w-10" />
          </View>

          <View className="mb-4 flex-row gap-1.5">
            {TIMEFRAMES.map((tf) => (
              <Pressable
                key={tf}
                onPress={() => setSelectedTimeframe(tf)}
                className={`flex-1 items-center rounded-lg py-2 ${
                  selectedTimeframe === tf
                    ? 'bg-[#8B5CF6]'
                    : 'bg-[#1C1C2E]'
                }`}
              >
                <Text className={`text-[12px] font-medium ${
                  selectedTimeframe === tf ? 'text-white' : 'text-[#64646E]'
                }`}>
                  {tf}
                </Text>
              </Pressable>
            ))}
          </View>

          <View className="mb-4 rounded-xl border border-[#1C1C2E] bg-[#0D0D14] p-3">
            {loading ? (
              <View className="h-[350px] items-center justify-center">
                <ActivityIndicator size="large" color="#8B5CF6" />
                <Text className="mt-3 text-[13px] text-[#64646E]">Loading chart...</Text>
              </View>
            ) : (
              <CandleChart candles={candles} />
            )}
          </View>

          {lastCandle && (
            <View className="mb-4 rounded-xl border border-[#1C1C2E] bg-[#0D0D14] p-4">
              <Text className="mb-3 text-[12px] font-semibold text-[#64646E]">
                OHLC DATA
              </Text>
              <View className="flex-row justify-between">
                <View className="items-center">
                  <Text className="text-[10px] text-[#64646E]">Open</Text>
                  <Text className="text-[13px] text-white">{lastCandle.open.toFixed(5)}</Text>
                </View>
                <View className="items-center">
                  <Text className="text-[10px] text-[#64646E]">High</Text>
                  <Text className="text-[13px] text-[#22C55E]">{lastCandle.high.toFixed(5)}</Text>
                </View>
                <View className="items-center">
                  <Text className="text-[10px] text-[#64646E]">Low</Text>
                  <Text className="text-[13px] text-[#EF4444]">{lastCandle.low.toFixed(5)}</Text>
                </View>
                <View className="items-center">
                  <Text className="text-[10px] text-[#64646E]">Close</Text>
                  <Text className="text-[13px] text-[#8B5CF6]">{lastCandle.close.toFixed(5)}</Text>
                </View>
              </View>
            </View>
          )}

          <View className="mb-6 flex-row justify-center gap-4">
            <View className="flex-row items-center gap-1.5">
              <View className="h-2 w-2 rounded-full bg-[#3B82F6]" />
              <Text className="text-[10px] text-[#64646E]">Entry</Text>
            </View>
            <View className="flex-row items-center gap-1.5">
              <View className="h-2 w-2 rounded-full bg-[#EF4444]" />
              <Text className="text-[10px] text-[#64646E]">Stop Loss</Text>
            </View>
            <View className="flex-row items-center gap-1.5">
              <View className="h-2 w-2 rounded-full bg-[#22C55E]" />
              <Text className="text-[10px] text-[#64646E]">Take Profit</Text>
            </View>
            <View className="flex-row items-center gap-1.5">
              <View className="h-2 w-2 rounded-full bg-[#22C55E]" />
              <Text className="text-[10px] text-[#64646E]">Bullish</Text>
            </View>
            <View className="flex-row items-center gap-1.5">
              <View className="h-2 w-2 rounded-full bg-[#EF4444]" />
              <Text className="text-[10px] text-[#64646E]">Bearish</Text>
            </View>
          </View>
        </View>
      </ScrollView>
    </SafeAreaView>
  )
}
