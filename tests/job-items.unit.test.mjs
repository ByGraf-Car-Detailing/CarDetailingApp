import { describe, expect, it } from "vitest";
import {
  buildLegacyFieldsFromJobItems,
  normalizeAppointmentJobItems,
  normalizeJobItem,
} from "../public/src/services/jobItems.js";

describe("jobItems helper", () => {
  it("calcola lineTotal e totale legacy da piu item", () => {
    const items = [
      normalizeJobItem({ jobTypeId: "a", jobTypeData: { description: "A" }, price: 50 }),
      normalizeJobItem({ jobTypeId: "b", jobTypeData: { description: "B" }, price: 30 }),
    ];
    const legacy = buildLegacyFieldsFromJobItems(items);
    expect(legacy.price).toBe(80);
    expect(legacy.jobTypeId).toBe("a");
    expect(legacy.jobTypeData?.description).toBe("A");
    expect(legacy.jobItems).toHaveLength(2);
    expect(legacy.jobItems[0].quantity).toBe(1);
  });

  it("fallback legacy -> jobItems singolo", () => {
    const items = normalizeAppointmentJobItems({
      jobTypeId: "legacy-id",
      jobTypeData: { description: "Legacy" },
      price: 99,
    });
    expect(items).toHaveLength(1);
    expect(items[0].jobTypeId).toBe("legacy-id");
    expect(items[0].lineTotal).toBe(99);
  });
});
