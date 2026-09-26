import { View, Text } from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import OnboardingDots from '../../component/onboardingDot';
import AppButton from '../../component/ui/AppButton';
import { useTheme } from '../../lib/theme';

export default function LastOnboarding() {
  const { colors } = useTheme();
  return (
    <SafeAreaView className="flex-1 bg-background" edges={['top', 'bottom']}>
      <View className="flex-1 px-6">
        <View className="flex-1 items-center justify-center">
          <View className="mb-6 h-16 w-16 items-center justify-center rounded-2xl bg-accent/15">
            <MaterialCommunityIcons name="lightning-bolt-outline" size={32} color={colors.accent} />
          </View>

          <Text className="mb-3 text-center text-[22px] font-bold text-foreground">
            Generate Smarter Signals
          </Text>

          <Text className="max-w-[330px] text-center text-[14px] leading-6 text-muted">
            Generate BUY and SELL signals using technical indicators and intelligent market analysis
            to help you understand the market.
          </Text>

          <View className="mt-5 rounded-lg border border-border bg-elevated px-4 py-3">
            <Text className="text-center text-[11px] text-muted">
              Entry · Stop Loss · Take Profit · Risk/Reward
            </Text>
          </View>
        </View>

        <View className="w-full items-center pb-8">
          <OnboardingDots active={3} />

          <AppButton
            title="Create your account"
            className="mt-6 w-full"
            onPress={() => router.replace('/(auth)/signUp')}
          />

          <AppButton
            title="I already have an account"
            variant="ghost"
            onPress={() => router.replace('/(auth)/logIn')}
          />
        </View>
      </View>
    </SafeAreaView>
  );
}