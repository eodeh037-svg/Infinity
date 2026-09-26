import { Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../../lib/theme';

export type SignalTone = 'BUY' | 'SELL' | 'HOLD';

type Props = {
  signal: SignalTone;
  showLabel?: boolean;
  className?: string;
};

export default function SignalBadge({ signal, showLabel = true, className = '' }: Props) {
  const { colors } = useTheme();
  const icon =
    signal === 'BUY' ? 'arrow-up' : signal === 'SELL' ? 'arrow-down' : 'pause';
  const badge =
    signal === 'BUY'
      ? 'bg-success/12'
      : signal === 'SELL'
        ? 'bg-danger/12'
        : 'bg-warning/12';
  const text =
    signal === 'BUY'
      ? 'text-success'
      : signal === 'SELL'
        ? 'text-danger'
        : 'text-warning';
  const color =
    signal === 'BUY' ? colors.success : signal === 'SELL' ? colors.danger : colors.warning;

  return (
    <View accessibilityLabel={`Signal: ${signal}`} className={`flex-row items-center gap-1 rounded-md px-2 py-1 ${badge} ${className}`}>
      <Ionicons name={icon} size={12} color={color} />
      {showLabel ? <Text className={`text-[11px] font-bold ${text}`}>{signal}</Text> : null}
    </View>
  );
}