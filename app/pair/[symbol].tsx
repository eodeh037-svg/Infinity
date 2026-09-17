import { View, Text, ScrollView, Pressable, ActivityIndicator, Modal, TextInput, Alert, Animated, Easing } from 'react-native'
import { useState, useEffect, useRef } from 'react'
import { SafeAreaView } from 'react-native-safe-area-context'
import { Ionicons } from '@expo/vector-icons'
import { router, useLocalSearchParams } from 'expo-router'
import * as Clipboard from 'expo-clipboard'
import { getCurrencyPair, formatPrice, saveTrade, getCurrentUserId } from '../../lib/services/dataService'
import { getTwelveData } from '../../lib/api/finnhub'
import { generateSignal } from '../../lib/signals/signalEngine'
import { analyzeMultiTimeframe, MultiTimeframeResult } from '../../lib/signals/multiTimeframe'
import { STRATEGY_LIST, StrategyKey, getStrategy, getStrategyTimeframes } from '../../lib/signals/strategies'
import { generateMultiTimeframeSignal } from '../../lib/api/client'
import { Candle } from '../../lib/indicators/types'
import { getAssetType, getMarketStatus } from '../../lib/services/marketStatus'
import { CurrencyPair } from '../../types'
import IndicatorCard from '../../component/IndicatorCard'

const PIP_VALUE = 0.0001
const RISK_PERCENT = 0.02

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

