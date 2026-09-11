import { View, Text, Pressable } from 'react-native'
import { CurrencyPair } from '../types'
import { formatPrice } from '../lib/services/dataService'

type Props = {
  pair: CurrencyPair
  onPress: () => void
}

export default function MarketCard({ pair, onPress }: Props) {
  const isPositive = pair.changePercent >= 0

  return (
    <Pressable
      onPress={onPress}
      className="flex-row items-center justify-between border-b border-[#1C1C2E] px-5 py-4"
    >
      <View className="flex-row items-center gap-3">
        <View className="flex-row">
          <Text className="text-lg">{pair.flag1}</Text>
          <Text className="text-lg -ml-1">{pair.flag2}</Text>
        </View>
        <View>
          <Text className="text-[15px] font-semibold text-white">
            {pair.symbol}
          </Text>
          <Text className="text-[12px] text-[#64646E]">
            {pair.name}
          </Text>
        </View>
      </View>

      <View className="flex-row items-center gap-4">
        <Text className="text-[15px] font-medium text-white">
          {formatPrice(pair.price)}
        </Text>
        <View className={`rounded-lg px-2.5 py-1 ${
          isPositive ? 'bg-[#22C55E]/15' : 'bg-[#EF4444]/15'
        }`}>
          <Text
            className={`text-[12px] font-bold ${
              isPositive ? 'text-[#22C55E]' : 'text-[#EF4444]'
            }`}
          >
            {isPositive ? '+' : ''}{pair.changePercent.toFixed(2)}%
          </Text>
        </View>
      </View>
    </Pressable>
  )
}
