import {
  View,
  Text,
  Pressable,
  ActivityIndicator,
  ScrollView,
  Modal,
  TextInput,
  useWindowDimensions,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useState, useEffect, useCallback, useRef } from 'react';
import { useTheme } from '../../lib/theme';
import { router } from 'expo-router';
import { getAuth } from 'firebase/auth';
import { Ionicons } from '@expo/vector-icons';
import { PaymentSuccessAnimation } from '../../components/PaymentSuccessAnimation';
import { PaymentRejectedAnimation } from '../../components/PaymentRejectedAnimation';
import { AnimatedActionButton } from '../../components/AnimatedActionButton';
import { formatMoney } from '../../component/ui/money';
import { PREMIUM_PRICE_NGN } from '../../component/ui/constants';

type Status = 'pending' | 'verified' | 'rejected';

type PaymentItem = {
  id: string;
  userId: string;
  amount: number;
  currency: string;
  plan: 'monthly';
  method: string;
  reference: string;
  infinityPaymentId: string;
  status: Status;
  createdAt: string | null;
  updatedAt: string | null;
  verifiedAt: string | null;
  expiresAt: string | null;
  userName: string;
  userEmail: string;
  premium: {
    active: boolean;
    plan: 'monthly' | null;
    activatedAt: string | null;
    expiresAt: string | null;
    paymentId: string | null;
  } | null;
};

type Stats = {
  total: number;
  pending: number;
  verified: number;
  rejected: number;
};

type Filter = Status | 'all';

type AdminPaymentsResponse = {
  success?: boolean;
  payments?: PaymentItem[];
  count?: number;
  stats?: Stats;
  status?: string;
  error?: string;
};

const ADMIN_API_BASE = (
  process.env.EXPO_PUBLIC_ADMIN_API_URL || ''
).replace(/\/+$/, '');

const FILTERS: { key: Filter; label: string }[] = [
  { key: 'all', label: 'All' },
  { key: 'pending', label: 'Pending' },
  { key: 'verified', label: 'Verified' },
  { key: 'rejected', label: 'Rejected' },
];

const EMPTY_MESSAGES: Record<Filter, string> = {
  all: 'No payment records yet.',
  pending: 'No pending payments.',
  verified: 'No verified payments yet.',
  rejected: 'No rejected payments.',
};

const ZERO_STATS: Stats = {
  total: 0,
  pending: 0,
  verified: 0,
  rejected: 0,
};

const TABLE_COLUMNS = [
  { key: 'id', label: 'ID', width: 76 },
  { key: 'user', label: 'USER', width: 150 },
  { key: 'email', label: 'EMAIL', width: 190 },
  { key: 'plan', label: 'PLAN', width: 80 },
  { key: 'amount', label: 'AMOUNT', width: 92 },
  { key: 'method', label: 'METHOD', width: 110 },
  { key: 'reference', label: 'REFERENCE', width: 130 },
  { key: 'submitted', label: 'SUBMITTED', width: 132 },
  { key: 'status', label: 'STATUS', width: 100 },
  { key: 'actions', label: 'ACTIONS', width: 130 },
];

const TABLE_WIDTH = TABLE_COLUMNS.reduce((sum, column) => sum + column.width, 0);

const naira = (amount?: number) =>
  formatMoney(amount ?? PREMIUM_PRICE_NGN);

const fmtDate = (iso?: string | null) =>
  iso
    ? new Date(iso).toLocaleString(undefined, {
        month: 'short',
        day: 'numeric',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
      })
    : '—';

const methodLabel = (method?: string) =>
  !method || method === 'bank_transfer' ? 'Bank transfer' : method;

const planLabel = (plan?: string) =>
  !plan ? '—' : plan === 'monthly' ? 'Monthly' : plan;

