import { View, Text, TextInput, ScrollView, Pressable, Modal, Alert, Animated, Easing, ActivityIndicator } from 'react-native'
import { useState, useEffect, useRef } from 'react'
import { SafeAreaView } from 'react-native-safe-area-context'
import { Ionicons } from '@expo/vector-icons'
import { router } from 'expo-router'
import { getCurrencyPairs, saveTrade, formatPrice, getCurrentUserId } from '../../lib/services/dataService'
import { getTwelveData } from '../../lib/api/finnhub'
import { generateSignal, SignalResult } from '../../lib/signals/signalEngine'
import { CurrencyPair } from '../../types'

const CATEGORIES = ['Major', 'Minor', 'Exotic', 'Crypto', 'Commodities']
const ANALYSIS_STEPS = [
  { icon: 'analytics', label: 'Fetching market candles', sublabel: 'Connecting to live data feed' },
  { icon: 'trending-up', label: 'Calculating indicators', sublabel: 'EMA-20, EMA-50, RSI-14, MACD' },
  { icon: 'pulse', label: 'Analyzing momentum', sublabel: 'Evaluating trend strength' },
  { icon: 'search', label: 'Scanning structure', sublabel: 'Identifying support & resistance' },
  { icon: 'sparkles', label: 'Generating signal', sublabel: 'Computing optimal entry & exit' },
]

