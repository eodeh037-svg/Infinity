import { View, Text } from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import OnboardingDots from '../../component/onboardingDot';
import AppButton from '../../component/ui/AppButton';
import { useTheme } from '../../lib/theme';

export default function FirstOnboarding() {
  const { colors } = useTheme();
  return (
    <SafeAreaView className="flex-1 bg-background" edges={['top', 'bottom']}>
      <View className="flex-1 px-6">
        <View className="flex-1 items-center justify-center">
          <View className="mb-6 h-16 w-16 items-center justify-center rounded-2xl bg-accent/15">
            <MaterialCommunityIcons name="diamond-outline" size={32} color={colors.accent} />
          </View>

          <Text className="mb-3 text-center text-[22px] font-bold text-foreground">
            AI-Powered Forex Signals
          </Text>

          <Text className="max-w-[330px] text-center text-[14px] leading-6 text-muted">
            Infinity scans major, minor, and exotic currency pairs 24/7, delivering high-confidence
            BUY, SELL, and HOLD signals backed by technical analysis.
          </Text>

          <View className="mt-5 rounded-lg border border-border bg-elevated px-4 py-3">
            <Text className="text-center text-[11px] text-muted">
              Built on RSI · MACD · EMA · Bollinger Bands
            </Text>
          </View>
        </View>

        <View className="w-full items-center pb-8">
          <OnboardingDots active={1} />

          <AppButton
            title="Continue"
            className="mt-6 w-full"
            onPress={() => router.push('/(onboarding)/second')}
          />

          <AppButton title="Skip" variant="ghost" onPress={() => router.replace('/(auth)/signUp')} />
        </View>
      </View>
    </SafeAreaView>
  );
}