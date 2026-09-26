const FRIENDLY: [RegExp, string][] = [
  [/wrong-password|invalid-credential|invalid-login-credentials/i, 'Incorrect email or password.'],
  [/user-not-found/i, 'No account found with this email.'],
  [/email-already-in-use/i, 'An account already exists for this email.'],
  [/weak-password/i, 'Password should be at least 6 characters.'],
  [/invalid-email/i, 'Enter a valid email address.'],
  [/user-disabled/i, 'This account has been disabled.'],
  [/network-request-failed|network error/i, 'Network error. Check your connection and try again.'],
  [/too-many-requests/i, 'Too many attempts. Please wait a moment and try again.'],
];

export function friendlyAuthError(raw: string): string {
  for (const [pattern, message] of FRIENDLY) {
    if (pattern.test(raw)) return message;
  }
  return 'Something went wrong. Please try again.';
}