function LoadingStep({ step, index, activeIndex }: { step: typeof ANALYSIS_STEPS[0], index: number, activeIndex: number }) {
  const isActive = index === activeIndex
  const isDone = index < activeIndex
  const pulseAnim = useRef(new Animated.Value(1)).current

  useEffect(() => {
    if (isActive) {
      Animated.loop(
        Animated.sequence([
          Animated.timing(pulseAnim, { toValue: 0.4, duration: 800, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
          Animated.timing(pulseAnim, { toValue: 1, duration: 800, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
        ])
      ).start()
    }
  }, [isActive])

  return (
    <Animated.View style={{ opacity: isActive ? pulseAnim : 1 }} className="flex-row items-center gap-3 py-3">
      <View className={`h-10 w-10 items-center justify-center rounded-full ${
        isDone ? 'bg-[#22C55E]' : isActive ? 'bg-[#8B5CF6]' : 'bg-[#1C1C2E]'
      }`}>
        {isDone ? (
          <Ionicons name="checkmark" size={18} color="#FFF" />
        ) : (
          <Ionicons name={step.icon as any} size={18} color={isActive ? '#FFF' : '#64646E'} />
        )}
      </View>
      <View className="flex-1">
        <Text className={`text-[13px] font-medium ${isDone || isActive ? 'text-white' : 'text-[#64646E]'}`}>
          {step.label}
        </Text>
        <Text className={`text-[11px] ${isDone || isActive ? 'text-[#8B5CF6]' : 'text-[#64646E]'}`}>
          {step.sublabel}
        </Text>
      </View>
      {isDone && <Ionicons name="checkmark-circle" size={16} color="#22C55E" />}
      {isActive && (
        <View className="flex-row gap-1">
          <View className="h-1.5 w-1.5 rounded-full bg-[#8B5CF6]" />
          <View className="h-1.5 w-1.5 rounded-full bg-[#8B5CF6]" />
          <View className="h-1.5 w-1.5 rounded-full bg-[#8B5CF6]" />
        </View>
      )}
    </Animated.View>
  )
}

export default function GenerateScreen() {
  const [pairs, setPairs] = useState<CurrencyPair[]>([])
  const [filteredPairs, setFilteredPairs] = useState<CurrencyPair[]>([])
  const [selectedCategory, setSelectedCategory] = useState('Major')
  const [search, setSearch] = useState('')
  const [loading, setLoading] = useState(false)
  const [generating, setGenerating] = useState(false)
  const [activeStep, setActiveStep] = useState(0)
  const [selectedPair, setSelectedPair] = useState<CurrencyPair | null>(null)
  const [signalResult, setSignalResult] = useState<SignalResult | null>(null)
  const [showSignalModal, setShowSignalModal] = useState(false)
  const [accountSize, setAccountSize] = useState('')

  useEffect(() => {
    loadPairs()
  }, [])

  useEffect(() => {
    filterPairs()
  }, [pairs, selectedCategory, search])

  async function loadPairs() {
    try {
      setLoading(true)
      const data = await getCurrencyPairs(selectedCategory)
      setPairs(data)
    } catch (error) {
      console.error('Failed to load pairs:', error)
    } finally {
      setLoading(false)
    }
  }

  function filterPairs() {
    setLoading(true)

    let result = pairs
    if (search) {
      const lower = search.toLowerCase()
      result = result.filter(
        p =>
          p.symbol.toLowerCase().includes(lower) ||
          p.name.toLowerCase().includes(lower)
      )
    }
    setFilteredPairs(result)
    setLoading(false)
  }

  async function handleCategoryChange(category: string) {
    setSelectedCategory(category)
    setLoading(true)
    try {
      const data = await getCurrencyPairs(category)
      setPairs(data)
    } catch (error) {
      console.error('Failed to load pairs:', error)
    } finally {
      setLoading(false)
    }
  }

  async function handleGenerateSignal(pair: CurrencyPair) {
    setSelectedPair(pair)
    setGenerating(true)
    setShowSignalModal(true)
    setSignalResult(null)
    setActiveStep(0)

    let step = 0
    const stepInterval = setInterval(() => {
      step++
      if (step < ANALYSIS_STEPS.length) setActiveStep(step)
    }, 2000)

    try {
      const [base, quote] = pair.symbol.split('/')
      const candles = await getTwelveData(base, quote)

      if (candles.length < 60) {
        clearInterval(stepInterval)
        Alert.alert('Insufficient Data', 'Not enough historical data to generate a reliable signal.')
        setShowSignalModal(false)
        return
      }

      await new Promise(resolve => setTimeout(resolve, 500))
      setActiveStep(ANALYSIS_STEPS.length - 1)
      await new Promise(resolve => setTimeout(resolve, 600))

      const result = generateSignal(candles, parseFloat(accountSize) || 0)
      clearInterval(stepInterval)
      setActiveStep(ANALYSIS_STEPS.length)
      await new Promise(resolve => setTimeout(resolve, 300))

      setSignalResult(result)
    } catch (error) {
      console.error('Failed to generate signal:', error)
      clearInterval(stepInterval)
      Alert.alert('Error', 'Failed to generate signal. Please try again.')
      setShowSignalModal(false)
    } finally {
      setGenerating(false)
    }
  }

  async function handleSaveTrade() {
    if (!signalResult || !selectedPair) return

    try {
      await saveTrade({
        pair: selectedPair.symbol,
        signal: signalResult.signal,
        entry: formatPrice(signalResult.entry),
        exitPrice: null,
        stopLoss: signalResult.stopLoss ? formatPrice(signalResult.stopLoss) : '',
        takeProfit: signalResult.takeProfit ? formatPrice(signalResult.takeProfit) : '',
        riskReward: signalResult.riskReward ? `1:${signalResult.riskReward.toFixed(2)}` : '1:2',
        confidence: signalResult.confidence,
        profitLoss: 0,
        profitLossPercent: 0,
        status: 'open',
        reasons: signalResult.reasons,
        createdAt: Date.now(),
        closedAt: null,
        userId: getCurrentUserId(),
      })

      setShowSignalModal(false)
      Alert.alert('Trade Saved', 'Your trade has been saved to your portfolio.')
    } catch (error) {
      console.error('Failed to save trade:', error)
      Alert.alert('Error', 'Failed to save trade.')
    }
  }

  if (loading) {
    return <View className="flex-1 justify-center items-center bg-[#0A0A12]">
      <ActivityIndicator size="large" color="#8B5CF6" />
      <Text className="text-[14px] text-[#64646E] mt-2">
        Loading hang tight...
      </Text>
    </View>
  }

  return (
    <SafeAreaView className="flex-1 bg-[#0A0A12]">
      <ScrollView showsVerticalScrollIndicator={false}>
        <View className="px-5 pt-4">
          <Text className="text-[24px] font-bold text-white">
            Generate AI Signal
          </Text>
          <Text className="mb-4 text-[14px] text-[#64646E]">
            Select a currency pair to analyze.
          </Text>

          <View className="mb-4 flex-row items-center rounded-xl border border-[#1C1C2E] bg-[#0D0D14] px-4 py-3">
            <Ionicons name="search" size={18} color="#64646E" />
            <TextInput
              placeholder="Search pairs..."
              placeholderTextColor="#64646E"
              value={search}
              onChangeText={setSearch}
              className="ml-2 flex-1 text-[14px] text-white"
            />
          </View>

          <View className="mb-4 flex-row items-center rounded-xl border border-[#1C1C2E] bg-[#0D0D14] px-4 py-3">
            <Ionicons name="wallet" size={18} color="#64646E" />
            <TextInput
              placeholder="Account size (USD)..."
              placeholderTextColor="#64646E"
              value={accountSize}
              onChangeText={setAccountSize}
              keyboardType="numeric"
              className="ml-2 flex-1 text-[14px] text-white"
            />
            {accountSize ? (
              <Pressable onPress={() => setAccountSize('')}>
                <Ionicons name="close-circle" size={16} color="#64646E" />
              </Pressable>
            ) : null}
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
                  onPress={() => handleCategoryChange(category)}
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

          <View className="rounded-xl border border-[#1C1C2E] bg-[#0D0D14]">
            {loading ? (
              <View className="items-center py-10">
                <Text className="text-[14px] text-[#64646E]">Loading pairs...</Text>
              </View>
            ) : (
              filteredPairs.map((pair) => (
                <Pressable
                  key={pair.symbol}
                  onPress={() => handleGenerateSignal(pair)}
                  disabled={generating}
                  className="flex-row items-center justify-between border-b border-[#1C1C2E] px-4 py-4"
                >
                  <View className="flex-row items-center gap-3">
                    <View className="flex-row">
                      <Text className="text-lg">{pair.flag1}</Text>
                      <Text className="text-lg -ml-1">{pair.flag2}</Text>
                    </View>
                    <View>
                      <Text className="text-[15px] font-semibold text-white">
                        {pair.symbol}
                      </Text>
                      <Text className="text-[12px] text-[#64646E]">
                        {formatPrice(pair.price)}
                      </Text>
                    </View>
                  </View>

                  <View className="flex-row items-center gap-3">
                    <Text
                      className={`text-[13px] font-medium ${
                        pair.changePercent >= 0 ? 'text-[#22C55E]' : 'text-[#EF4444]'
                      }`}
                    >
                      {pair.changePercent >= 0 ? '+' : ''}{pair.changePercent.toFixed(2)}%
                    </Text>
                    <Ionicons name="chevron-forward" size={16} color="#64646E" />
                  </View>
                </Pressable>
              ))
            )}
          </View>
        </View>
      </ScrollView>

      <Modal
        visible={showSignalModal}
        transparent
        animationType="slide"
        onRequestClose={() => !generating && setShowSignalModal(false)}
      >
        <View className="flex-1 items-center justify-end bg-black/60">
          <View className="w-full max-h-[85%] rounded-t-3xl bg-[#14141E] p-6 pb-10">
            {generating ? (
              <View className="py-4">
                <View className="mb-6 flex-row items-center justify-between">
                  <Text className="text-[18px] font-bold text-white">
                    Analyzing {selectedPair?.symbol}
                  </Text>
                  <Pressable onPress={() => {}}>
                    <Ionicons name="close" size={24} color="#64646E" />
                  </Pressable>
                </View>

                <View className="mb-4 rounded-xl border border-[#1C1C2E] bg-[#0D0D14] p-4">
                  {ANALYSIS_STEPS.map((step, index) => (
                    <LoadingStep
                      key={index}
                      step={step}
                      index={index}
                      activeIndex={activeStep}
                    />
                  ))}
                </View>

                <View className="items-center">
                  <Text className="text-[12px] text-[#64646E]">
                    {activeStep < ANALYSIS_STEPS.length ? 'Processing...' : 'Signal ready!'}
                  </Text>
                </View>
              </View>
            ) : signalResult ? (
              <ScrollView showsVerticalScrollIndicator={false}>
                <View className="mb-4 flex-row items-center justify-between">
                  <View className="flex-row items-center gap-2">
                    <Text className="text-[20px] font-bold text-white">
                      {selectedPair?.symbol}
                    </Text>
                    <View className={`rounded-md px-2 py-0.5 ${
                      signalResult.signal === 'BUY' ? 'bg-[#22C55E]/20' : 'bg-[#EF4444]/20'
                    }`}>
                      <Text className={`text-[12px] font-bold ${
                        signalResult.signal === 'BUY' ? 'text-[#22C55E]' : 'text-[#EF4444]'
                      }`}>
                        {signalResult.signal}
                      </Text>
                    </View>
                  </View>
                  <Pressable onPress={() => setShowSignalModal(false)}>
                    <Ionicons name="close" size={24} color="#64646E" />
                  </Pressable>
                </View>

                <View className="mb-4 flex-row items-center gap-2">
                  <Ionicons name="diamond" size={16} color="#8B5CF6" />
                  <Text className="text-[14px] font-medium text-[#8B5CF6]">
                    {signalResult.confidence}% Confidence
                  </Text>
                  {accountSize ? (
                    <Text className="text-[11px] text-[#64646E]">
                      • 2% risk (${(parseFloat(accountSize) * 0.02).toFixed(2)} max)
                    </Text>
                  ) : null}
                </View>

                <View className="mb-4 rounded-xl border border-[#1C1C2E] bg-[#0D0D14] p-4">
                  <View className="flex-row justify-between">
                    <View>
                      <Text className="text-[10px] text-[#64646E]">Entry</Text>
                      <Text className="text-[15px] font-medium text-white">
                        {formatPrice(signalResult.entry)}
                      </Text>
                    </View>
                    <View className="items-end">
                      <Text className="text-[10px] text-[#64646E]">Stop Loss</Text>
                      <Text className="text-[15px] font-medium text-[#EF4444]">
                        {signalResult.stopLoss ? formatPrice(signalResult.stopLoss) : 'N/A'}
                      </Text>
                    </View>
                  </View>

                  <View className="mt-3 flex-row justify-between">
                    <View>
                      <Text className="text-[10px] text-[#64646E]">Take Profit</Text>
                      <Text className="text-[15px] font-medium text-[#22C55E]">
                        {signalResult.takeProfit ? formatPrice(signalResult.takeProfit) : 'N/A'}
                      </Text>
                    </View>
                    <View className="items-end">
                      <Text className="text-[10px] text-[#64646E]">Risk/Reward</Text>
                      <Text className="text-[15px] font-medium text-white">
                        {signalResult.riskReward ? `1:${signalResult.riskReward.toFixed(2)}` : 'N/A'}
                      </Text>
                    </View>
                  </View>
                </View>

                <View className="mb-4 rounded-xl border border-[#1C1C2E] bg-[#0D0D14] p-4">
                  <Text className="mb-2 text-[12px] font-semibold text-[#64646E]">
                    INDICATORS
                  </Text>
                  <View className="flex-row justify-between">
                    <Text className="text-[13px] text-[#64646E]">RSI(14)</Text>
                    <Text className="text-[13px] text-white">
                      {signalResult.rsi?.toFixed(1) ?? 'N/A'}
                    </Text>
                  </View>
                  <View className="mt-2 flex-row justify-between">
                    <Text className="text-[13px] text-[#64646E]">EMA20</Text>
                    <Text className="text-[13px] text-white">
                      {signalResult.ema20 ? formatPrice(signalResult.ema20) : 'N/A'}
                    </Text>
                  </View>
                  <View className="mt-2 flex-row justify-between">
                    <Text className="text-[13px] text-[#64646E]">EMA50</Text>
                    <Text className="text-[13px] text-white">
                      {signalResult.ema50 ? formatPrice(signalResult.ema50) : 'N/A'}
                    </Text>
                  </View>
                  <View className="mt-2 flex-row justify-between">
                    <Text className="text-[13px] text-[#64646E]">ATR</Text>
                    <Text className="text-[13px] text-white">
                      {signalResult.atr?.toFixed(4) ?? 'N/A'}
                    </Text>
                  </View>
                </View>

                <View className="mb-6 rounded-xl border border-[#1C1C2E] bg-[#0D0D14] p-4">
                  <Text className="mb-2 text-[12px] font-semibold text-[#64646E]">
                    REASONS
                  </Text>
                  {signalResult.reasons.slice(0, 5).map((reason, i) => (
                    <View key={i} className="mt-1 flex-row items-start gap-2">
                      <Ionicons name="checkmark-circle" size={14} color="#22C55E" />
                      <Text className="flex-1 text-[12px] text-white">{reason}</Text>
                    </View>
                  ))}

                  {accountSize && signalResult.stopLoss ? (
                    <View className="mt-3 border-t border-[#1C1C2E] pt-3">
                      <View className="flex-row justify-between">
                        <Text className="text-[11px] text-[#64646E]">Suggested Lot Size</Text>
                        <Text className="text-[11px] font-medium text-[#8B5CF6]">
                          {(() => {
                            const acc = parseFloat(accountSize)
                            const sl = Math.abs(signalResult.entry - signalResult.stopLoss)
                            const slPips = sl / 0.0001
                            const maxRisk = acc * 0.02
                            const lotSize = slPips > 0 ? maxRisk / (slPips * 10) : 0.01
                            return Math.max(0.01, Math.min(lotSize, 1)).toFixed(2)
                          })()}
                        </Text>
                      </View>
                    </View>
                  ) : null}
                </View>

                <Pressable
                  onPress={handleSaveTrade}
                  className="items-center rounded-xl bg-[#8B5CF6] py-4"
                >
                  <Text className="text-[16px] font-semibold text-white">
                    Take This Trade
                  </Text>
                </Pressable>

                <Pressable
                  onPress={() => setShowSignalModal(false)}
                  className="mt-3 items-center py-3"
                >
                  <Text className="text-[14px] text-[#64646E]">Close</Text>
                </Pressable>
              </ScrollView>
            ) : null}
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  )
}
