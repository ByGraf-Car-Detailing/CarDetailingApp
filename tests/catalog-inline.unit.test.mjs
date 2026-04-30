import { describe, expect, it } from "vitest";
import {
  isAuthorizedRole,
  normalizeModelKey,
  normalizeModelName,
  resolveInlineVehicleType,
} from "../public/src/services/catalogInlinePolicy.js";

describe("catalog inline policy", () => {
  it("normalizza nome modello con trim e spazi singoli", () => {
    expect(normalizeModelName("  Serie   3  Touring  ")).toBe("Serie 3 Touring");
  });

  it("calcola model key stabile per marca+modello", () => {
    expect(normalizeModelKey("Alfa Romeo", "Giulia Quadrifoglio")).toBe("ALFA_ROMEO_GIULIA_QUADRIFOGLIO");
  });

  it("risolve vehicle type inline da etichetta UI", () => {
    expect(resolveInlineVehicleType("Motocicletta")).toBe("motorcycle");
    expect(resolveInlineVehicleType("Automobile")).toBe("car");
  });

  it("autorizza solo admin e staff", () => {
    expect(isAuthorizedRole("admin")).toBe(true);
    expect(isAuthorizedRole("staff")).toBe(true);
    expect(isAuthorizedRole("user")).toBe(false);
  });
});
