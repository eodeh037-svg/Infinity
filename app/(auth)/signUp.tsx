import { Ionicons } from '@expo/vector-icons';
import { Pressable, ScrollView, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import { useState } from 'react';

import { createAccount } from '../../lib/firebase/authService';
import { isUsernameTaken } from '../../lib/services/dataService';
import { useTheme } from '../../lib/theme';
import AppButton from '../../component/ui/AppButton';
import { friendlyAuthError } from '../../component/ui/authErrors';

export default function SignUp() {
  const { colors } = useTheme();
  const [userName, setUserName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleCreateAccount = async () => {
    if (!userName || !email || !password || !confirmPassword) {
      setError('Please fill in all fields.');
      return;
    }
    if (password !== confirmPassword) {
      setError('Passwords do not match.');
      return;
    }

    setError('');
    setIsSubmitting(true);

    try {
      const taken = await isUsernameTaken(userName);
      if (taken) {
        setError('Username is already taken.');
        setIsSubmitting(false);
        return;
      }
      await createAccount(email, password, userName);
      router.replace('/(tabs)');
    } catch (caughtError) {
      console.error(caughtError);
      setError(
        caughtError instanceof Error ? caughtError.message : 'Unable to create your account.'
      );
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <SafeAreaView className="flex-1 bg-background" edges={['top', 'bottom']}>
      <ScrollView
        contentContainerClassName="flex-grow justify-center px-6 py-10"
        keyboardShouldPersistTaps="handled">
        <View className="w-full items-center">
          <View className="mb-6 h-14 w-14 items-center justify-center rounded-2xl bg-accent">
            <Text className="text-[22px] font-bold text-white">∞</Text>
          </View>

          <Text className="text-[26px] font-bold text-foreground">Create account</Text>

          <Text className="mt-2 text-center text-[14px] text-muted">
            Start trading with AI-powered signals
          </Text>

          <View className="mt-8 w-full gap-3">
            <TextInput
              autoCapitalize="words"
              autoComplete="name"
              accessibilityLabel="Username"
              className="h-12 rounded-lg border border-border bg-input px-4 text-[15px] text-foreground"
              onChangeText={setUserName}
              placeholder="Username"
              placeholderTextColor={colors.mutedSoft}
              value={userName}
            />

            <TextInput
              autoCapitalize="none"
              autoComplete="email"
              accessibilityLabel="Email address"
              className="h-12 rounded-lg border border-border bg-input px-4 text-[15px] text-foreground"
              keyboardType="email-address"
              onChangeText={setEmail}
              placeholder="Email address"
              placeholderTextColor={colors.mutedSoft}
              value={email}
            />

            <View className="relative">
              <TextInput
                autoCapitalize="none"
                autoComplete="new-password"
                accessibilityLabel="Password"
                className="h-12 rounded-lg border border-border bg-input px-4 pr-12 text-[15px] text-foreground"
                onChangeText={setPassword}
                placeholder="Password"
                placeholderTextColor={colors.mutedSoft}
                secureTextEntry={!showPassword}
                value={password}
              />

              <Pressable
                accessibilityLabel={showPassword ? 'Hide password' : 'Show password'}
                className="absolute right-4 top-[14px]"
                onPress={() => setShowPassword((value) => !value)}>
                <Ionicons
                  color={colors.mutedSoft}
                  name={showPassword ? 'eye-off-outline' : 'eye-outline'}
                  size={20}
                />
              </Pressable>
            </View>

            <TextInput
              autoCapitalize="none"
              autoComplete="new-password"
              accessibilityLabel="Confirm password"
              className="h-12 rounded-lg border border-border bg-input px-4 text-[15px] text-foreground"
              onChangeText={setConfirmPassword}
              placeholder="Confirm password"
              placeholderTextColor={colors.mutedSoft}
              secureTextEntry={!showPassword}
              value={confirmPassword}
            />

            {error ? (
              <Text className="rounded-lg border border-danger/25 bg-danger/10 px-3 py-2 text-center text-[13px] text-danger">
                {friendlyAuthError(error)}
              </Text>
            ) : null}

            <AppButton
              title="Create Account"
              className="mt-1 w-full"
              loading={isSubmitting}
              onPress={handleCreateAccount}
            />
          </View>

          <View className="mt-7 flex-row">
            <Text className="text-[13px] text-muted">Have an account? </Text>

            <Pressable onPress={() => router.push('/(auth)/logIn')}>
              <Text className="text-[13px] font-medium text-accent">Sign in</Text>
            </Pressable>
          </View>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}