import { Ionicons } from '@expo/vector-icons';
import { Text, View } from 'react-native';
import { ComponentProps, ReactNode } from 'react';

type Tone = 'default' | 'positive' | 'negative' | 'accent' | 'muted';

type Props = {
  label: string;
  value: ReactNode;
  tone?: Tone;
  labelClassName?: string;
};

const TEXT: Record<Tone, string> = {
  default: 'text-foreground',
  positive: 'text-success',
  negative: 'text-danger',
  accent: 'text-accent',
  muted: 'text-muted',
};

export default function DataRow({ label, value, tone = 'default', labelClassName = '' }: Props) {
  return (
    <View className="flex-row items-center justify-between py-1.5">
      <Text className={`text-[12px] text-muted ${labelClassName}`}>{label}</Text>
      <Text className={`text-[12px] font-medium ${TEXT[tone]}`}>{value}</Text>
    </View>
  );
}

export function DataRowIcon({
  icon,
  size = 16,
  color,
  label,
  value,
}: {
  icon: ComponentProps<typeof Ionicons>['name'];
  size?: number;
  color: string;
  label: string;
  value: string;
}) {
  return (
    <View className="flex-row items-start gap-2.5 py-1.5">
      <Ionicons name={icon} size={size} color={color} style={{ marginTop: 2 }} />
      <View className="flex-1">
        <Text className="text-[12px] text-muted">{label}</Text>
        <Text className="mt-0.5 text-[13px] leading-5 text-foreground">{value}</Text>
      </View>
    </View>
  );
}