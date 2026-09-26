import { Ionicons } from '@expo/vector-icons';
import { Pressable, ScrollView, Text, TextInput, View, Alert } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import { useState } from 'react';

import { signIn, resetPassword } from '../../lib/firebase/authService';
import { useTheme } from '../../lib/theme';
import AppButton from '../../component/ui/AppButton';
import { friendlyAuthError } from '../../component/ui/authErrors';

export default function LogIn() {
  const { colors } = useTheme();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleEmailSignIn = async () => {
    setError('');
    setIsSubmitting(true);

    try {
      if (!email || !password) {
        setError('Please fill in all fields.');
        return;
      }
      await signIn(email, password);
      router.replace('/(tabs)');
    } catch (caughtError) {
      const errorMessage =
        caughtError instanceof Error ? caughtError.message : 'Unable to sign in. Please try again.';

      setError(errorMessage);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleForgotPassword = async () => {
    if (!email) {
      setError('Enter your email first, then tap "Forgot password?".');
      return;
    }

    try {
      await resetPassword(email);
      Alert.alert('Check your inbox', `We sent a password reset link to ${email.trim()}.`);
    } catch (caughtError) {
      console.error('Reset password error:', caughtError);
      const errorMessage =
        caughtError instanceof Error
          ? caughtError.message
          : 'Failed to send reset email. Please try again.';
      setError(errorMessage);
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

          <Text className="text-[26px] font-bold text-foreground">Welcome back</Text>

          <Text className="mt-2 text-[14px] text-muted">Sign in to your Infinity account</Text>

          <View className="mt-8 w-full gap-3">
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
                autoComplete="password"
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

            <Pressable className="self-end" onPress={handleForgotPassword}>
              <Text className="text-[13px] font-medium text-accent">Forgot password?</Text>
            </Pressable>

            {error ? (
              <Text className="rounded-lg border border-danger/25 bg-danger/10 px-3 py-2 text-center text-[13px] text-danger">
                {friendlyAuthError(error)}
              </Text>
            ) : null}

            <AppButton
              title="Sign In"
              className="mt-1 w-full"
              loading={isSubmitting}
              onPress={handleEmailSignIn}
            />
          </View>

          <View className="mt-7 flex-row">
            <Text className="text-[13px] text-muted">No account? </Text>

            <Pressable onPress={() => router.push('/(auth)/signUp')}>
              <Text className="text-[13px] font-medium text-accent">Sign up free</Text>
            </Pressable>
          </View>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}