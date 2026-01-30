import { initializeApp } from "https://www.gstatic.com/firebasejs/12.7.0/firebase-app.js";
import { getAuth, GoogleAuthProvider } from "https://www.gstatic.com/firebasejs/12.7.0/firebase-auth.js";
import { getFirestore } from "https://www.gstatic.com/firebasejs/12.7.0/firebase-firestore.js";
import { getStorage } from "https://www.gstatic.com/firebasejs/12.7.0/firebase-storage.js";

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

export function isMobileLike() {
  if (navigator.userAgentData && typeof navigator.userAgentData.mobile === "boolean") {
    return navigator.userAgentData.mobile;
  }
  return /Android|iPhone|iPad|iPod|IEMobile|Opera Mini/i.test(navigator.userAgent);
}
