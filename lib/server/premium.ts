import { db } from '../firebaseConfig';
import {
  collection,
  doc,
  addDoc,
  getDoc,
  getDocs,
  query,
  where,
  updateDoc,
  increment,
  serverTimestamp,
} from 'firebase/firestore';

export const FREE_SIGNAL_LIMIT = 5;
export const SIGNAL_WINDOW_MS = 24 * 60 * 60 * 1000;

export type PaymentStatus = 'pending' | 'verified' | 'rejected';

export type Payment = {
  id: string;
  userId: string;
  amount: number;
  currency: string;
  plan: 'monthly';
  method: 'bank_transfer';
  reference: string;
  infinityPaymentId: string;
  status: PaymentStatus;
  createdAt: any;
  updatedAt: any;
  verifiedAt: any | null;
  expiresAt: any | null;
};

export type PremiumEntitlement = {
  active: boolean;
  plan: 'monthly' | null;
  activatedAt: any | null;
  expiresAt: any | null;
  paymentId: string | null;
};

export async function getPremiumEntitlement(
  userId: string
): Promise<PremiumEntitlement> {
  const userRef = doc(db, 'users', userId);
  const userSnap = await getDoc(userRef);

  if (!userSnap.exists()) {
    return {
      active: false,
      plan: null,
      activatedAt: null,
      expiresAt: null,
      paymentId: null,
    };
  }

  const data = userSnap.data();

  const premium = data.premium as {
    active?: boolean;
    plan?: string | null;
    activatedAt?: any;
    expiresAt?: any;
    paymentId?: string | null;
  } | undefined;

  return {
    active: premium?.active === true,
    plan: (premium?.plan as PremiumEntitlement['plan']) || null,
    activatedAt: premium?.activatedAt || null,
    expiresAt: premium?.expiresAt || null,
    paymentId: premium?.paymentId || null,
  };
}

export async function isPremiumUser(userId: string): Promise<boolean> {
  const entitlement = await getPremiumEntitlement(userId);

  if (!entitlement.active) {
    return false;
  }

  if (entitlement.expiresAt) {
    const expiry = expiresToDate(entitlement.expiresAt);

    if (Date.now() > expiry.getTime()) {
      return false;
    }
  }

  return true;
}

export function expiresToDate(expiresAt: any): Date {
  if (!expiresAt) {
    return new Date(0);
  }

  if (typeof expiresAt.toDate === 'function') {
    return expiresAt.toDate();
  }

  if (typeof expiresAt.seconds === 'number') {
    return new Date(expiresAt.seconds * 1000);
  }

  if (typeof expiresAt._seconds === 'number') {
    return new Date(expiresAt._seconds * 1000);
  }

  if (expiresAt instanceof Date) {
    return expiresAt;
  }

  return new Date(String(expiresAt));
}

export async function createPayment(
  userId: string,
  amount: number,
  currency: string,
  plan: string,
  method: string,
  reference: string,
  infinityPaymentId: string
): Promise<string> {
  const paymentsRef = collection(db, 'payments');

  const paymentData = {
    userId,
    amount,
    currency,
    plan,
    method,
    reference,
    infinityPaymentId,
    status: 'pending' as PaymentStatus,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
    verifiedAt: null,
    expiresAt: null,
  };

  const docRef = await addDoc(paymentsRef, paymentData);

  return docRef.id;
}

export async function getUserPayments(
  userId: string,
  limitCount = 50
): Promise<Payment[]> {
  const paymentsRef = collection(db, 'payments');

  const q = query(
    paymentsRef,
    where('userId', '==', userId)
  );

  const snapshot = await getDocs(q);

  const payments = snapshot.docs.map((paymentDoc) => ({
    id: paymentDoc.id,
    ...paymentDoc.data(),
  })) as Payment[];

  payments.sort((a, b) => {
    const aTime = timestampToMillis(a.createdAt);
    const bTime = timestampToMillis(b.createdAt);

    return bTime - aTime;
  });

  return payments.slice(0, limitCount);
}

function timestampToMillis(timestamp: any): number {
  if (!timestamp) {
    return 0;
  }

  if (typeof timestamp.toMillis === 'function') {
    return timestamp.toMillis();
  }

  if (typeof timestamp.toDate === 'function') {
    return timestamp.toDate().getTime();
  }

  if (typeof timestamp.seconds === 'number') {
    return timestamp.seconds * 1000;
  }

  if (typeof timestamp._seconds === 'number') {
    return timestamp._seconds * 1000;
  }

  if (timestamp instanceof Date) {
    return timestamp.getTime();
  }

  return 0;
}

export type SignalLimit = {
  canGenerate: boolean;
  reason?: string;
  used?: number;
  remaining?: number;
  limit?: number;
};

export async function getSignalsUsed(userId: string): Promise<number> {
  const userRef = doc(db, 'users', userId);
  const userSnap = await getDoc(userRef);

  if (!userSnap.exists()) {
    return 0;
  }

  const data = userSnap.data();

  const usage = data.signalUsage as { count?: number; windowStartedAt?: any } | undefined;
  const count = typeof usage?.count === 'number' ? usage.count : 0;

  const startedAt = windowStartMillis(usage?.windowStartedAt);

  if (!startedAt || Date.now() - startedAt >= SIGNAL_WINDOW_MS) {
    return 0;
  }

  return count > 0 ? count : 0;
}

export async function recordSignalGeneration(userId: string): Promise<void> {
  const userRef = doc(db, 'users', userId);
  const userSnap = await getDoc(userRef);

  const now = Date.now();

  const usage = userSnap.exists()
    ? (userSnap.data().signalUsage as { count?: number; windowStartedAt?: any } | undefined)
    : undefined;

  const startedAt = windowStartMillis(usage?.windowStartedAt);
  const inWindow = startedAt > 0 && now - startedAt < SIGNAL_WINDOW_MS;

  if (!inWindow) {
    await updateDoc(userRef, {
      signalUsage: { count: 1, windowStartedAt: now },
    });
  } else {
    await updateDoc(userRef, {
      'signalUsage.count': increment(1),
    });
  }
}

function windowStartMillis(value: any): number {
  if (typeof value === 'number') {
    return value;
  }

  if (value && typeof value.toMillis === 'function') {
    return value.toMillis();
  }

  if (value && typeof value.seconds === 'number') {
    return value.seconds * 1000;
  }

  if (value instanceof Date) {
    return value.getTime();
  }

  return 0;
}

export async function canGenerateSignal(userId: string): Promise<SignalLimit> {
  const isPremium = await isPremiumUser(userId);

  if (isPremium) {
    return {
      canGenerate: true,
      limit: Infinity,
    };
  }

  const used = await getSignalsUsed(userId);
  const remaining = Math.max(0, FREE_SIGNAL_LIMIT - used);

  if (remaining <= 0) {
    return {
      canGenerate: false,
      reason: `You've used all ${FREE_SIGNAL_LIMIT} free signals. Upgrade to Premium for unlimited signals.`,
      used,
      remaining: 0,
      limit: FREE_SIGNAL_LIMIT,
    };
  }

  return {
    canGenerate: true,
    used,
    remaining,
    limit: FREE_SIGNAL_LIMIT,
  };
}
