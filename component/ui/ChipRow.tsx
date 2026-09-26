import { Pressable, ScrollView, Text, View } from 'react-native';
import { PillItem } from './SegmentedPills';

type Props = {
  items: PillItem[];
  selected: string | null;
  onSelect: (key: string) => void;
  className?: string;
};

export default function ChipRow({ items, selected, onSelect, className = '' }: Props) {
  return (
    <ScrollView horizontal showsHorizontalScrollIndicator={false} className={className}>
      <View className="flex-row gap-2">
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
              <Text className={`text-[13px] font-medium ${active ? 'text-accent' : 'text-muted'}`}>
                {item.label}
              </Text>
            </Pressable>
          );
        })}
      </View>
    </ScrollView>
  );
}