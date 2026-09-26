import {getApps, initializeApp} from 'firebase/app';
import {connectAuthEmulator, getAuth} from 'firebase/auth';
import {connectFirestoreEmulator, getFirestore} from 'firebase/firestore';

const localHost=['localhost','127.0.0.1','::1','[::1]'].includes(window.location.hostname);
export const localFirebaseMode=import.meta.env.DEV||localHost;
export const useFirebaseEmulators=localHost&&import.meta.env.VITE_USE_EMULATORS==='true';
const useProductionFirebase=!import.meta.env.DEV&&!localHost;
const config = {
  apiKey: useFirebaseEmulators?'demo-api-key':import.meta.env.VITE_FIREBASE_API_KEY,
  authDomain: useFirebaseEmulators?'localhost':import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: useFirebaseEmulators?'demo-slk-rave-local':import.meta.env.VITE_FIREBASE_PROJECT_ID,
  storageBucket: useFirebaseEmulators?'demo-slk-rave-local.appspot.com':import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: useFirebaseEmulators?'123456789000':import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId: useFirebaseEmulators?'1:123456789000:web:local-emulator':import.meta.env.VITE_FIREBASE_APP_ID,
};

// Local Vite and loopback previews are disconnected unless they use isolated emulators.
export const configured = Boolean(config.apiKey && config.projectId) && (useProductionFirebase||useFirebaseEmulators);
export const app = configured ? (getApps()[0] ?? initializeApp(config)) : null;
export const auth = app ? getAuth(app) : null;
export const db = app ? getFirestore(app) : null;

if (app && useFirebaseEmulators) {
  connectAuthEmulator(getAuth(app), 'http://127.0.0.1:9099', {disableWarnings: true});
  connectFirestoreEmulator(getFirestore(app), '127.0.0.1', 8080);
}
