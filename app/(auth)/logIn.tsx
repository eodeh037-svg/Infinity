import { Ionicons } from '@expo/vector-icons'
import {
  ActivityIndicator,
  Image,
  Pressable,
  ScrollView,
  Text,
  TextInput,
  View,
  Alert,
} from 'react-native'
import { router } from 'expo-router'
import { useState } from 'react'

import { signIn, resetPassword } from '../../lib/firebase/authService'

export default function LogIn() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [error, setError] = useState('')
  const [isSubmitting, setIsSubmitting] = useState(false)

  const handleEmailSignIn = async () => {
    setError('')
    setIsSubmitting(true)

    try {
      if (!email || !password) {
        setError('Please fill in all fields.')
        return
      }
      await signIn(email, password)
      router.replace('/(tabs)')
    } catch (caughtError) {
      const errorMessage =
        caughtError instanceof Error
          ? caughtError.message
          : 'Unable to sign in. Please try again.'

      setError(errorMessage)
    } finally {
      setIsSubmitting(false)
    }
  }

  const handleForgotPassword = async () => {
    if (!email) {
      setError('Enter your email first, then tap "Forgot password?".')
      return
    }

    try {
      await resetPassword(email)
      Alert.alert('Check your inbox', `We sent a password reset link to ${email.trim()}.`)
    } catch (caughtError) {
      console.error('Reset password error:', caughtError)
      const errorMessage =
        caughtError instanceof Error
          ? caughtError.message
          : 'Failed to send reset email. Please try again.'
      setError(errorMessage)
    }
  }

  return (
    <ScrollView
      className="flex-1 bg-[#05050d]"
      contentContainerClassName="flex-grow justify-center px-6 py-10"
      keyboardShouldPersistTaps="handled"
    >
      <View className="w-full items-center">
        <Image
          source={require('../../assets/icon.jpg')}
          className="mb-7 h-14 w-14 rounded-2xl"
        />

        <Text className="text-3xl font-bold text-white">
          Welcome back
        </Text>

        <Text className="mt-2 text-sm text-[#767481]">
          Sign in to your Infinity account
        </Text>

        <View className="mt-8 w-full gap-3">
          <TextInput
            autoCapitalize="none"
            autoComplete="email"
            className="h-14 rounded-xl border border-[#28243d] bg-[#0b0919] px-4 text-base text-white"
            keyboardType="email-address"
            onChangeText={setEmail}
            placeholder="Email address"
            placeholderTextColor="#666373"
            value={email}
          />

          <View className="relative">
            <TextInput
              autoCapitalize="none"
              autoComplete="password"
              className="h-14 rounded-xl border border-[#28243d] bg-[#0b0919] px-4 pr-12 text-base text-white"
              onChangeText={setPassword}
              placeholder="Password"
              placeholderTextColor="#666373"
              secureTextEntry={!showPassword}
              value={password}
            />

            <Pressable
              className="absolute right-4 top-[18px]"
              onPress={() => setShowPassword((value) => !value)}
            >
              <Ionicons
                color="#77738a"
                name={showPassword ? 'eye-off-outline' : 'eye-outline'}
                size={20}
              />
            </Pressable>
          </View>

          <Pressable
            className="self-end"
            onPress={handleForgotPassword}
          >
            <Text className="text-xs font-medium text-[#b66cff]">
              Forgot password?
            </Text>
          </Pressable>

          {error ? (
            <Text className="text-center text-xs text-[#ff8896]">
              {error}
            </Text>
          ) : null}

          <Pressable
            className="mt-1 h-14 items-center justify-center rounded-xl bg-[#7a00ff]"
            disabled={isSubmitting}
            onPress={handleEmailSignIn}
          >
            {isSubmitting ? (
              <ActivityIndicator color="#ffffff" />
            ) : (
              <Text className="font-semibold text-white">
                Sign In
              </Text>
            )}
          </Pressable>
        </View>

        <View className="mt-7 flex-row">
          <Text className="text-xs text-[#777381]">
            No account?{' '}
          </Text>

          <Pressable onPress={() => router.push('/(auth)/signUp')}>
            <Text className="text-xs font-medium text-[#b66cff]">
              Sign up free
            </Text>
          </Pressable>
        </View>
      </View>
    </ScrollView>
  )
}
