import { View, Text, ScrollView, Pressable, Alert, ActivityIndicator, RefreshControl } from 'react-native'
import { useState, useEffect, useCallback } from 'react'
import { SafeAreaView } from 'react-native-safe-area-context'
import { Ionicons } from '@expo/vector-icons'
import { router } from 'expo-router'
import { getUserProfile, getUserTrades, formatPrice, getCurrentUser } from '../../lib/services/dataService'
import { signOut } from '../../lib/firebase/authService'
import { UserProfile, Trade } from '../../types'

function formatDollar(amount: number): string {
  if (amount < 0) return `-$${Math.abs(amount).toFixed(2)}`
  return `$${amount.toFixed(2)}`
}

export default function ProfileScreen() {
  const [user, setUser] = useState<UserProfile | null>(null)
  const [trades, setTrades] = useState<Trade[]>([])
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)

  useEffect(() => {
    loadData()
  }, [])

  async function loadData() {
    try {
      const [userData, tradesData] = await Promise.all([
        getUserProfile(),
        getUserTrades(),
      ])
      setUser(userData)
      setTrades(tradesData)
    } catch (error) {
      console.error('Failed to load profile:', error)
    } finally {
      setLoading(false)
      setRefreshing(false)
    }
  }

  const onRefresh = useCallback(() => {
    setRefreshing(true)
    loadData()
  }, [])

  const totalTrades = trades.filter(t => t.status === 'closed').length
  const winCount = trades.filter(t => t.status === 'closed' && t.profitLoss > 0).length
  const avgRR = totalTrades > 0
    ? trades.filter(t => t.status === 'closed' && t.riskReward).reduce((acc, t) => {
        const rr = parseFloat(t.riskReward.split(':')[1] || '0')
        return acc + rr
      }, 0) /
      Math.max(trades.filter(t => t.status === 'closed' && t.riskReward).length, 1)
    : 0

  const firebaseUser = getCurrentUser()

  function handleSignOut() {
    Alert.alert(
      'Sign Out',
      'Are you sure you want to sign out?',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Sign Out',
          style: 'destructive',
          onPress: async () => {
            try {
              await signOut()
              router.replace('/(auth)/logIn')
            } catch (error) {
              console.error('Failed to sign out:', error)
            }
          },
        },
      ]
    )
  }

  if (loading) {
    return (
      <SafeAreaView className="flex-1 items-center justify-center bg-[#0A0A12]">
        <ActivityIndicator size="large" color="#8B5CF6" />
      </SafeAreaView>
    )
  }

  return (
    <SafeAreaView className="flex-1 bg-[#0A0A12]">
      <ScrollView
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#8B5CF6" />
        }
      >
        <View className="px-5 pt-4">
          <Text className="mb-6 text-[24px] font-bold text-white">
            Profile
          </Text>

          <View className="mb-6 items-center rounded-3xl border border-[#1C1C2E] bg-[#0D0D14] p-6">
            <View className="mb-3 h-20 w-20 items-center justify-center rounded-full bg-gradient-to-br from-[#8B5CF6] to-[#6D28D9]">
              <Text className="text-[28px] font-bold text-white">
                {(user?.userName ?? 'T')[0].toUpperCase()}
              </Text>
            </View>
            <Text className="text-[18px] font-bold text-white">
              {user?.userName ?? 'Trader'}
            </Text>
            <Text className="text-[13px] text-[#64646E]">
              {user?.email ?? firebaseUser?.email ?? ''}
            </Text>

            <View className="mt-3 flex-row items-center gap-1.5 rounded-full bg-[#8B5CF6]/15 px-3 py-1.5">
              <Ionicons name="flash" size={14} color="#8B5CF6" />
              <Text className="text-[12px] font-medium text-[#8B5CF6]">
                {user?.plan === 'premium' ? 'Premium Plan' : 'Free Plan'}
              </Text>
            </View>
          </View>

          <View className="mb-4 flex-row gap-3">
            <View className="flex-1 items-center rounded-2xl border border-[#1C1C2E] bg-[#0D0D14] py-4">
              <Text className="text-[20px] font-bold text-white">{totalTrades}</Text>
              <Text className="text-[11px] text-[#64646E]">Total Trades</Text>
            </View>
            <View className="flex-1 items-center rounded-2xl border border-[#1C1C2E] bg-[#0D0D14] py-4">
              <Text className="text-[20px] font-bold text-[#22C55E]">
                {totalTrades > 0 ? Math.round((winCount / totalTrades) * 100) : 0}%
              </Text>
              <Text className="text-[11px] text-[#64646E]">Win Rate</Text>
            </View>
            <View className="flex-1 items-center rounded-2xl border border-[#1C1C2E] bg-[#0D0D14] py-4">
              <Text className="text-[20px] font-bold text-[#8B5CF6]">
                {avgRR > 0 ? avgRR.toFixed(2) : '0.00'}
              </Text>
              <Text className="text-[11px] text-[#64646E]">Avg R:R</Text>
            </View>
          </View>

          <View className="mb-4 rounded-2xl border border-[#1C1C2E] bg-[#0D0D14] p-4">
            <View className="flex-row items-center justify-between">
              <View>
                <Text className="text-[12px] text-[#64646E]">Account Balance</Text>
                <Text className={`mt-1 text-[22px] font-bold ${(user?.accountBalance ?? 0) >= 0 ? 'text-white' : 'text-[#EF4444]'}`}>
                  {formatDollar(user?.accountBalance ?? 0)}
                </Text>
              </View>
              <View className="items-end">
                <Text className="text-[12px] text-[#64646E]">Total P/L</Text>
                <Text className={`mt-1 text-[18px] font-bold ${(user?.totalPL ?? 0) >= 0 ? 'text-[#22C55E]' : 'text-[#EF4444]'}`}>
                  {formatDollar(user?.totalPL ?? 0)}
                </Text>
              </View>
            </View>
          </View>

          <Pressable className="mb-4 flex-row items-center gap-3 rounded-2xl border border-[#8B5CF6]/30 bg-[#8B5CF6]/10 p-4">
            <View className="h-10 w-10 items-center justify-center rounded-full bg-[#8B5CF6]">
              <Ionicons name="diamond" size={20} color="#FFF" />
            </View>
            <View className="flex-1">
              <Text className="text-[14px] font-semibold text-white">
                Upgrade to Premium
              </Text>
              <Text className="text-[12px] text-[#64646E]">
                Unlimited signals, advanced analytics
              </Text>
            </View>
            <Ionicons name="chevron-forward" size={18} color="#8B5CF6" />
          </Pressable>

          <View className="mb-6 rounded-2xl border border-[#1C1C2E] bg-[#0D0D14]">
            {[
              { icon: 'notifications-outline' as const, label: 'Notifications' },
              { icon: 'card-outline' as const, label: 'Subscription' },
              { icon: 'shield-checkmark-outline' as const, label: 'Privacy & Security' },
              { icon: 'help-circle-outline' as const, label: 'Help & Support' },
              { icon: 'information-circle-outline' as const, label: 'About' },
            ].map((item, index, arr) => (
              <Pressable
                key={item.label}
                className={`flex-row items-center gap-3 px-4 py-4 ${
                  index < arr.length - 1 ? 'border-b border-[#1C1C2E]' : ''
                }`}
              >
                <Ionicons name={item.icon} size={20} color="#64646E" />
                <Text className="flex-1 text-[14px] text-white">
                  {item.label}
                </Text>
                <Ionicons name="chevron-forward" size={16} color="#64646E" />
              </Pressable>
            ))}
          </View>

          <Pressable
            onPress={handleSignOut}
            className="mb-8 flex-row items-center justify-center gap-2 rounded-2xl border border-[#EF4444]/30 bg-[#EF4444]/10 py-4"
          >
            <Ionicons name="log-out-outline" size={18} color="#EF4444" />
            <Text className="text-[14px] font-medium text-[#EF4444]">
              Sign Out
            </Text>
          </Pressable>
        </View>
      </ScrollView>
    </SafeAreaView>
  )
}
