import {
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  updateProfile,
  sendPasswordResetEmail,
  onAuthStateChanged,
} from 'firebase/auth'
import { doc, setDoc } from 'firebase/firestore'
import { auth, db } from '../firebaseConfig'

let authInitialized = false
let authInitResolve: (() => void) | null = null

onAuthStateChanged(auth, () => {
  if (!authInitialized) {
    authInitialized = true
    authInitResolve?.()
    authInitResolve = null
  }
})

export function waitForAuth(): Promise<void> {
  if (authInitialized) {
    return Promise.resolve()
  }

  return new Promise((resolve) => {
    authInitResolve = resolve
  })
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
  try {
    const credential = await createUserWithEmailAndPassword(
      auth,
      email.trim(),
      password
    )

    console.log('AUTH ACCOUNT CREATED:', credential.user.uid)

    const displayName =
      userName.trim() ||
      credential.user.email?.split('@')[0] ||
      'Trader'

    await updateProfile(credential.user, {
      displayName,
    })

    console.log('PROFILE UPDATED')

    const userId = credential.user.uid

    const userData = {
      id: userId,
      userId,
      userName: displayName,
      email: credential.user.email || email.trim(),
      plan: 'free',
      accountBalance: 0,
      totalPL: 0,
      totalPLPercent: 0,
      totalTrades: 0,
      winCount: 0,
    }

    console.log('WRITING USER DOCUMENT:', userId)

    await setDoc(
      doc(db, 'users', userId),
      userData
    )

    console.log('USER DOCUMENT CREATED')

    return credential.user
  } catch (error) {
    console.error('CREATE ACCOUNT FAILED:', error)
    throw error
  }
}
export async function signOut() {
  await auth.signOut()
}

export function getCurrentUser() {
  return auth.currentUser
}
