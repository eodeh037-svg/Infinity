import '../global.css';

import { Stack, useRouter, useSegments, useRootNavigationState } from 'expo-router';
import { StatusBar, View } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { useEffect, useState } from 'react';
import { onAuthStateChanged } from 'firebase/auth';
import { auth } from '../lib/firebaseConfig';

export default function Layout() {
  const router = useRouter();
  const segments = useSegments();
  const navigationState = useRootNavigationState();
  const [initializing, setInitializing] = useState(true);
  const [user, setUser] = useState<{ uid: string } | null>(null);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (currentUser) => {
      setUser(currentUser);
      setInitializing(false);
    });
    return unsubscribe;
  }, []);

  useEffect(() => {
    if (initializing) return;
    if (!navigationState?.key) return;

    const segment = segments[0];
    const inAuthFlow = segment === '(onboarding)' || segment === '(auth)';

    if (user && inAuthFlow) {
      router.replace('/(tabs)');
    } else if (!user && !inAuthFlow) {
      router.replace('/(onboarding)');
    }
  }, [user, initializing, segments, navigationState?.key, router]);

  if (initializing) {
    return (
      <SafeAreaProvider>
        <StatusBar barStyle="light-content" />
        <View style={{ flex: 1, backgroundColor: '#000005' }} />
      </SafeAreaProvider>
    );
  }

  return (
    <SafeAreaProvider>
      <StatusBar barStyle="light-content" />
      <Stack initialRouteName="(onboarding)" screenOptions={{ headerShown: false }}>
        <Stack.Screen name="(onboarding)" />
        <Stack.Screen name="(auth)" />
        <Stack.Screen name="(tabs)" />
      </Stack>
    </SafeAreaProvider>
  );
}