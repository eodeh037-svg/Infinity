import { Pressable, Text, View } from 'react-native';

export type PillItem = {
  key: string;
  label: string;
};

type Props = {
  items: PillItem[];
  selected?: string | null;
  onSelect: (key: string) => void;
  className?: string;
};

export default function SegmentedPills({ items, selected, onSelect, className = '' }: Props) {
  return (
    <View className={`flex-row flex-wrap gap-2 ${className}`}>
      {items.map((item) => {
        const active = item.key === selected;
        return (
          <Pressable
            key={item.key}
            accessibilityRole="button"
            accessibilityState={{ selected: active }}
            onPress={() => onSelect(item.key)}
            className={`rounded-full border px-3.5 py-2 ${
              active ? 'border-accent/60 bg-accent/15' : 'border-border bg-elevated'
            }`}>
            <Text
              className={`text-[13px] font-medium ${active ? 'text-accent' : 'text-muted'}`}>
              {item.label}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}