import { initializeApp } from "https://www.gstatic.com/firebasejs/11.9.1/firebase-app.js";
import {
  getAuth,
  GoogleAuthProvider,
  signInWithPopup,
  signInWithEmailAndPassword,
  signOut,
  connectAuthEmulator
} from "https://www.gstatic.com/firebasejs/11.9.1/firebase-auth.js";
import {
  getFirestore,
  doc,
  getDoc,
  connectFirestoreEmulator
} from "https://www.gstatic.com/firebasejs/11.9.1/firebase-firestore.js";

const firebaseConfig = {
  apiKey: "AIzaSyDrBjfxtshgBskV4KOaUc3lO6VI0ATNG88",
  authDomain: "cardetailingapp-e6c95.firebaseapp.com",
  projectId: "cardetailingapp-e6c95",
  storageBucket: "cardetailingapp-e6c95.firebasestorage.app",
  messagingSenderId: "1066766431776",
  appId: "1:1066766431776:web:80b9d02818baaaef052e45",
  measurementId: "G-26ZKJX6D03"
};

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);

// connect emulators only on localhost, once
const isLocal = location.hostname === "localhost" || location.hostname === "127.0.0.1";
if (isLocal && !window.__EMULATORS_ENABLED__) {
  window.__EMULATORS_ENABLED__ = true;
  connectAuthEmulator(auth, "http://127.0.0.1:9099", { disableWarnings: true });
  connectFirestoreEmulator(db, "127.0.0.1", 8080);
  console.log("[EMULATORS] Auth + Firestore connected");
}

const provider = new GoogleAuthProvider();

async function checkAllowed(user) {
  const email = user?.email;
  if (!email) return null;

  const userRef = doc(db, "allowedUsers", email);
  const userSnap = await getDoc(userRef);

  if (!userSnap.exists()) {
    alert("⛔ Accesso negato: utente non autorizzato.");
    await signOut(auth);
    return null;
  }

  const userData = userSnap.data();
  return { name: user.displayName || email, email, role: userData.role || "user" };
}

export async function loginWithGoogle() {
  try {
    const result = await signInWithPopup(auth, provider);
    return await checkAllowed(result.user);
  } catch (error) {
    console.error("❌ Errore login:", error?.message || error);
    alert("Errore durante il login");
    return null;
  }
}

// ✅ per test su emulator: email/password
export async function loginWithEmailPassword(email, password) {
  try {
    const result = await signInWithEmailAndPassword(auth, email, password);
    return await checkAllowed(result.user);
  } catch (error) {
    console.error("❌ Errore login email/password:", error?.message || error);
    alert("Errore durante il login");
    return null;
  }
}

export async function logout() {
  await signOut(auth);
}

export { auth, db };
