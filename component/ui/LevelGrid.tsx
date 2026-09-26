import { Ionicons } from '@expo/vector-icons';
import { Pressable, Text, View } from 'react-native';
import { useTheme } from '../../lib/theme';

type Cell = {
  label: string;
  value: string;
  tone?: 'default' | 'positive' | 'negative';
  copiable?: boolean;
  onCopy?: (value: string, field: string) => void;
};

type Props = {
  cells: Cell[];
  lotSize?: string | null;
};

export default function LevelGrid({ cells, lotSize }: Props) {
  const { colors } = useTheme();
  const rows = [];
  for (let i = 0; i < cells.length; i += 2) {
    rows.push(cells.slice(i, i + 2));
  }

  return (
    <View className="overflow-hidden rounded-lg border border-border">
      {rows.map((row, ri) => (
        <View key={ri} className={`flex-row ${ri > 0 ? 'border-t border-border' : ''}`}>
          {row.map((cell, ci) => {
            const tone =
              cell.tone === 'positive'
                ? 'text-success'
                : cell.tone === 'negative'
                  ? 'text-danger'
                  : 'text-foreground';
            return (
              <View
                key={ci}
                className={`flex-1 p-3 ${ci > 0 ? 'border-l border-border' : ''}`}>
                <Text className="text-[10px] uppercase tracking-wider text-muted-soft">
                  {cell.label}
                </Text>
                <Pressable
                  accessibilityRole={cell.copiable ? 'button' : undefined}
                  disabled={!cell.copiable}
                  onPress={() => cell.copiable && cell.onCopy?.(cell.value, cell.label)}
                  hitSlop={8}>
                  <View className="mt-0.5 flex-row items-center gap-1">
                    <Text
                      className={`text-[15px] font-semibold ${tone}`}
                      numberOfLines={1}
                      adjustsFontSizeToFit
                      minimumFontScale={0.7}>
                      {cell.value}
                    </Text>
                    {cell.copiable ? (
                      <Ionicons name="copy-outline" size={12} color={colors.muted} />
                    ) : null}
                  </View>
                </Pressable>
              </View>
            );
          })}
          {row.length === 1 ? <View className="flex-1 p-3" /> : null}
        </View>
      ))}
      {lotSize ? (
        <View className="flex-row items-center justify-between border-t border-border bg-elevated/50 px-3 py-2.5">
          <Text className="text-[11px] text-muted">Suggested Lot Size</Text>
          <Text className="text-[11px] font-semibold text-accent">{lotSize}</Text>
        </View>
      ) : null}
    </View>
  );
}