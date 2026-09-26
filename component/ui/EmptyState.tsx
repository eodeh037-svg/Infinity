import { Ionicons } from '@expo/vector-icons';
import { Text, View } from 'react-native';
import { ComponentProps, ReactNode } from 'react';
import { useTheme } from '../../lib/theme';

type Props = {
  icon?: ComponentProps<typeof Ionicons>['name'];
  title: string;
  message?: string;
  action?: ReactNode;
  className?: string;
};

export default function EmptyState({
  icon = 'file-tray-outline',
  title,
  message,
  action,
  className = '',
}: Props) {
  const { colors } = useTheme();
  return (
    <View className={`items-center justify-center px-10 py-14 ${className}`}>
      <View className="h-14 w-14 items-center justify-center rounded-full border border-border bg-elevated">
        <Ionicons name={icon} size={24} color={colors.muted} />
      </View>
      <Text className="mt-4 text-center text-[15px] font-semibold text-foreground">{title}</Text>
      {message ? (
        <Text className="mt-1.5 text-center text-[13px] leading-5 text-muted">{message}</Text>
      ) : null}
      {action ? <View className="mt-5">{action}</View> : null}
    </View>
  );
}