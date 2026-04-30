import { normalizeBrandName, normalizeOverrideId, normalizeVehicleType } from "../admin/brandNormalization.js";

const ALLOWED_ROLES = new Set(["admin", "staff"]);

function normalizeModelName(value) {
  return String(value || "").trim().replace(/\s+/g, " ");
}

function normalizeModelKey(makeName, modelName) {
  return normalizeOverrideId(`${normalizeBrandName(makeName)}_${normalizeModelName(modelName)}`);
}

function resolveInlineVehicleType(rawVehicleType) {
  const value = String(rawVehicleType || "").trim().toLowerCase();
  if (value.includes("moto")) return "motorcycle";
  return "car";
}

function isAuthorizedRole(role) {
  return ALLOWED_ROLES.has(String(role || "").trim().toLowerCase());
}

export {
  isAuthorizedRole,
  normalizeModelKey,
  normalizeModelName,
  normalizeVehicleType,
  resolveInlineVehicleType,
};
