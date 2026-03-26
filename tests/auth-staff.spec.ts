import { test, expect } from "@playwright/test";

test("login staff (emulator) then logout", async ({ page }) => {
  await page.goto("/");

  // verifica che il bottone login esista (selettore stabile)
  await expect(page.getByTestId("login-google")).toBeVisible();

  // login via emulator
  const user = await page.evaluate(async () => {
    const m = await import("/src/services/authService.js");
    return await m.loginWithEmailPassword("staff@test.local", "Passw0rd!");
  });

  expect(user).toBeTruthy();
  expect(user.role).toBe("staff");

  // logout button presente
  await expect(page.getByTestId("logout")).toBeVisible();
});
