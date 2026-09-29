import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test, { after } from 'node:test';
import { initializeApp, deleteApp } from 'firebase/app';
import { initializeTestEnvironment } from '@firebase/rules-unit-testing';
import {
  applyActionCode,
  connectAuthEmulator,
  createUserWithEmailAndPassword,
  getAuth,
  reload,
  sendEmailVerification,
  signInWithEmailAndPassword,
  signOut,
} from 'firebase/auth';
import { connectFirestoreEmulator, getFirestore, doc, getDoc } from 'firebase/firestore';
import { createGuestAccount, repairGuestAccountProfile, SignupSetupError } from '../src/signup.mjs';

const apps = [];
const testPassword = 'long-password-123!';

function emulatorServices(label) {
  const app = initializeApp({
    apiKey: 'demo-api-key',
    authDomain: 'localhost',
    projectId: 'demo-slk-rave-rules',
  }, `signup-${label}-${crypto.randomUUID()}`);
  apps.push(app);
  const auth = getAuth(app);
  connectAuthEmulator(auth, 'http://127.0.0.1:9099', { disableWarnings: true });
  const db = getFirestore(app);
  connectFirestoreEmulator(db, '127.0.0.1', 18080);
  return { auth, db };
}

async function createAccount(services, { email, username }) {
  const { auth, db } = services;
  return createGuestAccount({
    auth,
    db,
    fullName: 'Signup Test User',
    username,
    email,
    password: testPassword,
  });
}

test('valid signup creates an approved Guest profile, verifies email, and can sign in', async () => {
  const services = emulatorServices('valid');
  const suffix = crypto.randomUUID().replaceAll('-', '').slice(0, 12);
  const { credential, profile } = await createAccount(services, {
    email: `valid-${suffix}@example.test`,
    username: `valid_${suffix}`,
  });

  assert.equal(profile.uid, credential.user.uid);
  assert.equal(profile.status, 'approved');
  assert.equal(profile.role, 'guest');
  const privateProfile = await getDoc(doc(services.db, 'users', credential.user.uid));
  assert.equal(privateProfile.exists(), true);
  assert.equal(privateProfile.data().role, 'guest');
  assert.equal(privateProfile.data().status, 'approved');
  await sendEmailVerification(credential.user);
  assert.equal(credential.user.emailVerified, false);

  const codesResponse = await fetch('http://127.0.0.1:9099/emulator/v1/projects/demo-slk-rave-rules/oobCodes');
  assert.equal(codesResponse.ok, true);
  const { oobCodes } = await codesResponse.json();
  const verificationCode = oobCodes.find(code => code.email === credential.user.email && code.requestType === 'VERIFY_EMAIL');
  assert.ok(verificationCode, 'Auth emulator exposes a verification code for the new account');
  await applyActionCode(services.auth, verificationCode.oobCode);
  await reload(credential.user);
  assert.equal(credential.user.emailVerified, true);

  const uid = credential.user.uid;
  await signOut(services.auth);
  const signedIn = await signInWithEmailAndPassword(services.auth, credential.user.email, testPassword);
  assert.equal(signedIn.user.uid, uid);
});

test('a duplicate username rolls back the newly created Auth account', async () => {
  const services = emulatorServices('collision');
  const suffix = crypto.randomUUID().replaceAll('-', '').slice(0, 12);
  const username = `taken_${suffix}`;
  await createAccount(services, { email: `owner-${suffix}@example.test`, username });

  const duplicateEmail = `duplicate-${suffix}@example.test`;
  await assert.rejects(
    createAccount(services, { email: duplicateEmail, username }),
    error => error instanceof SignupSetupError && error.state === 'rolled-back',
  );
  assert.equal(services.auth.currentUser, null);
  await assert.rejects(signInWithEmailAndPassword(services.auth, duplicateEmail, testPassword));
});

