import { View, Text, Pressable } from 'react-native'
import React from 'react'
import { MaterialCommunityIcons } from '@expo/vector-icons'

import { router } from 'expo-router'
import OnboardingDots from '../../component/onboardingDot'

export default function FirstOnboarding() {
  return (
    <View className="flex-1 bg-[#000005] px-6">
      <View className="flex-1 items-center justify-between py-16">
        <View className="flex-1 items-center justify-center">
          <View className="mb-6 h-16 w-16 items-center justify-center rounded-2xl bg-[#121027]">
            <MaterialCommunityIcons
              name="diamond-outline"
              size={34}
              color="#8B5CF6"
            />
          </View>

          <Text className="mb-3 text-center text-[25px] font-bold text-white">
            AI-Powered Forex Signals
          </Text>

          <Text className="max-w-[330px] text-center text-[14px] leading-6 text-[#777781]">
            Infinity scans major, minor, and exotic currency
            pairs 24/7, delivering high-confidence BUY, SELL,
            and HOLD signals backed by technical analysis.
          </Text>

          <View className="mt-5 rounded-xl bg-[#111118] px-4 py-3">
            <Text className="text-center text-[11px] text-[#64646E]">
              Built on RSI · MACD · EMA · Bollinger Bands
            </Text>
          </View>
        </View>

        <View className="w-full items-center">
          <OnboardingDots active={1} />

          <Pressable
            className="mt-6 h-14 w-full overflow-hidden rounded-xl bg-[#6237D8] justify-center"
            onPress={() => router.push('/(onboarding)/second')}
          >

            <Text className="text-[15px] font-semibold text-white text-center">
              Continue
            </Text>

          </Pressable>

          <Pressable onPress={() => router.replace('/(auth)/signUp')}>
            <Text className="mt-5 text-[13px] text-[#55555E]">
              Skip
            </Text>
          </Pressable>
        </View>
      </View>
    </View>
  )
}
