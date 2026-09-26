import { View, Text, Pressable } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { CurrencyPair } from '../types';
import { formatPrice } from '../lib/services/dataService';
import { useTheme } from '../lib/theme';

type Props = {
  pair: CurrencyPair;
  onPress: () => void;
  blocked?: boolean;
  showChevron?: boolean;
};

export default function MarketCard({ pair, onPress, blocked = false, showChevron = false }: Props) {
  const { colors } = useTheme();
  const isPositive = pair.changePercent >= 0;

  return (
    <Pressable
      onPress={onPress}
      disabled={blocked}
      accessibilityRole="button"
      accessibilityLabel={`${pair.symbol}, ${formatPrice(pair.price)}, ${
        blocked ? 'market closed' : pair.changePercent >= 0 ? 'up' : 'down'
      } ${Math.abs(pair.changePercent).toFixed(2)} percent`}
      className={`flex-row items-center justify-between border-b border-border px-4 py-4 ${
        blocked ? 'opacity-50' : ''
      }`}>
      <View className="flex-row items-center gap-3">
        <View className="flex-row">
          <Text className="text-lg">{pair.flag1}</Text>
          <Text className="-ml-1 text-lg">{pair.flag2}</Text>
        </View>
        <View>
          <Text className="text-[15px] font-semibold text-foreground">{pair.symbol}</Text>
          <Text className="text-[12px] text-muted">
            {blocked ? 'Market closed' : pair.name}
          </Text>
        </View>
      </View>

      <View className="flex-row items-center gap-3">
        {!blocked ? (
          <>
            <Text className="text-[15px] font-medium text-foreground">{formatPrice(pair.price)}</Text>
            <View
              className={`rounded-md px-2 py-1 ${isPositive ? 'bg-success/12' : 'bg-danger/12'}`}>
              <Text
                className={`text-[12px] font-bold ${isPositive ? 'text-success' : 'text-danger'}`}>
                {isPositive ? '+' : ''}
                {pair.changePercent.toFixed(2)}%
              </Text>
            </View>
          </>
        ) : (
          <Ionicons name="lock-closed" size={14} color={colors.warning} />
        )}
        {showChevron ? <Ionicons name="chevron-forward" size={16} color={colors.muted} /> : null}
      </View>
    </Pressable>
  );
}