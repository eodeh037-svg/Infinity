import { HttpError } from './httpError';
import { initAdmin, getAdminUids } from './admin';

interface HeadersLike {
  headers: {
    authorization?: string;
  };
}

function logError(context: string, error: unknown, extra?: Record<string, any>): void {
  const err = error as {
    message?: string;
    code?: string;
    details?: string;
    stack?: string;
  };
  console.error(
    `[auth] ${context}`,
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


export async function requireAdminUid(req: HeadersLike): Promise<string> {
  const authorizationHeader = req.headers.authorization || '';

  if (!authorizationHeader || !authorizationHeader.startsWith('Bearer ')) {
    logError('requireAdminUid: missing auth header', new Error('Missing authorization header'));
    throw new HttpError(401, 'Missing authorization header');
  }

  const idToken = authorizationHeader.substring('Bearer '.length).trim();

  if (!idToken) {
    logError('requireAdminUid: empty token', new Error('Empty authentication token'));
    throw new HttpError(401, 'Empty authentication token');
  }

  let decoded;
  try {
    decoded = await initAdmin().auth.verifyIdToken(idToken);
  } catch (error) {
    logError('Firebase ID token verification failed', error);
    throw new HttpError(401, 'Invalid or expired Firebase token');
  }

  const uid: string = decoded.uid;
  const admins = getAdminUids();

  if (admins.length === 0 || !admins.includes(uid)) {
    logError('requireAdminUid: forbidden', new Error('Forbidden - not an admin'), { uid });
    throw new HttpError(403, 'Forbidden - not an admin');
  }

  return uid;
}