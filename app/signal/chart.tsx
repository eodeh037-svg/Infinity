import { View, Text, ScrollView, Pressable, ActivityIndicator } from 'react-native';
import { useState, useEffect, useRef } from 'react';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { router, useLocalSearchParams } from 'expo-router';
import { Candle } from '../../lib/indicators/types';
import CandleChart from '../../component/CandleChart';
import { useTheme } from '../../lib/theme';
import { formatPrice } from '../../component/ui/money';
import {
  LIVE_CHART_TIMEFRAMES,
  consumeLiveChartPrefetch,
  fetchLiveChart,
} from '../../lib/api/liveChart';

const TIMEFRAMES = LIVE_CHART_TIMEFRAMES;

export default function ChartScreen() {
  const { colors } = useTheme();
  const { symbol, entry, sl, tp } = useLocalSearchParams<{
    symbol: string;
    entry?: string;
    sl?: string;
    tp?: string;
  }>();
  const [selectedTimeframe, setSelectedTimeframe] = useState('4H');
  const [candles, setCandles] = useState<Candle[]>([]);
  const [loading, setLoading] = useState(true);
  const [pairName, setPairName] = useState('');
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  function startAutoRefresh() {
    if (intervalRef.current) clearInterval(intervalRef.current);
    intervalRef.current = setInterval(loadChartData, 60000);
  }

  async function loadChartData() {
    if (!symbol) return;
    try {
      const prefetched = consumeLiveChartPrefetch(symbol, selectedTimeframe);
      const candleResult = prefetched
        ? await prefetched
        : await fetchLiveChart(symbol, selectedTimeframe);
      setCandles(candleResult.data);
      setPairName(symbol.replace(/_/g, '/'));
    } catch (error) {
      console.error('Failed to load chart data:', error);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadChartData();
    startAutoRefresh();
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, [symbol, selectedTimeframe]);

  const lastCandle = candles[candles.length - 1];
  const previousCandle = candles[candles.length - 2];
  const priceChange = lastCandle && previousCandle ? lastCandle.close - previousCandle.close : 0;
  const priceChangePercent = previousCandle ? (priceChange / previousCandle.close) * 100 : 0;
  const isPositive = priceChange >= 0;

  const entryNum = entry ? parseFloat(entry) : null;
  const slNum = sl ? parseFloat(sl) : null;
  const tpNum = tp ? parseFloat(tp) : null;
  const hasLevels = entryNum != null && entryNum > 0;

  return (
    <SafeAreaView className="flex-1 bg-background">
      <ScrollView showsVerticalScrollIndicator={false}>
        <View className="px-4 pt-4">
          <View className="mb-4 flex-row items-center justify-between">
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Go back"
              onPress={() => router.back()}
              className="h-10 w-10 items-center justify-center rounded-lg border border-border bg-card">
              <Ionicons name="chevron-back" size={20} color={colors.foreground} />
            </Pressable>

            <View className="items-center">
              <Text className="text-[16px] font-bold text-foreground">{pairName}</Text>
              {lastCandle && (
                <View className="flex-row items-center gap-2">
                  <Text className="text-[15px] font-semibold text-foreground">
                    {formatPrice(lastCandle.close)}
                  </Text>
                  <Text
                    className={`text-[12px] font-medium ${isPositive ? 'text-success' : 'text-danger'}`}>
                    {isPositive ? '+' : ''}
                    {priceChangePercent.toFixed(2)}%
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
                accessibilityRole="button"
                accessibilityState={{ selected: selectedTimeframe === tf }}
                onPress={() => setSelectedTimeframe(tf)}
                className={`flex-1 items-center rounded-lg border py-2 ${
                  selectedTimeframe === tf
                    ? 'border-accent/60 bg-accent/15'
                    : 'border-border bg-card'
                }`}>
                <Text
                  className={`text-[12px] font-medium ${
                    selectedTimeframe === tf ? 'text-accent' : 'text-muted'
                  }`}>
                  {tf}
                </Text>
              </Pressable>
            ))}
          </View>

          <View className="mb-4 rounded-xl border border-border bg-card p-3">
            {loading ? (
              <View className="h-[300px] items-center justify-center">
                <ActivityIndicator size="large" color={colors.accent} />
                <Text className="mt-3 text-[13px] text-muted">Loading chart...</Text>
              </View>
            ) : (
              <CandleChart candles={candles} entryPrice={entryNum} stopLoss={slNum} takeProfit={tpNum} />
            )}
          </View>

          {lastCandle && (
            <View className="mb-4 rounded-xl border border-border bg-card p-4">
              <Text className="mb-3 text-[12px] font-semibold uppercase tracking-wider text-muted">
                OHLC Data
              </Text>
              <View className="flex-row justify-between gap-2">
                {(
                  [
                    ['Open', formatPrice(lastCandle.open)],
                    ['High', formatPrice(lastCandle.high)],
                    ['Low', formatPrice(lastCandle.low)],
                    ['Close', formatPrice(lastCandle.close)],
                  ] as const
                ).map(([label, value]) => (
                  <View key={label} className="flex-1 items-center">
                    <Text className="text-[10px] text-muted">{label}</Text>
                    <Text className="mt-1 text-[13px] font-medium text-foreground" numberOfLines={1}>
                      {value}
                    </Text>
                  </View>
                ))}
              </View>
            </View>
          )}

          {hasLevels && (
            <View className="mb-4 flex-row justify-center gap-4">
              <View className="flex-row items-center gap-1.5">
                <View className="h-2 w-2 rounded-full bg-accent" />
                <Text className="text-[10px] text-muted">Entry</Text>
              </View>
              <View className="flex-row items-center gap-1.5">
                <View className="h-2 w-2 rounded-full bg-danger" />
                <Text className="text-[10px] text-muted">Stop Loss</Text>
              </View>
              <View className="flex-row items-center gap-1.5">
                <View className="h-2 w-2 rounded-full bg-success" />
                <Text className="text-[10px] text-muted">Take Profit</Text>
              </View>
            </View>
          )}
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}