export default function PairDetailScreen() {
  const { symbol } = useLocalSearchParams<{ symbol: string }>()
  const [pair, setPair] = useState<CurrencyPair | null>(null)
  const [loading, setLoading] = useState(true)
  const [showSignalModal, setShowSignalModal] = useState(false)
  const [generating, setGenerating] = useState(false)
  const [activeStep, setActiveStep] = useState(0)
  const [signalResult, setSignalResult] = useState<any>(null)
  const [multiTimeframeResult, setMultiTimeframeResult] = useState<MultiTimeframeResult | null>(null)
  const [selectedStrategy, setSelectedStrategy] = useState<StrategyKey>('general')
  const [accountSize, setAccountSize] = useState('')

  useEffect(() => {
    loadPair()
  }, [symbol])

  async function loadPair() {
    if (!symbol) return
    try {
      const decoded = symbol.replace(/_/g, '/')
      const data = await getCurrencyPair(decoded)
      if (data) setPair(data)
    } catch (error) {
      console.error('Failed to load pair:', error)
    } finally {
      setLoading(false)
    }
  }

  async function handleGenerateSignal() {
    if (!pair) return

    const assetType = getAssetType(pair)
    const status = getMarketStatus(assetType)
    if (!status.isOpen) {
      Alert.alert('Market Closed', status.message)
      return
    }

    setGenerating(true)
    setShowSignalModal(true)
    setSignalResult(null)
    setMultiTimeframeResult(null)
    setActiveStep(0)

    let step = 0
    const stepInterval = setInterval(() => {
      step++
      if (step < ANALYSIS_STEPS.length) setActiveStep(step)
    }, 2000)

    try {
      const symbol = pair.symbol
      const timeframes = getStrategyTimeframes(selectedStrategy)

      const candleData = await generateMultiTimeframeSignal(symbol, selectedStrategy, 250)

      const candleMap: Record<string, Candle[]> = {}
      for (const tf of timeframes) {
        candleMap[tf] = (candleData.candleData[tf] ?? []) as Candle[]
      }

      await new Promise(resolve => setTimeout(resolve, 500))
      setActiveStep(ANALYSIS_STEPS.length - 1)
      await new Promise(resolve => setTimeout(resolve, 600))

      const mtResult = analyzeMultiTimeframe(candleMap, selectedStrategy, parseFloat(accountSize) || 0)
      setMultiTimeframeResult(mtResult)

      const allCandles: Candle[] = []
      for (const tf of timeframes) {
        const tfCandles = candleMap[tf] ?? []
        if (tfCandles.length > allCandles.length) {
          allCandles.splice(0, allCandles.length, ...tfCandles)
        }
      }

      if (allCandles.length >= 100) {
        const singleResult = generateSignal(allCandles, parseFloat(accountSize) || 0)
        setSignalResult(singleResult)
      }

      clearInterval(stepInterval)
      setActiveStep(ANALYSIS_STEPS.length)
      await new Promise(resolve => setTimeout(resolve, 300))
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
    if (!signalResult || !pair) return

    try {
      await saveTrade({
        pair: pair.symbol,
        signal: signalResult.signal,
        entry: formatPrice(signalResult.entry),
        exitPrice: null,
        stopLoss: signalResult.stopLoss ? formatPrice(signalResult.stopLoss) : '',
        takeProfit: signalResult.takeProfit ? formatPrice(signalResult.takeProfit) : '',
        riskReward: signalResult.riskReward ? `1:${signalResult.riskReward.toFixed(2)}` : '1:2',
        confidence: multiTimeframeResult ? multiTimeframeResult.overallScore : signalResult.confidence,
        profitLoss: 0,
        profitLossPercent: 0,
        status: 'open',
        reasons: multiTimeframeResult ? multiTimeframeResult.reasoning : signalResult.reasons || [],
        createdAt: Date.now(),
        closedAt: null,
        userId: getCurrentUserId(),
      })

      setShowSignalModal(false)
      setSignalResult(null)
      setMultiTimeframeResult(null)
      setAccountSize('')
      Alert.alert('Trade Saved', 'Your trade has been saved to your portfolio.')
    } catch (error) {
      console.error('Failed to save trade:', error)
      Alert.alert('Error', 'Failed to save trade.')
    }
  }

  function handleCloseModal() {
    setShowSignalModal(false)
    setSignalResult(null)
    setMultiTimeframeResult(null)
    setAccountSize('')
  }

  if (loading) {
    return (
      <SafeAreaView className="flex-1 items-center justify-center bg-[#0A0A12]">
        <ActivityIndicator size="large" color="#8B5CF6" />
      </SafeAreaView>
    )
  }

  if (!pair) {
    return (
      <SafeAreaView className="flex-1 items-center justify-center bg-[#0A0A12]">
        <Text className="text-[14px] text-[#64646E]">Pair not found</Text>
      </SafeAreaView>
    )
  }

  const isPositive = pair.changePercent >= 0
  const acc = parseFloat(accountSize) || 0
  const maxRisk = acc * RISK_PERCENT

  return (
    <SafeAreaView className="flex-1 bg-[#0A0A12]">
      <ScrollView showsVerticalScrollIndicator={false}>
        <View className="px-5 pt-4">
          <View className="mb-6 flex-row items-center justify-between">
            <Pressable
              onPress={() => router.back()}
              className="h-10 w-10 items-center justify-center rounded-full bg-[#1C1C2E]"
            >
              <Ionicons name="chevron-back" size={20} color="#FFF" />
            </Pressable>

            <View className="flex-row items-center gap-2">
              <Text className="text-[18px] font-bold text-white">
                {pair.symbol}
              </Text>
              <View className="rounded-md bg-[#1C1C2E] px-2 py-0.5">
                <Text className="text-[11px] text-[#64646E]">
                  {pair.category}
                </Text>
              </View>
            </View>

            <View className="w-10" />
          </View>

          <View className="mb-6">
            <View className="flex-row items-end gap-2">
              <Text className="text-[36px] font-bold text-white">
                {formatPrice(pair.price)}
              </Text>
              <View className="flex-row items-center gap-1 pb-1">
                <Ionicons
                  name={isPositive ? 'arrow-up' : 'arrow-down'}
                  size={14}
                  color={isPositive ? '#22C55E' : '#EF4444'}
                />
                <Text
                  className={`text-[14px] font-medium ${
                    isPositive ? 'text-[#22C55E]' : 'text-[#EF4444]'
                  }`}
                >
                  {isPositive ? '+' : ''}{formatPrice(pair.change)} ({isPositive ? '+' : ''}{pair.changePercent.toFixed(2)}%)
                </Text>
              </View>
            </View>

            <View className="mt-2 flex-row gap-4">
              <View className="flex-row gap-1">
                <Text className="text-[12px] text-[#64646E]">Bid</Text>
                <Text className="text-[12px] font-medium text-[#22C55E]">
                  {formatPrice(pair.bid)}
                </Text>
              </View>
              <View className="flex-row gap-1">
                <Text className="text-[12px] text-[#64646E]">Ask</Text>
                <Text className="text-[12px] font-medium text-[#EF4444]">
                  {formatPrice(pair.ask)}
                </Text>
              </View>
              <View className="flex-row gap-1">
                <Text className="text-[12px] text-[#64646E]">Spread</Text>
                <Text className="text-[12px] font-medium text-white">
                  {pair.spread}
                </Text>
              </View>
            </View>
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

          <View className="mb-4">
            <Text className="mb-2 text-[12px] font-semibold text-[#64646E]">
              TRADING STRATEGY
            </Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false}>
              <View className="flex-row gap-2">
                {STRATEGY_LIST.map((strategy) => (
                  <Pressable
                    key={strategy.key}
                    onPress={() => setSelectedStrategy(strategy.key)}
                    className={`rounded-full px-4 py-2 ${
                      selectedStrategy === strategy.key
                        ? 'bg-[#8B5CF6]'
                        : 'bg-[#1C1C2E]'
                    }`}
                  >
                    <Text
                      className={`text-[13px] font-medium ${
                        selectedStrategy === strategy.key
                          ? 'text-white'
                          : 'text-[#64646E]'
                      }`}
                    >
                      {strategy.label}
                    </Text>
                  </Pressable>
                ))}
              </View>
            </ScrollView>
            <Text className="mt-1 text-[11px] text-[#64646E]">
              {getStrategy(selectedStrategy).description}
            </Text>
          </View>

          {acc > 0 && (
            <View className="mb-4 rounded-xl border border-[#1C1C2E] bg-[#0D0D14] px-4 py-3">
              <View className="flex-row justify-between">
                <Text className="text-[12px] text-[#64646E]">Account</Text>
                <Text className="text-[12px] font-medium text-white">${acc.toFixed(2)}</Text>
              </View>
              <View className="mt-1 flex-row justify-between">
                <Text className="text-[12px] text-[#64646E]">Max Risk (2%)</Text>
                <Text className="text-[12px] font-medium text-[#EF4444]">${maxRisk.toFixed(2)}</Text>
              </View>
            </View>
          )}

          <View className="mb-6 flex-row gap-3">
            <Pressable
              onPress={() => router.push(`/signal/chart?symbol=${pair.symbol.replace('/', '_')}`)}
              className="flex-1 flex-row items-center justify-center gap-2 rounded-xl border border-[#1C1C2E] bg-[#0D0D14] py-4"
            >
              <Ionicons name="stats-chart" size={18} color="#8B5CF6" />
              <Text className="text-[14px] font-medium text-white">
                Live Chart
              </Text>
            </Pressable>

            <Pressable
              onPress={handleGenerateSignal}
              disabled={generating}
              className="flex-1 flex-row items-center justify-center gap-2 rounded-xl bg-[#8B5CF6] py-4"
            >
              <Ionicons name="sparkles" size={18} color="#FFF" />
              <Text className="text-[14px] font-medium text-white">
                {generating ? 'Analyzing...' : 'Generate AI Signal'}
              </Text>
            </Pressable>
          </View>

          <View className="mb-6">
            <Text className="mb-3 text-[13px] font-semibold uppercase tracking-wider text-[#64646E]">
              Market Overview
            </Text>
            <View className="rounded-xl border border-[#1C1C2E] bg-[#0D0D14] p-4">
              <View className="flex-row justify-between">
                <View>
                  <Text className="text-[12px] text-[#64646E]">Day High</Text>
                  <Text className="text-[16px] font-medium text-[#22C55E]">
                    {formatPrice(pair.dayHigh)}
                  </Text>
                </View>
                <View className="items-end">
                  <Text className="text-[12px] text-[#64646E]">Day Low</Text>
                  <Text className="text-[16px] font-medium text-[#EF4444]">
                    {formatPrice(pair.dayLow)}
                  </Text>
                </View>
              </View>

              <View className="mt-4 flex-row justify-between border-t border-[#1C1C2E] pt-4">
                <View>
                  <Text className="text-[12px] text-[#64646E]">Spread</Text>
                  <Text className="text-[16px] font-medium text-white">
                    {pair.spread} pips
                  </Text>
                </View>
                <View className="items-end">
                  <Text className="text-[12px] text-[#64646E]">Category</Text>
                  <Text className="text-[16px] font-medium text-white">
                    {pair.category}
                  </Text>
                </View>
              </View>
            </View>
          </View>

          <View className="mb-6">
            <Text className="mb-3 text-[13px] font-semibold uppercase tracking-wider text-[#64646E]">
              Technical Indicators
            </Text>
            <View className="rounded-xl border border-[#1C1C2E] bg-[#0D0D14]">
              <IndicatorCard name="RSI(14)" value="42" status="Neutral" color="#EAB308" />
              <IndicatorCard name="MACD" value="Bullish" status="Crossover signal" color="#22C55E" />
              <IndicatorCard name="EMA 200" value="Above" status="Bullish bias" color="#22C55E" />
              <IndicatorCard name="BB" value="Lower band" status="Bollinger Bands" color="#8B5CF6" />
            </View>
          </View>
        </View>
      </ScrollView>

      <Modal
        visible={showSignalModal}
        transparent
        animationType="slide"
        onRequestClose={() => !generating && handleCloseModal()}
      >
        <View className="flex-1 items-center justify-end bg-black/60">
          <View className="w-full max-h-[85%] rounded-t-3xl bg-[#14141E] p-6 pb-10">
            {generating ? (
              <View className="py-4">
                <View className="mb-6 flex-row items-center justify-between">
                  <Text className="text-[18px] font-bold text-white">
                    Analyzing {pair.symbol}
                  </Text>
                  <Pressable onPress={handleCloseModal}>
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
            ) : multiTimeframeResult ? (
              <ScrollView showsVerticalScrollIndicator={false}>
                <View className="mb-4 flex-row items-center justify-between">
                  <View className="flex-row items-center gap-2">
                    <Text className="text-[20px] font-bold text-white">
                      {pair.symbol}
                    </Text>
                    <View className={`rounded-md px-2 py-0.5 ${
                      multiTimeframeResult.overallSignal === 'BUY' ? 'bg-[#22C55E]/20' : multiTimeframeResult.overallSignal === 'SELL' ? 'bg-[#EF4444]/20' : 'bg-[#F59E0B]/20'
                    }`}>
                      <Text className={`text-[12px] font-bold ${
                        multiTimeframeResult.overallSignal === 'BUY' ? 'text-[#22C55E]' : multiTimeframeResult.overallSignal === 'SELL' ? 'text-[#EF4444]' : 'text-[#F59E0B]'
                      }`}>
                        {multiTimeframeResult.overallSignal}
                      </Text>
                    </View>
                  </View>
                  <Pressable onPress={handleCloseModal}>
                    <Ionicons name="close" size={24} color="#64646E" />
                  </Pressable>
                </View>

                <View className="mb-4 flex-row items-center gap-2">
                  <Ionicons name="layers" size={16} color="#8B5CF6" />
                  <Text className="text-[14px] font-medium text-[#8B5CF6]">
                    {multiTimeframeResult.strategyLabel}
                  </Text>
                  <Text className="text-[11px] text-[#64646E]">
                    • {multiTimeframeResult.technicalStrength} Strength
                  </Text>
                </View>

                <View className="mb-4 rounded-xl border border-[#1C1C2E] bg-[#0D0D14] p-4">
                  <Text className="mb-2 text-[12px] font-semibold text-[#64646E]">
                    TIMEFRAME ANALYSIS
                  </Text>
                  {multiTimeframeResult.timeframeAnalyses.map((tf, i) => (
                    <View key={i} className="mt-2 flex-row items-center justify-between">
                      <View className="flex-row items-center gap-2">
                        <Text className="text-[13px] font-medium text-white w-[40px]">
                          {tf.label}
                        </Text>
                        <Text className="text-[11px] text-[#64646E] w-[100px]">
                          {tf.role}
                        </Text>
                      </View>
                      <View className="flex-row items-center gap-2">
                        <Text className={`text-[12px] font-medium ${
                          tf.status === 'unavailable' ? 'text-[#64646E]' :
                          tf.signal === 'BUY' ? 'text-[#22C55E]' :
                          tf.signal === 'SELL' ? 'text-[#EF4444]' : 'text-[#F59E0B]'
                        }`}>
                          {tf.status === 'unavailable' ? 'N/A' : tf.signal}
                        </Text>
                        <Text className="text-[11px] text-[#64646E] w-[30px] text-right">
                          {tf.status === 'unavailable' ? '—' : `${tf.candleCount}`}
                        </Text>
                      </View>
                    </View>
                  ))}
                </View>

                <View className="mb-4 rounded-xl border border-[#1C1C2E] bg-[#0D0D14] p-4">
                  <Text className="mb-2 text-[12px] font-semibold text-[#64646E]">
                    MARKET CONTEXT
                  </Text>
                  <View className="flex-row justify-between">
                    <View className="items-center">
                      <Text className="text-[10px] text-[#64646E]">Trend</Text>
                      <Text className={`text-[13px] font-medium ${
                        multiTimeframeResult.marketContext.trend === 'bullish' ? 'text-[#22C55E]' :
                        multiTimeframeResult.marketContext.trend === 'bearish' ? 'text-[#EF4444]' : 'text-[#F59E0B]'
                      }`}>
                        {multiTimeframeResult.marketContext.trend.charAt(0).toUpperCase() + multiTimeframeResult.marketContext.trend.slice(1)}
                      </Text>
                    </View>
                    <View className="items-center">
                      <Text className="text-[10px] text-[#64646E]">Momentum</Text>
                      <Text className={`text-[13px] font-medium ${
                        multiTimeframeResult.marketContext.momentum === 'positive' ? 'text-[#22C55E]' :
                        multiTimeframeResult.marketContext.momentum === 'negative' ? 'text-[#EF4444]' : 'text-[#F59E0B]'
                      }`}>
                        {multiTimeframeResult.marketContext.momentum.charAt(0).toUpperCase() + multiTimeframeResult.marketContext.momentum.slice(1)}
                      </Text>
                    </View>
                    <View className="items-center">
                      <Text className="text-[10px] text-[#64646E]">Structure</Text>
                      <Text className={`text-[13px] font-medium ${
                        multiTimeframeResult.marketContext.structure === 'bullish' ? 'text-[#22C55E]' :
                        multiTimeframeResult.marketContext.structure === 'bearish' ? 'text-[#EF4444]' : 'text-[#F59E0B]'
                      }`}>
                        {multiTimeframeResult.marketContext.structure.charAt(0).toUpperCase() + multiTimeframeResult.marketContext.structure.slice(1)}
                      </Text>
                    </View>
                    <View className="items-center">
                      <Text className="text-[10px] text-[#64646E]">Volatility</Text>
                      <Text className={`text-[13px] font-medium ${
                        multiTimeframeResult.marketContext.volatility === 'low' ? 'text-[#22C55E]' :
                        multiTimeframeResult.marketContext.volatility === 'high' ? 'text-[#EF4444]' : 'text-[#F59E0B]'
                      }`}>
                        {multiTimeframeResult.marketContext.volatility.charAt(0).toUpperCase() + multiTimeframeResult.marketContext.volatility.slice(1)}
                      </Text>
                    </View>
                  </View>
                </View>

                {multiTimeframeResult.contextAssessment && (
                  <View className="mb-4 rounded-xl border border-[#1C1C2E] bg-[#0D0D14] p-4">
                    <Text className="mb-2 text-[12px] font-semibold text-[#64646E]">
                      CONTEXT ASSESSMENT
                    </Text>
                    <View className="flex-row justify-between">
                      <View>
                        <Text className="text-[10px] text-[#64646E]">Alignment</Text>
                        <Text className={`text-[13px] font-medium ${
                          multiTimeframeResult.contextAssessment.alignment === 'supportive' ? 'text-[#22C55E]' :
                          multiTimeframeResult.contextAssessment.alignment === 'conflicting' ? 'text-[#EF4444]' : 'text-[#F59E0B]'
                        }`}>
                          {multiTimeframeResult.contextAssessment.alignment.charAt(0).toUpperCase() + multiTimeframeResult.contextAssessment.alignment.slice(1)}
                        </Text>
                      </View>
                      <View className="items-center">
                        <Text className="text-[10px] text-[#64646E]">Regime</Text>
                        <Text className="text-[13px] font-medium text-white">
                          {multiTimeframeResult.timeframeAnalyses[0]?.context.regime.regime ?? 'N/A'}
                        </Text>
                      </View>
                      <View className="items-center">
                        <Text className="text-[10px] text-[#64646E]">Volatility</Text>
                        <Text className="text-[13px] font-medium text-white">
                          {multiTimeframeResult.timeframeAnalyses[0]?.context.volatility.regime ?? 'N/A'}
                        </Text>
                      </View>
                      <View className="items-end">
                        <Text className="text-[10px] text-[#64646E]">Price</Text>
                        <Text className="text-[13px] font-medium text-white">
                          {multiTimeframeResult.timeframeAnalyses[0]?.context.levels.priceLocation?.replace(/_/g, ' ') ?? 'N/A'}
                        </Text>
                      </View>
                    </View>
                    {multiTimeframeResult.contextAssessment.warnings.length > 0 && (
                      <View className="mt-3 border-t border-[#1C1C2E] pt-3">
                        {multiTimeframeResult.contextAssessment.warnings.map((w, i) => (
                          <View key={i} className="mt-1 flex-row items-start gap-2">
                            <Ionicons name="warning" size={12} color="#F59E0B" />
                            <Text className="flex-1 text-[11px] text-[#F59E0B]">{w}</Text>
                          </View>
                        ))}
                      </View>
                    )}
                  </View>
                )}

                {signalResult && (
                  <View className="mb-4 rounded-xl border border-[#1C1C2E] bg-[#0D0D14] p-4">
                    <Text className="mb-2 text-[12px] font-semibold text-[#64646E]">
                      TRADE LEVELS
                    </Text>
                    <View className="flex-row justify-between">
                      <View>
                        <Text className="text-[10px] text-[#64646E]">Entry</Text>
                        <Pressable onPress={async () => { await Clipboard.setStringAsync(formatPrice(signalResult.entry)); Alert.alert('Copied', `Entry ${formatPrice(signalResult.entry)} copied`); }}>
                          <View className="flex-row items-center gap-1.5">
                            <Text className="text-[15px] font-medium text-white">{formatPrice(signalResult.entry)}</Text>
                            <Ionicons name="copy-outline" size={12} color="#64646E" />
                          </View>
                        </Pressable>
                      </View>
                      <View className="items-end">
                        <Text className="text-[10px] text-[#64646E]">Stop Loss</Text>
                        <Pressable onPress={async () => { if (signalResult.stopLoss) { await Clipboard.setStringAsync(formatPrice(signalResult.stopLoss)); Alert.alert('Copied', `SL ${formatPrice(signalResult.stopLoss)} copied`); } }}>
                          <View className="flex-row items-center gap-1.5">
                            <Text className="text-[15px] font-medium text-[#EF4444]">{signalResult.stopLoss ? formatPrice(signalResult.stopLoss) : 'N/A'}</Text>
                            {signalResult.stopLoss && <Ionicons name="copy-outline" size={12} color="#EF4444" />}
                          </View>
                        </Pressable>
                      </View>
                    </View>
                    <View className="mt-3 flex-row justify-between">
                      <View>
                        <Text className="text-[10px] text-[#64646E]">Take Profit</Text>
                        <Pressable onPress={async () => { if (signalResult.takeProfit) { await Clipboard.setStringAsync(formatPrice(signalResult.takeProfit)); Alert.alert('Copied', `TP ${formatPrice(signalResult.takeProfit)} copied`); } }}>
                          <View className="flex-row items-center gap-1.5">
                            <Text className="text-[15px] font-medium text-[#22C55E]">{signalResult.takeProfit ? formatPrice(signalResult.takeProfit) : 'N/A'}</Text>
                            {signalResult.takeProfit && <Ionicons name="copy-outline" size={12} color="#22C55E" />}
                          </View>
                        </Pressable>
                      </View>
                      <View className="items-end">
                        <Text className="text-[10px] text-[#64646E]">Risk/Reward</Text>
                        <Text className="text-[15px] font-medium text-white">{signalResult.riskReward ? `1:${signalResult.riskReward.toFixed(2)}` : 'N/A'}</Text>
                      </View>
                    </View>

                    {acc > 0 && signalResult.stopLoss && (
                      <View className="mt-3 border-t border-[#1C1C2E] pt-3">
                        <View className="flex-row justify-between">
                          <Text className="text-[11px] text-[#64646E]">Suggested Lot Size</Text>
                          <Text className="text-[11px] font-medium text-[#8B5CF6]">
                            {(() => {
                              const sl = Math.abs(signalResult.entry - signalResult.stopLoss)
                              const slPips = sl / PIP_VALUE
                              const lotSize = slPips > 0 ? maxRisk / (slPips * 10) : 0.01
                              return Math.max(0.01, Math.min(lotSize, 1)).toFixed(2)
                            })()}
                          </Text>
                        </View>
                      </View>
                    )}
                  </View>
                )}

                <View className="mb-6 rounded-xl border border-[#1C1C2E] bg-[#0D0D14] p-4">
                  <Text className="mb-2 text-[12px] font-semibold text-[#64646E]">
                    ANALYSIS
                  </Text>
                  {multiTimeframeResult.reasoning.slice(0, 5).map((reason, i) => (
                    <View key={i} className="mt-1 flex-row items-start gap-2">
                      <Ionicons name="checkmark-circle" size={14} color="#22C55E" />
                      <Text className="flex-1 text-[12px] text-white">{reason}</Text>
                    </View>
                  ))}
                </View>

                <Pressable
                  onPress={handleSaveTrade}
                  className="items-center rounded-xl bg-[#8B5CF6] py-4"
                >
                  <Text className="text-[16px] font-semibold text-white">
                    Take This Trade
                  </Text>
                </Pressable>

                <Pressable onPress={handleCloseModal} className="mt-3 items-center py-3">
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
