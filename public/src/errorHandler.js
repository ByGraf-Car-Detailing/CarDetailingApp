let handlersInitialized = false;

function asErrorMessage(reason) {
  if (!reason) return "Errore promessa non gestita";
  if (typeof reason === "string") return reason;
  if (typeof reason.message === "string" && reason.message.length > 0) {
    return reason.message;
  }
  return String(reason);
}

export function initGlobalErrorHandling({
  bannerEl,
  hideDelayMs = 15000,
  consoleRef = console,
} = {}) {
  if (handlersInitialized || typeof window === "undefined") return;
  handlersInitialized = true;

  const showBanner = (message) => {
    if (!bannerEl) return;
    bannerEl.style.display = "block";
    bannerEl.textContent = message;
    setTimeout(() => {
      bannerEl.style.display = "none";
    }, hideDelayMs);
  };

  window.addEventListener("error", (event) => {
    const msg = `[JS ERROR] ${event.message || "Errore sconosciuto"} (${event.filename}:${event.lineno})`;
    showBanner(msg);
    consoleRef.error(msg, event.error || "");
  });

  window.addEventListener("unhandledrejection", (event) => {
    const msg = `[JS PROMISE] ${asErrorMessage(event.reason)}`;
    showBanner(msg);
    consoleRef.error(msg, event.reason || "");
  });
}

