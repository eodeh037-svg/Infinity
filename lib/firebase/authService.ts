import {
  getAuth,
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  updateProfile,
  sendPasswordResetEmail,
} from 'firebase/auth';
import { app } from '../firebaseConfig';

const auth = getAuth(app);

export async function signIn(email: string, password: string) {
  await signInWithEmailAndPassword(auth, email.trim(), password);
}

export function resetPassword(email: string) {
  return sendPasswordResetEmail(auth, email.trim());
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
  );

  if (userName.trim()) {
    await updateProfile(credential.user, {
      displayName: userName.trim(),
    });
  }
}

export async function signOut() {
  await auth.signOut();
}

export function getCurrentUser() {
  return auth.currentUser;
}
