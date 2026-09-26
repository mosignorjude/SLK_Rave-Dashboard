export class UserFacingError extends Error {
  readonly userFacing = true;
}

export function userFacingError(message: string) {
  return new UserFacingError(message);
}

const firebaseMessages: Record<string, string> = {
  'already-exists': 'A record with those details already exists. Check the form and try again.',
  'auth/email-already-in-use': 'An account already exists for this email. Sign in or reset its password.',
  'auth/invalid-credential': 'Email or password is incorrect.',
  'auth/invalid-email': 'Enter a valid email address.',
  'auth/network-request-failed': 'Connection problem. Check your internet and try again.',
  'auth/operation-not-allowed': 'Account registration is temporarily unavailable. Contact the administrator.',
  'auth/too-many-requests': 'Too many attempts. Wait a while, then try again.',
  'auth/user-disabled': 'This account is disabled. Contact the administrator.',
  'auth/weak-password': 'Choose a stronger password and try again.',
  'deadline-exceeded': 'The request took too long. Check your connection and try again.',
  'failed-precondition': 'This action is unavailable right now. Refresh the page and try again.',
  'not-found': 'That record could not be found. Refresh the page and try again.',
  'permission-denied': 'You don’t have permission to complete that action. Contact the administrator if you think this is a mistake.',
  'resource-exhausted': 'The service is busy. Wait a moment and try again.',
  'unauthenticated': 'Your session has expired. Sign in again and retry.',
  'unavailable': 'The service is temporarily unavailable. Check your connection and try again.',
};

export function notifyError(operation: string, error: unknown, notify: (message: string) => void, fallback = 'Something went wrong. Please try again.') {
  const value = error as { code?: unknown; name?: unknown } | null;
  const code = typeof value?.code === 'string' ? value.code : '';
  const normalizedCode = code.includes('/') ? code : code ? code : '';
  const message = error instanceof UserFacingError
    ? error.message
    : firebaseMessages[normalizedCode] ?? firebaseMessages[normalizedCode.split('/').pop() ?? ''] ?? fallback;

  // Keep diagnostics local and low sensitivity: never log form values, email addresses, or raw server messages.
  console.error('[SLK Rave]', { operation, code: normalizedCode || 'unknown', type: String(value?.name || 'Error') });
  notify(message);
  return message;
}
