import {
  View,
  Text,
  ScrollView,
  Pressable,
  ActivityIndicator,
  Modal,
  TextInput,
  Alert,
} from 'react-native';
import { useState, useEffect } from 'react';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { router, useLocalSearchParams } from 'expo-router';
import * as Clipboard from 'expo-clipboard';
import {
  getCurrencyPair,
  formatPrice,
  saveTrade,
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
import { generateMultiTimeframeSignal } from '../../lib/api/client';
import { Candle } from '../../lib/indicators/types';
import { useTheme } from '../../lib/theme';
import { getAssetType, getMarketStatus } from '../../lib/services/marketStatus';
import { startLiveChartPrefetch } from '../../lib/api/liveChart';
import { CurrencyPair } from '../../types';
import AppCard from '../../component/ui/AppCard';
import AppButton from '../../component/ui/AppButton';
import SectionHeader from '../../component/ui/SectionHeader';
import DataRow from '../../component/ui/DataRow';
import ChipRow from '../../component/ui/ChipRow';
import { SignalAnalysisLoading } from '../../component/ui/LoadingStep';
import SignalResultSheet from '../../component/ui/SignalResultSheet';

const RISK_PERCENT = 0.02;

export default function PairDetailScreen() {
  const { colors } = useTheme();
  const { symbol } = useLocalSearchParams<{ symbol: string }>();
  const [pair, setPair] = useState<CurrencyPair | null>(null);
  const [loading, setLoading] = useState(true);
  const [showSignalModal, setShowSignalModal] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [activeStep, setActiveStep] = useState(0);
  const [authoritativeSignal, setAuthoritativeSignal] = useState<AuthoritativeSignal | null>(null);
  const [multiTimeframeResult, setMultiTimeframeResult] = useState<MultiTimeframeResult | null>(
    null
  );
  const [selectedStrategy, setSelectedStrategy] = useState<StrategyKey>('general');
  const [accountSize, setAccountSize] = useState('');

  useEffect(() => {
    loadPair();
  }, [symbol]);

  async function loadPair() {
    if (!symbol) return;
    try {
      const decoded = symbol.replace(/_/g, '/');
      const data = await getCurrencyPair(decoded);
      if (data) setPair(data);
    } catch (error) {
      console.error('Failed to load pair:', error);
    } finally {
      setLoading(false);
    }
  }

  async function handleGenerateSignal() {
    if (!pair) return;

    const assetType = getAssetType(pair);
    const status = getMarketStatus(assetType);
    if (!status.isOpen) {
      Alert.alert('Market Closed', status.message);
      return;
    }

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

  async function handleSaveTrade() {
    if (!authoritativeSignal || !pair) return;
    if (authoritativeSignal.signal === 'HOLD' || authoritativeSignal.entry === null) {
      Alert.alert(
        'No Trade',
        'This is a HOLD signal — no entry, stop loss, or take profit available.'
      );
      return;
    }
    if (authoritativeSignal.stopLoss === null || authoritativeSignal.takeProfit === null) {
      Alert.alert(
        'No Trade',
        'No validated stop loss / take profit could be built for this setup.'
      );
      return;
    }

    try {
      await saveTrade({
        pair: pair.symbol,
        signal: authoritativeSignal.signal,
        entry: formatPrice(authoritativeSignal.entry),
        exitPrice: null,
        stopLoss: formatPrice(authoritativeSignal.stopLoss),
        takeProfit: formatPrice(authoritativeSignal.takeProfit),
        riskReward: authoritativeSignal.riskReward
          ? `1:${authoritativeSignal.riskReward.toFixed(2)}`
          : '1:2',
        confidence: authoritativeSignal.confidence,
        profitLoss: 0,
        profitLossPercent: 0,
        status: 'open',
        reasons: authoritativeSignal.reasons,
        createdAt: Date.now(),
        closedAt: null,
        userId: getCurrentUserId(),
      });

      handleCloseModal();
      Alert.alert('Trade Saved', 'Your trade has been saved to your portfolio.');
    } catch (error) {
      console.error('Failed to save trade:', error);
      Alert.alert('Error', 'Failed to save trade.');
    }
  }

  function handleCloseModal() {
    setShowSignalModal(false);
    setAuthoritativeSignal(null);
    setMultiTimeframeResult(null);
    setAccountSize('');
  }

  if (loading) {
    return (
      <SafeAreaView className="flex-1 items-center justify-center bg-background">
        <ActivityIndicator size="large" color={colors.accent} />
      </SafeAreaView>
    );
  }

  if (!pair) {
    return (
      <SafeAreaView className="flex-1 items-center justify-center bg-background">
        <Text className="text-[14px] text-muted">Pair not found</Text>
      </SafeAreaView>
    );
  }

  const isPositive = pair.changePercent >= 0;
  const acc = parseFloat(accountSize) || 0;
  const maxRisk = acc * RISK_PERCENT;

  return (
    <SafeAreaView className="flex-1 bg-background" edges={['top']}>
      <ScrollView showsVerticalScrollIndicator={false}>
        <View className="px-5 pt-4">
          <View className="mb-5 flex-row items-center justify-between">
            <Pressable
              accessibilityLabel="Go back"
              onPress={() => router.back()}
              className="h-10 w-10 items-center justify-center rounded-full border border-border bg-card">
              <Ionicons name="chevron-back" size={20} color={colors.foreground} />
            </Pressable>

            <View className="flex-row items-center gap-2">
              <Text className="text-[18px] font-bold text-foreground">{pair.symbol}</Text>
              <View className="rounded-md border border-border bg-elevated px-2 py-0.5">
                <Text className="text-[11px] text-muted">{pair.category}</Text>
              </View>
            </View>

            <View className="w-10" />
          </View>

          <View className="mb-5">
            <View className="flex-row items-end gap-2">
              <Text className="text-[28px] font-bold text-foreground">
                {formatPrice(pair.price)}
              </Text>
              <View className="flex-row items-center gap-1 pb-1">
                <Ionicons
                  name={isPositive ? 'arrow-up' : 'arrow-down'}
                  size={14}
                  color={isPositive ? colors.success : colors.danger}
                />
                <Text
                  className={`text-[14px] font-medium ${
                    isPositive ? 'text-success' : 'text-danger'
                  }`}>
                  {isPositive ? '+' : ''}
                  {formatPrice(pair.change)} ({isPositive ? '+' : ''}
                  {pair.changePercent.toFixed(2)}%)
                </Text>
              </View>
            </View>

            <View className="mt-2 flex-row gap-4">
              <View className="flex-row gap-1">
                <Text className="text-[12px] text-muted">Bid</Text>
                <Text className="text-[12px] font-medium text-success">
                  {formatPrice(pair.bid)}
                </Text>
              </View>
              <View className="flex-row gap-1">
                <Text className="text-[12px] text-muted">Ask</Text>
                <Text className="text-[12px] font-medium text-danger">{formatPrice(pair.ask)}</Text>
              </View>
              <View className="flex-row gap-1">
                <Text className="text-[12px] text-muted">Spread</Text>
                <Text className="text-[12px] font-medium text-foreground">{pair.spread}</Text>
              </View>
            </View>
          </View>

          <View className="mb-3 flex-row items-center rounded-lg border border-border bg-card px-4 py-2.5">
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

          {acc > 0 && (
            <AppCard className="mb-4">
              <DataRow label="Account" value={`$${acc.toFixed(2)}`} />
              <DataRow
                label={`Max Risk (${Math.round(RISK_PERCENT * 100)}%)`}
                value={`$${maxRisk.toFixed(2)}`}
                tone="negative"
              />
            </AppCard>
          )}

          <View className="mb-5 flex-row gap-3">
            <AppButton
              title="Live Chart"
              variant="secondary"
              className="flex-1"
              icon={<Ionicons name="stats-chart" size={18} color={colors.accent} />}
              onPress={() => {
                const symbol = pair.symbol.replace('/', '_');
                startLiveChartPrefetch(symbol, '4H');
                router.push(`/signal/chart?symbol=${symbol}`);
              }}
            />
            <AppButton
              title={generating ? 'Analyzing...' : 'Generate AI Signal'}
              className="flex-1"
              icon={<Ionicons name="sparkles" size={18} color={colors.foreground} />}
              disabled={generating}
              onPress={handleGenerateSignal}
            />
          </View>

          <AppCard className="mb-5" title="Market Overview">
            <DataRow label="Day High" value={formatPrice(pair.dayHigh)} tone="positive" />
            <DataRow label="Day Low" value={formatPrice(pair.dayLow)} tone="negative" />
            <DataRow label="Spread" value={`${pair.spread} pips`} />
            <DataRow label="Category" value={pair.category} />
          </AppCard>

          <View className="mb-8 flex-row items-start gap-2 rounded-xl border border-border bg-card px-4 py-3">
            <Ionicons
              name="cloud-done-outline"
              size={14}
              color={colors.accent}
              style={{ marginTop: 2 }}
            />
            <Text className="flex-1 text-[11px] leading-4 text-muted">
              Tap Generate AI Signal for a full multi-timeframe analysis — technicals, structure
              and trade levels for {pair.symbol}.
            </Text>
          </View>
        </View>
      </ScrollView>

      <Modal
        visible={showSignalModal}
        transparent
        animationType="slide"
        onRequestClose={() => !generating && handleCloseModal()}>
        <View className="flex-1 items-center justify-end bg-black/60">
          <View className="max-h-[85%] w-full rounded-t-2xl bg-elevated px-6 pb-8 pt-6">
            {generating ? (
              <SignalAnalysisLoading
                pairSymbol={pair.symbol}
                activeStep={activeStep}
                onClose={() => {}}
              />
            ) : multiTimeframeResult && authoritativeSignal ? (
              <SignalResultSheet
                pairSymbol={pair.symbol}
                result={authoritativeSignal}
                multiTimeframe={multiTimeframeResult}
                accountSize={accountSize}
                onCopy={async (value, field) => {
                  await Clipboard.setStringAsync(value);
                  Alert.alert('Copied', `${field} ${value} copied`);
                }}
                onSave={handleSaveTrade}
                onClose={handleCloseModal}
              />
            ) : null}
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}