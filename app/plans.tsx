import { View, Text, ScrollView, TouchableOpacity } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import { useTheme } from '../lib/theme';
import { FREE_SIGNAL_LIMIT } from '../lib/server/premium';
import { formatMoney } from '../component/ui/money';
import { PREMIUM_PRICE_NGN } from '../component/ui/constants';

export default function PlansScreen() {
  const { colors } = useTheme();

  const handleBack = () => {
    if (router.canGoBack()) {
      router.back();
    } else {
      router.replace('/(tabs)');
    }
  };

  const freeIncluded = [
    `${FREE_SIGNAL_LIMIT} free signals every 24 hours`,
    'Real-time market quotes',
    'Basic single-timeframe analysis',
    'Portfolio & trade tracking',
  ];

  const freeCons = [
    'Daily signal limit',
    'No multi-timeframe analysis',
    'No market context or structure',
    'Reduced signal detail',
  ];

  const premiumPerks = [
    { icon: 'flash' as const, color: colors.accent, label: 'Unlimited Signals', caption: 'Generate unlimited signals' },
    { icon: 'layers' as const, color: colors.success, label: 'Multi-Timeframe', caption: 'Analysis across timeframes' },
    { icon: 'globe' as const, color: colors.warning, label: 'Market Context', caption: 'Forex & Crypto analysis' },
    { icon: 'information-circle' as const, color: colors.foreground, label: 'Detailed Signals', caption: 'Full signal information' },
  ];

  return (
    <SafeAreaView className="flex-1" style={{ backgroundColor: colors.background }}>
      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerClassName="px-5 pt-5 pb-10"
        style={{ backgroundColor: colors.background }}>
        <View className="mb-6 border-b pb-4" style={{ borderBottomColor: colors.border }}>
<TouchableOpacity
              onPress={handleBack}
              className="mb-3 h-9 w-9 items-center justify-center rounded-lg"
              style={{ backgroundColor: colors.card }}
              hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
              <Ionicons name="arrow-back" size={20} color={colors.foreground} />
            </TouchableOpacity>

            <Text className="text-2xl font-bold" style={{ color: colors.foreground }}>
              Subscription Plans
            </Text>

          <Text className="mt-1 text-sm" style={{ color: colors.muted }}>
            Choose the plan that fits your trading style.
          </Text>
        </View>

        <View className="mb-5 rounded-2xl p-5" style={{ backgroundColor: colors.card, borderWidth: 1, borderColor: colors.border }}>
          <View className="mb-4 flex-row items-center justify-between">
            <View className="flex-row items-center gap-2">
              <View className="h-9 w-9 items-center justify-center rounded-full" style={{ backgroundColor: colors.background }}>
                <Ionicons name="person" size={18} color={colors.muted} />
              </View>
              <Text className="text-lg font-semibold" style={{ color: colors.foreground }}>
                Free Plan
              </Text>
            </View>
            <View className="rounded-full px-3 py-1" style={{ backgroundColor: colors.muted, opacity: 0.15 }}>
              <Text className="text-xs font-bold" style={{ color: colors.foreground }}>
                {formatMoney(0)}
              </Text>
            </View>
          </View>

          <Text className="mb-2 text-xs font-semibold" style={{ color: colors.success }}>
            WHAT YOU GET
          </Text>
          {freeIncluded.map((item, index) => (
            <View key={index} className="mb-2 flex-row items-start gap-2">
              <Ionicons name="checkmark-circle" size={16} color={colors.success} style={{ marginTop: 1 }} />
              <Text className="flex-1 text-[13px]" style={{ color: colors.foreground }}>
                {item}
              </Text>
            </View>
          ))}

          <Text className="mb-2 mt-4 text-xs font-semibold" style={{ color: colors.danger }}>
            FREE PLAN LIMITS
          </Text>
          {freeCons.map((item, index) => (
            <View key={index} className="mb-2 flex-row items-start gap-2">
              <Ionicons name="close-circle" size={16} color={colors.danger} style={{ marginTop: 1 }} />
              <Text className="flex-1 text-[13px]" style={{ color: colors.muted }}>
                {item}
              </Text>
            </View>
          ))}
        </View>

        <View
          className="mb-6 rounded-2xl p-5"
          style={{ backgroundColor: colors.card, borderWidth: 1, borderColor: colors.accent }}>
          <View className="mb-4 flex-row items-center justify-between">
            <View className="flex-row items-center gap-2">
              <View className="h-9 w-9 items-center justify-center rounded-full" style={{ backgroundColor: colors.accent }}>
                <Ionicons name="diamond" size={18} color={colors.background} />
              </View>
              <Text className="text-lg font-semibold" style={{ color: colors.foreground }}>
                Premium Plan
              </Text>
            </View>
            <View className="rounded-full px-3 py-1" style={{ backgroundColor: colors.accent }}>
              <Text className="text-xs font-bold" style={{ color: colors.background }}>
                RECOMMENDED
              </Text>
            </View>
          </View>

          <View className="mb-4 flex-row items-baseline gap-1">
            <Text className="text-3xl font-bold" style={{ color: colors.accent }}>
              {formatMoney(PREMIUM_PRICE_NGN)}
            </Text>
            <Text className="text-xs" style={{ color: colors.muted }}>
              / month
            </Text>
          </View>

          <Text className="mb-3 text-xs font-semibold" style={{ color: colors.accent }}>
            ALL FREE FEATURES PLUS
          </Text>
          {premiumPerks.map((perk) => (
            <View key={perk.label} className="mb-3 flex-row items-center">
              <View
                className="mr-3 h-9 w-9 items-center justify-center rounded-xl"
                style={{ backgroundColor: `${perk.color}20` }}>
                <Ionicons name={perk.icon} size={18} color={perk.color} />
              </View>
              <View className="flex-1">
                <Text className="text-sm font-semibold" style={{ color: colors.foreground }}>
                  {perk.label}
                </Text>
                <Text className="mt-0.5 text-xs" style={{ color: colors.muted }}>
                  {perk.caption}
                </Text>
              </View>
            </View>
          ))}

          <TouchableOpacity
            onPress={() => router.push('/premium')}
            className="mt-4 w-full items-center justify-center rounded-xl py-4"
            style={{ backgroundColor: colors.accent }}>
            <Text className="text-base font-bold" style={{ color: colors.background }}>
              Upgrade to Premium
            </Text>
          </TouchableOpacity>
        </View>

        <Text className="text-center text-xs leading-5" style={{ color: colors.muted }}>
          Prices are shown in Nigerian Naira (NGN). Premium access is activated after an admin
          verifies your bank transfer — usually within 24 hours.
        </Text>
      </ScrollView>
    </SafeAreaView>
  );
}
