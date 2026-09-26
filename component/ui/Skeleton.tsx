import { useEffect, useMemo } from 'react';
import { Animated, Easing } from 'react-native';

export default function Skeleton({ className = 'h-16' }: { className?: string }) {
  const opacity = useMemo(() => new Animated.Value(0.45), []);

  useEffect(() => {
    const anim = Animated.loop(
      Animated.sequence([
        Animated.timing(opacity, {
          toValue: 1,
          duration: 650,
          easing: Easing.inOut(Easing.ease),
          useNativeDriver: true,
        }),
        Animated.timing(opacity, {
          toValue: 0.45,
          duration: 650,
          easing: Easing.inOut(Easing.ease),
          useNativeDriver: true,
        }),
      ])
    );
    anim.start();
    return () => anim.stop();
  }, [opacity]);

  return <Animated.View className={`rounded-lg bg-chip ${className}`} style={{ opacity }} />;
}