import { expect, test } from "@playwright/test";
import { loginViaEmu } from "./helpers/auth";

test.describe.configure({ timeout: 60_000 });

test("compat: login, navigation, reload, logout", async ({ page }) => {
  await page.addInitScript(() => localStorage.clear());
  await loginViaEmu(page, "admin@test.local", "Passw0rd!");

  await expect(page.getByTestId("dash-gestione-appuntamenti")).toBeVisible();
  await page.getByTestId("dash-gestione-appuntamenti").click();
  await expect(page.locator("#appointmentManageSection")).toBeVisible({ timeout: 15000 });

  await page.reload();
  await expect(page.locator("#dashboardContainer")).toBeVisible({ timeout: 15000 });

  await page.getByTestId("logout").click();
  await expect(page.getByTestId("login-google")).toBeVisible({ timeout: 15000 });
});

test("compat: mobile-safe form controls render", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByTestId("login-google")).toBeVisible();

  const phoneInput = page.locator("#phoneNumber");
  await expect(phoneInput).toHaveAttribute("inputmode", "numeric");

  const dateFilter = page.locator("#filterDate");
  await expect(dateFilter).toHaveAttribute("type", "date");
});
