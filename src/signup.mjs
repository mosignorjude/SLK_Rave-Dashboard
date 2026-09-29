import { createUserWithEmailAndPassword, deleteUser, updateProfile } from 'firebase/auth';
import { doc, getDocFromServer, serverTimestamp, writeBatch } from 'firebase/firestore';

export class SignupSetupError extends Error {
  constructor(state, cause, cleanupError, user = null) {
    super('Account setup did not finish.');
    this.name = 'SignupSetupError';
    this.code = 'signup/setup-failed';
    this.state = state;
    this.cause = cause;
    this.cleanupError = cleanupError;
    this.user = user;
  }
}

export async function createGuestAccount({ auth, db, fullName, username, email, password, deleteAuthUser = deleteUser }) {
  const normalizedName = fullName.trim();
  const normalizedUsername = username.trim().toLowerCase();
  const normalizedEmail = email.trim().toLowerCase();
  const credential = await createUserWithEmailAndPassword(auth, normalizedEmail, password);
  const profileRef = doc(db, 'users', credential.user.uid);

  try {
    await updateProfile(credential.user, { displayName: normalizedName });
    const auditId = crypto.randomUUID();
    const batch = writeBatch(db);
    batch.set(doc(db, 'usernames', normalizedUsername), {
      uid: credential.user.uid,
      username: normalizedUsername,
      createdAt: serverTimestamp(),
    });
    batch.set(profileRef, {
      uid: credential.user.uid,
      fullName: normalizedName,
      username: normalizedUsername,
      usernameKey: normalizedUsername,
      email: normalizedEmail,
      role: 'guest',
      status: 'approved',
      auditLogId: auditId,
      createdAt: serverTimestamp(),
    });
    batch.set(doc(db, 'usersPublic', credential.user.uid), {
      uid: credential.user.uid,
      fullName: normalizedName,
      username: normalizedUsername,
      email: normalizedEmail,
      role: 'guest',
      status: 'approved',
      auditLogId: auditId,
      createdAt: serverTimestamp(),
    });
    batch.set(doc(db, 'activityLogs', auditId), {
      actor: normalizedName,
      actorId: credential.user.uid,
      action: 'user.signup',
      label: 'user.signup',
      targetType: 'users',
      targetId: credential.user.uid,
      createdAt: serverTimestamp(),
    });
    await batch.commit();
  } catch (setupError) {
    let profileExists;
    try {
      profileExists = (await getDocFromServer(profileRef)).exists();
    } catch (profileCheckError) {
      throw new SignupSetupError('uncertain', setupError, profileCheckError);
    }

    // A successful atomic batch may have committed even if the client lost its response.
    // Preserve that account instead of deleting its Auth record.
    if (profileExists) {
      return {
        credential,
        profile: { uid: credential.user.uid, fullName: normalizedName, username: normalizedUsername, email: normalizedEmail, role: 'guest', status: 'approved' },
      };
    }

    try {
      await deleteAuthUser(credential.user);
    } catch (cleanupError) {
      throw new SignupSetupError('cleanup-failed', setupError, cleanupError, credential.user);
    }
    throw new SignupSetupError('rolled-back', setupError);
  }

  return {
    credential,
    profile: { uid: credential.user.uid, fullName: normalizedName, username: normalizedUsername, email: normalizedEmail, role: 'guest', status: 'approved' },
  };
}

export async function repairGuestAccountProfile({ auth, db, fullName, username }) {
  const user = auth?.currentUser;
  if (!user || !db) throw new Error('Sign in again before completing account setup.');

  const normalizedName = String(fullName ?? '').trim();
  const normalizedUsername = String(username ?? '').trim().toLowerCase();
  if (normalizedName.length < 2 || normalizedName.length > 100) {
    throw new Error('Enter a name between 2 and 100 characters.');
  }
  if (!/^[a-z0-9_-]{3,24}$/.test(normalizedUsername) || ['admin', 'slkadmin', 'administrator'].includes(normalizedUsername)) {
    throw new Error('Choose a 3–24 character username using letters, numbers, _ or -.');
  }

  const email = String(user.email ?? '').trim().toLowerCase();
  if (!email) throw new Error('The signed-in account has no email address. Contact the administrator.');
  await updateProfile(user, { displayName: normalizedName });

  const auditId = crypto.randomUUID();
  const batch = writeBatch(db);
  batch.set(doc(db, 'usernames', normalizedUsername), {
    uid: user.uid,
    username: normalizedUsername,
    createdAt: serverTimestamp(),
  });
  batch.set(doc(db, 'users', user.uid), {
    uid: user.uid,
    fullName: normalizedName,
    username: normalizedUsername,
    usernameKey: normalizedUsername,
    email,
    role: 'guest',
    status: 'approved',
    auditLogId: auditId,
    createdAt: serverTimestamp(),
  });
  batch.set(doc(db, 'usersPublic', user.uid), {
    uid: user.uid,
    fullName: normalizedName,
    username: normalizedUsername,
    email,
    role: 'guest',
    status: 'approved',
    auditLogId: auditId,
    createdAt: serverTimestamp(),
  });
  batch.set(doc(db, 'activityLogs', auditId), {
    actor: normalizedName,
    actorId: user.uid,
    action: 'user.signup',
    label: 'user.signup',
    targetType: 'users',
    targetId: user.uid,
    createdAt: serverTimestamp(),
  });
  await batch.commit();

  return { uid: user.uid, fullName: normalizedName, username: normalizedUsername, email, role: 'guest', status: 'approved' };
}
