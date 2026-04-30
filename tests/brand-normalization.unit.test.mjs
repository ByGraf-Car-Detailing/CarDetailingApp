import { describe, expect, it } from "vitest";
import { normalizeBrandName } from "../public/src/admin/brandNormalization.js";

describe("brand normalization", () => {
  it("normalizza casing display per brand manuali", () => {
    expect(normalizeBrandName("  dr ")).toBe("DR");
    expect(normalizeBrandName("alfa   romeo")).toBe("Alfa Romeo");
    expect(normalizeBrandName("harley-davidson")).toBe("Harley-Davidson");
    expect(normalizeBrandName("bMw")).toBe("BMW");
  });
});

