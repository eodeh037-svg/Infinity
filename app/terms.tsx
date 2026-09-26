import { View, Text, ScrollView, TouchableOpacity } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import { useTheme } from '../lib/theme';
import { formatMoney } from '../component/ui/money';
import { PREMIUM_PRICE_NGN } from '../component/ui/constants';

export default function TermsScreen() {
  const { colors } = useTheme();

  const handleBack = () => {
    if (router.canGoBack()) {
      router.back();
    } else {
      router.replace('/(tabs)');
    }
  };

  const sections: { title: string; points: string[] }[] = [
    {
      title: 'Market Analysis & Signals',
      points: [
        'Infinity uses algorithmic market analysis to evaluate price action, momentum, trend conditions, and volatility across supported markets.',
        'Our signal engine combines multiple technical indicators and market data to identify potential BUY, SELL, or HOLD opportunities.',
        'Signals are generated from the available market data and the analysis conditions defined by the Infinity signal engine. They are not manually selected or guaranteed outcomes.',
        'Each signal is intended to help users understand current market conditions and make more informed decisions based on their own strategy and risk tolerance.',
        'Market conditions can change quickly. A valid signal at the time of generation may become less relevant as new market data develops.',
      ],
    },
    {
      title: 'Risk Disclosure',
      points: [
        'Trading foreign exchange (Forex), cryptocurrencies, commodities, and other financial markets involves significant risk and may not be suitable for everyone.',
        'Infinity provides market analysis and trading signals for informational and educational purposes. Signals should not be treated as guaranteed trading instructions or promises of profit.',
        'Past performance, historical signals, or successful outcomes do not guarantee future results.',
        'You are responsible for evaluating every signal and deciding whether, when, and how to act on it.',
        'Never trade with money you cannot afford to lose, and consider using appropriate risk management for every position.',
        'Leveraged trading can significantly increase both potential gains and potential losses.',
      ],
    },
    {
      title: 'No Financial Advice',
      points: [
        'Infinity is a market analysis and signal platform, not a licensed financial advisor, broker, or investment firm.',
        'Information provided by Infinity does not constitute personalized financial, investment, or trading advice.',
        'Users should consider their individual financial circumstances and risk tolerance before making trading decisions.',
        'If you require personalized financial advice, consult a qualified and appropriately licensed professional.',
      ],
    },
    {
      title: 'Premium Subscription',
      points: [
        'Premium provides access to enhanced Infinity features and unlimited signal generation during an active subscription period.',
        `Premium membership is billed monthly at ${formatMoney(PREMIUM_PRICE_NGN)} via bank transfer.`,
        'Premium access is activated after payment has been reviewed and verified by the Infinity administration team.',
        'Payment does not guarantee profitable trades or successful trading outcomes. Market performance depends on changing market conditions and individual trading decisions.',
        'Subscription pricing, features, and availability may be updated as Infinity evolves. Users will be notified of significant changes where appropriate.',
      ],
    },
    {
      title: 'User Responsibility',
      points: [
        'You remain fully responsible for your trading decisions, account management, position sizing, and risk management.',
        'Before acting on a signal, consider the current market environment and whether the opportunity fits your own trading strategy.',
        'By using Infinity, you acknowledge that market analysis is inherently uncertain and that no signal system can guarantee a particular outcome.',
        'You agree to use Infinity responsibly and at your own risk.',
      ],
    },
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
            Terms & Conditions
          </Text>

          <Text className="mt-1 text-sm" style={{ color: colors.muted }}>
            Understand how Infinity analyzes the market and how signals should be used.
          </Text>
        </View>

        {sections.map((section) => (
          <View
            key={section.title}
            className="mb-5 rounded-2xl p-5"
            style={{ backgroundColor: colors.card }}>
            <Text className="mb-3 text-lg font-semibold" style={{ color: colors.foreground }}>
              {section.title}
            </Text>

            {section.points.map((point, index) => (
              <View key={index} className="mb-3 flex-row items-start gap-2">
                <Ionicons
                  name="checkmark-circle-outline"
                  size={15}
                  color={colors.warning}
                  style={{ marginTop: 2 }}
                />
                <Text className="flex-1 text-[13px] leading-5" style={{ color: colors.muted }}>
                  {point}
                </Text>
              </View>
            ))}
          </View>
        ))}

        <Text className="text-center text-xs" style={{ color: colors.muted }}>
          Last updated: September 2026
        </Text>
      </ScrollView>
    </SafeAreaView>
  );
}
