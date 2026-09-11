import { View } from 'react-native'
import React from 'react'

type Props = {
  active: 1 | 2 | 3
}

export default function OnboardingDots({ active }: Props) {
  return (
    <View className="mb-5 flex-row items-center gap-2">
      <View
        className={`h-1.5 rounded-full ${
          active === 1
            ? 'w-6 bg-[#8B5CF6]'
            : 'w-2 bg-[#34343D]'
        }`}
      />

      <View
        className={`h-1.5 rounded-full ${
          active === 2
            ? 'w-6 bg-[#8B5CF6]'
            : 'w-2 bg-[#34343D]'
        }`}
      />

      <View
        className={`h-1.5 rounded-full ${
          active === 3
            ? 'w-6 bg-[#8B5CF6]'
            : 'w-2 bg-[#34343D]'
        }`}
      />
    </View>
  )
}
