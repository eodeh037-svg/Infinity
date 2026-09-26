import { View, Text, ScrollView, Pressable, RefreshControl, ActivityIndicator } from 'react-native';
import { useState, useCallback, useLayoutEffect } from 'react';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import {
  getCurrencyPairs,
  getUserProfile,
  getUserOpenTrades,
  getMarketNews,
  getGreeting,
  isMarketOpen,
  formatPrice,
  waitForAuth,
} from '../../lib/services/dataService';
import { CurrencyPair, UserProfile, Trade, MarketNews } from '../../types';
import { useTheme } from '../../lib/theme';
import { useUser } from '../../lib/firebase/userProvider';
import AppCard from '../../component/ui/AppCard';
import SectionHeader from '../../component/ui/SectionHeader';
import SignalBadge from '../../component/ui/SignalBadge';
import EmptyState from '../../component/ui/EmptyState';
import { formatDollar } from '../../component/ui/money';

export default function HomeScreen() {
  const { colors } = useTheme();
  const { isPremium } = useUser();
  const [user, setUser] = useState<UserProfile | null>(null);
  const [pairs, setPairs] = useState<CurrencyPair[]>([]);
  const [openTrades, setOpenTrades] = useState<Trade[]>([]);
  const [news, setNews] = useState<MarketNews[]>([]);
  const [loading, setLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);

  useLayoutEffect(() => {
    loadData();
  }, []);

  async function loadData() {
    try {
      setLoading(true);
      await waitForAuth();
      const [userData, newsData, tradesData, pairsData] = await Promise.all([
        getUserProfile(),
        getMarketNews(),
        getUserOpenTrades(),
        getCurrencyPairs('Major'),
      ]);
      setUser(userData);
      setNews(newsData);
      setOpenTrades(tradesData);
      setPairs(pairsData);
    } catch (error) {
      console.log(error);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }

  const onRefresh = useCallback(() => {
    setRefreshing(true);
    loadData();
  }, []);

  const bestPair =
    pairs.length > 0 ? pairs.reduce((a, b) => (a.changePercent > b.changePercent ? a : b)) : null;
  const worstPair =
    pairs.length > 0 ? pairs.reduce((a, b) => (a.changePercent < b.changePercent ? a : b)) : null;
  const marketOpen = isMarketOpen();

  if (loading) {
    return (
      <View className="flex-1 items-center justify-center bg-background">
        <ActivityIndicator size="large" color={colors.accent} />
        <Text className="mt-4 text-[13px] text-muted">Loading your dashboard...</Text>
      </View>
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
          <View className="mb-5 flex-row items-center justify-between">
            <View className="flex-row items-center gap-3">
              <View className="h-10 w-10 items-center justify-center rounded-full bg-accent">
                <Text className="text-[16px] font-bold text-white">∞</Text>
              </View>
              <View>
                <Text className="text-[18px] font-bold text-foreground">
                  {user?.userName ?? 'Trader'}
                </Text>
                <Text className="text-[12px] text-muted">
                  {getGreeting()} · {user?.email?.split('@')[0] ?? 'Infinity'}
                </Text>
              </View>
            </View>

            <View
              className={`flex-row items-center gap-1.5 rounded-full px-3 py-1.5 ${
                marketOpen ? 'bg-success/12' : 'bg-warning/12'
              }`}>
              <View
                className={`h-1.5 w-1.5 rounded-full ${marketOpen ? 'bg-success' : 'bg-warning'}`}
              />
              <Text
                className={`text-[11px] font-medium ${
                  marketOpen ? 'text-success' : 'text-warning'
                }`}>
                {marketOpen ? 'Market Open' : 'Markets Closed'}
              </Text>
            </View>
          </View>

          <AppCard className="mb-5 p-5">
            <View className="flex-row items-center justify-between">
              <View>
                <Text className="text-[12px] text-muted">Account Balance</Text>
                <Text
                  className={`mt-1 text-[24px] font-bold ${
                    (user?.accountBalance ?? 0) >= 0 ? 'text-foreground' : 'text-danger'
                  }`}>
                  {formatDollar(user?.accountBalance ?? 0)}
                </Text>
              </View>
              <View className="items-end">
                <Text className="text-[12px] text-muted">Total P/L</Text>
                <Text
                  className={`mt-1 text-[17px] font-bold ${
                    (user?.totalPL ?? 0) >= 0 ? 'text-success' : 'text-danger'
                  }`}>
                  {formatDollar(user?.totalPL ?? 0)}
                </Text>
              </View>
            </View>

            <View className="mt-4 flex-row items-center justify-between border-t border-border pt-3">
              <View className="flex-row items-center gap-2">
                <View className="h-2 w-2 rounded-full bg-muted" />
                <Text className="text-[12px] text-muted">Open positions: {openTrades.length}</Text>
              </View>
              <View className="flex-row items-center gap-1.5 rounded-md border border-border bg-elevated px-2 py-1">
                <Ionicons name="flash" size={12} color={colors.accent} />
                <Text className="text-[11px] text-muted">
                  {isPremium ? 'Premium Plan' : 'Free Plan'}
                </Text>
              </View>
            </View>
          </AppCard>

          <View className="mb-6">
            <SectionHeader className="mb-3">Market Movers</SectionHeader>
            <View className="flex-row gap-3">
              {bestPair && (
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel={`Top mover ${bestPair.symbol}`}
                  onPress={() => router.push(`/pair/${bestPair.symbol.replace('/', '_')}`)}
                  className="flex-1 rounded-xl border border-border bg-card p-4">
                  <View className="mb-2 flex-row items-center gap-1">
                    <Ionicons name="trending-up" size={12} color={colors.success} />
                    <Text className="text-[10px] font-semibold text-success">TOP MOVER</Text>
                  </View>
                  <Text className="text-[17px] font-bold text-foreground">{bestPair.symbol}</Text>
                  <Text className="mb-2 mt-0.5 text-[12px] text-muted">
                    {formatPrice(bestPair.price)}
                  </Text>
                  <View className="flex-row items-center gap-2">
                    <View className="rounded-md bg-success/12 px-2 py-0.5">
                      <Text className="text-[11px] font-bold text-success">
                        {bestPair.changePercent >= 0 ? '+' : ''}
                        {bestPair.changePercent.toFixed(2)}%
                      </Text>
                    </View>
                    <Text className="text-[11px] text-muted">24h</Text>
                  </View>
                </Pressable>
              )}

              {worstPair && (
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel={`Bottom mover ${worstPair.symbol}`}
                  onPress={() => router.push(`/pair/${worstPair.symbol.replace('/', '_')}`)}
                  className="flex-1 rounded-xl border border-border bg-card p-4">
                  <View className="mb-2 flex-row items-center gap-1">
                    <Ionicons name="trending-down" size={12} color={colors.danger} />
                    <Text className="text-[10px] font-semibold text-danger">BOTTOM MOVER</Text>
                  </View>
                  <Text className="text-[17px] font-bold text-foreground">{worstPair.symbol}</Text>
                  <Text className="mb-2 mt-0.5 text-[12px] text-muted">
                    {formatPrice(worstPair.price)}
                  </Text>
                  <View className="flex-row items-center gap-2">
                    <View className="rounded-md bg-danger/12 px-2 py-0.5">
                      <Text className="text-[11px] font-bold text-danger">
                        {worstPair.changePercent >= 0 ? '+' : ''}
                        {worstPair.changePercent.toFixed(2)}%
                      </Text>
                    </View>
                    <Text className="text-[11px] text-muted">24h</Text>
                  </View>
                </Pressable>
              )}
            </View>
          </View>

          <View className="mb-6">
            <SectionHeader className="mb-3">Open Positions</SectionHeader>
            {openTrades.length > 0 ? (
              openTrades.map((trade) => (
                <Pressable
                  key={trade.id}
                  accessibilityRole="button"
                  accessibilityLabel={`Open position ${trade.pair}`}
                  className="mb-2 flex-row items-center justify-between rounded-xl border border-border bg-card p-4">
                  <View className="flex-row items-center gap-2">
                    <Text className="text-[15px] font-semibold text-foreground">
                      {trade.pair}
                    </Text>
                    <SignalBadge signal={trade.signal === 'SELL' ? 'SELL' : 'BUY'} />
                  </View>
                  <Text className="text-[12px] text-muted">Entry: {trade.entry}</Text>
                </Pressable>
              ))
            ) : (
              <EmptyState
                icon="briefcase-outline"
                title="No open positions"
                message="Signals you take on the Generate tab will appear here."
              />
            )}
          </View>

          <View className="mb-6">
            <SectionHeader className="mb-3">Market Summary</SectionHeader>
            <AppCard className="overflow-hidden p-0">
              {pairs.slice(0, 4).map((pair) => (
                <Pressable
                  key={pair.symbol}
                  onPress={() => router.push(`/pair/${pair.symbol.replace('/', '_')}`)}
                  className="flex-row items-center justify-between border-b border-border px-4 py-3.5">
                  <View className="flex-row items-center gap-2">
                    <Text className="text-sm">{pair.flag1}</Text>
                    <Text className="text-[14px] font-medium text-foreground">{pair.symbol}</Text>
                  </View>

                  <View className="flex-row items-center gap-6">
                    <Text className="text-[14px] text-foreground">{formatPrice(pair.price)}</Text>
                    <Text
                      className={`w-16 text-right text-[13px] font-medium ${
                        pair.changePercent >= 0 ? 'text-success' : 'text-danger'
                      }`}>
                      {pair.changePercent >= 0 ? '+' : ''}
                      {pair.changePercent.toFixed(2)}%
                    </Text>
                  </View>
                </Pressable>
              ))}
            </AppCard>
          </View>

          <View className="mb-8">
            <SectionHeader className="mb-3">Market News</SectionHeader>
            <AppCard className="overflow-hidden p-0">
              {news.map((item) => (
                <View
                  key={item.id}
                  className="flex-row items-start gap-3 border-b border-border p-4">
                  <View className="mt-0.5 rounded-md bg-accent/15 px-2 py-1">
                    <Text className="text-[10px] font-bold text-accent">{item.currency}</Text>
                  </View>
                  <View className="flex-1">
                    <Text className="text-[13px] leading-5 text-foreground">{item.title}</Text>
                    <Text className="mt-1 text-[11px] text-muted">{item.time}</Text>
                  </View>
                </View>
              ))}
            </AppCard>
          </View>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}