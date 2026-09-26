import { getApps, initializeApp } from 'firebase-admin/app';
import { getAuth, Auth } from 'firebase-admin/auth';
import { getFirestore, Firestore } from 'firebase-admin/firestore';

let envLogged = false;

function logEnvironment(): void {
  if (envLogged) return;
  envLogged = true;

  const config = (() => {
    try {
      return process.env.FIREBASE_CONFIG
        ? JSON.parse(process.env.FIREBASE_CONFIG)
        : null;
    } catch {
      return null;
    }
  })();

  const project =
    config?.projectId ||
    process.env.GCLOUD_PROJECT ||
    process.env.GOOGLE_CLOUD_PROJECT ||
    '(unknown)';

  const isEmulator = [
    'FIREBASE_FUNCTIONS_EMULATOR',
    'FUNCTIONS_EMULATOR',
    'FIRESTORE_EMULATOR_HOST',
    'FIREBASE_AUTH_EMULATOR_HOST',
    'FIREBASE_DATABASE_EMULATOR_HOST',
  ].some((key) => Boolean(process.env[key]));

  console.log(
    `[adminApi init] runtime=${isEmulator ? 'emulator' : 'production'} project=${project} credentials=${process.env.GOOGLE_APPLICATION_CREDENTIALS ? 'from-file' : 'runtime-service-account'} firestoreEmulator=${process.env.FIRESTORE_EMULATOR_HOST || 'off'} firestoreProjectId=${getFirestoreProjectId()}`
  );
}

function getFirestoreProjectId(): string {
  if (process.env.FIRESTORE_EMULATOR_HOST) {
    return '(local emulator)';
  }
  try {
    return JSON.parse(process.env.FIREBASE_CONFIG || '{}').projectId || '(from credentials)';
  } catch {
    return '(from credentials)';
  }
}


export function initAdmin(): { auth: Auth; db: Firestore } {
  logEnvironment();
  if (getApps().length === 0) {
    initializeApp();
  }
  return { auth: getAuth(), db: getFirestore() };
}


export function getAdminUids(): string[] {
  return (process.env.ADMIN_UIDS || '')
    .split(',')
    .map((s: string) => s.trim())
    .filter(Boolean);
}