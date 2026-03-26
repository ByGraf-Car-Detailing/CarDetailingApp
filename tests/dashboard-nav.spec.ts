import { test, expect } from "@playwright/test";

async function login(page, email, password) {
  await page.addInitScript(() => localStorage.clear());
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

test("staff: dashboard buttons expected", async ({ page }) => {
  await login(page, "staff@test.local", "Passw0rd!");
  await expect(page.getByTestId("dash-gestione-appuntamenti")).toBeVisible();
  await expect(page.getByTestId("dash-nuovo-appuntamento")).toBeVisible();
  await expect(page.getByTestId("dash-gestione-veicoli")).toBeVisible();
  await expect(page.getByTestId("dash-gestione-clienti")).toHaveCount(0);
});

test("admin: dashboard buttons -> correct sections", async ({ page }) => {
  test.setTimeout(120000);

  await login(page, "admin@test.local", "Passw0rd!");

  const cases = [
    { btn: "dash-gestione-appuntamenti", section: "#appointmentManageSection", back: "#backToDashboardAppointmentsBtn" },
    { btn: "dash-nuovo-appuntamento",   section: "#appointmentFormSection",   back: "#backToDashboardAppointmentBtn" },
    { btn: "dash-gestione-veicoli",     section: "#vehicleManageSection",     back: "#backToDashboardVehiclesBtn" },
    { btn: "dash-gestione-clienti",     section: "#clientManageSection",      back: "#backToDashboardClientsBtn" },
  ];

  for (const c of cases) {
    await page.getByTestId(c.btn).click();
    await expect(page.locator(c.section)).toBeVisible({ timeout: 15000 });
    await page.locator(c.back).click();
    await expect(page.locator("#dashboardContainer")).toBeVisible({ timeout: 15000 });
  }
});
