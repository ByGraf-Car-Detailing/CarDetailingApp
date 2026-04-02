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

async function openCatalogSyncAdmin(page) {
  await page.getByTestId("dash-catalog-sync-admin").click();
  await expect(page.locator("#catalogSyncSection")).toBeVisible({ timeout: 15000 });
  await expect(page.locator("#catalogSyncTarget")).toBeVisible({ timeout: 15000 });
  await expect(page.locator("#catalogSyncConfirmation")).toBeVisible({ timeout: 15000 });

  const runtimeTarget = await page.locator("#catalogSyncTarget").inputValue();
  expect(["staging", "prod"]).toContain(runtimeTarget);
}

async function getOverride(page, id) {
  return page.evaluate(async (docId) => {
    const fs = await import("https://www.gstatic.com/firebasejs/11.9.1/firebase-firestore.js");
    const svc = await import("/src/services/authService.js");
    const snap = await fs.getDoc(fs.doc(svc.db, "vehicleMakeOverrides", docId));
    return snap.exists() ? snap.data() : null;
  }, id);
}

async function deleteOverride(page, id) {
  await page.evaluate(async (docId) => {
    const fs = await import("https://www.gstatic.com/firebasejs/11.9.1/firebase-firestore.js");
    const svc = await import("/src/services/authService.js");
    await fs.deleteDoc(fs.doc(svc.db, "vehicleMakeOverrides", docId));
  }, id);
}

test("catalog sync admin: gestione override baseline (disattiva)", async ({ page }) => {
  await loginAdmin(page);
  await openCatalogSyncAdmin(page);

  await page.locator("#brandListContainer button[data-action='configure-baseline'][data-name='Zeekr']").click();
  await expect(page.locator("#brandNameInput")).toBeVisible();
  await page.uncheck("#brandActiveInput");
  await page.click("#saveBrandOverrideBtn");

  await expect.poll(async () => getOverride(page, "ZEEKR"), { timeout: 30000 }).toMatchObject({
    name: "Zeekr",
    active: false,
  });

  // cleanup test state
  await deleteOverride(page, "ZEEKR");
  await expect.poll(async () => getOverride(page, "ZEEKR"), { timeout: 30000 }).toBeNull();
});

test("catalog sync admin: filtro tipo veicolo", async ({ page }) => {
  await loginAdmin(page);
  await openCatalogSyncAdmin(page);

  await page.selectOption("#brandFilterType", "motorcycle");
  await page.click("#refreshBrandListBtn");
  await expect(page.locator("#panelActiveBrands h4").first()).toHaveText("Brand attivi effettivi");
});

test("catalog sync admin: blocca brand custom gia presente in baseline", async ({ page }) => {
  await loginAdmin(page);
  await openCatalogSyncAdmin(page);

  await page.locator("#panelCustomBrand .accordion-header").click();
  await expect(page.locator("#brandNameInput")).toBeVisible();
  await page.fill("#brandNameInput", "Ferrari");
  await page.selectOption("#brandTypeInput", "car");
  await page.click("#saveBrandOverrideBtn");

  const exists = await getOverride(page, "FERRARI");
  expect(exists).toBeNull();
});
