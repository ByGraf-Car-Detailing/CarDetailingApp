import { test, expect } from "@playwright/test";
import { loginViaEmu } from "./helpers/auth";

test("SPA: reload resets to dashboard (admin)", async ({ page }) => {
  await page.addInitScript(() => localStorage.clear());
  await loginViaEmu(page, "admin@test.local", "Passw0rd!");

  const cases = [
    { btn: "dash-gestione-appuntamenti", section: "#appointmentManageSection" },
    { btn: "dash-nuovo-appuntamento", section: "#appointmentFormSection" },
    { btn: "dash-gestione-veicoli", section: "#vehicleManageSection" },
    { btn: "dash-gestione-clienti", section: "#clientManageSection" },
  ];

  for (const c of cases) {
    await page.getByTestId(c.btn).click();
    await expect(page.locator(c.section)).toBeVisible({ timeout: 15000 });
    await page.reload();
    await expect(page.locator("#dashboardContainer")).toBeVisible({ timeout: 15000 });
  }
});
