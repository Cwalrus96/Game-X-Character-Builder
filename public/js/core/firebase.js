import { initializeApp } from "/vendor/firebase/firebase-app.js";
import {
  connectAuthEmulator,
  getAuth,
  GoogleAuthProvider,
} from "/vendor/firebase/firebase-auth.js";
import {
  connectFirestoreEmulator,
  getFirestore,
} from "/vendor/firebase/firebase-firestore.js";
import {
  connectStorageEmulator,
  getStorage,
} from "/vendor/firebase/firebase-storage.js";

// NOTE: Client-side Firebase config is required by the SDK and is not a secret.
const firebaseConfig = {
  apiKey: "AIzaSyC1rGZVKmr3kdNLSGvh0eHDg78TKv1xptg",
  authDomain: "game-x-character-builder.firebaseapp.com",
  projectId: "game-x-character-builder",
  storageBucket: "game-x-character-builder.firebasestorage.app",
  messagingSenderId: "994625181702",
  appId: "1:994625181702:web:866737d8164124ae4b0b87",
  measurementId: "G-HBDTGGWY3R",
};

// Helps redirect fallback on web.app/custom domains by keeping auth helpers same-domain.
firebaseConfig.authDomain = window.location.hostname;

export const firebaseApp = initializeApp(firebaseConfig);
export const auth = getAuth(firebaseApp);
export const db = getFirestore(firebaseApp);
export const storage = getStorage(firebaseApp);
export const googleProvider = new GoogleAuthProvider();

const localHostnames = new Set(["localhost", "127.0.0.1", "::1", "[::1]"]);
export const usingFirebaseEmulators = localHostnames.has(window.location.hostname);

if (usingFirebaseEmulators) {
  connectAuthEmulator(auth, "http://127.0.0.1:9099", { disableWarnings: true });
  connectFirestoreEmulator(db, "127.0.0.1", 8080);
  connectStorageEmulator(storage, "127.0.0.1", 9199);
  console.info("Using local Firebase emulators for Auth, Firestore, and Storage.");
}

export function isMobileLike() {
  if (navigator.userAgentData && typeof navigator.userAgentData.mobile === "boolean") {
    return navigator.userAgentData.mobile;
  }
  return /Android|iPhone|iPad|iPod|IEMobile|Opera Mini/i.test(navigator.userAgent);
}
