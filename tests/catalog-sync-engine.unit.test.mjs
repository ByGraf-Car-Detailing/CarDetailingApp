import { describe, expect, it } from "vitest";
import { planMajorMakesUpserts } from "../public/src/admin/catalogSyncEngine.js";

describe("catalog sync engine - major makes upserts", () => {
  it("non disattiva brand custom manual_override fuori policy major", () => {
    const existing = new Map([
      ["DR", { name: "DR", active: true, source: "manual_override", origin: "custom" }],
      ["BENTLEY", { name: "Bentley", active: true, source: "NHTSA_MAJOR_POLICY", origin: "baseline" }],
    ]);
    const selected = [
      { canonicalName: "Bentley", vehicleType: "car", makeId: 1, makeIdCar: 1, makeIdMotorcycle: null, nhtsaNameCar: "Bentley", nhtsaNameMotorcycle: null },
    ];

    const plan = planMajorMakesUpserts(existing, selected, "v-test");
    const drDeactivate = plan.operations.find((op) => op.docId === "DR" && op.data?.active === false);
    expect(drDeactivate).toBeUndefined();
  });
});