test('a failed Auth cleanup routes an orphan into recoverable Guest setup', async () => {
  const services = emulatorServices('cleanup-failure');
  const rules = await readFile(new URL('../firestore.rules', import.meta.url), 'utf8');
  const testEnv = await initializeTestEnvironment({
    projectId: 'demo-slk-rave-rules',
    firestore: { host: '127.0.0.1', port: 18080, rules },
  });
  const suffix = crypto.randomUUID().replaceAll('-', '').slice(0, 12);
  const takenUsername = `taken_${suffix}`;

  try {
    await createAccount(services, { email: `owner-${suffix}@example.test`, username: takenUsername });

    let setupFailure;
    await assert.rejects(
      createGuestAccount({
        ...services,
        fullName: 'Recovered Test User',
        username: takenUsername,
        email: `orphan-${suffix}@example.test`,
        password: testPassword,
        deleteAuthUser: async () => { throw new Error('Injected Auth cleanup failure'); },
      }),
      error => {
        setupFailure = error;
        return error instanceof SignupSetupError && error.state === 'cleanup-failed';
      },
    );

    const orphan = services.auth.currentUser;
    assert.ok(orphan);
    assert.equal(setupFailure.user.uid, orphan.uid);
    let beforeRecovery;
    await testEnv.withSecurityRulesDisabled(async context => {
      const adminDb = context.firestore();
      const [privateProfile, publicProfile] = await Promise.all([
        getDoc(doc(adminDb, 'users', orphan.uid)),
        getDoc(doc(adminDb, 'usersPublic', orphan.uid)),
      ]);
      beforeRecovery = { privateProfile, publicProfile };
    });
    assert.equal(beforeRecovery.privateProfile.exists(), false);
    assert.equal(beforeRecovery.publicProfile.exists(), false);

    const profile = await repairGuestAccountProfile({
      ...services,
      fullName: 'Recovered Test User',
      username: `recovered_${suffix}`,
    });
    let afterRecovery;
    await testEnv.withSecurityRulesDisabled(async context => {
      const adminDb = context.firestore();
      const [privateProfile, publicProfile, username, audit] = await Promise.all([
        getDoc(doc(adminDb, 'users', orphan.uid)),
        getDoc(doc(adminDb, 'usersPublic', orphan.uid)),
        getDoc(doc(adminDb, 'usernames', `recovered_${suffix}`)),
      ]);
      const auditLogId = privateProfile.data().auditLogId;
      const auditSnapshot = await getDoc(doc(adminDb, 'activityLogs', auditLogId));
      afterRecovery = { privateProfile, publicProfile, username, audit: auditSnapshot };
    });

    assert.equal(profile.uid, orphan.uid);
    assert.equal(profile.role, 'guest');
    assert.equal(profile.status, 'approved');
    assert.equal(afterRecovery.privateProfile.exists(), true);
    assert.equal(afterRecovery.publicProfile.exists(), true);
    assert.equal(afterRecovery.privateProfile.data().auditLogId, afterRecovery.publicProfile.data().auditLogId);
    assert.equal(afterRecovery.username.data().uid, orphan.uid);
    assert.equal(afterRecovery.audit.data().action, 'user.signup');
  } finally {
    await testEnv.cleanup();
  }
});

test('an Auth account with no Firestore profile can safely complete Guest setup', async () => {
  const services = emulatorServices('repair');
  const suffix = crypto.randomUUID().replaceAll('-', '').slice(0, 12);
  const user = await createUserWithEmailAndPassword(services.auth, `repair-${suffix}@example.test`, testPassword);

  const profile = await repairGuestAccountProfile({
    ...services,
    fullName: 'Recovered Test User',
    username: `repair_${suffix}`,
  });

  assert.equal(profile.uid, user.user.uid);
  assert.equal(profile.role, 'guest');
  assert.equal(profile.status, 'approved');
  assert.equal((await getDoc(doc(services.db, 'users', user.user.uid))).exists(), true);
});

after(async () => {
  await Promise.all(apps.map(app => deleteApp(app)));
});
