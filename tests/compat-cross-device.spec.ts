import { expect, test } from "@playwright/test";
import { loginViaEmu } from "./helpers/auth";

test.describe.configure({ timeout: 60_000 });

async function settleAfterReload(page) {
  const readState = async () =>
    page.evaluate(() => {
      const isVisible = (id) => {
        const el = document.querySelector(id);
        if (!el) return false;
        const style = window.getComputedStyle(el);
        return style.display !== "none" && style.visibility !== "hidden";
      };
      return {
        dashboard: isVisible("#dashboardContainer"),
        appointments: isVisible("#appointmentManageSection"),
        login: isVisible("#loginContainer"),
      };
    });

  const timeoutMs = 20_000;
  const start = Date.now();
  let state = await readState();
  while (!state.dashboard && !state.appointments && !state.login && Date.now() - start < timeoutMs) {
    await page.waitForTimeout(250);
    state = await readState();
  }

  if (!state.dashboard && !state.appointments && !state.login) {
    throw new Error("Reload state not settled: no visible login/dashboard/appointments container.");
  }

  if (state.login) {
    await loginViaEmu(page, "admin@test.local", "Passw0rd!");
    await expect(page.locator("#dashboardContainer")).toBeVisible({ timeout: 15000 });
    return;
  }

  if (state.appointments && !state.dashboard) {
    const backBtn = page.getByRole("button", { name: /Torna alla Dashboard/i }).first();
    if (await backBtn.isVisible()) {
      await backBtn.click();
    }
    await expect(page.locator("#dashboardContainer")).toBeVisible({ timeout: 15000 });
    return;
  }

  await expect(page.locator("#dashboardContainer")).toBeVisible({ timeout: 15000 });
}

test("compat: login, navigation, reload, logout", async ({ page }) => {
  await page.addInitScript(() => localStorage.clear());
  await loginViaEmu(page, "admin@test.local", "Passw0rd!");

  await expect(page.getByTestId("dash-gestione-appuntamenti")).toBeVisible();
  await page.getByTestId("dash-gestione-appuntamenti").click();
  await expect(page.locator("#appointmentManageSection")).toBeVisible({ timeout: 15000 });

  await page.reload();
  await settleAfterReload(page);

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
