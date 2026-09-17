import {
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  updateProfile,
  sendPasswordResetEmail,
  onAuthStateChanged,
} from 'firebase/auth';
import { doc, setDoc } from 'firebase/firestore';
import { auth, db } from '../firebaseConfig';

let authReady = false
let authReadyResolve: (() => void) | null = null

onAuthStateChanged(auth, (user) => {
  if (user) {
    authReady = true
    if (authReadyResolve) {
      authReadyResolve()
      authReadyResolve = null
    }
  } else {
    authReady = false
  }
})

export function waitForAuth(): Promise<void> {
  if (authReady) return Promise.resolve()
  return new Promise((resolve) => { authReadyResolve = resolve })
}

export async function signIn(email: string, password: string) {
  await signInWithEmailAndPassword(auth, email.trim(), password)
  await waitForAuth()
}

export function resetPassword(email: string) {
  return sendPasswordResetEmail(auth, email.trim())
}

export async function createAccount(
  email: string,
  password: string,
  userName: string
) {
  const credential = await createUserWithEmailAndPassword(
    auth,
    email.trim(),
    password
  )

  const displayName = userName.trim() || credential.user.email?.split('@')[0] || 'Trader'

  if (displayName) {
    await updateProfile(credential.user, { displayName })
  }

  const userId = credential.user.uid
  const userRef = doc(db, 'users', userId)
  await setDoc(userRef, {
    id: userId,
    userId: userId,
    userName: displayName,
    email: credential.user.email || '',
    plan: 'free',
    accountBalance: 0,
    totalPL: 0,
    totalPLPercent: 0,
    totalTrades: 0,
    winCount: 0,
  })
}

export async function signOut() {
  await auth.signOut()
}

export function getCurrentUser() {
  return auth.currentUser
}
