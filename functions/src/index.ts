import { onRequest } from 'firebase-functions/v2/https';
import { setGlobalOptions } from 'firebase-functions/v2';
import { HttpError } from './httpError';
import { requireAdminUid } from './auth';
import {
  listAllPayments,
  getPaymentStats,
  verifyPaymentAndActivatePremium,
  rejectPaymentServer,
} from './payments';

setGlobalOptions({ region: 'us-central1', memory: '256MiB', timeoutSeconds: 60, maxInstances: 10 });

function json(res: any, status: number, body: unknown): void {
  res.status(status).json(body);
}


export const adminApi = onRequest({ cors: true }, async (req, res) => {
  const requestId =
    (typeof req.headers['x-request-id'] === 'string' &&
      req.headers['x-request-id']) ||
    Math.random().toString(36).slice(2, 10);

  console.log(`[adminApi] ${req.method} ${req.path} requestId=${requestId}`);

  try {
    const pathIndex = req.path.indexOf('/admin/payments');
    const path = (pathIndex >= 0 ? req.path.slice(pathIndex) : req.path).replace(/\/+$/, '');

    if (req.method === 'GET' && path === '/admin/payments') {
      const uid = await requireAdminUid(req);

      const url = new URL(req.url, 'http://localhost');
      const status = url.searchParams.get('status') || undefined;
      const search = url.searchParams.get('q') || undefined;
      const rawLimit = url.searchParams.get('limit');
      const limitCount = rawLimit
        ? Math.min(Math.max(parseInt(rawLimit, 10) || 200, 1), 500)
        : 200;

      const [payments, stats] = await Promise.all([
        listAllPayments({ status, search, limitCount }),
        getPaymentStats(),
      ]);

      return json(res, 200, {
        success: true,
        payments,
        count: payments.length,
        stats,
        status: status || 'all',
      });
    }

    if (
      (req.method === 'POST' && path === '/admin/payments/verify') ||
      (req.method === 'POST' && path === '/admin/payments/reject')
    ) {
      const uid = await requireAdminUid(req);

      const body = (req.body || {}) as { paymentId?: unknown };
      const paymentId = typeof body === 'object' && body !== null ? body.paymentId : undefined;

      if (typeof paymentId !== 'string' || paymentId.length === 0) {
        return json(res, 400, { error: 'paymentId is required' });
      }

      if (path === '/admin/payments/verify') {
        const result = await verifyPaymentAndActivatePremium(paymentId, uid);
        return json(res, 200, {
          success: true,
          message: 'Payment verified. Premium activated.',
          paymentId: result.paymentId,
          status: result.status,
          expiresAt: result.expiresAt,
        });
      }

      const result = await rejectPaymentServer(paymentId, uid);
      return json(res, 200, {
        success: true,
        message: 'Payment rejected. Premium remains inactive.',
        paymentId: result.paymentId,
        status: result.status,
      });
    }

    return json(res, 404, { error: 'Not found' });
  } catch (error) {
    if (error instanceof HttpError) {
      return json(res, error.status, { error: error.message });
    }

    const err = error as {
      message?: string;
      code?: string;
      details?: string;
      stack?: string;
    };

    console.error(
      `[adminApi] unexpected error requestId=${requestId} method=${req.method} path=${req.path}`,
      JSON.stringify({
        requestId,
        method: req.method,
        path: req.path,
        message: err.message || String(error),
        name: error instanceof Error ? error.name : typeof error,
        code: err.code,
        details: err.details,
        stack: err.stack,
      })
    );

    return json(res, 500, { error: 'Internal server error', requestId });
  }
});