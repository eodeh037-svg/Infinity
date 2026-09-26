import { useEffect, useMemo, ComponentProps } from 'react';
import { Animated, Easing, Text, View, Pressable } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../../lib/theme';

export const ANALYSIS_STEPS = [
  { icon: 'analytics', label: 'Fetching market candles', sublabel: 'Connecting to live data feed' },
  {
    icon: 'trending-up',
    label: 'Calculating indicators',
    sublabel: 'EMA-20, EMA-50, RSI-14, MACD',
  },
  { icon: 'pulse', label: 'Analyzing momentum', sublabel: 'Evaluating trend strength' },
  { icon: 'search', label: 'Scanning structure', sublabel: 'Identifying support & resistance' },
  { icon: 'sparkles', label: 'Generating signal', sublabel: 'Computing optimal entry & exit' },
] as const;

export function LoadingStep({
  step,
  index,
  activeIndex,
}: {
  step: (typeof ANALYSIS_STEPS)[number];
  index: number;
  activeIndex: number;
}) {
  const { colors } = useTheme();
  const isActive = index === activeIndex;
  const isDone = index < activeIndex;
  const pulseAnim = useMemo(() => new Animated.Value(1), []);

  useEffect(() => {
    if (isActive) {
      Animated.loop(
        Animated.sequence([
          Animated.timing(pulseAnim, {
            toValue: 0.4,
            duration: 800,
            easing: Easing.inOut(Easing.ease),
            useNativeDriver: true,
          }),
          Animated.timing(pulseAnim, {
            toValue: 1,
            duration: 800,
            easing: Easing.inOut(Easing.ease),
            useNativeDriver: true,
          }),
        ])
      ).start();
    }
  }, [isActive, pulseAnim]);

  return (
    <Animated.View
      style={{ opacity: isActive ? pulseAnim : 1 }}
      className="flex-row items-center gap-3 py-3">
      <View
        className={`h-10 w-10 items-center justify-center rounded-full ${
          isDone ? 'bg-success' : isActive ? 'bg-accent' : 'bg-border'
        }`}>
        {isDone ? (
          <Ionicons name="checkmark" size={18} color={colors.foreground} />
        ) : (
          <Ionicons
            name={step.icon as ComponentProps<typeof Ionicons>['name']}
            size={18}
            color={isActive ? '#FFF' : colors.muted}
          />
        )}
      </View>
      <View className="flex-1">
        <Text
          className={`text-[13px] font-medium ${isDone || isActive ? 'text-foreground' : 'text-muted'}`}>
          {step.label}
        </Text>
        <Text className={`text-[11px] ${isDone || isActive ? 'text-accent' : 'text-muted'}`}>
          {step.sublabel}
        </Text>
      </View>
      {isDone && <Ionicons name="checkmark-circle" size={16} color={colors.success} />}
      {isActive && (
        <View className="flex-row gap-1">
          <View className="h-1.5 w-1.5 rounded-full bg-accent" />
          <View className="h-1.5 w-1.5 rounded-full bg-accent" />
          <View className="h-1.5 w-1.5 rounded-full bg-accent" />
        </View>
      )}
    </Animated.View>
  );
}

export function SignalAnalysisLoading({
  pairSymbol,
  activeStep,
  onClose,
}: {
  pairSymbol: string;
  activeStep: number;
  onClose: () => void;
}) {
  const { colors } = useTheme();
  return (
    <View className="py-4">
      <View className="mb-6 flex-row items-center justify-between">
        <Text className="text-[18px] font-bold text-foreground">Analyzing {pairSymbol}</Text>
        <Pressable
          accessibilityLabel="Close"
          onPress={onClose}
          className="h-8 w-8 items-center justify-center rounded-full bg-elevated">
          <Ionicons name="close" size={20} color={colors.muted} />
        </Pressable>
      </View>

      <View className="mb-4 rounded-xl border border-border bg-card p-4">
        {ANALYSIS_STEPS.map((step, index) => (
          <LoadingStep key={index} step={step} index={index} activeIndex={activeStep} />
        ))}
      </View>

      <View className="items-center">
        <Text className="text-[12px] text-muted">
          {activeStep < ANALYSIS_STEPS.length ? 'Processing...' : 'Signal ready!'}
        </Text>
      </View>
    </View>
  );
}