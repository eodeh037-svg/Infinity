import { Timestamp } from 'firebase-admin/firestore';
import { initAdmin } from './admin';
import { HttpError } from './httpError';

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

const DEFAULT_LIST_LIMIT = 200;

function toIso(value: any): string | null {
  if (!value) return null;
  if (typeof value.toDate === 'function') {
    const date = value.toDate();
    return isNaN(date.getTime()) ? null : date.toISOString();
  }
  if (value.seconds !== undefined) {
    return new Date(value.seconds * 1000).toISOString();
  }
  return String(value);
}

function logError(context: string, error: unknown, extra?: Record<string, any>): void {
  const err = error as {
    message?: string;
    code?: string;
    details?: string;
    stack?: string;
  };
  console.error(
    `[payments] ${context}`,
    JSON.stringify({
      context,
      message: err.message || String(error),
      name: error instanceof Error ? error.name : typeof error,
      code: err.code,
      details: err.details,
      stack: err.stack,
      ...extra,
    })
  );
}


export async function getPaymentStats(): Promise<{
  total: number;
  pending: number;
  verified: number;
  rejected: number;
}> {
  const db = initAdmin().db;
  try {
    const snapshot = await db.collection('payments').get();

    let total = 0;
    let pending = 0;
    let verified = 0;
    let rejected = 0;

    snapshot.forEach((doc) => {
      total++;
      const status = doc.data().status;
      if (status === 'pending') pending++;
      else if (status === 'verified') verified++;
      else if (status === 'rejected') rejected++;
    });

    return { total, pending, verified, rejected };
  } catch (error) {
    logError('getPaymentStats failed', error);
    throw error;
  }
}


export async function listAllPayments(options: {
  status?: string | null;
  search?: string | null;
  limitCount?: number;
}) {
  const db = initAdmin().db;
  const limitCount = options.limitCount ?? DEFAULT_LIST_LIMIT;
  try {
    const snapshot = await db
      .collection('payments')
      .orderBy('createdAt', 'desc')
      .limit(limitCount)
      .get();

    const payments: Payment[] = snapshot.docs.map((v) => {
      const data = v.data() as any;
      return { id: v.id, ...data } as Payment;
    });

    const userIds = Array.from(new Set(payments.map((p) => p.userId).filter(Boolean)));
    const userMap = new Map<string, { name: string; email: string; premium: any }>();

    if (userIds.length > 0) {
      await Promise.all(
        userIds.map(async (userId) => {
          try {
            const userSnap = await db.doc(`users/${userId}`).get();
            if (userSnap.exists) {
              const data = userSnap.data() as any;
              userMap.set(userId, {
                name:
                  data.name ||
                  data.displayName ||
                  data.fullName ||
                  data.userName ||
                  'Unknown User',
                email: data.email || '',
                premium: data.premium ?? null,
              });
            } else {
              userMap.set(userId, { name: 'Unknown User', email: '', premium: null });
            }
          } catch (error) {
            logError(`listAllPayments: failed to fetch user ${userId}`, error);
            userMap.set(userId, { name: 'Unknown User', email: '', premium: null });
          }
        })
      );
    }

    const enriched = payments.map((p) => {
      const user = userMap.get(p.userId) || {
        name: 'Unknown User',
        email: '',
        premium: null,
      };
      return {
        id: p.id,
        userId: p.userId,
        amount: p.amount,
        currency: p.currency,
        plan: p.plan,
        method: p.method,
        reference: p.reference,
        infinityPaymentId: p.infinityPaymentId,
        status: p.status,
        createdAt: toIso(p.createdAt),
        updatedAt: toIso(p.updatedAt),
        verifiedAt: toIso(p.verifiedAt),
        expiresAt: toIso(p.expiresAt),
        userName: user.name,
        userEmail: user.email,
        premium: user.premium
          ? {
              active: user.premium.active === true,
              plan: user.premium.plan || null,
              activatedAt: toIso(user.premium.activatedAt),
              expiresAt: toIso(user.premium.expiresAt),
              paymentId: user.premium.paymentId || null,
            }
          : null,
      };
    });

    let result = enriched;

    const status = options.status;
    if (status && status !== 'all') {
      result = result.filter((p) => p.status === status);
    }

    const search = options.search?.trim().toLowerCase();
    if (search) {
      result = result.filter((p) =>
        [p.userName, p.userEmail, p.reference, p.infinityPaymentId, p.id]
          .filter(Boolean)
          .some((field) => String(field).toLowerCase().includes(search))
      );
    }

    return result;
  } catch (error) {
    logError('listAllPayments failed', error, { status: options.status, search: options.search });
    throw error;
  }
}


