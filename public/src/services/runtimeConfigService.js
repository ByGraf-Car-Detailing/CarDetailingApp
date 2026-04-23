import {
  doc,
  getDoc,
  serverTimestamp,
  setDoc,
} from "https://www.gstatic.com/firebasejs/11.9.1/firebase-firestore.js";
import { resolveOperatorAuditName } from "./operatorIdentity.js";

const RUNTIME_COLLECTION = "runtimeConfig";
const APPOINTMENT_LOCATIONS_DOC = "appointmentLocations";
const DEFAULT_APPOINTMENT_LOCATIONS = ["Lugano Centro", "Lugano Stampa"];

let appointmentLocationsCache = null;
let fallbackWarningIssued = false;

function warnFallback(message) {
  if (fallbackWarningIssued) return;
  fallbackWarningIssued = true;
  console.warn(`[runtime-config] ${message} Using fallback appointment locations.`);
}

function sanitizeLocationList(value) {
  if (!Array.isArray(value)) return [];
  const seen = new Set();
  const normalized = [];
  for (const item of value) {
    if (typeof item !== "string") continue;
    const clean = item.trim();
    if (!clean) continue;
    const key = clean.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    normalized.push(clean);
  }
  return normalized;
}

function ensureLegacyLocation(locations, legacyLocation) {
  const legacy = typeof legacyLocation === "string" ? legacyLocation.trim() : "";
  if (!legacy) return locations;
  const exists = locations.some((entry) => entry.toLowerCase() === legacy.toLowerCase());
  if (exists) return locations;
  return [legacy, ...locations];
}

function fallbackLocations() {
  return [...DEFAULT_APPOINTMENT_LOCATIONS];
}

async function readAppointmentLocationsConfig(db) {
  const ref = doc(db, RUNTIME_COLLECTION, APPOINTMENT_LOCATIONS_DOC);
  const snap = await getDoc(ref);
  if (!snap.exists()) return null;

  const raw = snap.data() || {};
  const locations = sanitizeLocationList(raw.locations);
  const enabled = raw.enabled !== false;
  const version = Number.isInteger(raw.version) ? raw.version : 1;
  return { ...raw, locations, enabled, version };
}

export async function getAppointmentLocations({ db, includeLegacyLocation = "" } = {}) {
  if (!db) throw new Error("getAppointmentLocations requires a Firestore db instance.");
  if (appointmentLocationsCache) {
    return ensureLegacyLocation([...appointmentLocationsCache], includeLegacyLocation);
  }

  try {
    const config = await readAppointmentLocationsConfig(db);
    if (!config) {
      warnFallback("Document runtimeConfig/appointmentLocations not found.");
      appointmentLocationsCache = fallbackLocations();
      return ensureLegacyLocation([...appointmentLocationsCache], includeLegacyLocation);
    }
    if (!config.enabled) {
      warnFallback("Document runtimeConfig/appointmentLocations is disabled.");
      appointmentLocationsCache = fallbackLocations();
      return ensureLegacyLocation([...appointmentLocationsCache], includeLegacyLocation);
    }
    if (config.locations.length === 0) {
      warnFallback("Document runtimeConfig/appointmentLocations has no valid locations.");
      appointmentLocationsCache = fallbackLocations();
      return ensureLegacyLocation([...appointmentLocationsCache], includeLegacyLocation);
    }
    appointmentLocationsCache = [...config.locations];
    return ensureLegacyLocation([...appointmentLocationsCache], includeLegacyLocation);
  } catch (error) {
    warnFallback(`Failed to read runtimeConfig/appointmentLocations: ${error?.message || error}`);
    appointmentLocationsCache = fallbackLocations();
    return ensureLegacyLocation([...appointmentLocationsCache], includeLegacyLocation);
  }
}

export async function saveAppointmentLocations({
  db,
  locations,
  actorEmail = "unknown",
  actorName = "",
  previousVersion = 0,
  enabled = true,
} = {}) {
  if (!db) throw new Error("saveAppointmentLocations requires a Firestore db instance.");
  const sanitized = sanitizeLocationList(locations);
  if (sanitized.length === 0) {
    throw new Error("Appointment locations list cannot be empty.");
  }
  const version = Math.max(Number(previousVersion) || 0, 0) + 1;
  const payload = {
    locations: sanitized,
    enabled: enabled !== false,
    version,
    updatedAt: serverTimestamp(),
    updatedBy: actorEmail || "unknown",
    updatedByName: resolveOperatorAuditName({ updatedByName: actorName }),
  };
  await setDoc(doc(db, RUNTIME_COLLECTION, APPOINTMENT_LOCATIONS_DOC), payload, { merge: true });
  appointmentLocationsCache = [...sanitized];
  return payload;
}

export function resetRuntimeConfigCache() {
  appointmentLocationsCache = null;
  fallbackWarningIssued = false;
}

export {
  APPOINTMENT_LOCATIONS_DOC,
  DEFAULT_APPOINTMENT_LOCATIONS,
  RUNTIME_COLLECTION,
  ensureLegacyLocation,
  sanitizeLocationList,
};

