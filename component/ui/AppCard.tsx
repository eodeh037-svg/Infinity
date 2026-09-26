import { Text, View } from 'react-native';
import { ReactNode } from 'react';

type Props = {
  title?: string;
  trailing?: ReactNode;
  children: ReactNode;
  className?: string;
};

export default function AppCard({ title, trailing, children, className = '' }: Props) {
  return (
    <View className={`rounded-xl border border-border bg-card p-4 ${className}`}>
      {title ? (
        <View className="mb-3 flex-row items-center justify-between">
          <Text className="text-[12px] font-semibold uppercase tracking-wider text-muted">
            {title}
          </Text>
          {trailing}
        </View>
      ) : null}
      {children}
    </View>
  );
}