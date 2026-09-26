import React from 'react';
import { TouchableOpacity, Text, StyleSheet } from 'react-native';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withTiming,
  Easing,
} from 'react-native-reanimated';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../lib/theme';

interface AnimatedActionButtonProps {
  title: string;
  loadingTitle?: string;
  onPress: () => Promise<void>;
  disabled?: boolean;
  loading?: boolean;
  variant: 'primary' | 'danger' | 'success' | 'secondary';
  fullWidth?: boolean;
  className?: string;
  style?: any;
  iconName?: React.ComponentProps<typeof Ionicons>['name'];
  loadingIconName?: React.ComponentProps<typeof Ionicons>['name'];
}

export function AnimatedActionButton({
  title,
  loadingTitle,
  onPress,
  disabled = false,
  loading = false,
  variant = 'primary',
  fullWidth = true,
  className = '',
  style,
  iconName,
  loadingIconName = 'refresh',
}: AnimatedActionButtonProps & { variant?: 'primary' | 'danger' | 'success' | 'secondary' }) {
  const { colors } = useTheme();
  const v = variant ?? 'primary';
  const VARIANT_STYLES = {
    primary: { bg: colors.accent, text: colors.foreground },
    danger: { bg: colors.danger, text: colors.foreground },
    success: { bg: colors.success, text: colors.foreground },
    secondary: { bg: colors.elevated, text: colors.foreground },
  };
  const { bg, text } = VARIANT_STYLES[v];
  const buttonScale = useSharedValue(1);
  const iconRotation = useSharedValue(0);
  const contentOpacity = useSharedValue(1);
  const isPressed = useSharedValue(false);

  const handlePressIn = () => {
    if (!disabled && !loading) {
      isPressed.value = true;
      buttonScale.value = withTiming(0.96, { duration: 80, easing: Easing.out(Easing.quad) });
    }
  };

  const handlePressOut = () => {
    if (!disabled && !loading) {
      isPressed.value = false;
      buttonScale.value = withTiming(1, { duration: 120, easing: Easing.out(Easing.quad) });
    }
  };

  const handlePress = async () => {
    if (disabled || loading) return;
    handlePressOut();
    await onPress();
  };

  const animatedContainerStyle = useAnimatedStyle(() => ({
    transform: [{ scale: buttonScale.value }],
    opacity: disabled || loading ? 0.6 : 1,
  }));

  const iconRotationStyle = useAnimatedStyle(() => ({
    transform: [{ rotate: `${iconRotation.value}deg` }],
  }));

  React.useEffect(() => {
    if (loading) {
      iconRotation.value = withTiming(360, { duration: 1000, easing: Easing.linear }, (finished) => {
        if (finished && loading) {
          iconRotation.value = 0;
        }
      });
    }
  }, [loading]);

  const displayTitle = loading ? (loadingTitle || 'Processing...') : title;

  return (
    <TouchableOpacity
      onPress={handlePress}
      onPressIn={handlePressIn}
      onPressOut={handlePressOut}
      disabled={disabled || loading}
      activeOpacity={0.9}
      style={[
        styles.container,
        { backgroundColor: bg },
        fullWidth && styles.fullWidth,
        style,
      ]}
      className={className}
    >
      <Animated.View style={[styles.content, animatedContainerStyle]}>
        {iconName && !loading && (
          <Ionicons name={iconName} size={18} color={text} style={styles.icon} />
        )}
        {loading && (
          <Animated.View style={iconRotationStyle}>
            <Ionicons name={loadingIconName} size={18} color={text} style={styles.icon} />
          </Animated.View>
        )}
        <Animated.Text
          style={[
            styles.text,
            { color: text, opacity: contentOpacity },
          ]}>
          {displayTitle}
        </Animated.Text>
      </Animated.View>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  container: {
    borderRadius: 12,
    paddingVertical: 14,
    paddingHorizontal: 20,
    minHeight: 52,
  },
  fullWidth: {
    width: '100%',
  },
  content: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  icon: {
    marginRight: 4,
  },
  text: {
    fontSize: 16,
    fontWeight: '700',
    letterSpacing: 0.2,
  },
});