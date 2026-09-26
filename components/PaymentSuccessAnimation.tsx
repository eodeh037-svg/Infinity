import React from 'react';
import { View, StyleSheet } from 'react-native';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withTiming,
  withSpring,
  withDelay,
  Easing,
} from 'react-native-reanimated';

interface PaymentSuccessAnimationProps {
  visible: boolean;
  onComplete?: () => void;
  size?: number;
  color?: string;
  backgroundColor?: string;
}

const SCALE_MS = 700;
const CHECK_MS = 400;
const HOLD_MS = 800;
const FADE_MS = 300;
const TOTAL_MS = SCALE_MS + CHECK_MS + HOLD_MS + FADE_MS;

export function PaymentSuccessAnimation({
  visible,
  onComplete,
  size = 80,
  color = '#61A568',
  backgroundColor = '#61A568',
}: PaymentSuccessAnimationProps) {
  const scale = useSharedValue(0);
  const checkmarkProgress = useSharedValue(0);
  const opacity = useSharedValue(1);
  const hasAnimated = useSharedValue(false);
  const onCompleteRef = React.useRef(onComplete);
  onCompleteRef.current = onComplete;

  React.useEffect(() => {
    if (!visible) {
      hasAnimated.value = false;
      scale.value = 0;
      checkmarkProgress.value = 0;
      opacity.value = 1;
      return;
    }
    if (hasAnimated.value) {
      return;
    }
    hasAnimated.value = true;

    scale.value = withSpring(1, { damping: 12, stiffness: 150 });
    checkmarkProgress.value = withDelay(
      SCALE_MS,
      withTiming(1, { duration: CHECK_MS, easing: Easing.out(Easing.cubic) })
    );
    opacity.value = withDelay(
      SCALE_MS + CHECK_MS + HOLD_MS,
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

  const checkmarkStyle = useAnimatedStyle(() => ({
    strokeDashoffset: 40 * (1 - checkmarkProgress.value),
    opacity: opacity.value,
  }));

  return (
    <Animated.View style={[styles.container, { width: size, height: size }]}>
      <Animated.View style={[styles.circle, { backgroundColor, width: size, height: size }, circleStyle]} />
      <Animated.View
        style={[
          styles.checkmarkContainer,
          { width: size, height: size, top: -size },
        ]}>
        <Animated.View style={checkmarkStyle}>
          <View style={styles.checkmarkSvg}>
            <View style={styles.checkmarkPath} />
          </View>
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
  checkmarkContainer: {
    position: 'absolute',
    justifyContent: 'center',
    alignItems: 'center',
  },
  checkmarkSvg: {
    width: '100%',
    height: '100%',
  },
  checkmarkPath: {
    width: '100%',
    height: '100%',
  },
});