import { loginWithGoogle } from "./services/authService.js";
import {
  signOut,
  onAuthStateChanged,
} from "https://www.gstatic.com/firebasejs/11.9.1/firebase-auth.js";
import {
  doc,
  getDoc,
  setDoc,
} from "https://www.gstatic.com/firebasejs/11.9.1/firebase-firestore.js";
import { resolveOperatorDisplayName } from "./services/operatorIdentity.js";

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
    let storedDisplayName = "";
    try {
      const userRef = doc(db, "allowedUsers", user.email);
      const userSnap = await getDoc(userRef);
      if (!userSnap.exists()) {
        clearSession({ includeCurrentView: true });
        await signOut(auth);
        onLoggedOut?.();
        return;
      }
      const userData = userSnap.data();
      userRole = userData.role || userRole || "user";
      storedDisplayName = typeof userData.displayName === "string" ? userData.displayName.trim() : "";
      localStorage.setItem("userRole", userRole);

      // Best effort metadata sync: fill missing displayName only, never overwrite an existing non-empty value.
      const runtimeDisplayName = (user.displayName || "").trim();
      if (!storedDisplayName && runtimeDisplayName) {
        try {
          await setDoc(userRef, { displayName: runtimeDisplayName }, { merge: true });
          storedDisplayName = runtimeDisplayName;
        } catch (syncErr) {
          console.warn("Impossibile sincronizzare displayName su allowedUsers:", syncErr?.message || syncErr);
        }
      }
    } catch (err) {
      console.error("Errore verifica ruolo:", err.message);
      clearSession({ includeCurrentView: true });
      await signOut(auth);
      onLoggedOut?.();
      return;
    }

    const resolvedName = resolveOperatorDisplayName({
      allowedDisplayName: storedDisplayName,
      authDisplayName: user.displayName || "",
      email: user.email || "",
      operatorId: user.email || "",
    });
    const userInfo = {
      name: resolvedName,
      email: user.email,
      role: userRole,
    };

    localStorage.setItem("userName", resolvedName);
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
