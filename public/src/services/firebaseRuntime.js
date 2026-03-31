import { initializeApp } from "https://www.gstatic.com/firebasejs/11.9.1/firebase-app.js";
import { connectAuthEmulator, getAuth } from "https://www.gstatic.com/firebasejs/11.9.1/firebase-auth.js";
import { connectFirestoreEmulator, getFirestore } from "https://www.gstatic.com/firebasejs/11.9.1/firebase-firestore.js";

const PROD_FALLBACK_CONFIG = {
  apiKey: "AIzaSyDrBjfxtshgBskV4KOaUc3lO6VI0ATNG88",
  authDomain: "cardetailingapp-e6c95.firebaseapp.com",
  projectId: "cardetailingapp-e6c95",
  storageBucket: "cardetailingapp-e6c95.firebasestorage.app",
  messagingSenderId: "1066766431776",
  appId: "1:1066766431776:web:80b9d02818baaaef052e45",
  measurementId: "G-26ZKJX6D03",
};

async function resolveFirebaseConfig() {
  try {
    const response = await fetch("/__/firebase/init.json", { cache: "no-store" });
    if (!response.ok) throw new Error(`init.json HTTP ${response.status}`);
    const json = await response.json();
    if (json?.projectId) return json;
    throw new Error("init.json missing projectId");
  } catch (error) {
    const isLocal = location.hostname === "localhost" || location.hostname === "127.0.0.1";
    if (isLocal) {
      console.warn("[firebase] using local fallback config:", error?.message || error);
      return PROD_FALLBACK_CONFIG;
    }
    throw new Error(
      `[firebase] runtime config unavailable for hostname '${location.hostname}': ${error?.message || error}`
    );
  }
}

const firebaseConfig = await resolveFirebaseConfig();
const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);

const isLocal = location.hostname === "localhost" || location.hostname === "127.0.0.1";
if (isLocal && !window.__EMULATORS_ENABLED__) {
  window.__EMULATORS_ENABLED__ = true;
  connectAuthEmulator(auth, "http://127.0.0.1:9099", { disableWarnings: true });
  connectFirestoreEmulator(db, "127.0.0.1", 8080);
  console.log("[EMULATORS] Auth + Firestore connected");
}

window.__FIREBASE_PROJECT_ID__ = firebaseConfig.projectId || "";

export { app, auth, db, firebaseConfig };

