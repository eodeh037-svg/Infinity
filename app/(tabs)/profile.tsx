import {
  View,
  Text,
  ScrollView,
  Pressable,
  Alert,
  ActivityIndicator,
  RefreshControl,
  Modal,
  Linking,
} from 'react-native';
import { useState, useEffect, useCallback } from 'react';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import {
  getUserProfile,
  getUserTrades,
  getCurrentUser,
} from '../../lib/services/dataService';
import { signOut } from '../../lib/firebase/authService';
import { UserProfile, Trade } from '../../types';
import { useTheme } from '../../lib/theme';
import { useUser } from '../../lib/firebase/userProvider';
import AppCard from '../../component/ui/AppCard';
import AppButton from '../../component/ui/AppButton';
import { formatDollar } from '../../component/ui/money';

export default function ProfileScreen() {
  const { colors } = useTheme();
  const { isPremium } = useUser();
  const [user, setUser] = useState<UserProfile | null>(null);
  const [trades, setTrades] = useState<Trade[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [privacyVisible, setPrivacyVisible] = useState(false);

  useEffect(() => {
    loadData();
  }, []);

  async function loadData() {
    try {
      const [userData, tradesData] = await Promise.all([getUserProfile(), getUserTrades()]);
      setUser(userData);
      setTrades(tradesData);
    } catch (error) {
      console.error('Failed to load profile:', error);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }

  const onRefresh = useCallback(() => {
    setRefreshing(true);
    loadData();
  }, []);

  const totalTrades = trades.filter((t) => t.status === 'closed').length;
  const winCount = trades.filter((t) => t.status === 'closed' && t.profitLoss > 0).length;
  const avgRR =
    totalTrades > 0
      ? trades
          .filter((t) => t.status === 'closed' && t.riskReward)
          .reduce((acc, t) => {
            const rr = parseFloat(t.riskReward.split(':')[1] || '0');
            return acc + rr;
          }, 0) / Math.max(trades.filter((t) => t.status === 'closed' && t.riskReward).length, 1)
      : 0;

  const firebaseUser = getCurrentUser();

  function handleSignOut() {
    Alert.alert('Sign Out', 'Are you sure you want to sign out?', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Sign Out',
        style: 'destructive',
        onPress: async () => {
          try {
            await signOut();
            router.replace('/(auth)/logIn');
          } catch (error) {
            console.error('Failed to sign out:', error);
          }
        },
      },
    ]);
  }

  if (loading) {
    return (
      <SafeAreaView className="flex-1 items-center justify-center bg-background">
        <ActivityIndicator size="large" color={colors.accent} />
        <Text className="mt-4 text-[13px] text-muted">Loading profile...</Text>
      </SafeAreaView>
    );
  }

  return (
    <>
      <SafeAreaView className="flex-1 bg-background" edges={['top']}>
        <ScrollView
          showsVerticalScrollIndicator={false}
          contentContainerClassName="pb-6"
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.accent} />
          }>
          <View className="px-5 pt-4">
            <Text className="mb-4 text-[22px] font-bold text-foreground">Profile</Text>

            <AppCard className="mb-5 items-center p-6">
              <View className="mb-3 h-16 w-16 items-center justify-center rounded-full bg-accent">
                <Text className="text-[24px] font-bold text-white">
                  {(user?.userName ?? 'T')[0].toUpperCase()}
                </Text>
              </View>
              <Text className="text-[17px] font-bold text-foreground">
                {user?.userName ?? 'Trader'}
              </Text>
              <Text className="mt-0.5 text-[12px] text-muted">
                {user?.email ?? firebaseUser?.email ?? ''}
              </Text>

              <View className="mt-3 flex-row items-center gap-1.5 rounded-full bg-accent/12 px-3 py-1.5">
                <Ionicons name="flash" size={14} color={colors.accent} />
                <Text className="text-[12px] font-medium text-accent">
                  {isPremium ? 'Premium Plan' : 'Free Plan'}
                </Text>
              </View>
            </AppCard>

            <View className="mb-4 flex-row gap-3">
              <View className="flex-1 items-center rounded-xl border border-border bg-card py-4">
                <Text className="text-[18px] font-bold text-foreground">{totalTrades}</Text>
                <Text className="mt-0.5 text-[11px] text-muted">Closed Trades</Text>
              </View>
              <View className="flex-1 items-center rounded-xl border border-border bg-card py-4">
                <Text className="text-[18px] font-bold text-success">
                  {totalTrades > 0 ? Math.round((winCount / totalTrades) * 100) : 0}%
                </Text>
                <Text className="mt-0.5 text-[11px] text-muted">Win Rate</Text>
              </View>
              <View className="flex-1 items-center rounded-xl border border-border bg-card py-4">
                <Text className="text-[18px] font-bold text-accent">
                  {avgRR > 0 ? avgRR.toFixed(2) : '0.00'}
                </Text>
                <Text className="mt-0.5 text-[11px] text-muted">Avg R:R</Text>
              </View>
            </View>

            <AppCard className="mb-4">
              <View className="flex-row items-center justify-between">
                <View>
                  <Text className="text-[12px] text-muted">Account Balance</Text>
                  <Text
                    className={`mt-1 text-[20px] font-bold ${
                      (user?.accountBalance ?? 0) >= 0 ? 'text-foreground' : 'text-danger'
                    }`}>
                    {formatDollar(user?.accountBalance ?? 0)}
                  </Text>
                </View>
                <View className="items-end">
                  <Text className="text-[12px] text-muted">Total P/L</Text>
                  <Text
                    className={`mt-1 text-[17px] font-bold ${
                      (user?.totalPL ?? 0) >= 0 ? 'text-success' : 'text-danger'
                    }`}>
                    {formatDollar(user?.totalPL ?? 0)}
                  </Text>
                </View>
              </View>
            </AppCard>

            {!isPremium && (
              <Pressable
                accessibilityRole="button"
                onPress={() => router.push('/premium')}
                className="mb-4 flex-row items-center gap-3 rounded-xl border border-accent/25 bg-accent/8 p-4">
                <View className="h-10 w-10 items-center justify-center rounded-full bg-accent">
                  <Ionicons name="diamond" size={19} color={colors.foreground} />
                </View>
                <View className="flex-1">
                  <Text className="text-[14px] font-semibold text-foreground">
                    Upgrade to Premium
                  </Text>
                  <Text className="mt-0.5 text-[12px] text-muted">
                    Unlimited signals, advanced analytics
                  </Text>
                </View>
                <Ionicons name="chevron-forward" size={18} color={colors.accent} />
              </Pressable>
            )}

            <AppCard className="mb-6 overflow-hidden p-0">
              {[
                { icon: 'card-outline' as const, label: 'Subscription' },
                { icon: 'shield-checkmark-outline' as const, label: 'Privacy & Security' },
                { icon: 'document-text-outline' as const, label: 'Terms & Conditions' },
                { icon: 'help-circle-outline' as const, label: 'Help & Support' },
              ].map((item, index, arr) => (
                <Pressable
                  key={item.label}
                  accessibilityRole="button"
                  onPress={() => {
                    if (item.label === 'Subscription') router.push('/plans');
                    if (item.label === 'Privacy & Security') setPrivacyVisible(true);
                    if (item.label === 'Terms & Conditions') router.push('/terms');
                    if (item.label === 'Help & Support') Linking.openURL('mailto:infinityapp89@gmail.com');
                  }}
                  className={`flex-row items-center gap-3 px-4 py-4 ${
                    index < arr.length - 1 ? 'border-b border-border' : ''
                  }`}>
                  <Ionicons name={item.icon} size={20} color={colors.muted} />
                  <Text className="flex-1 text-[14px] text-foreground">{item.label}</Text>
                  <Ionicons name="chevron-forward" size={16} color={colors.muted} />
                </Pressable>
              ))}
            </AppCard>

            <Pressable
              accessibilityRole="button"
              onPress={handleSignOut}
              className="mb-4 flex-row items-center justify-center gap-2 rounded-xl border border-danger/25 bg-danger/8 py-4">
              <Ionicons name="log-out-outline" size={18} color={colors.danger} />
              <Text className="text-[14px] font-medium text-danger">Sign Out</Text>
            </Pressable>
          </View>
        </ScrollView>
      </SafeAreaView>

      <Modal visible={privacyVisible} transparent animationType="fade" onRequestClose={() => setPrivacyVisible(false)}>
        <View className="flex-1 items-center justify-center bg-black/60 px-5">
          <View className="w-full max-w-md rounded-2xl border border-border bg-card p-6">
            <View className="mb-4 items-center">
              <View className="mb-3 h-12 w-12 items-center justify-center rounded-full bg-accent/15">
                <Ionicons name="shield-checkmark" size={24} color={colors.accent} />
              </View>
              <Text className="text-[17px] font-bold text-foreground">Privacy & Security</Text>
            </View>
            <View className="gap-3">
              <View className="flex-row gap-3">
                <Ionicons name="lock-closed" size={16} color={colors.success} style={{ marginTop: 2 }} />
                <Text className="flex-1 text-[12px] leading-5 text-muted">
                  Your account is protected by Firebase Authentication with industry-standard
                  encryption.
                </Text>
              </View>
              <View className="flex-row gap-3">
                <Ionicons name="key" size={16} color={colors.success} style={{ marginTop: 2 }} />
                <Text className="flex-1 text-[12px] leading-5 text-muted">
                  Passwords are never stored — only secure tokens managed by Firebase.
                </Text>
              </View>
              <View className="flex-row gap-3">
                <Ionicons name="finger-print" size={16} color={colors.success} style={{ marginTop: 2 }} />
                <Text className="flex-1 text-[12px] leading-5 text-muted">
                  Sign in with Google, Apple, or email — your data stays private and synced.
                </Text>
              </View>
              <View className="flex-row gap-3">
                <Ionicons name="cloud-done" size={16} color={colors.success} style={{ marginTop: 2 }} />
                <Text className="flex-1 text-[12px] leading-5 text-muted">
                  All data is stored securely in Firestore with strict access rules.
                </Text>
              </View>
            </View>
            <AppButton title="Got it" className="mt-6 w-full" onPress={() => setPrivacyVisible(false)} />
          </View>
        </View>
      </Modal>
    </>
  );
}