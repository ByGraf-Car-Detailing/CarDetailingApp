import { expect, Page } from "@playwright/test";

export async function loginViaEmu(page: Page, email: string, password: string) {
  await page.goto("/");
  const user = await page.evaluate(async ({ email, password }) => {
    const m = await import("/src/services/authService.js");
    const u = await m.loginWithEmailPassword(email, password);
    if (u?.role) localStorage.setItem("userRole", u.role);
    return u;
  }, { email, password });

  expect(user).toBeTruthy();
  await expect(page.locator("#dashboardContainer")).toBeVisible({ timeout: 15000 });
  return user;
}

// crea un utente nel Firebase Auth Emulator (ma NON in allowedUsers)
export async function createAuthEmuUser(email: string, password: string) {
  const r = await fetch("http://127.0.0.1:9099/identitytoolkit.googleapis.com/v1/accounts:signUp?key=fake-key", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, password, returnSecureToken: true })
  });

  if (r.ok) return r.json();

  const body = await r.text();
  if (body.includes("EMAIL_EXISTS")) return null; // ok per test ripetuti/paralleli
  throw new Error("Auth emulator signUp failed: " + body);
}
