import { test, expect } from "@playwright/test";

test("login admin (emulator) works", async ({ page }) => {
  await page.goto("/");

  // esegue login via modulo già presente
  const user = await page.evaluate(async () => {
    const m = await import("/src/services/authService.js");
    return await m.loginWithEmailPassword("admin@test.local", "Passw0rd!");
  });

  expect(user).toBeTruthy();
  expect(user.role).toBe("admin");
});
