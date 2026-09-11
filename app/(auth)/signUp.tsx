import { Ionicons } from '@expo/vector-icons'
import {
  ActivityIndicator,
  Image,
  Pressable,
  ScrollView,
  Text,
  TextInput,
  View,
} from 'react-native'
import { router } from 'expo-router'
import { useState } from 'react'

import { createAccount } from '../../lib/firebase/authService'

export default function SignUp() {
  const [userName, setUserName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [error, setError] = useState('')
  const [isSubmitting, setIsSubmitting] = useState(false)

  const handleCreateAccount = async () => {
    if (!userName || !email || !password || !confirmPassword) {
      setError('Please fill in all fields.')
      return
    }
    if (password !== confirmPassword) {
      setError('Passwords do not match.')
      return
    }

    setError('')
    setIsSubmitting(true)

    try {
      await createAccount(email, password, userName)
      router.replace('/(tabs)')
    } catch (caughtError) {
      console.error(caughtError)
      setError(
        caughtError instanceof Error
          ? caughtError.message
          : 'Unable to create your account.'
      )
    } finally {
      setIsSubmitting(false)
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
          Create account
        </Text>

        <Text className="mt-2 text-center text-sm text-[#767481]">
          Start trading with AI-powered signals
        </Text>

        <View className="mt-8 w-full gap-3">
          <TextInput
            autoCapitalize="words"
            autoComplete="name"
            className="h-14 rounded-xl border border-[#28243d] bg-[#0b0919] px-4 text-base text-white"
            onChangeText={setUserName}
            placeholder="Username"
            placeholderTextColor="#666373"
            value={userName}
          />

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
              autoComplete="new-password"
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

          <TextInput
            autoCapitalize="none"
            autoComplete="new-password"
            className="h-14 rounded-xl border border-[#28243d] bg-[#0b0919] px-4 text-base text-white"
            onChangeText={setConfirmPassword}
            placeholder="Confirm password"
            placeholderTextColor="#666373"
            secureTextEntry={!showPassword}
            value={confirmPassword}
          />

          {error ? (
            <Text className="text-center text-xs text-[#ff8896]">
              {error}
            </Text>
          ) : null}

          <Pressable
            className="mt-1 h-14 items-center justify-center rounded-xl bg-[#7a00ff]"
            disabled={isSubmitting}
            onPress={handleCreateAccount}
          >
            {isSubmitting ? (
              <ActivityIndicator color="#ffffff" />
            ) : (
              <Text className="font-semibold text-white">
                Create Account
              </Text>
            )}
          </Pressable>
        </View>

        <View className="mt-7 flex-row">
          <Text className="text-xs text-[#777381]">
            Have an account?{' '}
          </Text>

          <Pressable onPress={() => router.push('/(auth)/logIn')}>
            <Text className="text-xs font-medium text-[#b66cff]">
              Sign in
            </Text>
          </Pressable>
        </View>
      </View>
    </ScrollView>
  )
}
