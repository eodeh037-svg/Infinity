import { Text, View } from 'react-native';

export type IndicatorTone = 'positive' | 'negative' | 'neutral' | 'accent';

type Props = {
  name: string;
  value: string;
  status: string;
  tone?: IndicatorTone;
  last?: boolean;
};

const TONES: Record<IndicatorTone, { value: string; badge: string }> = {
  positive: { value: 'text-success', badge: 'bg-success/12' },
  negative: { value: 'text-danger', badge: 'bg-danger/12' },
  neutral: { value: 'text-foreground', badge: 'bg-elevated' },
  accent: { value: 'text-accent', badge: 'bg-accent/12' },
};

export default function IndicatorRow({
  name,
  value,
  status,
  tone = 'neutral',
  last = false,
}: Props) {
  const t = TONES[tone];
  return (
    <View
      className={`flex-row items-center justify-between px-4 py-3 ${
        last ? '' : 'border-b border-border'
      }`}>
      <Text className="text-[13px] font-medium text-muted">{name}</Text>
      <View className="flex-row items-center gap-3">
        <Text className={`text-[13px] font-medium ${t.value}`}>{value}</Text>
        <View className={`rounded-md px-2 py-0.5 ${t.badge}`}>
          <Text className={`text-[11px] font-medium ${t.value}`}>{status}</Text>
        </View>
      </View>
    </View>
  );
}