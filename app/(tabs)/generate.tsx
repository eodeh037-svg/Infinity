import {
  View,
  Text,
  TextInput,
  ScrollView,
  Pressable,
  Modal,
  Alert,
  ActivityIndicator,
} from 'react-native';
import { useState, useEffect, useRef, useCallback } from 'react';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { router, useFocusEffect } from 'expo-router';
import * as Clipboard from 'expo-clipboard';
import {
  getCurrencyPairs,
  saveTrade,
  formatPrice,
  getCurrentUserId,
} from '../../lib/services/dataService';
import { buildAuthoritativeSignal, AuthoritativeSignal } from '../../lib/signals/tradeSetup';
import { MultiTimeframeResult } from '../../lib/signals/multiTimeframe';
import {
  STRATEGY_LIST,
  StrategyKey,
  getStrategy,
  getStrategyTimeframes,
} from '../../lib/signals/strategies';
import {
  getAssetType,
  getMarketStatus,
  MarketStatus,
  AssetType,
} from '../../lib/services/marketStatus';
import { CurrencyPair } from '../../types';
import { generateMultiTimeframeSignal } from '../../lib/api/client';
import { Candle } from '../../lib/indicators/types';
import { useTheme } from '../../lib/theme';
import { useUser } from '../../lib/firebase/userProvider';
import {
  FREE_SIGNAL_LIMIT,
  canGenerateSignal,
  getSignalsUsed,
  recordSignalGeneration,
} from '../../lib/server/premium';
import AppCard from '../../component/ui/AppCard';
import AppButton from '../../component/ui/AppButton';
import SectionHeader from '../../component/ui/SectionHeader';
import ChipRow from '../../component/ui/ChipRow';
import EmptyState from '../../component/ui/EmptyState';
import MarketCard from '../../component/MarketCard';
import { SignalAnalysisLoading } from '../../component/ui/LoadingStep';
import SignalResultSheet from '../../component/ui/SignalResultSheet';
import { formatMoney } from '../../component/ui/money';
import { PREMIUM_PRICE_NGN } from '../../component/ui/constants';

const CATEGORIES = ['Major', 'Minor', 'Exotic', 'Crypto', 'Commodities'];

