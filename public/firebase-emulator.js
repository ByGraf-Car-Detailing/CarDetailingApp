/**
 * Carica questo file PRIMA di ogni uso di Auth/Firestore.
 * Attiva emulatori quando:
 *  - hostname  localhost/127.0.0.1
 *  - oppure window.__USE_EMULATORS__ = true
 */
export function enableFirebaseEmulators(auth, db) {
  const isLocalHost =
    location.hostname === "localhost" || location.hostname === "127.0.0.1";
  const force = Boolean(window.__USE_EMULATORS__);
  if (!isLocalHost && !force) return;

  // Evita doppia inizializzazione (hot reload / import multipli)
  if (window.__EMULATORS_ENABLED__) return;
  window.__EMULATORS_ENABLED__ = true;

  // Firebase v9 modular
  // Import dinamico per non obbligare dipendenze extra qui
  return (async () => {
    const { connectAuthEmulator } = await import("https://www.gstatic.com/firebasejs/11.0.2/firebase-auth.js");
    const { connectFirestoreEmulator } = await import("https://www.gstatic.com/firebasejs/11.0.2/firebase-firestore.js");

    connectAuthEmulator(auth, "http://127.0.0.1:9099", { disableWarnings: true });
    connectFirestoreEmulator(db, "127.0.0.1", 8080);
    console.log("[EMULATORS] Auth + Firestore connected");
  })();
}
