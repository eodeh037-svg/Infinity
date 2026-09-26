import React from 'react';
import { View, StyleSheet } from 'react-native';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withTiming,
  withSpring,
  withDelay,
  Easing,
  SharedValue,
} from 'react-native-reanimated';

interface PaymentRejectedAnimationProps {
  visible: boolean;
  onComplete?: () => void;
  size?: number;
  color?: string;
  backgroundColor?: string;
}

const SCALE_MS = 700;
const CROSS_MS = 300;
const HOLD_MS = 800;
const FADE_MS = 300;
const TOTAL_MS = SCALE_MS + CROSS_MS * 2 + HOLD_MS + FADE_MS;

export function PaymentRejectedAnimation({
  visible,
  onComplete,
  size = 80,
  color = '#C94F4F',
  backgroundColor = '#C94F4F',
}: PaymentRejectedAnimationProps) {
  const scale = useSharedValue(0);
  const crossProgress1 = useSharedValue(0);
  const crossProgress2 = useSharedValue(0);
  const opacity = useSharedValue(1);
  const hasAnimated = useSharedValue(false);
  const onCompleteRef = React.useRef(onComplete);
  onCompleteRef.current = onComplete;

  React.useEffect(() => {
    if (!visible) {
      hasAnimated.value = false;
      scale.value = 0;
      crossProgress1.value = 0;
      crossProgress2.value = 0;
      opacity.value = 1;
      return;
    }
    if (hasAnimated.value) {
      return;
    }
    hasAnimated.value = true;

    scale.value = withSpring(1, { damping: 12, stiffness: 150 });
    crossProgress1.value = withDelay(
      SCALE_MS,
      withTiming(1, { duration: CROSS_MS, easing: Easing.out(Easing.cubic) })
    );
    crossProgress2.value = withDelay(
      SCALE_MS + CROSS_MS,
      withTiming(1, { duration: CROSS_MS, easing: Easing.out(Easing.cubic) })
    );
    opacity.value = withDelay(
      SCALE_MS + CROSS_MS * 2 + HOLD_MS,
      withTiming(0, { duration: FADE_MS })
    );

    const timer = setTimeout(() => {
      onCompleteRef.current?.();
    }, TOTAL_MS);

    return () => clearTimeout(timer);
  }, [visible]);

  const circleStyle = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }],
    opacity: opacity.value,
  }));

  const crossStyle = (progress: SharedValue<number>) => useAnimatedStyle(() => ({
    opacity: opacity.value,
    transform: [
      { scale: progress.value },
    ],
  }));

  return (
    <Animated.View style={[styles.container, { width: size, height: size }]}>
      <Animated.View style={[styles.circle, { backgroundColor, width: size, height: size }, circleStyle]} />
      <Animated.View
        style={[
          styles.crossContainer,
          { width: size, height: size, top: -size },
        ]}>
        <Animated.View style={crossStyle(crossProgress1)}>
          <View style={styles.crossLine} />
        </Animated.View>
        <Animated.View style={crossStyle(crossProgress2)}>
          <View style={[styles.crossLine, styles.crossLine2]} />
        </Animated.View>
      </Animated.View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  container: {
    position: 'relative',
    justifyContent: 'center',
    alignItems: 'center',
  },
  circle: {
    position: 'absolute',
    borderRadius: 999,
    justifyContent: 'center',
    alignItems: 'center',
  },
  crossContainer: {
    position: 'absolute',
    justifyContent: 'center',
    alignItems: 'center',
  },
  crossLine: {
    width: '70%',
    height: 3,
    backgroundColor: 'white',
    borderRadius: 2,
  },
  crossLine2: {
    transform: [{ rotate: '90deg' }],
  },
});