async function getFirebaseIdToken(): Promise<string | null> {
  try {
    const auth = getAuth();
    const user = auth.currentUser;

    if (!user) {
      return null;
    }

    const token = await user.getIdToken(true);

    return token || null;
  } catch (error) {
    console.error('Failed to get Firebase ID token:', error);
    return null;
  }
}

async function parseResponse<T>(response: Response): Promise<T | null> {
  try {
    return (await response.json()) as T;
  } catch {
    return null;
  }
}

export default function AdminPaymentsScreen() {
  const { colors } = useTheme();
  const { width } = useWindowDimensions();

  const [initialLoading, setInitialLoading] = useState(true);
  const [reloading, setReloading] = useState(false);
  const [payments, setPayments] = useState<PaymentItem[]>([]);
  const [stats, setStats] = useState<Stats>(ZERO_STATS);
  const [filter, setFilter] = useState<Filter>('pending');
  const [searchInput, setSearchInput] = useState('');
  const [search, setSearch] = useState('');
  const [banner, setBanner] = useState<{
    kind: 'success' | 'error';
    message: string;
  } | null>(null);

  const [confirm, setConfirm] = useState<{
    kind: 'verify' | 'reject';
    payment: PaymentItem;
  } | null>(null);

  const [detail, setDetail] = useState<PaymentItem | null>(null);

  const [op, setOp] = useState<{
    kind: 'verify' | 'reject';
    id: string;
  } | null>(null);

  const [processingPaymentId, setProcessingPaymentId] = useState<string | null>(null);
  const [showSuccessAnimation, setShowSuccessAnimation] = useState(false);
  const [showRejectedAnimation, setShowRejectedAnimation] = useState(false);

  const seqRef = useRef(0);
  const bannerTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (bannerTimer.current) {
      clearTimeout(bannerTimer.current);
      bannerTimer.current = null;
    }

    if (banner?.kind === 'success') {
      bannerTimer.current = setTimeout(() => {
        setBanner(null);
      }, 4000);
    }

    return () => {
      if (bannerTimer.current) {
        clearTimeout(bannerTimer.current);
        bannerTimer.current = null;
      }
    };
  }, [banner]);

  useEffect(() => {
    const timer = setTimeout(() => {
      setSearch(searchInput.trim());
    }, 400);

    return () => clearTimeout(timer);
  }, [searchInput]);

  const load = useCallback(
    async (opts: { initial?: boolean } = {}) => {
      const isInitial = opts.initial === true;

      if (isInitial) {
        setInitialLoading(true);
      } else {
        setReloading(true);
      }

      const seq = ++seqRef.current;

      try {
        const token = await getFirebaseIdToken();

        if (seq !== seqRef.current) {
          return;
        }

        if (!token) {
          setBanner({
            kind: 'error',
            message: 'Not authenticated. Please log in.',
          });
          setPayments([]);
          setStats(ZERO_STATS);
          return;
        }

        const params = new URLSearchParams();

        if (filter !== 'all') {
          params.set('status', filter);
        }

        if (search) {
          params.set('q', search);
        }

        params.set('limit', '200');

        const endpoint =
          `${ADMIN_API_BASE}/admin/payments?${params.toString()}`;

        const response = await fetch(endpoint, {
          method: 'GET',
          headers: {
            Authorization: `Bearer ${token}`,
            Accept: 'application/json',
          },
        });

        const data =
          await parseResponse<AdminPaymentsResponse>(
            response
          );

        if (seq !== seqRef.current) {
          return;
        }

        if (!response.ok) {
          const message =
            response.status === 401
              ? 'Authentication failed. Please log in again.'
              : response.status === 403
                ? 'Forbidden - not an admin.'
                : data?.error ||
                  `Failed to load payments (${response.status})`;

          setBanner({
            kind: 'error',
            message,
          });

          setPayments([]);
          setStats(ZERO_STATS);
          return;
        }

        setBanner(null);
        setPayments(data?.payments ?? []);
        setStats(data?.stats ?? ZERO_STATS);
      } catch (error) {
        if (seq !== seqRef.current) {
          return;
        }

        console.error(
          'Failed to load admin payments:',
          error
        );

        setBanner({
          kind: 'error',
          message:
            'Could not reach the server. Check your connection and API URL.',
        });
      } finally {
        if (seq === seqRef.current) {
          setInitialLoading(false);
          setReloading(false);
        }
      }
    },
    [filter, search]
  );
  useEffect(() => {
    void load({ initial: true });
  }, [load]);

  const runAction = async (
    kind: 'verify' | 'reject',
    payment: PaymentItem
  ) => {
    const previousPayments = payments;
    const previousStats = stats;

    setOp({
      kind,
      id: payment.id,
    });
    setProcessingPaymentId(payment.id);

    const finish = () => {
      setOp(null);
      setConfirm(null);
      setProcessingPaymentId(null);
    };

    try {
      const token = await getFirebaseIdToken();

      if (!token) {
        setBanner({
          kind: 'error',
          message: 'Not authenticated. Please log in.',
        });
        finish();
        return;
      }

      const baseUrl = ADMIN_API_BASE;

      const response = await fetch(
        `${baseUrl}/admin/payments/${kind}`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Accept: 'application/json',
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify({
            paymentId: payment.id,
          }),
        }
      );

      const data = await parseResponse<{
        success?: boolean;
        error?: string;
        paymentId?: string;
        status?: Status;
      }>(response);

      if (!response.ok) {
        const message =
          response.status === 401
            ? 'Authentication failed. Please log in again.'
            : response.status === 403
              ? 'Forbidden - not an admin.'
              : data?.error ||
                `Failed to ${kind} payment (${response.status})`;

        setBanner({
          kind: 'error',
          message,
        });

        setPayments(previousPayments);
        setStats(previousStats);
        finish();
        return;
      }

      if (kind === 'verify') {
        setShowSuccessAnimation(true);
      } else {
        setShowRejectedAnimation(true);
      }

      setBanner({
        kind: 'success',
        message:
          kind === 'verify'
            ? `Payment verified. Premium activated for ${payment.userName}.`
            : 'Payment rejected. Premium remains inactive.',
      });

      finish();

      await load({
        initial: false,
      });
    } catch (error) {
      console.error(`Failed to ${kind} payment:`, error);

      setBanner({
        kind: 'error',
        message: 'Network error — please try again.',
      });

      setPayments(previousPayments);
      setStats(previousStats);
      finish();
    }
  };

  const showConfirm = (
    kind: 'verify' | 'reject',
    payment: PaymentItem
  ) => {
    setConfirm({
      kind,
      payment,
    });
  };

  const handleBack = () => {
    if (router.canGoBack()) {
      router.back();
    } else {
      router.replace('/(tabs)');
    }
  };

  const busy = !!op;

  const isTable = width >= 900;

  const PADDING = 16;
  const GAP = 8;

  const cardWidth =
    (width -
      PADDING * 2 -
      (isTable ? GAP * 3 : GAP)) /
    (isTable ? 4 : 2);

  const renderStatusBadge = (status: Status) => (
    <View
      className={
        status === 'verified'
          ? 'rounded bg-success px-2 py-0.5'
          : status === 'rejected'
            ? 'rounded bg-danger px-2 py-0.5'
            : 'rounded bg-warning px-2 py-0.5'
      }
      style={{
        alignSelf: 'flex-start',
      }}>
      <Text
        className={`text-[10px] font-bold tracking-wide ${
          status === 'pending'
            ? 'text-black'
            : 'text-white'
        }`}>
        {status.toUpperCase()}
      </Text>
    </View>
  );

  const renderActionButtons = (payment: PaymentItem) => {
    if (payment.status === 'verified') {
      return (
        <Text className="text-xs font-semibold text-success">
          VERIFIED
        </Text>
      );
    }

    if (payment.status === 'rejected') {
      return (
        <Text className="text-xs font-semibold text-danger">
          REJECTED
        </Text>
      );
    }

    const isProcessing = processingPaymentId === payment.id;
    const isVerifying = isProcessing && op?.kind === 'verify';
    const isRejecting = isProcessing && op?.kind === 'reject';

    return (
      <View className="flex-row gap-1.5">
        <AnimatedActionButton
          title="REJECT"
          loadingTitle="REJECTING..."
          onPress={async () => { showConfirm('reject', payment); }}
          disabled={busy || isProcessing}
          loading={isRejecting}
          variant="danger"
          fullWidth={false}
        />
        <AnimatedActionButton
          title="VERIFY"
          loadingTitle="VERIFYING..."
          onPress={async () => { showConfirm('verify', payment); }}
          disabled={busy || isProcessing}
          loading={isVerifying}
          variant="success"
          fullWidth={false}
        />
      </View>
    );
  };

  const renderTable = () => (
    <View className="overflow-hidden rounded-xl border border-soft bg-card">
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator>
        <View
          style={{
            width: TABLE_WIDTH + 24,
          }}>
          <View className="flex-row items-center bg-elevated px-3 py-2">
            {TABLE_COLUMNS.map((column) => (
              <Text
                key={column.key}
                numberOfLines={1}
                className="text-[10px] font-bold tracking-wider text-muted"
                style={{
                  width: column.width,
                  paddingRight: 8,
                }}>
                {column.label}
              </Text>
            ))}
          </View>

          {payments.map((payment) => (
            <Pressable
              key={payment.id}
              onPress={() =>
                setDetail(payment)
              }
              className="flex-row items-center border-t border-soft/50 px-3 py-2.5">
              <Text
                numberOfLines={1}
                className="text-xs font-semibold text-accent"
                style={{
                  width: TABLE_COLUMNS[0].width,
                  paddingRight: 8,
                }}>
                #{payment.id.slice(0, 8)}
              </Text>

              <Text
                numberOfLines={1}
                className="text-xs text-foreground"
                style={{
                  width: TABLE_COLUMNS[1].width,
                  paddingRight: 8,
                }}>
                {payment.userName}
              </Text>

              <Text
                numberOfLines={1}
                className="text-xs text-muted"
                style={{
                  width: TABLE_COLUMNS[2].width,
                  paddingRight: 8,
                }}>
                {payment.userEmail || '—'}
              </Text>

              <Text
                numberOfLines={1}
                className="text-xs text-foreground"
                style={{
                  width: TABLE_COLUMNS[3].width,
                  paddingRight: 8,
                }}>
                {planLabel(payment.plan)}
              </Text>

              <Text
                numberOfLines={1}
                className="text-xs font-semibold text-foreground"
                style={{
                  width: TABLE_COLUMNS[4].width,
                  paddingRight: 8,
                }}>
                {naira(payment.amount)}
              </Text>

              <Text
                numberOfLines={1}
                className="text-xs text-muted"
                style={{
                  width: TABLE_COLUMNS[5].width,
                  paddingRight: 8,
                }}>
                {methodLabel(payment.method)}
              </Text>

              <Text
                numberOfLines={1}
                className="text-xs text-muted"
                style={{
                  width: TABLE_COLUMNS[6].width,
                  paddingRight: 8,
                }}>
                {payment.reference || '—'}
              </Text>

              <Text
                numberOfLines={1}
                className="text-xs text-muted"
                style={{
                  width: TABLE_COLUMNS[7].width,
                  paddingRight: 8,
                }}>
                {fmtDate(payment.createdAt)}
              </Text>

              <View
                style={{
                  width: TABLE_COLUMNS[8].width,
                  paddingRight: 8,
                }}>
                {renderStatusBadge(
                  payment.status
                )}
              </View>

              <View
                style={{
                  width: TABLE_COLUMNS[9].width,
                }}>
                {renderActionButtons(payment)}
              </View>
            </Pressable>
          ))}
        </View>
      </ScrollView>
    </View>
  );

  const renderCard = (payment: PaymentItem) => (
    <Pressable
      key={payment.id}
      onPress={() => setDetail(payment)}
      className="mb-3 rounded-xl bg-card p-4">
      <View className="mb-3 flex-row items-center justify-between">
        <View className="flex-1">
          <Text className="text-xs font-semibold text-accent">
            {payment.infinityPaymentId ||
              `#${payment.id.slice(0, 8)}`}
          </Text>

          <Text className="mt-0.5 text-sm font-semibold text-foreground">
            {payment.userName}
          </Text>

          <Text className="text-xs text-muted">
            {payment.userEmail || '—'}
          </Text>
        </View>

        {renderStatusBadge(
          payment.status
        )}
      </View>

      <View className="flex-row flex-wrap">
        <View className="mb-2 w-[50%]">
          <Text className="text-[10px] uppercase tracking-wider text-muted">
            Amount
          </Text>

          <Text className="text-sm font-bold text-foreground">
            {naira(payment.amount)}
          </Text>
        </View>

        <View className="mb-2 w-[50%]">
          <Text className="text-[10px] uppercase tracking-wider text-muted">
            Plan
          </Text>

          <Text className="text-sm text-foreground">
            {planLabel(payment.plan)}
          </Text>
        </View>

        <View className="mb-2 w-[50%]">
          <Text className="text-[10px] uppercase tracking-wider text-muted">
            Method
          </Text>

          <Text className="text-sm text-foreground">
            {methodLabel(payment.method)}
          </Text>
        </View>

        <View className="mb-2 w-[50%]">
          <Text className="text-[10px] uppercase tracking-wider text-muted">
            Submitted
          </Text>

          <Text className="text-sm text-foreground">
            {fmtDate(payment.createdAt)}
          </Text>
        </View>

        <View className="w-[50%]">
          <Text className="text-[10px] uppercase tracking-wider text-muted">
            Reference
          </Text>

          <Text
            numberOfLines={1}
            className="text-sm text-foreground">
            {payment.reference || '—'}
          </Text>
        </View>

        <View className="w-[50%]">
          <Text className="text-[10px] uppercase tracking-wider text-muted">
            Premium
          </Text>

          <Text
            className={`text-sm font-semibold ${
              payment.premium?.active
                ? 'text-success'
                : 'text-muted'
            }`}>
            {payment.premium?.active
              ? 'Active'
              : 'Inactive'}
          </Text>
        </View>
      </View>

      <View className="mt-3 flex-row items-center justify-end border-t border-soft/50 pt-3">
        {payment.status === 'pending' ? (
          renderActionButtons(payment)
        ) : (
          <Text className="text-xs text-muted">
            {payment.status.charAt(0).toUpperCase() +
              payment.status.slice(1)}
          </Text>
        )}
      </View>
    </Pressable>
  );

  const renderEmptyState = () => {
    const searching =
      search.trim().length > 0;

    return (
      <View className="mt-10 items-center px-4">
        <Ionicons
          name="file-tray-outline"
          size={40}
          color={colors.mutedSoft}
        />

        <Text className="mt-3 text-center text-sm text-muted">
          {searching
            ? `No payments match "${search}".`
            : EMPTY_MESSAGES[filter]}
        </Text>
      </View>
    );
  };

  const renderConfirmModal = () => (
    <Modal
      visible={!!confirm}
      transparent
      animationType="fade"
      onRequestClose={() => {
        if (!busy) {
          setConfirm(null);
        }
      }}>
      <View className="flex-1 items-center justify-center bg-black/70 px-4">
        <View
          className="rounded-2xl bg-card p-5"
          style={{
            width: 430,
            maxWidth: '94%',
          }}>
          <Text className="text-lg font-bold text-foreground">
            {confirm?.kind === 'verify'
              ? 'Verify Payment'
              : 'Reject Payment'}
          </Text>

          <Text className="mt-2 text-sm text-muted">
            {confirm?.kind === 'verify'
              ? `Verify this ${naira(
                  confirm?.payment.amount
                )} payment and activate Premium for ${
                  confirm?.payment.userName
                }?`
              : `Reject this ${naira(
                  confirm?.payment.amount
                )} payment from ${
                  confirm?.payment.userName
                }?`}
          </Text>

          <View className="mt-4 flex-row justify-end gap-2">
            <Pressable
              disabled={busy}
              onPress={() =>
                setConfirm(null)
              }
              className={`rounded-md bg-elevated px-4 py-2.5 ${
                busy ? 'opacity-50' : ''
              }`}>
              <Text className="text-sm font-semibold text-foreground">
                Cancel
              </Text>
            </Pressable>

            <Pressable
              disabled={busy}
              onPress={() => {
                if (confirm) {
                  void runAction(
                    confirm.kind,
                    confirm.payment
                  );
                }
              }}
              className={`rounded-md px-4 py-2.5 ${
                confirm?.kind === 'verify'
                  ? 'bg-success'
                  : 'bg-danger'
              } ${busy ? 'opacity-50' : ''}`}>
              {busy ? (
                <View className="flex-row items-center gap-2">
                  <ActivityIndicator
                    size="small"
                    color="#ffffff"
                  />

                  <Text className="text-sm font-bold text-white">
                    {op?.kind === 'verify'
                      ? 'VERIFYING...'
                      : 'REJECTING...'}
                  </Text>
                </View>
              ) : (
                <Text className="text-sm font-bold text-white">
                  {confirm?.kind === 'verify'
                    ? 'Verify'
                    : 'Reject'}
                </Text>
              )}
            </Pressable>
          </View>
        </View>
      </View>
    </Modal>
  );

  const renderDetailModal = () => (
    <Modal
      visible={!!detail}
      transparent
      animationType="fade"
      onRequestClose={() =>
        setDetail(null)
      }>
      <View className="flex-1 items-center justify-center bg-black/70 px-4">
        <View
          className="rounded-2xl bg-card p-5"
          style={{
            width: 460,
            maxWidth: '94%',
          }}>
          <View className="flex-row items-start justify-between">
            <View className="flex-1">
              <Text className="text-base font-bold text-foreground">
                Payment Details
              </Text>

              <Text className="mt-0.5 text-xs text-accent">
                {detail?.infinityPaymentId ||
                  `#${detail?.id.slice(0, 8)}`}
              </Text>
            </View>

            <View className="flex-row items-center gap-2">
              {detail?.status === 'pending'
                ? renderStatusBadge(
                    detail.status
                  )
                : null}

              <Pressable
                onPress={() =>
                  setDetail(null)
                }
                className="rounded-md bg-elevated p-1.5">
                <Ionicons
                  name="close"
                  size={16}
                  color={colors.foreground}
                />
              </Pressable>
            </View>
          </View>

          <View className="mt-4">
            <InfoRow
              label="User"
              value={
                detail?.userName ||
                'Unknown User'
              }
            />

            <InfoRow
              label="Email"
              value={
                detail?.userEmail || '—'
              }
            />

            <InfoRow
              label="Payment ID"
              value={detail?.id || '—'}
            />

            <InfoRow
              label="Status"
              value={
                detail
                  ? detail.status.toUpperCase()
                  : '—'
              }
            />

            <InfoRow
              label="Amount"
              value={naira(
                detail?.amount
              )}
            />

            <InfoRow
              label="Plan"
              value={planLabel(
                detail?.plan
              )}
            />

            <InfoRow
              label="Method"
              value={methodLabel(
                detail?.method
              )}
            />

            <InfoRow
              label="Reference"
              value={
                detail?.reference || '—'
              }
            />

            <InfoRow
              label="Submitted"
              value={fmtDate(
                detail?.createdAt
              )}
            />

            <InfoRow
              label="Last updated"
              value={fmtDate(
                detail?.updatedAt
              )}
            />

            {detail?.status ===
            'verified' ? (
              <>
                <InfoRow
                  label="Verified at"
                  value={fmtDate(
                    detail.verifiedAt
                  )}
                />

                <InfoRow
                  label="Expires at"
                  value={fmtDate(
                    detail.expiresAt
                  )}
                />
              </>
            ) : null}

            <InfoRow
              label="Premium"
              value={
                detail?.premium?.active
                  ? `Active · expires ${fmtDate(
                      detail.premium
                        .expiresAt
                    )}`
                  : 'Inactive'
              }
            />
          </View>

          {detail?.status ===
          'pending' ? (
            <View className="mt-5 flex-row justify-end gap-2 border-t border-soft/50 pt-4">
              {renderActionButtons(
                detail
              )}
            </View>
          ) : null}
        </View>
      </View>
    </Modal>
  );

  return (
    <SafeAreaView className="flex-1 bg-background">
      <View className="flex-row items-center justify-between border-b border-border bg-card px-4 py-3">
        <View>
          <Text className="text-lg font-bold tracking-wide text-foreground">
            Infinity Admin
          </Text>

          <Text className="text-[11px] text-muted">
            Payment verification
          </Text>
        </View>

        <View className="flex-row items-center gap-2">
          <Pressable
            onPress={() =>
              void load({
                initial:
                  payments.length === 0,
              })
            }
            disabled={
              reloading ||
              initialLoading
            }
            className="flex-row items-center gap-1.5 rounded-md bg-elevated px-3 py-2">
            {reloading ||
            initialLoading ? (
              <ActivityIndicator
                size="small"
                color={colors.accent}
              />
            ) : (
              <Ionicons
                name="refresh"
                size={15}
                color={colors.accent}
              />
            )}

            <Text className="text-xs font-semibold text-accent">
              Refresh
            </Text>
          </Pressable>

          <Pressable
            onPress={handleBack}
            className="flex-row items-center gap-1.5 rounded-md bg-elevated px-3 py-2">
            <Ionicons
              name="arrow-back"
              size={15}
              color={colors.foreground}
            />

            <Text className="text-xs font-semibold text-foreground">
              Back
            </Text>
          </Pressable>
        </View>
      </View>

      <ScrollView
        contentContainerStyle={{
          padding: PADDING,
          paddingBottom: 40,
        }}>
        {banner ? (
          <View
            className={`mb-4 flex-row items-center justify-between rounded-lg px-3 py-2 ${
              banner.kind === 'success'
                ? 'bg-success'
                : 'bg-danger'
            }`}>
            <Text className="flex-1 pr-2 text-xs font-semibold text-white">
              {banner.message}
            </Text>

            <Pressable
              onPress={() =>
                setBanner(null)
              }
              hitSlop={8}>
              <Ionicons
                name="close"
                size={14}
                color="#ffffff"
              />
            </Pressable>
          </View>
        ) : null}

        <View
          className="mb-4 flex-row flex-wrap justify-between"
          style={{
            rowGap: GAP,
          }}>
          <StatCard
            label="Total"
            value={stats.total}
            width={cardWidth}
            highlight={false}
            onPress={() =>
              setFilter('all')
            }
          />

          <StatCard
            label="Pending"
            value={stats.pending}
            width={cardWidth}
            highlight={true}
            onPress={() =>
              setFilter('pending')
            }
          />

          <StatCard
            label="Verified"
            value={stats.verified}
            width={cardWidth}
            highlight={false}
            onPress={() =>
              setFilter('verified')
            }
          />

          <StatCard
            label="Rejected"
            value={stats.rejected}
            width={cardWidth}
            highlight={false}
            onPress={() =>
              setFilter('rejected')
            }
          />
        </View>

        <View className="mb-3 flex-row gap-2">
          {FILTERS.map((item) => {
            const active =
              filter === item.key;

            return (
              <Pressable
                key={item.key}
                onPress={() =>
                  setFilter(item.key)
                }
                className={`flex-1 items-center rounded-lg border py-2 ${
                  active
                    ? 'border-accent/60 bg-accent/15'
                    : 'border-border bg-card'
                }`}>
                <Text
                  className={`text-xs font-semibold ${
                    active
                      ? 'text-accent'
                      : 'text-muted'
                  }`}>
                  {item.label}
                </Text>
              </Pressable>
            );
          })}
        </View>

        <View className="mb-4 flex-row items-center rounded-lg bg-card px-3">
          <Ionicons
            name="search"
            size={15}
            color={colors.muted}
          />

          <TextInput
            value={searchInput}
            onChangeText={
              setSearchInput
            }
            placeholder="Search by name, email, reference or payment ID"
            placeholderTextColor={
              colors.mutedSoft
            }
            className="flex-1 py-2.5 pl-2 text-sm text-foreground"
          />

          {searchInput.length > 0 ? (
            <Pressable
              onPress={() =>
                setSearchInput('')
              }
              hitSlop={8}>
              <Ionicons
                name="close-circle"
                size={16}
                color={colors.muted}
              />
            </Pressable>
          ) : null}
        </View>

        {initialLoading ? (
          <View className="items-center py-16">
            <ActivityIndicator
              size="large"
              color={colors.accent}
            />

            <Text className="mt-3 text-sm text-muted">
              Loading payments...
            </Text>
          </View>
        ) : (
          <>
            {reloading &&
            payments.length > 0 ? (
              <View className="mb-3 flex-row items-center gap-2">
                <ActivityIndicator
                  size="small"
                  color={colors.accent}
                />

                <Text className="text-xs text-muted">
                  Loading payments...
                </Text>
              </View>
            ) : null}

            {payments.length ===
            0 ? (
              renderEmptyState()
            ) : isTable ? (
              renderTable()
            ) : (
              <View>
                {payments.map(
                  renderCard
                )}
              </View>
            )}

            {!search &&
            payments.length > 0 ? (
              <Text className="mt-4 text-center text-[11px] text-muted-soft">
                Showing {payments.length}{' '}
                payment
                {payments.length ===
                1
                  ? ''
                  : 's'}
                {filter !== 'all'
                  ? ` · ${filter}`
                  : ''}
              </Text>
            ) : null}
          </>
        )}
      </ScrollView>

      {renderConfirmModal()}
      {renderDetailModal()}

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
    </SafeAreaView>
  );
}

function StatCard({
  label,
  value,
  width,
  highlight,
  onPress,
}: {
  label: string;
  value: number;
  width: number;
  highlight: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable
      onPress={onPress}
      className={`rounded-xl p-3 ${
        highlight
          ? 'border border-warning bg-warning/10'
          : 'bg-card'
      }`}
      style={{ width }}>
      <Text className="text-[10px] font-bold uppercase tracking-widest text-muted">
        {label}
      </Text>

      <Text
        className={`mt-1 text-2xl font-bold ${
          highlight
            ? 'text-warning'
            : 'text-foreground'
        }`}>
        {value}
      </Text>
    </Pressable>
  );
}

function InfoRow({
  label,
  value,
}: {
  label: string;
  value: string;
}) {
  return (
    <View className="flex-row items-start justify-between border-b border-soft/40 py-2">
      <Text className="text-xs uppercase tracking-wider text-muted">
        {label}
      </Text>

      <Text className="flex-1 pl-4 text-right text-sm text-foreground">
        {value}
      </Text>
    </View>
  );
}
