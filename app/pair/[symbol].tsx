import { View, Text, ScrollView, Pressable, ActivityIndicator, Modal, TextInput, Alert, TouchableOpacity } from 'react-native'
import { useState, useEffect } from 'react'
import { SafeAreaView } from 'react-native-safe-area-context'
import { Ionicons } from '@expo/vector-icons'
import { router, useLocalSearchParams } from 'expo-router'
import * as Clipboard from 'expo-clipboard'
import { getCurrencyPair, formatPrice, saveTrade, getCurrentUserId } from '../../lib/services/dataService'
import { getTwelveData } from '../../lib/api/finnhub'
import { generateSignal } from '../../lib/signals/signalEngine'
import { CurrencyPair } from '../../types'
import IndicatorCard from '../../component/IndicatorCard'

const PIP_VALUE = 0.0001
const RISK_PERCENT = 0.02

export default function PairDetailScreen() {
  const { symbol } = useLocalSearchParams<{ symbol: string }>()
  const [pair, setPair] = useState<CurrencyPair | null>(null)
  const [loading, setLoading] = useState(true)
  const [showSignalModal, setShowSignalModal] = useState(false)
  const [generating, setGenerating] = useState(false)
  const [signalResult, setSignalResult] = useState<any>(null)
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
    setGenerating(true)
    setShowSignalModal(true)
    setSignalResult(null)

    try {
      const [base, quote] = pair.symbol.split('/')
      const candles = await getTwelveData(base, quote, '4h', '100')

      if (candles.length < 60) {
        Alert.alert('Insufficient Data', 'Not enough historical data to generate a reliable signal.')
        setShowSignalModal(false)
        return
      }

      await new Promise(resolve => setTimeout(resolve, 1500))
      const result = generateSignal(candles, parseFloat(accountSize) || 0)
      setSignalResult(result)
    } catch (error) {
      console.error('Failed to generate signal:', error)
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
        confidence: signalResult.confidence,
        profitLoss: 0,
        profitLossPercent: 0,
        status: 'open',
        reasons: signalResult.reasons || [],
        createdAt: Date.now(),
        closedAt: null,
        userId: getCurrentUserId(),
      })

      setShowSignalModal(false)
      setSignalResult(null)
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

                <View className="mb-4 items-center py-6">
                  <ActivityIndicator size="large" color="#8B5CF6" />
                  <Text className="mt-4 text-[13px] text-[#64646E]">
                    Computing indicators and generating signal...
                  </Text>
                </View>
              </View>
            ) : signalResult ? (
              <ScrollView showsVerticalScrollIndicator={false}>
                <View className="mb-4 flex-row items-center justify-between">
                  <View className="flex-row items-center gap-2">
                    <Text className="text-[20px] font-bold text-white">
                      {pair.symbol}
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
                  <Pressable onPress={handleCloseModal}>
                    <Ionicons name="close" size={24} color="#64646E" />
                  </Pressable>
                </View>

                <View className="mb-4 flex-row items-center gap-2">
                  <Ionicons name="diamond" size={16} color="#8B5CF6" />
                  <Text className="text-[14px] font-medium text-[#8B5CF6]">
                    {signalResult.confidence}% Confidence
                  </Text>
                  {acc > 0 && (
                    <Text className="text-[11px] text-[#64646E]">
                      • 2% risk (${maxRisk.toFixed(2)} max)
                    </Text>
                  )}
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
                      <TouchableOpacity
                        onPress={async () => {
                          if (signalResult.stopLoss) {
                            await Clipboard.setStringAsync(formatPrice(signalResult.stopLoss))
                            Alert.alert('Copied', `SL ${formatPrice(signalResult.stopLoss)} copied to clipboard`)
                          }
                        }}
                        activeOpacity={0.6}
                      >
                        <View className="flex-row items-center gap-1">
                          <Text className="text-[15px] font-medium text-[#EF4444]">
                            {signalResult.stopLoss ? formatPrice(signalResult.stopLoss) : 'N/A'}
                          </Text>
                          {signalResult.stopLoss && (
                            <Ionicons name="copy" size={12} color="#EF4444" />
                          )}
                        </View>
                      </TouchableOpacity>
                    </View>
                  </View>

                  <View className="mt-3 flex-row justify-between">
                    <View>
                      <Text className="text-[10px] text-[#64646E]">Take Profit</Text>
                      <TouchableOpacity
                        onPress={async () => {
                          if (signalResult.takeProfit) {
                            await Clipboard.setStringAsync(formatPrice(signalResult.takeProfit))
                            Alert.alert('Copied', `TP ${formatPrice(signalResult.takeProfit)} copied to clipboard`)
                          }
                        }}
                        activeOpacity={0.6}
                      >
                        <View className="flex-row items-center gap-1">
                          <Text className="text-[15px] font-medium text-[#22C55E]">
                            {signalResult.takeProfit ? formatPrice(signalResult.takeProfit) : 'N/A'}
                          </Text>
                          {signalResult.takeProfit && (
                            <Ionicons name="copy" size={12} color="#22C55E" />
                          )}
                        </View>
                      </TouchableOpacity>
                    </View>
                    <View className="items-end">
                      <Text className="text-[10px] text-[#64646E]">Risk/Reward</Text>
                      <Text className="text-[15px] font-medium text-white">
                        {signalResult.riskReward ? `1:${signalResult.riskReward.toFixed(2)}` : 'N/A'}
                      </Text>
                    </View>
                  </View>
                </View>

                {acc > 0 && signalResult.stopLoss && (
                  <View className="mb-4 rounded-xl border border-[#1C1C2E] bg-[#0D0D14] p-4">
                    <Text className="mb-2 text-[12px] font-semibold text-[#64646E]">
                      RISK MANAGEMENT
                    </Text>
                    <View className="flex-row justify-between">
                      <Text className="text-[12px] text-[#64646E]">SL Distance (pips)</Text>
                      <Text className="text-[12px] font-medium text-white">
                        {(() => {
                          const sl = Math.abs(signalResult.entry - signalResult.stopLoss)
                          return (sl / PIP_VALUE).toFixed(1)
                        })()}
                      </Text>
                    </View>
                    <View className="mt-1 flex-row justify-between">
                      <Text className="text-[12px] text-[#64646E]">Suggested Lot Size</Text>
                      <Text className="text-[12px] font-medium text-[#8B5CF6]">
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

                <View className="mb-4 rounded-xl border border-[#1C1C2E] bg-[#0D0D14] p-4">
                  <Text className="mb-2 text-[12px] font-semibold text-[#64646E]">
                    TREND
                  </Text>
                  <View className="flex-row justify-between">
                    <Text className="text-[13px] text-[#64646E]">EMA20 / EMA50</Text>
                    <Text className="text-[13px] text-white">
                      {signalResult.ema20 ? formatPrice(signalResult.ema20) : 'N/A'} / {signalResult.ema50 ? formatPrice(signalResult.ema50) : 'N/A'}
                    </Text>
                  </View>
                  <View className="mt-2 flex-row justify-between">
                    <Text className="text-[13px] text-[#64646E]">ADX</Text>
                    <Text className={`text-[13px] font-medium ${
                      (signalResult.adx ?? 0) >= 30 ? 'text-[#22C55E]' : (signalResult.adx ?? 0) >= 25 ? 'text-[#EAB308]' : 'text-[#64646E]'
                    }`}>
                      {signalResult.adx?.toFixed(1) ?? 'N/A'}
                      {(signalResult.adx ?? 0) >= 30 ? ' (Strong)' : (signalResult.adx ?? 0) >= 25 ? ' (Trend)' : (signalResult.adx ?? 0) < 20 ? ' (Range)' : ''}
                    </Text>
                  </View>
                  <View className="mt-2 flex-row justify-between">
                    <Text className="text-[13px] text-[#64646E]">+DI / -DI</Text>
                    <Text className="text-[13px] text-white">
                      {signalResult.plusDI?.toFixed(1) ?? 'N/A'} / {signalResult.minusDI?.toFixed(1) ?? 'N/A'}
                    </Text>
                  </View>
                  <View className="mt-2 flex-row justify-between">
                    <Text className="text-[13px] text-[#64646E]">Ichimoku</Text>
                    <Text className={`text-[13px] font-medium ${signalResult.ichimokuCloud ? 'text-[#22C55E]' : 'text-[#64646E]'}`}>
                      {signalResult.ichimokuCloud ? 'Above Cloud' : 'Below/In Cloud'}
                    </Text>
                  </View>
                </View>

                <View className="mb-4 rounded-xl border border-[#1C1C2E] bg-[#0D0D14] p-4">
                  <Text className="mb-2 text-[12px] font-semibold text-[#64646E]">
                    MOMENTUM
                  </Text>
                  <View className="flex-row justify-between">
                    <Text className="text-[13px] text-[#64646E]">RSI(14)</Text>
                    <Text className={`text-[13px] font-medium ${
                      (signalResult.rsi ?? 50) >= 70 ? 'text-[#EF4444]' : (signalResult.rsi ?? 50) <= 30 ? 'text-[#22C55E]' : 'text-white'
                    }`}>
                      {signalResult.rsi?.toFixed(1) ?? 'N/A'}
                    </Text>
                  </View>
                  <View className="mt-2 flex-row justify-between">
                    <Text className="text-[13px] text-[#64646E]">Stochastic K/D</Text>
                    <Text className="text-[13px] text-white">
                      {signalResult.stochK?.toFixed(1) ?? 'N/A'} / {signalResult.stochD?.toFixed(1) ?? 'N/A'}
                    </Text>
                  </View>
                  <View className="mt-2 flex-row justify-between">
                    <Text className="text-[13px] text-[#64646E]">MACD</Text>
                    <Text className="text-[13px] text-white">
                      {signalResult.macd?.histogram !== null && signalResult.macd?.histogram !== undefined
                        ? (signalResult.macd.histogram > 0 ? 'Bullish' : 'Bearish')
                        : 'N/A'}
                    </Text>
                  </View>
                  <View className="mt-2 flex-row justify-between">
                    <Text className="text-[13px] text-[#64646E]">ATR(14)</Text>
                    <Text className="text-[13px] text-white">
                      {signalResult.atr?.toFixed(4) ?? 'N/A'}
                    </Text>
                  </View>
                </View>

                <View className="mb-4 rounded-xl border border-[#1C1C2E] bg-[#0D0D14] p-4">
                  <Text className="mb-2 text-[12px] font-semibold text-[#64646E]">
                    VOLATILITY
                  </Text>
                  <View className="flex-row justify-between">
                    <Text className="text-[13px] text-[#64646E]">Bollinger Upper</Text>
                    <Text className="text-[13px] text-white">
                      {signalResult.bbUpper ? formatPrice(signalResult.bbUpper) : 'N/A'}
                    </Text>
                  </View>
                  <View className="mt-2 flex-row justify-between">
                    <Text className="text-[13px] text-[#64646E]">Bollinger Lower</Text>
                    <Text className="text-[13px] text-white">
                      {signalResult.bbLower ? formatPrice(signalResult.bbLower) : 'N/A'}
                    </Text>
                  </View>
                  <View className="mt-2 flex-row justify-between">
                    <Text className="text-[13px] text-[#64646E]">BB Width</Text>
                    <Text className={`text-[13px] font-medium ${
                      (signalResult.bbWidth ?? 0) < 0.01 ? 'text-[#EAB308]' : 'text-white'
                    }`}>
                      {signalResult.bbWidth?.toFixed(4) ?? 'N/A'}
                      {(signalResult.bbWidth ?? 0) < 0.01 ? ' (Squeeze)' : ''}
                    </Text>
                  </View>
                </View>

                <View className="mb-6 rounded-xl border border-[#1C1C2E] bg-[#0D0D14] p-4">
                  <Text className="mb-2 text-[12px] font-semibold text-[#64646E]">
                    REASONS ({(signalResult.reasons || []).length})
                  </Text>
                  {(signalResult.reasons || []).slice(0, 8).map((reason: string, i: number) => (
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

                <Pressable
                  onPress={handleCloseModal}
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
