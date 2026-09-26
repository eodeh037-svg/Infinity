import { Pressable, Text, ActivityIndicator, View } from 'react-native';
import { ReactNode } from 'react';

type Variant = 'primary' | 'secondary' | 'danger' | 'ghost';
type Size = 'md' | 'sm';

type Props = {
  title: string;
  onPress?: () => void;
  variant?: Variant;
  size?: Size;
  icon?: ReactNode;
  disabled?: boolean;
  loading?: boolean;
  accessibilityLabel?: string;
  className?: string;
};

const VARIANTS: Record<Variant, { bg: string; text: string; border: string }> = {
  primary: { bg: 'bg-accent', text: 'text-white', border: '' },
  secondary: { bg: 'bg-elevated', text: 'text-foreground', border: 'border border-border' },
  danger: { bg: 'bg-danger', text: 'text-white', border: '' },
  ghost: { bg: 'bg-transparent', text: 'text-muted', border: '' },
};

const SIZES: Record<Size, string> = {
  md: 'h-12 px-4',
  sm: 'h-9 px-3',
};

export default function AppButton({
  title,
  onPress,
  variant = 'primary',
  size = 'md',
  icon,
  disabled,
  loading,
  accessibilityLabel,
  className = '',
}: Props) {
  const v = VARIANTS[variant];
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel ?? title}
      accessibilityState={{ disabled: disabled || loading }}
      disabled={disabled || loading}
      onPress={onPress}
      className={`flex-row items-center justify-center rounded-lg ${SIZES[size]} ${v.bg} ${v.border} ${
        disabled || loading ? 'opacity-40' : ''
      } ${className}`}>
      {loading ? (
        <ActivityIndicator
          size="small"
          color={variant === 'primary' || variant === 'danger' ? '#FFFFFF' : '#A0A0A6'}
        />
      ) : (
        <>
          {icon}
          {icon ? <View className="w-2" /> : null}
          <Text className={`${size === 'md' ? 'text-[15px] font-semibold' : 'text-[13px] font-medium'} ${v.text}`}>
            {title}
          </Text>
        </>
      )}
    </Pressable>
  );
}