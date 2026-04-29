import { test, expect } from "@playwright/test";
import { loginViaEmu } from "./helpers/auth";

test("EB-022: jobItems multi-service + fallback legacy in gestione appuntamenti", async ({ page }) => {
  await page.addInitScript(() => localStorage.clear());
  await loginViaEmu(page, "admin@test.local", "Passw0rd!");

  const suffix = Date.now();
  const multiName = `EB022 Multi ${suffix}`;
  const legacyName = `EB022 Legacy ${suffix}`;

  const seeded = await page.evaluate(async ({ multiName, legacyName, suffix }) => {
    const svc = await import("/src/services/authService.js");
    const fs = await import("https://www.gstatic.com/firebasejs/11.9.1/firebase-firestore.js");
    const db = svc.db;
    const now = new Date();
    const plus = (minutes: number) => new Date(now.getTime() + minutes * 60000).toISOString();

    const clientMultiRef = await fs.addDoc(fs.collection(db, "clients"), {
      type: "company",
      companyName: multiName,
      email: `multi.${suffix}@test.local`,
      phone: "+41000000111",
      active: true,
    });
    const clientLegacyRef = await fs.addDoc(fs.collection(db, "clients"), {
      type: "company",
      companyName: legacyName,
      email: `legacy.${suffix}@test.local`,
      phone: "+41000000112",
      active: true,
    });
    const carMultiRef = await fs.addDoc(fs.collection(db, "cars"), {
      customerId: clientMultiRef.id,
      brand: "BMW",
      model: "X1",
      licensePlate: `EB${suffix}`.slice(0, 8),
      chassisNumber: `CH${suffix}`,
      active: true,
    });
    const carLegacyRef = await fs.addDoc(fs.collection(db, "cars"), {
      customerId: clientLegacyRef.id,
      brand: "Audi",
      model: "A3",
      licensePlate: `LG${suffix}`.slice(0, 8),
      chassisNumber: `CL${suffix}`,
      active: true,
    });

    const jobTypeARef = fs.doc(db, "jobTypes", `eb022_a_${suffix}`);
    const jobTypeBRef = fs.doc(db, "jobTypes", `eb022_b_${suffix}`);
    await fs.setDoc(jobTypeARef, { description: "Lavaggio Premium", defaultPrice: 100 });
    await fs.setDoc(jobTypeBRef, { description: "Interni Dettaglio", defaultPrice: 80 });

    const multiRef = await fs.addDoc(fs.collection(db, "appointments"), {
      customerId: clientMultiRef.id,
      customerData: { type: "company", companyName: multiName },
      customerType: "company",
      contactPersonId: null,
      contactPersonData: null,
      vehicleId: carMultiRef.id,
      vehicleData: { brand: "BMW", model: "X1", licensePlate: `EB${suffix}`.slice(0, 8), chassisNumber: `CH${suffix}` },
      location: "Lugano",
      operatorId: "admin@test.local",
      operatorData: { operatorId: "admin@test.local", displayName: "Admin" },
      jobItems: [
        { jobTypeId: jobTypeARef.id, jobTypeData: { description: "Lavaggio Premium", defaultPrice: 100 }, price: 100, lineTotal: 100 },
        { jobTypeId: jobTypeBRef.id, jobTypeData: { description: "Interni Dettaglio", defaultPrice: 80 }, price: 160, lineTotal: 160 },
      ],
      jobTypeId: jobTypeARef.id,
      jobTypeData: { description: "Lavaggio Premium", defaultPrice: 100 },
      price: 260,
      noteInternal: "seed-multi",
      status: "programmato",
      startReception: plus(0),
      endReception: plus(30),
      startWork: plus(40),
      endWork: plus(180),
      startDelivery: plus(190),
      endDelivery: plus(220),
      createdBy: "admin@test.local",
      createdAt: fs.serverTimestamp(),
      updatedAt: fs.serverTimestamp(),
      history: [],
      deleted: false,
    });

    const legacyRef = await fs.addDoc(fs.collection(db, "appointments"), {
      customerId: clientLegacyRef.id,
      customerData: { type: "company", companyName: legacyName },
      customerType: "company",
      contactPersonId: null,
      contactPersonData: null,
      vehicleId: carLegacyRef.id,
      vehicleData: { brand: "Audi", model: "A3", licensePlate: `LG${suffix}`.slice(0, 8), chassisNumber: `CL${suffix}` },
      location: "Lugano",
      operatorId: "admin@test.local",
      operatorData: { operatorId: "admin@test.local", displayName: "Admin" },
      jobTypeId: jobTypeARef.id,
      jobTypeData: { description: "Lavaggio Premium", defaultPrice: 100 },
      price: 100,
      noteInternal: "seed-legacy",
      status: "programmato",
      startReception: plus(0),
      endReception: plus(30),
      startWork: plus(40),
      endWork: plus(180),
      startDelivery: plus(190),
      endDelivery: plus(220),
      createdBy: "admin@test.local",
      createdAt: fs.serverTimestamp(),
      updatedAt: fs.serverTimestamp(),
      history: [],
      deleted: false,
    });
    return { multiId: multiRef.id, legacyId: legacyRef.id, jobTypeB: jobTypeBRef.id };
  }, { multiName, legacyName, suffix });

  page.on("dialog", async (dialog) => dialog.accept());
  await page.getByTestId("dash-gestione-appuntamenti").click();
  await expect(page.locator("#appointmentManageSection")).toBeVisible();
  await expect(page.locator("#appointmentsList")).toContainText(multiName);
  await expect(page.locator("#appointmentsList")).toContainText(legacyName);

  await page.locator("#filterJobType").selectOption(seeded.jobTypeB);
  await page.locator("#searchAppointmentsBtn").click();
  await expect(page.locator("#appointmentsList")).toContainText(multiName);
  await expect(page.locator("#appointmentsList")).not.toContainText(legacyName);

  const multiRow = page.locator("#appointmentsList tbody tr").filter({ hasText: multiName }).first();
  await multiRow.locator("button.viewBtn").click();
  await expect(page.locator(".client-view-modal")).toContainText("Lavaggio Premium");
  await expect(page.locator(".client-view-modal")).toContainText("Totale");
  await page.keyboard.press("Escape");

  await page.locator("#resetAppointmentsBtn").click();
  const legacyRow = page.locator("#appointmentsList tbody tr").filter({ hasText: legacyName }).first();
  await legacyRow.locator("button.editBtn").click();
  await expect(page.locator("#appointmentEditForm")).toBeVisible();
  await page.locator("#editNoteInternal").fill("legacy promoted");
  await page.locator("#appointmentEditForm button[type='submit']").click();
  await expect(page.locator("#appointmentManageSection")).toBeVisible();

  const promoted = await page.evaluate(async ({ legacyId }) => {
    const svc = await import("/src/services/authService.js");
    const fs = await import("https://www.gstatic.com/firebasejs/11.9.1/firebase-firestore.js");
    const snap = await fs.getDoc(fs.doc(svc.db, "appointments", legacyId));
    const data = snap.data();
    return {
      jobItemsLen: Array.isArray(data?.jobItems) ? data.jobItems.length : 0,
      legacyPrice: data?.price || 0,
      firstJobType: data?.jobTypeId || "",
    };
  }, { legacyId: seeded.legacyId });

  expect(promoted.jobItemsLen).toBe(1);
  expect(promoted.legacyPrice).toBeGreaterThanOrEqual(0);
  expect(promoted.firstJobType).toBeTruthy();
});
