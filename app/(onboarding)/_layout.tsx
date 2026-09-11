
import React from 'react'
import { Stack } from 'expo-router'

export default function onboardLayout() {
  return (
    <Stack initialRouteName="index" screenOptions={{ headerShown:false}}>
      <Stack.Screen name="index" />
      <Stack.Screen name="second" />
      <Stack.Screen name="last" />
    </Stack>
  )
}
