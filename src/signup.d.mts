import type { Auth, User, UserCredential } from 'firebase/auth';
import type { Firestore } from 'firebase/firestore';
import type { Person } from './types';

export type SignupSetupState = 'uncertain' | 'cleanup-failed' | 'rolled-back';

export class SignupSetupError extends Error {
  readonly code: 'signup/setup-failed';
  readonly state: SignupSetupState;
  readonly cause: unknown;
  readonly cleanupError: unknown;
  readonly user: User | null;
}

export function createGuestAccount(input: {
  auth: Auth;
  db: Firestore;
  fullName: string;
  username: string;
  email: string;
  password: string;
  /** Override Auth cleanup for controlled failure-path tests. */
  deleteAuthUser?: (user: User) => Promise<void>;
}): Promise<{ credential: UserCredential; profile: Person }>;

export function repairGuestAccountProfile(input: {
  auth: Auth;
  db: Firestore;
  fullName: string;
  username: string;
}): Promise<Person>;
