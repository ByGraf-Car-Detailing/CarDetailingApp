import { test, expect } from "@playwright/test";
import { createAuthEmuUser } from "./helpers/auth";

test("auth: user not in allowedUsers is denied and stays on login", async ({ page }, testInfo) => {
  await page.addInitScript(() => localStorage.clear());

  // email unico per evitare EMAIL_EXISTS tra project/worker
  const uniq = `${testInfo.project.name}-${testInfo.parallelIndex}-${Date.now()}-${Math.random().toString(16).slice(2)}`;
  const email = `blocked+${uniq}@test.local`;
  const password = "Passw0rd!";

  await createAuthEmuUser(email, password);

  await page.goto("/");

  // tenta login (bypass UI) e poi valida lo stato finale UI (deny => login visibile, logout non visibile)
  await page.evaluate(async ({ email, password }) => {
    const m = await import("/src/services/authService.js");
    await m.loginWithEmailPassword(email, password);
  }, { email, password });

  await expect(page.getByTestId("login-google")).toBeVisible({ timeout: 15000 });
  await expect(page.getByTestId("logout")).toBeHidden({ timeout: 15000 });
  await expect(page.locator("#dashboardContainer")).toBeHidden({ timeout: 15000 });
});
