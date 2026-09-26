import {
  View,
  Text,
  ScrollView,
  Pressable,
  RefreshControl,
  ActivityIndicator,
  Alert,
  Modal,
  TextInput,
} from 'react-native';
import { useState, useEffect, useCallback } from 'react';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { Trade } from '../../types';
import {
  getUserTrades,
  deleteTrade,
  closeTrade,
} from '../../lib/services/dataService';
import { useTheme } from '../../lib/theme';
import AppButton from '../../component/ui/AppButton';
import AppCard from '../../component/ui/AppCard';
import SegmentedPills from '../../component/ui/SegmentedPills';
import EmptyState from '../../component/ui/EmptyState';
import SignalBadge from '../../component/ui/SignalBadge';
import { formatDollar } from '../../component/ui/money';

function formatTime(timestamp: number): string {
  const diff = Date.now() - timestamp;
  const minutes = Math.floor(diff / 60000);
  const hours = Math.floor(diff / 3600000);
  const days = Math.floor(diff / 86400000);
  if (minutes < 1) return 'Just now';
  if (hours < 1) return `${minutes}m ago`;
  if (hours < 24) return `${hours}h ago`;
  return `${days}d ago`;
}

export default function HistoryScreen() {
  const { colors } = useTheme();
  const [trades, setTrades] = useState<Trade[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [filter, setFilter] = useState<'all' | 'open' | 'closed'>('all');
  const [closeStep, setCloseStep] = useState<'none' | 'profitOrLoss' | 'amount'>('none');
  const [closingTrade, setClosingTrade] = useState<Trade | null>(null);
  const [tradeResult, setTradeResult] = useState<'profit' | 'loss' | null>(null);
  const [amountInput, setAmountInput] = useState('');

  useEffect(() => {
    loadTrades();
  }, []);

  async function loadTrades() {
    try {
      const data = await getUserTrades();
      setTrades(data);
    } catch (error) {
      console.error('Failed to load trades:', error);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }

  const onRefresh = useCallback(() => {
    setRefreshing(true);
    loadTrades();
  }, []);

  const filteredTrades = trades.filter((t) => {
    if (filter === 'open') return t.status === 'open';
    if (filter === 'closed') return t.status === 'closed';
    return true;
  });

  const totalTrades = trades.filter((t) => t.status === 'closed').length;
  const winCount = trades.filter((t) => t.status === 'closed' && (t.profitLoss ?? 0) > 0).length;
  const totalPL = trades
    .filter((t) => t.status === 'closed')
    .reduce((acc, t) => acc + (t.profitLoss ?? 0), 0);

  function openCloseFlow(trade: Trade) {
    setClosingTrade(trade);
    setTradeResult(null);
    setAmountInput('');
    setCloseStep('profitOrLoss');
  }

  function selectProfitOrLoss(result: 'profit' | 'loss') {
    setTradeResult(result);
    setAmountInput('');
    setCloseStep('amount');
  }

  async function handleConfirmClose() {
    if (!closingTrade || !tradeResult) return;

    const amount = parseFloat(amountInput);
    if (!amount || isNaN(amount) || amount <= 0) {
      Alert.alert('Error', 'Please enter a valid amount.');
      return;
    }

    const pl = tradeResult === 'profit' ? amount : -amount;

    try {
      await closeTrade(closingTrade.id, closingTrade.entry, pl, 0);
      setCloseStep('none');
      setClosingTrade(null);
      setTradeResult(null);
      loadTrades();
    } catch (error) {
      console.error('Failed to close trade:', error);
      Alert.alert('Error', 'Failed to close trade.');
    }
  }

  function handleCancel() {
    setCloseStep('none');
    setClosingTrade(null);
    setTradeResult(null);
  }

  async function handleDeleteTrade(tradeId: string) {
    Alert.alert('Delete Trade', 'Are you sure you want to delete this trade?', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: async () => {
          try {
            await deleteTrade(tradeId);
            loadTrades();
          } catch (error) {
            console.error('Failed to delete trade:', error);
          }
        },
      },
    ]);
  }

  if (loading) {
    return (
      <SafeAreaView className="flex-1 items-center justify-center bg-background">
        <ActivityIndicator size="large" color={colors.accent} />
        <Text className="mt-4 text-[13px] text-muted">Loading trades...</Text>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView className="flex-1 bg-background" edges={['top']}>
      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerClassName="pb-6"
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.accent} />
        }>
        <View className="px-5 pt-4">
          <Text className="mb-3 text-[22px] font-bold text-foreground">Trade History</Text>

          <View className="mb-4 flex-row gap-3">
            <View className="flex-1 rounded-xl border border-border bg-card p-4">
              <Text className="text-[11px] text-muted">Closed</Text>
              <Text className="mt-1 text-[18px] font-bold text-foreground">{totalTrades}</Text>
            </View>
            <View className="flex-1 rounded-xl border border-border bg-card p-4">
              <Text className="text-[11px] text-muted">Win Rate</Text>
              <Text className="mt-1 text-[18px] font-bold text-success">
                {totalTrades > 0 ? Math.round((winCount / totalTrades) * 100) : 0}%
              </Text>
            </View>
            <View className="flex-1 rounded-xl border border-border bg-card p-4">
              <Text className="text-[11px] text-muted">Total P/L</Text>
              <Text
                className={`mt-1 text-[18px] font-bold ${totalPL >= 0 ? 'text-success' : 'text-danger'}`}>
                {totalPL > 0 ? '+' : ''}
                {formatDollar(totalPL)}
              </Text>
            </View>
          </View>

          <SegmentedPills
            className="mb-5"
            items={[
              { key: 'all', label: 'All' },
              { key: 'open', label: 'Open' },
              { key: 'closed', label: 'Closed' },
            ]}
            selected={filter}
            onSelect={(key) => setFilter(key as 'all' | 'open' | 'closed')}
          />

          {filteredTrades.length === 0 ? (
            <AppCard className="p-0">
              <EmptyState
                icon="receipt-outline"
                title="No trades yet"
                message="Generate a signal and take a trade to see it here."
              />
            </AppCard>
          ) : (
            filteredTrades.map((trade) => {
              const isBuy = trade.signal === 'BUY';
              return (
                <AppCard key={trade.id} className="mb-3 p-4">
                  <View className="mb-3 flex-row items-center gap-2">
                    <Text className="text-[16px] font-bold text-foreground">{trade.pair}</Text>
                    <SignalBadge signal={isBuy ? 'BUY' : 'SELL'} />
                    <View
                      className={`rounded-md px-1.5 py-1 ${
                        trade.status === 'open' ? 'bg-warning/12' : 'bg-elevated'
                      }`}>
                      <Text
                        className={`text-[10px] font-bold ${
                          trade.status === 'open' ? 'text-warning' : 'text-muted'
                        }`}>
                        {trade.status.toUpperCase()}
                      </Text>
                    </View>
                    <Text className="ml-auto text-[12px] text-muted">
                      {formatTime(trade.createdAt)}
                    </Text>
                  </View>

                  <View className="mb-3 flex-row justify-between">
                    <View>
                      <Text className="text-[10px] uppercase tracking-wider text-muted">Entry</Text>
                      <Text className="mt-0.5 text-[13px] font-medium text-foreground">
                        {trade.entry}
                      </Text>
                    </View>
                    <View>
                      <Text className="text-[10px] uppercase tracking-wider text-muted">Stop Loss</Text>
                      <Text className="mt-0.5 text-[13px] font-medium text-danger">
                        {trade.stopLoss || 'N/A'}
                      </Text>
                    </View>
                    <View>
                      <Text className="text-[10px] uppercase tracking-wider text-muted">Take Profit</Text>
                      <Text className="mt-0.5 text-[13px] font-medium text-success">
                        {trade.takeProfit || 'N/A'}
                      </Text>
                    </View>
                    <View className="items-end">
                      <Text className="text-[10px] uppercase tracking-wider text-muted">R:R</Text>
                      <Text className="mt-0.5 text-[13px] font-medium text-accent">
                        {trade.riskReward || 'N/A'}
                      </Text>
                    </View>
                  </View>

                  {trade.profitLoss !== null && trade.profitLoss !== undefined && trade.profitLoss !== 0 ? (
                    <View className="mb-3 flex-row items-center justify-between rounded-lg bg-elevated/60 px-3 py-2">
                      <Text className="text-[11px] text-muted">Realized P/L</Text>
                      <Text
                        className={`text-[13px] font-bold ${
                          trade.profitLoss >= 0 ? 'text-success' : 'text-danger'
                        }`}>
                        {trade.profitLoss > 0 ? '+' : ''}
                        {formatDollar(trade.profitLoss)}
                      </Text>
                    </View>
                  ) : null}

                  <View className="flex-row items-center justify-between border-t border-border pt-3">
                    <Text className="flex-1 pr-3 text-[11px] text-muted" numberOfLines={1}>
                      {trade.reasons[0] ?? 'No reasons'}
                    </Text>
                    <View className="flex-row gap-2">
                      {trade.status === 'open' && (
                        <AppButton
                          title="Close"
                          size="sm"
                          variant="secondary"
                          className="px-4"
                          onPress={() => openCloseFlow(trade)}
                        />
                      )}
                      <Pressable
                        accessibilityLabel={`Delete ${trade.pair} trade`}
                        onPress={() => handleDeleteTrade(trade.id)}
                        className="h-9 w-9 items-center justify-center rounded-lg border border-danger/30 bg-danger/10">
                        <Ionicons name="trash-outline" size={15} color={colors.danger} />
                      </Pressable>
                    </View>
                  </View>
                </AppCard>
              );
            })
          )}
        </View>
      </ScrollView>

      <Modal
        visible={closeStep === 'profitOrLoss'}
        transparent
        animationType="fade"
        onRequestClose={handleCancel}>
        <View className="flex-1 items-center justify-center bg-black/60 px-5">
          <View className="w-full max-w-md rounded-2xl border border-border bg-elevated p-6">
            <Text className="text-[18px] font-bold text-foreground">Close Trade</Text>
            <Text className="mt-1 text-[13px] text-muted">
              {closingTrade?.pair} — {closingTrade?.signal}
            </Text>
            <Text className="mb-5 text-[12px] text-muted">Entry: {closingTrade?.entry}</Text>

            <Text className="mb-4 text-center text-[14px] text-foreground">
              Did you make a profit or a loss?
            </Text>

            <View className="flex-row gap-3">
              <Pressable
                onPress={() => selectProfitOrLoss('profit')}
                className="flex-1 items-center rounded-xl border border-success/30 bg-success/10 py-5">
                <Ionicons name="trending-up" size={26} color={colors.success} />
                <Text className="mt-2 text-[14px] font-bold text-success">Profit</Text>
              </Pressable>
              <Pressable
                onPress={() => selectProfitOrLoss('loss')}
                className="flex-1 items-center rounded-xl border border-danger/30 bg-danger/10 py-5">
                <Ionicons name="trending-down" size={26} color={colors.danger} />
                <Text className="mt-2 text-[14px] font-bold text-danger">Loss</Text>
              </Pressable>
            </View>

            <AppButton
              title="Cancel"
              variant="ghost"
              className="mt-4 w-full"
              onPress={handleCancel}
            />
          </View>
        </View>
      </Modal>

      <Modal
        visible={closeStep === 'amount'}
        transparent
        animationType="fade"
        onRequestClose={handleCancel}>
        <View className="flex-1 items-center justify-center bg-black/60 px-5">
          <View className="w-full max-w-md rounded-2xl border border-border bg-elevated p-6">
            <Text className="text-[18px] font-bold text-foreground">
              {tradeResult === 'profit' ? 'Profit Amount' : 'Loss Amount'}
            </Text>
            <Text className="mt-1 text-[13px] text-muted">
              {closingTrade?.pair} — {closingTrade?.signal}
            </Text>
            <Text className="mb-5 text-[12px] text-muted">
              How much did you {tradeResult === 'profit' ? 'make' : 'lose'}?
            </Text>

            <Text className="mb-2 text-[12px] font-medium text-muted">Amount (USD)</Text>
            <TextInput
              value={amountInput}
              onChangeText={setAmountInput}
              keyboardType="decimal-pad"
              placeholder="0.00"
              placeholderTextColor={colors.muted}
              accessibilityLabel={`${tradeResult === 'profit' ? 'Profit' : 'Loss'} amount`}
              className={`mb-4 rounded-xl border bg-card px-4 py-4 text-[22px] font-bold text-foreground ${
                tradeResult === 'profit' ? 'border-success/30' : 'border-danger/30'
              }`}
            />

            {amountInput && parseFloat(amountInput) > 0 && (
              <View
                className={`mb-4 rounded-xl p-3 ${
                  tradeResult === 'profit' ? 'bg-success/10' : 'bg-danger/10'
                }`}>
                <View className="flex-row items-center justify-between">
                  <Text className="text-[12px] text-muted">Your balance will be</Text>
                  <Text
                    className={`text-[15px] font-bold ${
                      tradeResult === 'profit' ? 'text-success' : 'text-danger'
                    }`}>
                    {tradeResult === 'profit' ? '+' : '-'}${parseFloat(amountInput).toFixed(2)}
                  </Text>
                </View>
              </View>
            )}

            <View className="flex-row gap-3">
              <AppButton
                title="Back"
                variant="secondary"
                className="flex-1"
                onPress={handleCancel}
              />
              <AppButton
                title="Confirm"
                variant={tradeResult === 'profit' ? 'primary' : 'danger'}
                className="flex-1"
                onPress={handleConfirmClose}
              />
            </View>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}