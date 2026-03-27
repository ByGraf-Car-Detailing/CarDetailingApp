import { loginWithGoogle } from "./services/authService.js";
import {
  signOut,
  onAuthStateChanged,
} from "https://www.gstatic.com/firebasejs/11.9.1/firebase-auth.js";
import {
  doc,
  getDoc,
} from "https://www.gstatic.com/firebasejs/11.9.1/firebase-firestore.js";

let initialized = false;

function clearSession({ includeCurrentView }) {
  localStorage.removeItem("userRole");
  localStorage.removeItem("userName");
  localStorage.removeItem("userEmail");
  if (includeCurrentView) {
    localStorage.removeItem("currentView");
  }
}

export function initSessionManager({
  auth,
  db,
  loginBtn,
  logoutBtn,
  onAuthenticated,
  onLoggedOut,
  onPostAuthCheck,
} = {}) {
  if (initialized) {
    return { unsubscribe: () => {}, teardown: () => {} };
  }
  initialized = true;

  if (!auth || !db) {
    throw new Error("initSessionManager requires auth and db");
  }

  const handleAuthState = async (user) => {
    if (!user) {
      clearSession({ includeCurrentView: false });
      onLoggedOut?.();
      return;
    }

    let userRole = localStorage.getItem("userRole");
    try {
      const userRef = doc(db, "allowedUsers", user.email);
      const userSnap = await getDoc(userRef);
      if (!userSnap.exists()) {
        clearSession({ includeCurrentView: true });
        await signOut(auth);
        onLoggedOut?.();
        return;
      }
      userRole = userSnap.data().role || userRole || "user";
      localStorage.setItem("userRole", userRole);
    } catch (err) {
      console.error("Errore verifica ruolo:", err.message);
      clearSession({ includeCurrentView: true });
      await signOut(auth);
      onLoggedOut?.();
      return;
    }

    const userInfo = {
      name: user.displayName,
      email: user.email,
      role: userRole,
    };

    localStorage.setItem("userName", user.displayName || "");
    localStorage.setItem("userEmail", user.email || "");

    try {
      onAuthenticated?.(userInfo);
      await onPostAuthCheck?.();
    } catch (err) {
      console.error("Errore callback sessionManager:", err);
      throw err;
    }
  };

  const unsubscribe = onAuthStateChanged(auth, handleAuthState);

  const onLoginClick = async () => {
    const userInfo = await loginWithGoogle();
    if (userInfo) {
      localStorage.setItem("userRole", userInfo.role);
      localStorage.setItem("userName", userInfo.name || "");
      localStorage.setItem("userEmail", userInfo.email || "");
    }
  };

  const onLogoutClick = async () => {
    await signOut(auth);
    localStorage.clear();
    location.reload();
  };

  loginBtn?.addEventListener("click", onLoginClick);
  logoutBtn?.addEventListener("click", onLogoutClick);

  const teardown = () => {
    loginBtn?.removeEventListener("click", onLoginClick);
    logoutBtn?.removeEventListener("click", onLogoutClick);
    unsubscribe?.();
    initialized = false;
  };

  return { unsubscribe, teardown };
}
