import { test, expect } from "@playwright/test";
import { loginViaEmu } from "./helpers/auth";

test("EB-019: riattivazione cliente inattivo + coerenza filtro inattivi", async ({ page }) => {
  await page.addInitScript(() => localStorage.clear());
  await loginViaEmu(page, "admin@test.local", "Passw0rd!");

  const suffix = Date.now();
  const activeName = `EB019 Active ${suffix}`;
  const inactiveName = `EB019 Inactive ${suffix}`;

  await page.evaluate(async ({ activeName, inactiveName }) => {
    const svc = await import("/src/services/authService.js");
    const fs = await import("https://www.gstatic.com/firebasejs/11.9.1/firebase-firestore.js");

    await fs.addDoc(fs.collection(svc.db, "clients"), {
      type: "company",
      companyName: activeName,
      email: `active.${Date.now()}@test.local`,
      phone: "+41000000001",
      active: true,
      address: { street: "Via Test", number: "1", cap: "6900", city: "Lugano" },
      note: "seed",
    });

    await fs.addDoc(fs.collection(svc.db, "clients"), {
      type: "company",
      companyName: inactiveName,
      email: `inactive.${Date.now()}@test.local`,
      phone: "+41000000002",
      active: false,
      address: { street: "Via Test", number: "2", cap: "6900", city: "Lugano" },
      note: "seed",
    });
  }, { activeName, inactiveName });

  page.on("dialog", async (dialog) => {
    await dialog.accept();
  });

  await page.getByTestId("dash-gestione-clienti").click();
  await expect(page.locator("#clientManageSection")).toBeVisible();

  await expect(page.locator("#clientsList")).toContainText(activeName);
  await expect(page.locator("#clientsList")).not.toContainText(inactiveName);

  await page.locator("#searchIncludeInactive").check();
  await page.locator("#searchClientsBtnManage").click();
  await expect(page.locator("#clientsList")).toContainText(inactiveName);

  await page.locator("#searchEmailManage").fill(`inactive.`);
  await page.locator("#searchClientsBtnManage").click();
  const row = page.locator("#clientsList tbody tr").filter({ hasText: inactiveName }).first();
  await row.locator("button.editBtn").click();

  await expect(page.locator("#editWarningBanner")).toBeVisible();
  await page.locator("#editReactivateClient").check();
  await page.locator("#editClientForm button[type='submit']").click();

  await expect(page.locator("#clientManageSection")).toBeVisible();

  await page.locator("#resetClientsBtnManage").click();
  await expect(page.locator("#clientsList")).toContainText(inactiveName);
});