export async function verifyPaymentAndActivatePremium(
  paymentId: string,
  adminUid: string
) {
  const db = initAdmin().db;
  const paymentRef = db.doc(`payments/${paymentId}`);
  try {
    const paymentSnap = await paymentRef.get();

    if (!paymentSnap.exists) {
      throw new HttpError(404, 'Payment not found');
    }

    const paymentData = paymentSnap.data() as any;
    const userId = paymentData.userId as string;

    if (paymentData.status !== 'pending') {
      throw new HttpError(400, 'Payment is not in pending status');
    }

    const userRef = db.doc(`users/${userId}`);

    const now = Timestamp.now();
    const expiresAt = Timestamp.fromDate(
      new Date(Date.now() + 30 * 24 * 60 * 60 * 1000)
    );

    console.log(`[payments] verifyPaymentAndActivatePremium start paymentId=${paymentId} adminUid=${adminUid} userId=${userId}`);

    const result = await db.runTransaction(async (t) => {
      const paymentDoc = await t.get(paymentRef);
      const userDoc = await t.get(userRef);

      if (!paymentDoc.exists) {
        throw new HttpError(404, 'Payment not found');
      }

      const data = paymentDoc.data() as any;

      if (data.status !== 'pending') {
        throw new HttpError(400, 'Payment has already been verified or rejected');
      }

      if (!userDoc.exists) {
        throw new HttpError(404, 'User profile not found');
      }

      t.update(paymentRef, {
        status: 'verified' as PaymentStatus,
        verifiedAt: now,
        updatedAt: now,
      });

      t.update(userRef, {
        premium: {
          active: true,
          plan: 'monthly',
          activatedAt: now,
          expiresAt,
          paymentId,
        },
      });

      return {
        paymentId,
        userId: data.userId,
        status: 'verified' as PaymentStatus,
      };
    });

    console.log(`[payments] verifyPaymentAndActivatePremium success paymentId=${paymentId} adminUid=${adminUid} userId=${userId}`);

    return {
      ...result,
      adminUid,
      activatedAt: toIso(now),
      expiresAt: toIso(expiresAt),
    };
  } catch (error) {
    logError('verifyPaymentAndActivatePremium failed', error, { paymentId, adminUid });
    throw error;
  }
}


export async function rejectPaymentServer(paymentId: string, adminUid: string) {
  const db = initAdmin().db;
  const paymentRef = db.doc(`payments/${paymentId}`);
  try {
    const paymentSnap = await paymentRef.get();

    if (!paymentSnap.exists) {
      throw new HttpError(404, 'Payment not found');
    }

    const paymentData = paymentSnap.data() as any;

    if (paymentData.status !== 'pending') {
      throw new HttpError(400, 'Payment is not in pending status');
    }

    console.log(`[payments] rejectPaymentServer start paymentId=${paymentId} adminUid=${adminUid}`);

    await paymentRef.update({
      status: 'rejected' as PaymentStatus,
      updatedAt: Timestamp.now(),
    });

    console.log(`[payments] rejectPaymentServer success paymentId=${paymentId} adminUid=${adminUid}`);

    return { paymentId, status: 'rejected' as PaymentStatus, adminUid };
  } catch (error) {
    logError('rejectPaymentServer failed', error, { paymentId, adminUid });
    throw error;
  }
}