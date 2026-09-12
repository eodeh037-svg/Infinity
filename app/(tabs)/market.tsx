import { View, Text, TextInput, ScrollView, Pressable, RefreshControl, ActivityIndicator } from 'react-native'
import { useState, useCallback, useRef, useEffect } from 'react'
import { SafeAreaView } from 'react-native-safe-area-context'
import { Ionicons } from '@expo/vector-icons'
import { router } from 'expo-router'
import { getCurrencyPairs } from '../../lib/services/dataService'
import { CurrencyPair } from '../../types'
import MarketCard from '../../component/MarketCard'

const CATEGORIES = ['All', 'Major', 'Minor', 'Exotic', 'Crypto', 'Commodities']
const REFRESH_INTERVAL = 60000

export default function MarketsScreen() {
  const [allPairs, setAllPairs] = useState<CurrencyPair[]>([])
  const [filteredPairs, setFilteredPairs] = useState<CurrencyPair[]>([])
  const [selectedCategory, setSelectedCategory] = useState('All')
  const [search, setSearch] = useState('')
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const loadedRef = useRef(false)

  useEffect(() => {
    loadAllPairs()
    intervalRef.current = setInterval(() => loadAllPairs(true), REFRESH_INTERVAL)
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current)
    }
  }, [])

  useEffect(() => {
    filterPairs()
  }, [allPairs, selectedCategory, search])

  async function loadAllPairs(isRefresh = false) {
    try {
      const data = await getCurrencyPairs('all')
      setAllPairs(data)
      if (!loadedRef.current) setLoading(false)
      loadedRef.current = true
    } catch (error) {
      console.error('Failed to load pairs:', error)
      if (!loadedRef.current) setLoading(false)
      loadedRef.current = true
    } finally {
      setRefreshing(false)
    }
  }

  function filterPairs() {
    let result = allPairs
    if (selectedCategory !== 'All') {
      result = result.filter(p => p.category === selectedCategory)
    }
    if (search) {
      const lower = search.toLowerCase()
      result = result.filter(
        p =>
          p.symbol.toLowerCase().includes(lower) ||
          p.name.toLowerCase().includes(lower)
      )
    }
    setFilteredPairs(result)
  }

  const onRefresh = useCallback(() => {
    setRefreshing(true)
    loadAllPairs(true)
  }, [])

  if (loading) {
    return (
      <View className="flex-1 items-center justify-center bg-[#0A0A12]">
        <ActivityIndicator size="large" color="#8B5CF6" />
        <Text className="mt-3 text-[13px] text-[#64646E]">Loading market data...</Text>
      </View>
    )
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
          <Text className="mb-4 text-[24px] font-bold text-white">
            Markets
          </Text>

          <View className="mb-4 flex-row items-center rounded-2xl border border-[#1C1C2E] bg-[#0D0D14] px-4 py-3">
            <Ionicons name="search" size={18} color="#64646E" />
            <TextInput
              placeholder="Search pairs..."
              placeholderTextColor="#64646E"
              value={search}
              onChangeText={setSearch}
              className="ml-2 flex-1 text-[14px] text-white"
            />
            {search.length > 0 && (
              <Pressable onPress={() => setSearch('')}>
                <Ionicons name="close-circle" size={18} color="#64646E" />
              </Pressable>
            )}
          </View>

          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            className="mb-4"
          >
            <View className="flex-row gap-2">
              {CATEGORIES.map((category) => (
                <Pressable
                  key={category}
                  onPress={() => setSelectedCategory(category)}
                  className={`rounded-full px-4 py-2 ${
                    selectedCategory === category
                      ? 'bg-[#8B5CF6]'
                      : 'bg-[#1C1C2E]'
                  }`}
                >
                  <Text
                    className={`text-[13px] font-medium ${
                      selectedCategory === category
                        ? 'text-white'
                        : 'text-[#64646E]'
                    }`}
                  >
                    {category}
                  </Text>
                </Pressable>
              ))}
            </View>
          </ScrollView>

          <View className="mb-2 flex-row justify-between px-1">
            <Text className="text-[11px] font-semibold uppercase tracking-wider text-[#64646E]">
              PAIR
            </Text>
            <View className="flex-row gap-10">
              <Text className="text-[11px] font-semibold uppercase tracking-wider text-[#64646E]">
                PRICE
              </Text>
              <Text className="text-[11px] font-semibold uppercase tracking-wider text-[#64646E]">
                CHANGE
              </Text>
            </View>
          </View>

          <View className="rounded-2xl border border-[#1C1C2E] bg-[#0D0D14]">
            {filteredPairs.map((pair) => (
              <MarketCard
                key={pair.symbol}
                pair={pair}
                onPress={() => router.push(`/pair/${pair.symbol.replace('/', '_')}`)}
              />
            ))}
            {filteredPairs.length === 0 && (
              <View className="items-center py-10">
                <Ionicons name="search-outline" size={32} color="#64646E" />
                <Text className="mt-2 text-[14px] text-[#64646E]">
                  No pairs found
                </Text>
              </View>
            )}
          </View>
        </View>
      </ScrollView>
    </SafeAreaView>
  )
}
