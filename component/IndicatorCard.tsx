import { View, Text } from 'react-native'

type Props = {
  name: string
  value: string
  status: string
  color: string
}

export default function IndicatorCard({ name, value, status, color }: Props) {
  return (
    <View className="flex-row items-center justify-between border-b border-[#1C1C2E] px-4 py-3">
      <Text className="text-[13px] font-medium text-[#64646E]">{name}</Text>
      <View className="flex-row items-center gap-3">
        <Text className="text-[13px] font-medium text-white">{value}</Text>
        <View className="rounded-md px-2 py-0.5" style={{ backgroundColor: `${color}20` }}>
          <Text className="text-[11px] font-medium" style={{ color }}>{status}</Text>
        </View>
      </View>
    </View>
  )
}
