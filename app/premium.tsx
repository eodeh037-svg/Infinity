import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  Modal,
  TextInput,
  KeyboardAvoidingView,
  Platform,
  ActivityIndicator,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import { useState, useEffect, useRef } from 'react';
import { useTheme } from '../lib/theme';
import { useUser } from '../lib/firebase/userProvider';
import { getCurrentUser } from '../lib/firebase/authService';
import {
  getPremiumEntitlement,
  isPremiumUser,
  createPayment,
  getUserPayments,
} from '../lib/server/premium';
import { PaymentSuccessAnimation } from '../components/PaymentSuccessAnimation';
import { PaymentRejectedAnimation } from '../components/PaymentRejectedAnimation';
import { AnimatedActionButton } from '../components/AnimatedActionButton';
import { formatMoney } from '../component/ui/money';
import { PREMIUM_PRICE_NGN } from '../component/ui/constants';

export default function PremiumScreen() {
  const { colors } = useTheme();
  const { premium, firebaseUser } = useUser();

  const [user, setUser] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [showPaymentModal, setShowPaymentModal] = useState(false);
  const [paymentSubmitted, setPaymentSubmitted] = useState(false);
  const [paymentStatus, setPaymentStatus] = useState<string | null>(null);
  const [paymentError, setPaymentError] = useState<string | null>(null);
  const [showPremiumInfo, setShowPremiumInfo] = useState(false);
  const [paymentReference, setPaymentReference] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [showSuccessAnimation, setShowSuccessAnimation] = useState(false);
  const [showRejectedAnimation, setShowRejectedAnimation] = useState(false);

  const benefits = [
    {
      id: 'unlimited',
      icon: 'flash' as const,
      color: colors.accent,
      label: 'Unlimited Signals',
      caption: 'Generate unlimited signals',
    },
    {
      id: 'multi',
      icon: 'layers' as const,
      color: colors.success,
      label: 'Multi-Timeframe',
      caption: 'Analysis across timeframes',
    },
    {
      id: 'market',
      icon: 'globe' as const,
      color: colors.warning,
      label: 'Market Context',
      caption: 'Forex & Crypto analysis',
    },
    {
      id: 'details',
      icon: 'information-circle' as const,
      color: colors.foreground,
      label: 'Detailed Signals',
      caption: 'Full signal information',
    },
  ];

  useEffect(() => {
    loadData();
  }, []);

  useEffect(() => {
    if (firebaseUser?.uid) {
      setUser({ ...premium, uid: firebaseUser.uid });
    }
  }, [premium, firebaseUser]);

  const loadData = async () => {
    try {
      const uid = getCurrentUser()?.uid;

      if (uid) {
        const entitlement = await getPremiumEntitlement(uid);
        setUser({ ...entitlement, uid });
      }
    } catch (error) {
      console.error('Failed to load premium data:', error);
    } finally {
      setLoading(false);
    }
  };

  const togglePaymentModal = () => {
    setShowPaymentModal((prev) => !prev);
  };

  const closePaymentModal = () => {
    setShowPaymentModal(false);
    setPaymentError(null);
  };

  const handleBack = () => {
    if (router.canGoBack()) {
      router.back();
    } else {
      router.replace('/(tabs)');
    }
  };

  const handleSubmitPayment = async () => {
    setPaymentSubmitted(false);
    setPaymentError(null);
    setSubmitting(true);
    setShowSuccessAnimation(false);
    setShowRejectedAnimation(false);

    if (!paymentReference.trim()) {
      setPaymentError('Please enter your payment reference.');
      setSubmitting(false);
      return;
    }

    const firebaseUid = getCurrentUser()?.uid;

    if (!firebaseUid) {
      setPaymentError('User not authenticated');
      setSubmitting(false);
      return;
    }

    try {
      const premium = await isPremiumUser(firebaseUid);

      if (premium) {
        setPaymentError('You are already a Premium member.');
        setSubmitting(false);
        return;
      }

      const infinityPaymentId = `INF-${new Date()
        .toISOString()
        .split('T')[0]
        .replace(/-/g, '')}-${Math.random()
        .toString(36)
        .substring(2, 6)
        .toUpperCase()}`;

      await createPayment(
        firebaseUid,
        PREMIUM_PRICE_NGN,
        'NGN',
        'monthly',
        'bank_transfer',
        paymentReference.trim(),
        infinityPaymentId
      );
      setPaymentSubmitted(true);
      setPaymentStatus('pending');
      setPaymentReference('');
      setShowPaymentModal(false);
      setSubmitting(false);

      setShowSuccessAnimation(true);

      const pollStatus = setInterval(async () => {
        try {
          const payments = await getUserPayments(firebaseUid, 1);
          const latestPayment = payments[0];

          if (latestPayment?.status === 'verified') {
            clearInterval(pollStatus);
            setPaymentStatus('verified');
            setShowPremiumInfo(true);
            loadData();
          } else if (latestPayment?.status === 'rejected') {
            clearInterval(pollStatus);
            setPaymentStatus('rejected');
            setPaymentError('Payment was rejected. Please try again.');
            setPaymentSubmitted(false);
            setShowRejectedAnimation(true);
          }
        } catch (error) {
          console.error('Error checking payment status:', error);
        }
      }, 3000);

      setTimeout(() => {
        clearInterval(pollStatus);
      }, 15000);
    } catch (error: any) {
      console.error('Error creating payment:', error);
      setSubmitting(false);
      setPaymentError(
        error?.message || 'Failed to submit payment'
      );
    }
  };

  const isPremium = user?.active === true;
  const plan = user?.plan;

  const expiresAt = user?.expiresAt
    ? new Date(
        user.expiresAt.toDate
          ? user.expiresAt.toDate()
          : user.expiresAt
      )
    : null;

  return (
    <>
      <SafeAreaView
        className="flex-1"
        style={{ backgroundColor: colors.background }}
      >
        <ScrollView
          showsVerticalScrollIndicator={false}
          contentContainerClassName="px-5 pt-5 pb-10"
          style={{ backgroundColor: colors.background }}
        >
          <View
            className="mb-6 border-b pb-4"
            style={{ borderBottomColor: colors.border }}
          >
            <TouchableOpacity
              onPress={handleBack}
              className="mb-3 h-9 w-9 items-center justify-center rounded-lg"
              style={{ backgroundColor: colors.card }}
              hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
            >
              <Ionicons
                name="arrow-back"
                size={20}
                color={colors.foreground}
              />
            </TouchableOpacity>

            <Text
              className="text-2xl font-bold"
              style={{ color: colors.foreground }}
            >
              {isPremium
                ? 'Premium Active'
                : 'Upgrade to Premium'}
            </Text>

            <Text
              className="mt-1 text-sm"
              style={{ color: colors.muted }}
            >
              {isPremium
                ? 'Your premium membership is active.'
                : 'Unlock the full Infinity trading experience.'}
            </Text>
          </View>

          {isPremium && plan ? (
            <View
              className="mb-5 rounded-2xl p-5"
              style={{ backgroundColor: colors.card }}
            >
              <View className="mb-5 flex-row items-center justify-between">
                <Text
                  className="text-lg font-semibold"
                  style={{ color: colors.foreground }}
                >
                  Active Benefits
                </Text>

                <View
                  className="rounded-full px-3 py-1"
                  style={{ backgroundColor: colors.accent }}
                >
                  <Text
                    className="text-xs font-bold"
                    style={{ color: colors.background }}
                  >
                    PREMIUM
                  </Text>
                </View>
              </View>

              {benefits.map((benefit) => (
                <View
                  key={benefit.id}
                  className="mb-4 flex-row items-center"
                >
                  <View
                    className="mr-3 h-9 w-9 items-center justify-center rounded-xl"
                    style={{
                      backgroundColor: `${benefit.color}20`,
                    }}
                  >
                    <Ionicons
                      name={benefit.icon}
                      size={18}
                      color={benefit.color}
                    />
                  </View>

                  <View className="flex-1">
                    <Text
                      className="text-sm font-semibold"
                      style={{ color: colors.foreground }}
                    >
                      {benefit.label}
                    </Text>

                    <Text
                      className="mt-0.5 text-xs"
                      style={{ color: colors.muted }}
                    >
                      {benefit.caption}
                    </Text>
                  </View>
                </View>
              ))}

              {expiresAt && (
                <View
                  className="mt-2 rounded-xl px-4 py-3"
                  style={{ backgroundColor: colors.background }}
                >
                  <Text
                    className="text-xs"
                    style={{ color: colors.muted }}
                  >
                    Premium expires
                  </Text>

                  <Text
                    className="mt-1 text-sm font-semibold"
                    style={{ color: colors.foreground }}
                  >
                    {expiresAt.toLocaleDateString()}
                  </Text>
                </View>
              )}
            </View>
          ) : (
            <View
              className="mb-5 rounded-2xl p-5"
              style={{ backgroundColor: colors.card }}
            >
<Text
              className="text-2xl font-bold"
              style={{ color: colors.foreground }}
            >
              Unlock Premium
            </Text>

              <Text
                className="mb-5 text-sm"
                style={{ color: colors.muted }}
              >
                Get unlimited access to Infinity&apos;s advanced
                analysis tools.
              </Text>

              {benefits.map((benefit) => (
                <View
                  key={benefit.id}
                  className="mb-4 flex-row items-center"
                >
                  <View
                    className="mr-3 h-9 w-9 items-center justify-center rounded-xl"
                    style={{
                      backgroundColor: `${benefit.color}20`,
                    }}
                  >
                    <Ionicons
                      name={benefit.icon}
                      size={18}
                      color={benefit.color}
                    />
                  </View>

                  <View className="flex-1">
                    <Text
                      className="text-sm font-semibold"
                      style={{ color: colors.foreground }}
                    >
                      {benefit.label}
                    </Text>

                    <Text
                      className="mt-0.5 text-xs"
                      style={{ color: colors.muted }}
                    >
                      {benefit.caption}
                    </Text>
                  </View>
                </View>
              ))}

              <View
                className="mt-2 rounded-xl px-4 py-4"
                style={{ backgroundColor: colors.background }}
              >
                <Text
                  className="text-xs"
                  style={{ color: colors.muted }}
                >
                  Premium plan
                </Text>

                <Text
                  className="mt-1 text-2xl font-bold"
                  style={{ color: colors.accent }}
                >
                  {formatMoney(PREMIUM_PRICE_NGN)}
                </Text>

                <Text
                  className="mt-0.5 text-xs"
                  style={{ color: colors.muted }}
                >
                  per month
                </Text>
              </View>
            </View>
          )}

          <View
            className="mb-5 rounded-2xl p-5"
            style={{ backgroundColor: colors.card }}
          >
            <Text
              className="mb-5 text-lg font-semibold"
              style={{ color: colors.foreground }}
            >
              Payment Instructions
            </Text>

            <View className="mb-4">
              <Text
                className="mb-1 text-xs"
                style={{ color: colors.muted }}
              >
                Bank Name
              </Text>

              <Text
                className="text-sm font-semibold"
                style={{ color: colors.accent }}
              >
                Opay
              </Text>
            </View>

            <View className="mb-4">
              <Text
                className="mb-1 text-xs"
                style={{ color: colors.muted }}
              >
                Account Name
              </Text>

              <Text
                className="text-sm font-semibold"
                style={{ color: colors.accent }}
              >
                EMMANUEL AJILIMA
              </Text>
            </View>

            <View className="mb-4">
              <Text
                className="mb-1 text-xs"
                style={{ color: colors.muted }}
              >
                Account Number
              </Text>

              <Text
                className="text-base font-bold tracking-wider"
                style={{ color: colors.accent }}
              >
                9038910070
              </Text>
            </View>

            <View
              className="mt-1 rounded-xl px-4 py-3"
              style={{ backgroundColor: colors.background }}
            >
              <Text
                className="text-xs"
                style={{ color: colors.muted }}
              >
                Transfer amount
              </Text>

              <Text
                className="mt-1 text-lg font-bold"
                style={{ color: colors.foreground }}
              >
                {formatMoney(PREMIUM_PRICE_NGN)}
              </Text>
            </View>
          </View>

          <TouchableOpacity
            onPress={togglePaymentModal}
            disabled={isPremium || paymentSubmitted}
            className="w-full items-center justify-center rounded-xl py-4"
            style={{
              backgroundColor:
                isPremium || paymentSubmitted
                  ? colors.muted
                  : colors.accent,
            }}
          >
            <Text
              className="text-base font-bold"
              style={{
                color:
                  isPremium || paymentSubmitted
                    ? colors.foreground
                    : colors.background,
              }}
            >
              {paymentSubmitted
                ? 'Payment Submitted'
                : isPremium
                  ? 'You are Premium'
                  : "I've Made The Transfer"}
            </Text>
          </TouchableOpacity>

          {!isPremium && !paymentSubmitted && (
            <Text
              className="mt-3 px-4 text-center text-xs leading-5"
              style={{ color: colors.muted }}
            >
              Transfer {formatMoney(PREMIUM_PRICE_NGN)} to the account above and tap
              &quot;I&apos;ve Made The Transfer&quot; to submit your payment.
            </Text>
          )}

          {paymentStatus && (
            <View className="mt-4 items-center">
              <Text
                className="text-xs"
                style={{
                  color:
                    paymentStatus === 'verified'
                      ? colors.success
                      : paymentStatus === 'rejected'
                        ? colors.warning
                        : colors.muted,
                }}
              >
                Payment status: {paymentStatus}
              </Text>
            </View>
          )}

          {paymentError && (
            <View
              className="mt-4 rounded-xl px-4 py-3"
              style={{ backgroundColor: colors.card }}
            >
              <Text
                className="text-center text-xs"
                style={{ color: colors.warning }}
              >
                {paymentError}
              </Text>
            </View>
          )}
        </ScrollView>
      </SafeAreaView>

      <Modal
        visible={showPaymentModal}
        transparent
        animationType="fade"
        onRequestClose={closePaymentModal}
      >
        <KeyboardAvoidingView
          className="flex-1"
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        >
          <View className="flex-1 items-center justify-center bg-black/70 px-5">
            <View
              className="w-full max-w-md rounded-2xl p-6"
              style={{ backgroundColor: colors.card }}
            >
              <View className="mb-6 flex-row items-center justify-between">
                <View>
                  <Text
                    className="text-xl font-bold"
                    style={{ color: colors.foreground }}
                  >
                    Submit Payment
                  </Text>

                  <Text
                    className="mt-1 text-xs"
                    style={{ color: colors.muted }}
                  >
                    Confirm your {formatMoney(PREMIUM_PRICE_NGN)} transfer
                  </Text>
                </View>

                <TouchableOpacity
                  onPress={closePaymentModal}
                  className="h-9 w-9 items-center justify-center rounded-lg"
                  style={{
                    backgroundColor: colors.background,
                  }}
                >
                  <Ionicons
                    name="close"
                    size={20}
                    color={colors.foreground}
                  />
                </TouchableOpacity>
              </View>

              <View
                className="mb-5 rounded-2xl p-4"
                style={{ backgroundColor: colors.background }}
              >
                <View className="mb-3 flex-row items-center justify-between">
                  <Text
                    className="text-xs"
                    style={{ color: colors.muted }}
                  >
                    Amount
                  </Text>

                  <Text
                    className="text-base font-bold"
                    style={{ color: colors.accent }}
                  >
                    {formatMoney(PREMIUM_PRICE_NGN)}
                  </Text>
                </View>

                <View className="flex-row items-center justify-between">
                  <Text
                    className="text-xs"
                    style={{ color: colors.muted }}
                  >
                    Account
                  </Text>

                  <Text
                    className="text-xs font-semibold"
                    style={{ color: colors.foreground }}
                  >
                    9038910070
                  </Text>
                </View>
              </View>

              <Text
                className="mb-2 text-sm font-semibold"
                style={{ color: colors.foreground }}
              >
                Payment Reference
              </Text>

              <TextInput
                value={paymentReference}
                onChangeText={setPaymentReference}
                placeholder="Enter your Opay transaction reference"
                placeholderTextColor={colors.muted}
                autoCapitalize="characters"
                className="mb-3 rounded-xl px-4 py-4 text-sm"
                style={{
                  backgroundColor: colors.background,
                  color: colors.foreground,
                  borderWidth: 1,
                  borderColor: colors.border,
                }}
              />

              <Text
                className="mb-5 text-xs leading-5"
                style={{ color: colors.muted }}
              >
                Enter the transaction reference shown after
                completing your transfer. An admin will verify
                your payment before Premium is activated.
              </Text>

              {paymentError && (
                <View
                  className="mb-4 rounded-xl px-4 py-3"
                  style={{
                    backgroundColor: colors.background,
                    borderWidth: 1,
                    borderColor: colors.warning,
                  }}
                >
                  <Text
                    className="text-center text-xs"
                    style={{ color: colors.warning }}
                  >
                    {paymentError}
                  </Text>
                </View>
              )}

              <AnimatedActionButton
                title="Submit Payment"
                loadingTitle="Submitting..."
                onPress={handleSubmitPayment}
                disabled={submitting}
                loading={submitting}
                variant="primary"
                fullWidth={true}
                loadingIconName="refresh"
              />

              <TouchableOpacity
                onPress={closePaymentModal}
                className="mt-3 items-center justify-center py-3"
              >
                <Text
                  className="text-sm font-semibold"
                  style={{ color: colors.muted }}
                >
                  Cancel
                </Text>
              </TouchableOpacity>
            </View>
          </View>
        </KeyboardAvoidingView>
      </Modal>

      <Modal
        visible={showPremiumInfo}
        transparent
        animationType="fade"
        onRequestClose={() => setShowPremiumInfo(false)}
      >
        <View className="flex-1 items-center justify-center bg-black/70 px-5">
          <View
            className="w-full max-w-md items-center rounded-2xl p-7"
            style={{ backgroundColor: colors.card }}
          >
            <View
              className="mb-5 h-16 w-16 items-center justify-center rounded-full"
              style={{ backgroundColor: colors.accent }}
            >
              <Ionicons
                name="checkmark"
                size={34}
                color={colors.background}
              />
            </View>

            <Text
              className="text-center text-2xl font-bold"
              style={{ color: colors.foreground }}
            >
              Premium Activated
            </Text>

            <Text
              className="mt-2 text-center text-sm leading-5"
              style={{ color: colors.muted }}
            >
              Your payment has been verified and your
              Infinity Premium membership is now active.
            </Text>

            <TouchableOpacity
              onPress={() => setShowPremiumInfo(false)}
              className="mt-6 w-full items-center justify-center rounded-xl py-4"
              style={{ backgroundColor: colors.accent }}
            >
              <Text
                className="text-base font-bold"
                style={{ color: colors.background }}
              >
                Continue
              </Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      {showSuccessAnimation && (
        <Modal
          visible={showSuccessAnimation}
          transparent
          animationType="fade"
          onRequestClose={() => setShowSuccessAnimation(false)}
        >
          <View className="flex-1 items-center justify-center bg-black/50">
            <PaymentSuccessAnimation
              visible={true}
              onComplete={() => setShowSuccessAnimation(false)}
              size={100}
              color={colors.success}
              backgroundColor={colors.success}
            />
          </View>
        </Modal>
      )}

      {showRejectedAnimation && (
        <Modal
          visible={showRejectedAnimation}
          transparent
          animationType="fade"
          onRequestClose={() => setShowRejectedAnimation(false)}
        >
          <View className="flex-1 items-center justify-center bg-black/50">
            <PaymentRejectedAnimation
              visible={true}
              onComplete={() => setShowRejectedAnimation(false)}
              size={100}
              color={colors.danger}
              backgroundColor={colors.danger}
            />
          </View>
        </Modal>
      )}
    </>
  );
}
