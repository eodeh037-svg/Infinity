import {
  View,
  Text,
  TextInput,
  ScrollView,
  Pressable,
  RefreshControl,
  ActivityIndicator,
} from 'react-native';
import { useState, useCallback, useRef, useEffect } from 'react';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { getCurrencyPairs } from '../../lib/services/dataService';
import { getAssetType, getMarketStatus, MarketStatus } from '../../lib/services/marketStatus';
import { CurrencyPair } from '../../types';
import { useTheme } from '../../lib/theme';
import AppCard from '../../component/ui/AppCard';
import ChipRow from '../../component/ui/ChipRow';
import EmptyState from '../../component/ui/EmptyState';
import MarketCard from '../../component/MarketCard';

const CATEGORIES = ['All', 'Major', 'Minor', 'Exotic', 'Crypto', 'Commodities'];
const REFRESH_INTERVAL = 60000;

export default function MarketsScreen() {
  const { colors } = useTheme();
  const [allPairs, setAllPairs] = useState<CurrencyPair[]>([]);
  const [filteredPairs, setFilteredPairs] = useState<CurrencyPair[]>([]);
  const [selectedCategory, setSelectedCategory] = useState('All');
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const loadedRef = useRef(false);
  const [marketStatus, setMarketStatus] = useState<MarketStatus | null>(null);
  const statusIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    loadAllPairs();
    intervalRef.current = setInterval(() => loadAllPairs(true), REFRESH_INTERVAL);
    statusIntervalRef.current = setInterval(updateMarketStatus, 60000);
    updateMarketStatus();
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
      if (statusIntervalRef.current) clearInterval(statusIntervalRef.current);
    };
  }, []);

  useEffect(() => {
    updateMarketStatus();
  }, [selectedCategory]);

  useEffect(() => {
    filterPairs();
  }, [allPairs, selectedCategory, search]);

  async function loadAllPairs(isRefresh = false) {
    try {
      const data = await getCurrencyPairs('all');
      setAllPairs(data);
      if (!loadedRef.current) setLoading(false);
      loadedRef.current = true;
    } catch (error) {
      console.error('Failed to load pairs:', error);
      if (!loadedRef.current) setLoading(false);
      loadedRef.current = true;
    } finally {
      setRefreshing(false);
    }
  }

  function filterPairs() {
    let result = allPairs;
    if (selectedCategory !== 'All') {
      result = result.filter((p) => p.category === selectedCategory);
    }
    if (search) {
      const lower = search.toLowerCase();
      result = result.filter(
        (p) => p.symbol.toLowerCase().includes(lower) || p.name.toLowerCase().includes(lower)
      );
    }
    setFilteredPairs(result);
  }

  function updateMarketStatus() {
    const isForexView =
      !selectedCategory ||
      selectedCategory === 'All' ||
      selectedCategory === 'Major' ||
      selectedCategory === 'Minor' ||
      selectedCategory === 'Exotic';
    if (isForexView) {
      setMarketStatus(getMarketStatus('forex'));
    } else if (selectedCategory === 'Crypto') {
      setMarketStatus(getMarketStatus('crypto'));
    } else {
      setMarketStatus(null);
    }
  }

  const onRefresh = useCallback(() => {
    setRefreshing(true);
    loadAllPairs(true);
  }, []);

  if (loading) {
    return (
      <View className="flex-1 items-center justify-center bg-background">
        <ActivityIndicator size="large" color={colors.accent} />
        <Text className="mt-3 text-[13px] text-muted">Loading market data...</Text>
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
          <Text className="mb-3 text-[22px] font-bold text-foreground">Markets</Text>

          <View className="mb-3 flex-row items-center rounded-lg border border-border bg-card px-4 py-2.5">
            <Ionicons name="search" size={18} color={colors.muted} />
            <TextInput
              placeholder="Search pairs..."
              placeholderTextColor={colors.muted}
              value={search}
              onChangeText={setSearch}
              className="ml-2 flex-1 py-2 text-[14px] text-foreground"
            />
            {search.length > 0 && (
              <Pressable accessibilityLabel="Clear search" onPress={() => setSearch('')}>
                <Ionicons name="close-circle" size={18} color={colors.muted} />
              </Pressable>
            )}
          </View>

          <ChipRow
            className="mb-4"
            items={CATEGORIES.map((c) => ({ key: c, label: c }))}
            selected={selectedCategory}
            onSelect={setSelectedCategory}
          />

          <View className="mb-2 flex-row justify-between px-1">
            <Text className="text-[11px] font-semibold uppercase tracking-wider text-muted">
              PAIR
            </Text>
            <View className="flex-row gap-8">
              <Text className="text-[11px] font-semibold uppercase tracking-wider text-muted">
                PRICE
              </Text>
              <Text className="text-[11px] font-semibold uppercase tracking-wider text-muted">
                CHANGE
              </Text>
            </View>
          </View>

          <AppCard className="overflow-hidden p-0">
            {marketStatus && !marketStatus.isOpen && (
              <View className="items-center border-b border-border px-4 py-4">
                <Ionicons name="time-outline" size={20} color={colors.warning} />
                <Text className="mt-2 text-[13px] font-medium text-warning">
                  {marketStatus.message}
                </Text>
              </View>
            )}
            {filteredPairs.map((pair) => {
              const pairAssetType = getAssetType(pair);
              const pairClosed = pairAssetType === 'forex' && marketStatus && !marketStatus.isOpen;
              return (
                <MarketCard
                  key={pair.symbol}
                  pair={pair}
                  blocked={!!pairClosed}
                  onPress={() => router.push(`/pair/${pair.symbol.replace('/', '_')}`)}
                />
              );
            })}
            {filteredPairs.length === 0 && (
              <EmptyState
                icon="search-outline"
                title="No pairs found"
                message="Try a different search or category."
              />
            )}
          </AppCard>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}