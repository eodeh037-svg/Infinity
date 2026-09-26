import { ScrollView, Text, View, Pressable } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../../lib/theme';
import { AuthoritativeSignal } from '../../lib/signals/tradeSetup';
import { MultiTimeframeResult } from '../../lib/signals/multiTimeframe';
import { formatPrice } from '../../lib/services/dataService';
import AppCard from './AppCard';
import AppButton from './AppButton';
import SignalBadge from './SignalBadge';
import LevelGrid from './LevelGrid';
import { SIGNAL_RETRY_HINT } from './constants';

const PIP_VALUE = 0.0001;
const RISK_PERCENT = 0.02;

function capitalize(value: string): string {
  return value.charAt(0).toUpperCase() + value.slice(1);
}

function toneFor(value: string, positive: string[], negative: string[]): string {
  if (positive.includes(value)) return 'text-success';
  if (negative.includes(value)) return 'text-danger';
  return 'text-warning';
}

type Props = {
  pairSymbol: string;
  result: AuthoritativeSignal;
  multiTimeframe: MultiTimeframeResult;
  accountSize: string;
  onCopy?: (value: string, field: string) => void;
  onSave: () => void;
  onClose: () => void;
};

export default function SignalResultSheet({
  pairSymbol,
  result,
  multiTimeframe,
  accountSize,
  onCopy,
  onSave,
  onClose,
}: Props) {
  const { colors } = useTheme();
  const signal = multiTimeframe.overallSignal;
  const isHold =
    signal === 'HOLD' || result.entry === null || result.stopLoss === null;

  const acc = parseFloat(accountSize) || 0;
  const lotSize =
    acc > 0 && result.stopLoss !== null && result.entry !== null
      ? (() => {
          const sl = Math.abs(result.entry - result.stopLoss);
          const slPips = sl / PIP_VALUE;
          const lotSz = slPips > 0 ? (acc * RISK_PERCENT) / (slPips * 10) : 0.01;
          return Math.max(0.01, Math.min(lotSz, 1)).toFixed(2);
        })()
      : null;

  const tradable =
    result.signal !== 'HOLD' && signal !== 'HOLD' && result.stopLoss !== null;

  const firstTf = multiTimeframe.timeframeAnalyses[0];

  return (
    <ScrollView showsVerticalScrollIndicator={false}>
      <View className="mb-4 flex-row items-center justify-between">
        <View className="flex-row items-center gap-2">
          <Text className="text-[20px] font-bold text-foreground">{pairSymbol}</Text>
          <SignalBadge signal={signal} />
        </View>
        <Pressable
          accessibilityLabel="Close"
          onPress={onClose}
          className="h-8 w-8 items-center justify-center rounded-full bg-elevated">
          <Ionicons name="close" size={20} color={colors.muted} />
        </Pressable>
      </View>

      <View className="mb-4 flex-row items-center gap-2">
        <Ionicons name="layers" size={16} color={colors.accent} />
        <Text className="text-[14px] font-medium text-accent">
          {multiTimeframe.strategyLabel}
        </Text>
        <Text className="text-[11px] text-muted">
          • {multiTimeframe.technicalStrength} Strength
        </Text>
        <View className="ml-auto flex-row items-center gap-1.5">
          <Text className="text-[11px] text-muted">Confidence</Text>
          <Text className="text-[13px] font-semibold text-accent">{result.confidence}%</Text>
        </View>
      </View>

      <AppCard className="mb-4" title="Timeframe Analysis">
        {multiTimeframe.timeframeAnalyses.map((tf, i) => (
          <View key={i} className="mt-2 flex-row items-center justify-between">
            <View className="flex-row items-center gap-2">
              <Text className="w-[44px] text-[13px] font-medium text-foreground">{tf.label}</Text>
              <Text className="w-[110px] text-[11px] text-muted">{tf.role}</Text>
            </View>
            <View className="flex-row items-center gap-2">
              {tf.status === 'unavailable' ? (
                <View className="rounded-md bg-elevated px-1.5 py-0.5">
                  <Text className="text-[11px] font-medium text-muted">N/A</Text>
                </View>
              ) : (
                <SignalBadge signal={tf.signal} showLabel={false} className="px-1.5" />
              )}
              <Text className="w-[30px] text-right text-[11px] text-muted">
                {tf.status === 'unavailable' ? '—' : `${tf.candleCount}`}
              </Text>
            </View>
          </View>
        ))}
      </AppCard>

      <AppCard className="mb-4" title="Market Context">
        <View className="flex-row justify-between">
          <View className="items-center">
            <Text className="text-[10px] text-muted">Trend</Text>
            <Text
              className={`text-[13px] font-medium ${toneFor(
                multiTimeframe.marketContext.trend,
                ['bullish'],
                ['bearish']
              )}`}>
              {capitalize(multiTimeframe.marketContext.trend)}
            </Text>
          </View>
          <View className="items-center">
            <Text className="text-[10px] text-muted">Momentum</Text>
            <Text
              className={`text-[13px] font-medium ${toneFor(
                multiTimeframe.marketContext.momentum,
                ['positive'],
                ['negative']
              )}`}>
              {capitalize(multiTimeframe.marketContext.momentum)}
            </Text>
          </View>
          <View className="items-center">
            <Text className="text-[10px] text-muted">Structure</Text>
            <Text
              className={`text-[13px] font-medium ${toneFor(
                multiTimeframe.marketContext.structure,
                ['bullish'],
                ['bearish']
              )}`}>
              {capitalize(multiTimeframe.marketContext.structure)}
            </Text>
          </View>
          <View className="items-center">
            <Text className="text-[10px] text-muted">Volatility</Text>
            <Text
              className={`text-[13px] font-medium ${toneFor(
                multiTimeframe.marketContext.volatility,
                ['low'],
                ['high']
              )}`}>
              {capitalize(multiTimeframe.marketContext.volatility)}
            </Text>
          </View>
        </View>
      </AppCard>

      {multiTimeframe.contextAssessment ? (
        <AppCard className="mb-4" title="Context Assessment">
          <View className="flex-row justify-between">
            <View>
              <Text className="text-[10px] text-muted">Alignment</Text>
              <Text
                className={`text-[13px] font-medium ${toneFor(
                  multiTimeframe.contextAssessment.alignment,
                  ['supportive'],
                  ['conflicting']
                )}`}>
                {capitalize(multiTimeframe.contextAssessment.alignment)}
              </Text>
            </View>
            <View className="items-center">
              <Text className="text-[10px] text-muted">Regime</Text>
              <Text className="text-[13px] font-medium text-foreground">
                {firstTf?.context.regime.regime ?? 'N/A'}
              </Text>
            </View>
            <View className="items-center">
              <Text className="text-[10px] text-muted">Volatility</Text>
              <Text className="text-[13px] font-medium text-foreground">
                {firstTf?.context.volatility.regime ?? 'N/A'}
              </Text>
            </View>
            <View className="items-end">
              <Text className="text-[10px] text-muted">Price</Text>
              <Text className="text-[13px] font-medium text-foreground">
                {firstTf?.context.levels.priceLocation.replace(/_/g, ' ') ?? 'N/A'}
              </Text>
            </View>
          </View>
          {multiTimeframe.contextAssessment.warnings.length > 0 ? (
            <View className="mt-3 border-t border-border pt-3">
              {multiTimeframe.contextAssessment.warnings.map((w, i) => (
                <View key={i} className="mt-1 flex-row items-start gap-2">
                  <Ionicons name="warning" size={12} color={colors.warning} style={{ marginTop: 2 }} />
                  <Text className="flex-1 text-[11px] leading-4 text-warning">{w}</Text>
                </View>
              ))}
            </View>
          ) : null}
        </AppCard>
      ) : null}

      {isHold ? (
        <AppCard className="mb-4">
          <View className="flex-row items-center gap-2">
            <Ionicons name="pause-circle" size={18} color={colors.warning} />
            <Text className="text-[12px] font-semibold uppercase tracking-wider text-warning">
              Market on Hold
            </Text>
          </View>
          <Text className="mt-2 text-[13px] leading-5 text-foreground">
            No entry / stop loss / take profit — market conditions are not clear.
          </Text>
          {multiTimeframe.reasoning.slice(0, 5).map((reason, i) => (
            <View key={i} className="mt-2 flex-row items-start gap-2">
              <Ionicons
                name="information-circle"
                size={12}
                color={colors.muted}
                style={{ marginTop: 3 }}
              />
              <Text className="flex-1 text-[12px] leading-5 text-muted">{reason}</Text>
            </View>
          ))}
          <Text className="mt-3 text-[12px] font-medium text-warning">{SIGNAL_RETRY_HINT}</Text>
        </AppCard>
      ) : (
        <AppCard className="mb-4" title="Trade Levels">
          <LevelGrid
            lotSize={lotSize}
            cells={[
              {
                label: 'Entry',
                value: formatPrice(result.entry ?? 0),
                copiable: true,
                onCopy,
              },
              {
                label: 'Stop Loss',
                value: result.stopLoss ? formatPrice(result.stopLoss) : 'N/A',
                tone: 'negative',
                copiable: !!result.stopLoss,
                onCopy,
              },
              {
                label: 'Take Profit',
                value: result.takeProfit ? formatPrice(result.takeProfit) : 'N/A',
                tone: 'positive',
                copiable: !!result.takeProfit,
                onCopy,
              },
              {
                label: 'Risk/Reward',
                value: result.riskReward ? `1:${result.riskReward.toFixed(2)}` : 'N/A',
              },
            ]}
          />
        </AppCard>
      )}

      {!isHold && (
        <AppCard className="mb-6" title="Analysis">
          {multiTimeframe.reasoning.slice(0, 5).map((reason, i) => (
            <View key={i} className="mt-1 flex-row items-start gap-2">
              <Ionicons name="checkmark-circle" size={14} color={colors.success} style={{ marginTop: 2 }} />
              <Text className="flex-1 text-[12px] leading-5 text-foreground">{reason}</Text>
            </View>
          ))}
        </AppCard>
      )}

      {tradable ? (
        <AppButton title="Take This Trade" onPress={onSave} className="w-full" />
      ) : null}

      <Pressable onPress={onClose} className="mt-3 items-center py-3">
        <Text className="text-[14px] text-muted">Close</Text>
      </Pressable>
    </ScrollView>
  );
}