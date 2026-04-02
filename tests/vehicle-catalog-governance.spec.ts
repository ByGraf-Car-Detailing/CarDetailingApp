import { expect, test } from "@playwright/test";

async function loginAdmin(page) {
  await page.addInitScript(() => localStorage.clear());
  await page.goto("/");
  const user = await page.evaluate(async () => {
    const m = await import("/src/services/authService.js");
    const u = await m.loginWithEmailPassword("admin@test.local", "Passw0rd!");
    if (u?.role) localStorage.setItem("userRole", u.role);
    return u;
  });
  expect(user).toBeTruthy();
  await expect(page.locator("#dashboardContainer")).toBeVisible({ timeout: 15000 });
}

test("vehicle form: modello solo da catalogo (no Altro/manuale)", async ({ page }) => {
  await loginAdmin(page);

  await page.evaluate(async () => {
    const fs = await import("https://www.gstatic.com/firebasejs/11.9.1/firebase-firestore.js");
    const svc = await import("/src/services/authService.js");

    await fs.setDoc(fs.doc(svc.db, "clients", "test-client-1"), {
      type: "person",
      firstName: "Mario",
      lastName: "Rossi",
      active: true,
    }, { merge: true });

    await fs.setDoc(fs.doc(svc.db, "vehicleMakes", "FERRARI"), {
      name: "Ferrari",
      active: true,
      vehicleType: "car",
    }, { merge: true });

    await fs.setDoc(fs.doc(svc.db, "vehicleModels", "FERRARI_ROMA"), {
      make: "Ferrari",
      name: "Roma",
      source: "manual_override",
    }, { merge: true });
  });

  await page.getByTestId("dash-gestione-veicoli").click();
  await expect(page.locator("#vehicleManageSection")).toBeVisible({ timeout: 15000 });

  await page.click("#showAddVehicleBtn");
  await expect(page.locator("#vehicleFormSection")).toBeVisible({ timeout: 15000 });

  const customerValue = await page.locator("#customerSelect option").nth(1).getAttribute("value");
  expect(customerValue).toBeTruthy();
  await page.selectOption("#customerSelect", customerValue!);
  await page.selectOption("#vehicleTypeSelect", "Automobile");
  await page.selectOption("#makeSelect", "Ferrari");

  await expect(page.locator("#modelSelect")).toBeVisible();
  await expect(page.locator("#modelSelect option[value='__OTHER__']")).toHaveCount(0);
  await expect(page.locator("#modelSelect")).toContainText("Roma");
  await expect(page.locator("#modelManual")).toBeHidden();
});
