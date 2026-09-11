import { View, Text, Pressable } from 'react-native';
import React from 'react';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { router } from 'expo-router';
import OnboardingDots from '../../component/onboardingDot';

export default function LastOnboarding() {
  return (
    <View className="flex-1 bg-[#000005] px-6">
      <View className="flex-1 items-center justify-between py-14">
        <View className="w-full flex-1 items-center justify-center">
          <View className="mb-6 h-16 w-16 items-center justify-center rounded-2xl bg-[#121027]">
            <MaterialCommunityIcons name="lightning-bolt-outline" size={34} color="#8B5CF6" />
          </View>

          <Text className="mb-3 text-center text-[25px] font-bold text-white">
            Generate Smarter Signals
          </Text>

          <Text className="max-w-[330px] text-center text-[14px] leading-6 text-[#777781]">
            Generate BUY and SELL signals using technical indicators and intelligent market analysis
            to help you understand the market.
          </Text>

          <View className="mt-5 rounded-xl bg-[#111118] px-4 py-3">
            <Text className="text-center text-[11px] text-[#64646E]">
              Entry · Stop Loss · Take Profit · Risk/Reward
            </Text>
          </View>
        </View>

        <View className="w-full items-center">
          <OnboardingDots active={3} />

          <Pressable
            className="mt-6 h-14 w-full items-center justify-center overflow-hidden rounded-xl bg-[#6237D8]"
            onPress={() => router.replace('/(auth)/signUp')}>
            <Text className="text-center text-[15px] font-semibold text-white">
              Create your account
            </Text>
          </Pressable>
          <Pressable className="mt-5" onPress={() => router.replace('/(auth)/logIn')}>
            <Text className="text-[13px] font-medium text-[#B66CFF]">
              I already have an account
            </Text>
          </Pressable>
        </View>
      </View>
    </View>
  );
}
