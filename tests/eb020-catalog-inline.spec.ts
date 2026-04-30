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

async function seedClientAndCatalog(page, suffix: string) {
  return page.evaluate(async ({ suffix }) => {
    const fs = await import("https://www.gstatic.com/firebasejs/11.9.1/firebase-firestore.js");
    const svc = await import("/src/services/authService.js");
    const db = svc.db;

    const clientId = `eb020_client_${suffix}`;
    await fs.setDoc(fs.doc(db, "clients", clientId), {
      type: "person",
      firstName: "Mario",
      lastName: `EB020_${suffix}`,
      active: true,
      email: `eb020_${suffix}@test.local`,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    }, { merge: true });

    await fs.setDoc(fs.doc(db, "vehicleMakes", "ALFA_ROMEO"), {
      name: "Alfa Romeo",
      active: true,
      vehicleType: "car",
      source: "manual",
      updatedAt: new Date().toISOString(),
    }, { merge: true });

    await fs.setDoc(fs.doc(db, "vehicleModels", "ALFA_ROMEO_GIULIA"), {
      make: "Alfa Romeo",
      name: "Giulia",
      source: "manual",
      updatedAt: new Date().toISOString(),
    }, { merge: true });

    return { clientId };
  }, { suffix });
}

test("EB-020: inline add marca e modello nel form veicolo", async ({ page }) => {
  const suffix = Date.now().toString().slice(-6);
  await loginAdmin(page);
  await seedClientAndCatalog(page, suffix);

  await page.getByTestId("dash-gestione-veicoli").click();
  await expect(page.locator("#vehicleManageSection")).toBeVisible({ timeout: 15000 });
  await page.click("#showAddVehicleBtn");
  await expect(page.locator("#vehicleFormSection")).toBeVisible({ timeout: 15000 });

  const customerValue = await page
    .locator("#customerSelect option")
    .filter({ hasText: `EB020_${suffix}` })
    .first()
    .getAttribute("value");
  expect(customerValue).toBeTruthy();
  await page.selectOption("#customerSelect", customerValue || "");
  await page.selectOption("#vehicleTypeSelect", "Automobile");
  await expect(page.locator("#stepMake")).toBeVisible();
  await expect(page.locator("#makeSelect option[value='__ADD_MAKE__']")).toHaveCount(1);

  const makeName = `InlineBrand${suffix}`;
  page.once("dialog", async (dialog) => {
    expect(dialog.type()).toBe("prompt");
    await dialog.accept(makeName);
  });
  await page.selectOption("#makeSelect", "__ADD_MAKE__");
  await expect(page.locator("#vehicleFormMsg")).toContainText("selezionata", { timeout: 15000 });
  await expect(page.locator("#makeSelect")).toHaveValue(makeName);
  await expect(page.locator("#modelSelect option[value='__ADD_MODEL__']")).toHaveCount(1);

  const modelName = `InlineModel${suffix}`;
  page.once("dialog", async (dialog) => {
    expect(dialog.type()).toBe("prompt");
    await dialog.accept(modelName);
  });
  await page.selectOption("#modelSelect", "__ADD_MODEL__");
  await expect(page.locator("#vehicleFormMsg")).toContainText("selezionato", { timeout: 15000 });
  await expect(page.locator("#modelSelect")).toHaveValue(modelName);
  await expect(page.locator("#stepYear")).toBeVisible();

  // Duplicate flow must not trigger on plain vehicle-type changes; only on explicit add action.
  await page.selectOption("#vehicleTypeSelect", "");
  await page.selectOption("#vehicleTypeSelect", "Automobile");
  await expect(page.locator("#vehicleFormMsg")).toHaveText("");
});