export default function GenerateScreen() {
  const { colors } = useTheme();
  const { isPremium } = useUser();
  const [pairs, setPairs] = useState<CurrencyPair[]>([]);
  const [filteredPairs, setFilteredPairs] = useState<CurrencyPair[]>([]);
  const [selectedCategory, setSelectedCategory] = useState('Major');
  const [selectedStrategy, setSelectedStrategy] = useState<StrategyKey>('general');
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [activeStep, setActiveStep] = useState(0);
  const [selectedPair, setSelectedPair] = useState<CurrencyPair | null>(null);
  const [authoritativeSignal, setAuthoritativeSignal] =
    useState<AuthoritativeSignal | null>(null);
  const [multiTimeframeResult, setMultiTimeframeResult] = useState<MultiTimeframeResult | null>(
    null
  );
  const [showSignalModal, setShowSignalModal] = useState(false);
  const [accountSize, setAccountSize] = useState('');
  const [marketStatus, setMarketStatus] = useState<MarketStatus | null>(null);
  const statusIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const [signalsUsed, setSignalsUsed] = useState(0);
  const [showUpgradeModal, setShowUpgradeModal] = useState(false);

  useEffect(() => {
    loadPairs();
    loadSignalUsage();
    return () => {
      if (statusIntervalRef.current) clearInterval(statusIntervalRef.current);
    };
  }, []);

  useFocusEffect(
    useCallback(() => {
      loadSignalUsage();
    }, [])
  );

  useEffect(() => {
    updateMarketStatus();
    if (statusIntervalRef.current) clearInterval(statusIntervalRef.current);
    statusIntervalRef.current = setInterval(updateMarketStatus, 60000);
    return () => {
      if (statusIntervalRef.current) clearInterval(statusIntervalRef.current);
    };
  }, [selectedCategory]);

  useEffect(() => {
    filterPairs();
  }, [pairs, selectedCategory, search]);

  async function loadPairs() {
    try {
      setLoading(true);
      const data = await getCurrencyPairs('all');
      setPairs(data);
    } catch (error) {
      console.error('Failed to load pairs:', error);
    } finally {
      setLoading(false);
    }
  }

  async function loadSignalUsage() {
    const uid = getCurrentUserId();

    if (!uid || uid === 'anonymous') {
      return;
    }

    try {
      const used = await getSignalsUsed(uid);
      setSignalsUsed(used);
    } catch (error) {
      console.error('Failed to load signal usage:', error);
    }
  }

  function filterPairs() {
    let result = pairs;
    if (selectedCategory) {
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

  function handleCategoryChange(category: string) {
    setSelectedCategory(category);
  }

  function updateMarketStatus() {
    const assetType: AssetType =
      selectedCategory === 'Crypto'
        ? 'crypto'
        : selectedCategory === 'Commodities'
          ? 'commodities'
          : 'forex';
    setMarketStatus(getMarketStatus(assetType));
  }

  async function handleGenerateSignal(pair: CurrencyPair) {
    const uid = getCurrentUserId();

    if (!uid || uid === 'anonymous') {
      Alert.alert('Sign in Required', 'Please sign in to generate signals.');
      return;
    }

    const check = await canGenerateSignal(uid);

    if (!check.canGenerate) {
      setShowUpgradeModal(true);
      return;
    }

    const assetType = getAssetType(pair);
    const status = getMarketStatus(assetType);

    if (!status.isOpen) {
      Alert.alert('Market Closed', status.message);
      return;
    }

    setSelectedPair(pair);
    setGenerating(true);
    setShowSignalModal(true);
    setAuthoritativeSignal(null);
    setMultiTimeframeResult(null);
    setActiveStep(0);

    let step = 0;
    const stepInterval = setInterval(() => {
      step++;
      if (step < 5) setActiveStep(step);
    }, 2000);

    try {
      const symbol = pair.symbol;
      const timeframes = getStrategyTimeframes(selectedStrategy);
      const candleData = await generateMultiTimeframeSignal(symbol, selectedStrategy, 250);

      const candleMap: Record<string, Candle[]> = {};
      for (const tf of timeframes) {
        candleMap[tf] = (candleData.candleData[tf] ?? []) as Candle[];
      }

      await new Promise((resolve) => setTimeout(resolve, 500));
      setActiveStep(4);
      await new Promise((resolve) => setTimeout(resolve, 600));

      const result = buildAuthoritativeSignal(
        candleMap,
        selectedStrategy,
        parseFloat(accountSize) || 0
      );
      setAuthoritativeSignal(result);
      setMultiTimeframeResult(result.timeframeAnalysis);

      if (!isPremium && result.signal !== 'HOLD') {
        try {
          await recordSignalGeneration(uid);
          await loadSignalUsage();
        } catch (error) {
          console.error('Failed to record signal usage:', error);
        }
      }

      clearInterval(stepInterval);
      setActiveStep(5);
      await new Promise((resolve) => setTimeout(resolve, 300));
    } catch (error) {
      console.error('Failed to generate signal:', error);
      clearInterval(stepInterval);
      Alert.alert('Error', 'Failed to generate signal. Please try again.');
      setShowSignalModal(false);
    } finally {
      setGenerating(false);
    }
  }

  async function handleCopyValue(value: string) {
    await Clipboard.setStringAsync(value);
  }

  async function handleSaveTrade() {
    if (!selectedPair) return;

    const resultToSave = authoritativeSignal;
    if (!resultToSave) return;
    if (resultToSave.signal === 'HOLD' || resultToSave.entry === null) {
      Alert.alert(
        'No Trade',
        'This is a HOLD signal — no entry, stop loss, or take profit available.'
      );
      return;
    }
    if (resultToSave.stopLoss === null || resultToSave.takeProfit === null) {
      Alert.alert(
        'No Trade',
        'No validated stop loss / take profit could be built for this setup.'
      );
      return;
    }

    try {
      await saveTrade({
        pair: selectedPair.symbol,
        signal: resultToSave.signal,
        entry: formatPrice(resultToSave.entry),
        exitPrice: null,
        stopLoss: formatPrice(resultToSave.stopLoss),
        takeProfit: formatPrice(resultToSave.takeProfit),
        riskReward: resultToSave.riskReward
          ? `1:${resultToSave.riskReward.toFixed(2)}`
          : '1:2',
        confidence: resultToSave.confidence,
        profitLoss: 0,
        profitLossPercent: 0,
        status: 'open',
        reasons: resultToSave.reasons,
        createdAt: Date.now(),
        closedAt: null,
        userId: getCurrentUserId(),
      });

      setShowSignalModal(false);
      Alert.alert('Trade Saved', 'Your trade has been saved to your portfolio.');
    } catch (error) {
      console.error('Failed to save trade:', error);
      Alert.alert('Error', 'Failed to save trade.');
    }
  }

  if (loading) {
    return (
      <View className="flex-1 items-center justify-center bg-background">
        <ActivityIndicator size="large" color={colors.accent} />
        <Text className="mt-3 text-[13px] text-muted">Loading pairs...</Text>
      </View>
    );
  }

  return (
    <SafeAreaView className="flex-1 bg-background" edges={['top']}>
      <ScrollView showsVerticalScrollIndicator={false}>
        <View className="px-5 pt-4">
          <Text className="text-[22px] font-bold text-foreground">Generate AI Signal</Text>
          <Text className="mb-4 mt-1 text-[14px] text-muted">
            Select a currency pair to analyze.
          </Text>

          {!isPremium && (
            <AppCard className="mb-4">
              <View className="flex-row items-center justify-between">
                <Text className="text-[13px] font-semibold text-foreground">Free Plan</Text>
                <Text className="text-[13px] text-muted">
                  {signalsUsed} / {FREE_SIGNAL_LIMIT} signals used
                </Text>
              </View>
              <View
                className="mt-2 h-1.5 w-full overflow-hidden rounded-full"
                style={{ backgroundColor: colors.border }}>
                <View
                  className="h-1.5 rounded-full"
                  style={{
                    width: `${Math.min(100, (signalsUsed / FREE_SIGNAL_LIMIT) * 100)}%`,
                    backgroundColor:
                      signalsUsed >= FREE_SIGNAL_LIMIT ? colors.warning : colors.accent,
                  }}
                />
              </View>
              <Text className="mt-1.5 text-[11px] text-muted">
                {signalsUsed >= FREE_SIGNAL_LIMIT
                  ? 'Upgrade to Premium for unlimited signals — free signals reset every 24 hours'
                  : `${FREE_SIGNAL_LIMIT - signalsUsed} free signal${
                      FREE_SIGNAL_LIMIT - signalsUsed === 1 ? '' : 's'
                    } left`}
              </Text>
            </AppCard>
          )}

          <View className="mb-3 flex-row items-center rounded-lg border border-border bg-card px-4 py-2.5">
            <Ionicons name="search" size={18} color={colors.muted} />
            <TextInput
              placeholder="Search pairs..."
              placeholderTextColor={colors.muted}
              value={search}
              onChangeText={setSearch}
              className="ml-2 flex-1 py-2 text-[14px] text-foreground"
            />
          </View>

          <View className="mb-4 flex-row items-center rounded-lg border border-border bg-card px-4 py-2.5">
            <Ionicons name="wallet" size={18} color={colors.muted} />
            <TextInput
              placeholder="Account size (USD)..."
              placeholderTextColor={colors.muted}
              value={accountSize}
              onChangeText={setAccountSize}
              keyboardType="numeric"
              className="ml-2 flex-1 py-2 text-[14px] text-foreground"
            />
            {accountSize ? (
              <Pressable accessibilityLabel="Clear account size" onPress={() => setAccountSize('')}>
                <Ionicons name="close-circle" size={16} color={colors.muted} />
              </Pressable>
            ) : null}
          </View>

          <View className="mb-4">
            <SectionHeader className="mb-2">Trading Strategy</SectionHeader>
            <ChipRow
              items={STRATEGY_LIST.map((s) => ({ key: s.key, label: s.label }))}
              selected={selectedStrategy}
              onSelect={(key) => setSelectedStrategy(key as StrategyKey)}
            />
            <Text className="mt-1.5 text-[11px] text-muted">
              {getStrategy(selectedStrategy).description}
            </Text>
          </View>

          <View className="mb-4">
            <SectionHeader className="mb-2">Category</SectionHeader>
            <ChipRow
              items={CATEGORIES.map((c) => ({ key: c, label: c }))}
              selected={selectedCategory}
              onSelect={handleCategoryChange}
            />
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
              const pairBlocked =
                pairAssetType === 'forex' && marketStatus && !marketStatus.isOpen;
              return (
                <MarketCard
                  key={pair.symbol}
                  pair={pair}
                  blocked={!!pairBlocked}
                  showChevron
                  onPress={() => handleGenerateSignal(pair)}
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

          <View className="mb-6 mt-4 flex-row items-start gap-2 rounded-xl border border-border bg-card px-4 py-3">
            <Ionicons
              name="warning-outline"
              size={14}
              color={colors.warning}
              style={{ marginTop: 2 }}
            />
            <Text className="flex-1 text-[11px] leading-4 text-muted">
              Trading forex, crypto, and commodities involves high risk. Infinity is not
              responsible for any loss. See Terms & Conditions.
            </Text>
          </View>
        </View>
      </ScrollView>

      <Modal
        visible={showSignalModal}
        transparent
        animationType="slide"
        onRequestClose={() => !generating && setShowSignalModal(false)}>
        <View className="flex-1 items-center justify-end bg-black/60">
          <View className="max-h-[85%] w-full rounded-t-2xl bg-elevated px-6 pb-8 pt-6">
            {generating ? (
              <SignalAnalysisLoading
                pairSymbol={selectedPair?.symbol ?? ''}
                activeStep={activeStep}
                onClose={() => {}}
              />
            ) : multiTimeframeResult && authoritativeSignal ? (
              <SignalResultSheet
                pairSymbol={selectedPair?.symbol ?? ''}
                result={authoritativeSignal}
                multiTimeframe={multiTimeframeResult}
                accountSize={accountSize}
                onCopy={(value) => handleCopyValue(value)}
                onSave={handleSaveTrade}
                onClose={() => setShowSignalModal(false)}
              />
            ) : null}
          </View>
        </View>
      </Modal>

      <Modal
        visible={showUpgradeModal}
        transparent
        animationType="fade"
        onRequestClose={() => setShowUpgradeModal(false)}>
        <View className="flex-1 items-center justify-center bg-black/60 px-5">
          <View className="w-full max-w-md rounded-2xl border border-border bg-elevated p-6">
            <View className="mb-4 h-12 w-12 items-center justify-center rounded-full bg-accent/15">
              <Ionicons name="flash" size={24} color={colors.accent} />
            </View>

            <Text className="text-[18px] font-bold text-foreground">Free Signal Limit Reached</Text>

            <Text className="mt-2 text-[13px] leading-5 text-muted">
              You&apos;ve used all {FREE_SIGNAL_LIMIT} free signals. Upgrade to Infinity Premium to
              generate unlimited signals, unlock multi-timeframe analysis, and get full market
              context. Free signals reset every 24 hours.
            </Text>

            <AppCard className="mt-4">
              <Text className="text-[12px] font-semibold uppercase tracking-wider text-muted">
                Premium Monthly
              </Text>
              <View className="mt-1 flex-row items-baseline gap-1">
                <Text className="text-[22px] font-bold text-accent">
                  {formatMoney(PREMIUM_PRICE_NGN)}
                </Text>
                <Text className="text-[12px] text-muted">/ month</Text>
              </View>
              <Text className="mt-1 text-[12px] text-muted">
                Unlimited signals • Multi-timeframe • Market context
              </Text>
            </AppCard>

            <AppButton
              title="Upgrade to Premium"
              className="mt-5 w-full"
              onPress={() => {
                setShowUpgradeModal(false);
                router.push('/premium');
              }}
            />
            <AppButton
              title="Not Now"
              variant="ghost"
              className="mt-2 w-full"
              onPress={() => setShowUpgradeModal(false)}
            />
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}