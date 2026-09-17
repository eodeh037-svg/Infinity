import { View, Text, ScrollView, Pressable, RefreshControl, ActivityIndicator, Alert, Modal, TextInput } from 'react-native'
import { useState, useEffect, useCallback } from 'react'
import { SafeAreaView } from 'react-native-safe-area-context'
import { Ionicons } from '@expo/vector-icons'
import { Trade } from '../../types'
import { getUserTrades, deleteTrade, closeTrade, formatPrice, getCurrentUserId, getUserProfile, updateBalance } from '../../lib/services/dataService'

function formatTime(timestamp: number): string {
  const diff = Date.now() - timestamp
  const hours = Math.floor(diff / 3600000)
  const days = Math.floor(diff / 86400000)
  if (hours < 1) return 'Just now'
  if (hours < 24) return `${hours}h ago`
  return `${days}d ago`
}

export default function HistoryScreen() {
  const [trades, setTrades] = useState<Trade[]>([])
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [filter, setFilter] = useState<'all' | 'open' | 'closed'>('all')
  const [closeStep, setCloseStep] = useState<'none' | 'profitOrLoss' | 'amount'>('none')
  const [closingTrade, setClosingTrade] = useState<Trade | null>(null)
  const [tradeResult, setTradeResult] = useState<'profit' | 'loss' | null>(null)
  const [amountInput, setAmountInput] = useState('')

  useEffect(() => {
    loadTrades()
  }, [])

  async function loadTrades() {
    try {
      const data = await getUserTrades()
      setTrades(data)
    } catch (error) {
      console.error('Failed to load trades:', error)
    } finally {
      setLoading(false)
      setRefreshing(false)
    }
  }

  const onRefresh = useCallback(() => {
    setRefreshing(true)
    loadTrades()
  }, [])

  const filteredTrades = trades.filter(t => {
    if (filter === 'open') return t.status === 'open'
    if (filter === 'closed') return t.status === 'closed'
    return true
  })

  const totalTrades = trades.filter(t => t.status === 'closed').length
  const winCount = trades.filter(t => t.status === 'closed' && (t.profitLoss ?? 0) > 0).length
  const totalPL = trades
    .filter(t => t.status === 'closed')
    .reduce((acc, t) => acc + (t.profitLoss ?? 0), 0)

  function openCloseFlow(trade: Trade) {
    setClosingTrade(trade)
    setTradeResult(null)
    setAmountInput('')
    setCloseStep('profitOrLoss')
  }

  function selectProfitOrLoss(result: 'profit' | 'loss') {
    setTradeResult(result)
    setAmountInput('')
    setCloseStep('amount')
  }

  async function handleConfirmClose() {
    if (!closingTrade || !tradeResult) return

    const amount = parseFloat(amountInput)
    if (!amount || isNaN(amount) || amount <= 0) {
      Alert.alert('Error', 'Please enter a valid amount.')
      return
    }

    const pl = tradeResult === 'profit' ? amount : -amount

    try {
      await closeTrade(closingTrade.id, closingTrade.entry, pl, 0)
      await updateBalance(pl)
      setCloseStep('none')
      setClosingTrade(null)
      setTradeResult(null)
      loadTrades()
    } catch (error) {
      console.error('Failed to close trade:', error)
      Alert.alert('Error', 'Failed to close trade.')
    }
  }

  function handleCancel() {
    setCloseStep('none')
    setClosingTrade(null)
    setTradeResult(null)
  }

  async function handleDeleteTrade(tradeId: string) {
    Alert.alert(
      'Delete Trade',
      'Are you sure you want to delete this trade?',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            try {
              await deleteTrade(tradeId)
              loadTrades()
            } catch (error) {
              console.error('Failed to delete trade:', error)
            }
          },
        },
      ]
    )
  }

  if (loading) {
    return (
      <SafeAreaView className="flex-1 items-center justify-center bg-[#0A0A12]">
        <ActivityIndicator size="large" color="#8B5CF6" />
        <Text className="mt-4 text-[13px] text-[#64646E]">Loading hang tight...</Text>
      </SafeAreaView>
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
            Trade History
          </Text>

          <View className="mb-4 flex-row gap-3">
            <View className="flex-1 rounded-2xl border border-[#1C1C2E] bg-[#0D0D14] p-4">
              <Text className="text-[11px] text-[#64646E]">Total Trades</Text>
              <Text className="mt-1 text-[22px] font-bold text-white">{totalTrades}</Text>
            </View>
            <View className="flex-1 rounded-2xl border border-[#1C1C2E] bg-[#0D0D14] p-4">
              <Text className="text-[11px] text-[#64646E]">Win Rate</Text>
              <Text className="mt-1 text-[22px] font-bold text-[#22C55E]">
                {totalTrades > 0 ? Math.round((winCount / totalTrades) * 100) : 0}%
              </Text>
            </View>
            <View className="flex-1 rounded-2xl border border-[#1C1C2E] bg-[#0D0D14] p-4">
              <Text className="text-[11px] text-[#64646E]">Total P/L</Text>
              <Text className={`mt-1 text-[22px] font-bold ${totalPL >= 0 ? 'text-[#22C55E]' : 'text-[#EF4444]'}`}>
                {totalPL >= 0 ? '+' : ''}${Math.abs(totalPL).toFixed(2)}
              </Text>
            </View>
          </View>

          <View className="mb-4 flex-row gap-2">
            {(['all', 'open', 'closed'] as const).map((f) => (
              <Pressable
                key={f}
                onPress={() => setFilter(f)}
                className={`rounded-full px-4 py-2 ${
                  filter === f ? 'bg-[#8B5CF6]' : 'bg-[#1C1C2E]'
                }`}
              >
                <Text
                  className={`text-[13px] font-medium capitalize ${
                    filter === f ? 'text-white' : 'text-[#64646E]'
                  }`}
                >
                  {f}
                </Text>
              </Pressable>
            ))}
          </View>

          <View className="mb-8">
            {filteredTrades.map((trade) => {
              const isBuy = trade.signal === 'BUY'
              return (
                <View
                  key={trade.id}
                  className="mb-3 rounded-2xl border border-[#1C1C2E] bg-[#0D0D14] p-4"
                >
                  <View className="mb-3 flex-row items-center justify-between">
                    <View className="flex-row items-center gap-2">
                      <Text className="text-[16px] font-bold text-white">
                        {trade.pair}
                      </Text>
                      <View
                        className={`rounded-lg px-2 py-0.5 ${
                          isBuy ? 'bg-[#22C55E]/15' : 'bg-[#EF4444]/15'
                        }`}
                      >
                        <Text
                          className={`text-[11px] font-bold ${
                            isBuy ? 'text-[#22C55E]' : 'text-[#EF4444]'
                          }`}
                        >
                          {trade.signal}
                        </Text>
                      </View>
                      <View className={`rounded-lg px-2 py-0.5 ${
                        trade.status === 'open' ? 'bg-[#EAB308]/15' : 'bg-[#64646E]/15'
                      }`}>
                        <Text className={`text-[10px] font-medium ${
                          trade.status === 'open' ? 'text-[#EAB308]' : 'text-[#64646E]'
                        }`}>
                          {trade.status.toUpperCase()}
                        </Text>
                      </View>
                    </View>

                    <Text className="text-[12px] text-[#64646E]">
                      {formatTime(trade.createdAt)}
                    </Text>
                  </View>

                  <View className="mb-3 flex-row justify-between">
                    <View>
                      <Text className="text-[10px] text-[#64646E]">ENTRY</Text>
                      <Text className="text-[13px] font-medium text-white">
                        {trade.entry}
                      </Text>
                    </View>
                    <View>
                      <Text className="text-[10px] text-[#64646E]">STOP LOSS</Text>
                      <Text className="text-[13px] font-medium text-[#EF4444]">
                        {trade.stopLoss || 'N/A'}
                      </Text>
                    </View>
                    <View>
                      <Text className="text-[10px] text-[#64646E]">TAKE PROFIT</Text>
                      <Text className="text-[13px] font-medium text-[#22C55E]">
                        {trade.takeProfit || 'N/A'}
                      </Text>
                    </View>
                    <View>
                      <Text className="text-[10px] text-[#64646E]">R:R</Text>
                      <Text className="text-[13px] font-medium text-[#8B5CF6]">
                        {trade.riskReward || 'N/A'}
                      </Text>
                    </View>
                  </View>

                  {trade.profitLoss !== 0 && (
                    <View className="mb-3 flex-row items-center gap-2 border-t border-[#1C1C2E] pt-3">
                      <Text className="text-[11px] text-[#64646E]">P/L:</Text>
                      <Text className={`text-[14px] font-bold ${
                        trade.profitLoss >= 0 ? 'text-[#22C55E]' : 'text-[#EF4444]'
                      }`}>
                        {trade.profitLoss >= 0 ? '+' : '-'}${Math.abs(trade.profitLoss).toFixed(2)}
                      </Text>
                    </View>
                  )}

                  <View className="flex-row items-center justify-between border-t border-[#1C1C2E] pt-3">
                    <Text className="flex-1 text-[11px] text-[#64646E]" numberOfLines={1}>
                      {trade.reasons[0] ?? 'No reasons'}
                    </Text>
                    <View className="flex-row gap-2">
                      {trade.status === 'open' && (
                        <Pressable
                          onPress={() => openCloseFlow(trade)}
                          className="rounded-lg bg-[#8B5CF6] px-3 py-1.5"
                        >
                          <Text className="text-[11px] font-medium text-white">Close</Text>
                        </Pressable>
                      )}
                      <Pressable
                        onPress={() => handleDeleteTrade(trade.id)}
                        className="rounded-lg bg-[#EF4444]/15 px-3 py-1.5"
                      >
                        <Ionicons name="trash-outline" size={12} color="#EF4444" />
                      </Pressable>
                    </View>
                  </View>
                </View>
              )
            })}

            {filteredTrades.length === 0 && (
              <View className="items-center py-16">
                <Ionicons name="time-outline" size={48} color="#64646E" />
                <Text className="mt-3 text-[14px] text-[#64646E]">
                  No trades found
                </Text>
                <Text className="mt-1 text-[12px] text-[#64646E]">
                  Generate a signal and take a trade to see it here
                </Text>
              </View>
            )}
          </View>
        </View>
      </ScrollView>

      <Modal
        visible={closeStep === 'profitOrLoss'}
        transparent
        animationType="fade"
        onRequestClose={handleCancel}
      >
        <View className="flex-1 items-center justify-center bg-black/60">
          <View className="w-[85%] rounded-3xl bg-[#14141E] p-6">
            <Text className="mb-2 text-[18px] font-bold text-white">
              Close Trade
            </Text>
            <Text className="mb-1 text-[13px] text-[#64646E]">
              {closingTrade?.pair} — {closingTrade?.signal}
            </Text>
            <Text className="mb-6 text-[12px] text-[#64646E]">
              Entry: {closingTrade?.entry}
            </Text>

            <Text className="mb-4 text-center text-[14px] text-white">
              Did you make a profit or a loss?
            </Text>

            <View className="flex-row gap-3">
              <Pressable
                onPress={() => selectProfitOrLoss('profit')}
                className="flex-1 items-center rounded-2xl border-2 border-[#22C55E]/30 bg-[#22C55E]/10 py-5"
              >
                <Ionicons name="trending-up" size={28} color="#22C55E" />
                <Text className="mt-2 text-[14px] font-bold text-[#22C55E]">Profit</Text>
              </Pressable>
              <Pressable
                onPress={() => selectProfitOrLoss('loss')}
                className="flex-1 items-center rounded-2xl border-2 border-[#EF4444]/30 bg-[#EF4444]/10 py-5"
              >
                <Ionicons name="trending-down" size={28} color="#EF4444" />
                <Text className="mt-2 text-[14px] font-bold text-[#EF4444]">Loss</Text>
              </Pressable>
            </View>

            <Pressable
              onPress={handleCancel}
              className="mt-4 items-center py-3"
            >
              <Text className="text-[14px] text-[#64646E]">Cancel</Text>
            </Pressable>
          </View>
        </View>
      </Modal>

      <Modal
        visible={closeStep === 'amount'}
        transparent
        animationType="fade"
        onRequestClose={handleCancel}
      >
        <View className="flex-1 items-center justify-center bg-black/60">
          <View className="w-[85%] rounded-3xl bg-[#14141E] p-6">
            <Text className="mb-2 text-[18px] font-bold text-white">
              {tradeResult === 'profit' ? 'Profit Amount' : 'Loss Amount'}
            </Text>
            <Text className="mb-1 text-[13px] text-[#64646E]">
              {closingTrade?.pair} — {closingTrade?.signal}
            </Text>
            <Text className="mb-6 text-[12px] text-[#64646E]">
              How much did you {tradeResult === 'profit' ? 'make' : 'lose'}?
            </Text>

            <Text className="mb-2 text-[12px] font-medium text-[#64646E]">
              AMOUNT (USD)
            </Text>
            <TextInput
              value={amountInput}
              onChangeText={setAmountInput}
              keyboardType="decimal-pad"
              placeholder="0.00"
              placeholderTextColor="#64646E"
              className={`mb-4 rounded-2xl border bg-[#0D0D14] px-4 py-4 text-[24px] font-bold text-white ${
                tradeResult === 'profit' ? 'border-[#22C55E]/30' : 'border-[#EF4444]/30'
              }`}
            />

            {amountInput && parseFloat(amountInput) > 0 && (
              <View className={`mb-4 rounded-2xl p-3 ${
                tradeResult === 'profit' ? 'bg-[#22C55E]/10' : 'bg-[#EF4444]/10'
              }`}>
                <View className="flex-row items-center justify-between">
                  <Text className="text-[12px] text-[#64646E]">Your balance will be</Text>
                  <Text className={`text-[16px] font-bold ${
                    tradeResult === 'profit' ? 'text-[#22C55E]' : 'text-[#EF4444]'
                  }`}>
                    {tradeResult === 'profit' ? '+' : '-'}${parseFloat(amountInput).toFixed(2)}
                  </Text>
                </View>
              </View>
            )}

            <View className="flex-row gap-3">
              <Pressable
                onPress={handleCancel}
                className="flex-1 items-center rounded-2xl border border-[#1C1C2E] py-3"
              >
                <Text className="text-[14px] font-medium text-[#64646E]">Back</Text>
              </Pressable>
              <Pressable
                onPress={handleConfirmClose}
                className={`flex-1 items-center rounded-2xl py-3 ${
                  tradeResult === 'profit' ? 'bg-[#22C55E]' : 'bg-[#EF4444]'
                }`}
              >
                <Text className="text-[14px] font-medium text-white">Confirm</Text>
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  )
}
