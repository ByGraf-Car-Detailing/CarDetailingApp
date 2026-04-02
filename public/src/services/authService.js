import {
  GoogleAuthProvider,
  signInWithPopup,
  signInWithEmailAndPassword,
  signOut
} from "https://www.gstatic.com/firebasejs/11.9.1/firebase-auth.js";
import {
  doc,
  getDoc
} from "https://www.gstatic.com/firebasejs/11.9.1/firebase-firestore.js";
import { auth, db } from "./firebaseRuntime.js";

const provider = new GoogleAuthProvider();

async function checkAllowed(user) {
  const email = user?.email;
  if (!email) return null;

  const userRef = doc(db, "allowedUsers", email);
  const userSnap = await getDoc(userRef);

  if (!userSnap.exists()) {
    alert("? Accesso negato: utente non autorizzato.");
    await signOut(auth);
    return null;
  }

  const userData = userSnap.data();
  const displayName =
    (typeof userData.displayName === "string" && userData.displayName.trim()) ||
    user.displayName ||
    email;
  return { name: displayName, email, role: userData.role || "user" };
}

export async function loginWithGoogle() {
  try {
    const result = await signInWithPopup(auth, provider);
    return await checkAllowed(result.user);
  } catch (error) {
    console.error("? Errore login:", error?.message || error);
    alert("Errore durante il login");
    return null;
  }
}

export async function loginWithEmailPassword(email, password) {
  try {
    const result = await signInWithEmailAndPassword(auth, email, password);
    return await checkAllowed(result.user);
  } catch (error) {
    console.error("? Errore login email/password:", error?.message || error);
    alert("Errore durante il login");
    return null;
  }
}

export async function logout() {
  await signOut(auth);
}

export { auth, db };
