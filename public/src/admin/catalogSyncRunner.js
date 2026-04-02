import {
  collection,
  doc,
  getDoc,
  getDocs,
  query,
  runTransaction,
  serverTimestamp,
  setDoc,
  Timestamp,
  updateDoc,
  where,
  addDoc,
  deleteDoc,
} from "https://www.gstatic.com/firebasejs/11.9.1/firebase-firestore.js";
import { auth, db } from "../services/authService.js";
import { majorBrandsPolicy } from "./majorBrandsPolicy.js";
import {
  buildBaselineRegistry,
  normalizeBrandKey,
  normalizeBrandName,
  normalizeOverrideId,
  normalizeVehicleType,
} from "./brandNormalization.js";
import {
  applyPlanChunked,
  planMajorMakes,
  planMajorMakesUpserts,
  planModelsForActiveMakes,
} from "./catalogSyncEngine.js";

const NHTSA_API = "https://vpic.nhtsa.dot.gov/api/vehicles";
const OVERRIDE_COLLECTION = "vehicleMakeOverrides";
const TARGET_TO_PROJECT = {
  staging: "cardetailingapp-e6c95-staging",
  prod: "cardetailingapp-e6c95",
};
const PROD_CATALOG_SYNC_ENABLED = window.__ENABLE_PROD_CATALOG_SYNC__ === true;

const LOCK_TTL_MS = 10 * 60 * 1000;

function addToPolicySet(policySet, vehicleType, brandName) {
  if (vehicleType === "car" || vehicleType === "both") policySet.cars.add(brandName);
  if (vehicleType === "motorcycle" || vehicleType === "both") policySet.motorcycles.add(brandName);
}

function removeFromPolicySet(policySet, vehicleType, brandName) {
  if (vehicleType === "car" || vehicleType === "both") policySet.cars.delete(brandName);
  if (vehicleType === "motorcycle" || vehicleType === "both") policySet.motorcycles.delete(brandName);
}

function normalizeOverrideDoc(raw) {
  const name = normalizeBrandName(raw?.name);
  const id = String(raw?.id || "");
  const source = raw?.source;
  const origin = raw?.origin || (source === "manual_override" ? "custom" : "baseline");
  const active = raw?.active === false ? false : true;
  const vehicleType = normalizeVehicleType(raw?.vehicleType);
  return { ...raw, id, name, origin, active, vehicleType };
}

function collectOverrideConflicts(basePolicy, overrideDocs) {
  const baseline = buildBaselineRegistry(basePolicy);
  const customSeen = new Map();
  const conflicts = [];

  for (const override of overrideDocs.map(normalizeOverrideDoc)) {
    if (!override.name || !override.id) {
      conflicts.push({
        code: "INVALID_OVERRIDE",
        overrideId: override.id || null,
        message: "Override senza id o name valido.",
      });
      continue;
    }

    const normalizedKey = normalizeBrandKey(override.name);
    const normalizedId = normalizeOverrideId(override.name);
    if (override.id !== normalizedId) {
      conflicts.push({
        code: "ID_MISMATCH",
        overrideId: override.id,
        normalizedId,
        name: override.name,
      });
      continue;
    }

    const baselineHit = baseline.byKey.get(normalizedKey);
    if (override.origin === "custom" && baselineHit) {
      conflicts.push({
        code: "CUSTOM_COLLIDES_BASELINE",
        overrideId: override.id,
        name: override.name,
        baselineCanonical: baselineHit.canonicalName,
      });
      continue;
    }

    if (override.origin === "custom") {
      const existing = customSeen.get(normalizedKey);
      if (existing && existing !== override.id) {
        conflicts.push({
          code: "CUSTOM_DUPLICATE",
          overrideId: override.id,
          duplicateOf: existing,
          name: override.name,
        });
        continue;
      }
      customSeen.set(normalizedKey, override.id);
    }
  }

  return conflicts;
}

function composeEffectivePolicy(basePolicy, overrideDocsRaw) {
  const overrideDocs = overrideDocsRaw.map(normalizeOverrideDoc);
  const blockedCollisions = collectOverrideConflicts(basePolicy, overrideDocs);
  const blockedIds = new Set(blockedCollisions.map((item) => item.overrideId).filter(Boolean));
  const policySet = {
    cars: new Set(basePolicy.cars.core || []),
    motorcycles: new Set(basePolicy.motorcycles.core || []),
  };

  let enabledByOverride = 0;
  let disabledByOverride = 0;

  for (const override of overrideDocs) {
    if (blockedIds.has(override.id)) continue;
    const brandName = normalizeBrandName(override?.name);
    if (!brandName) continue;
    const vehicleType = normalizeVehicleType(override?.vehicleType);
    if (override?.active !== true && override?.active !== false) continue;
    const isActive = override.active === true;
    if (isActive) {
      addToPolicySet(policySet, vehicleType, brandName);
      enabledByOverride += 1;
    } else {
      removeFromPolicySet(policySet, vehicleType, brandName);
      disabledByOverride += 1;
    }
  }

  return {
    policy: {
      ...basePolicy,
      cars: { core: Array.from(policySet.cars).sort((a, b) => a.localeCompare(b)) },
      motorcycles: { core: Array.from(policySet.motorcycles).sort((a, b) => a.localeCompare(b)) },
    },
    overrideStats: {
      total: overrideDocs.length,
      enabledByOverride,
      disabledByOverride,
      blockedCollisions,
    },
    normalizedOverrides: overrideDocs,
  };
}

function getActorEmail() {
  return auth.currentUser?.email || null;
}

function assertRuntimeTarget(target) {
  if (target === "prod" && !PROD_CATALOG_SYNC_ENABLED) {
    throw new Error("Catalog sync su prod bloccato da policy. Validare staging e riaprire gate esplicitamente.");
  }
  const currentProjectId = db.app?.options?.projectId;
  const expectedProjectId = TARGET_TO_PROJECT[target];
  if (!expectedProjectId) throw new Error(`Target non supportato: ${target}`);
  if (currentProjectId !== expectedProjectId) {
    throw new Error(
      `Runtime target mismatch: app connessa a '${currentProjectId}', ma target richiesto '${target}' (${expectedProjectId}).`
    );
  }
}

async function fetchJson(url) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`HTTP ${res.status} su ${url}`);
  return res.json();
}

async function fetchMakesForType(type) {
  const data = await fetchJson(`${NHTSA_API}/GetMakesForVehicleType/${type}?format=json`);
  return Array.isArray(data?.Results) ? data.Results : [];
}

async function fetchModelsForMake(makeId, makeName) {
  if (makeId) {
    const data = await fetchJson(`${NHTSA_API}/getmodelsformakeid/${encodeURIComponent(String(makeId))}?format=json`);
    return Array.isArray(data?.Results) ? data.Results : [];
  }
  const data = await fetchJson(`${NHTSA_API}/getmodelsformake/${encodeURIComponent(makeName)}?format=json`);
  return Array.isArray(data?.Results) ? data.Results : [];
}

async function acquireLock(target, jobId, actorEmail) {
  const lockRef = doc(db, "catalogSyncLocks", target);
  await runTransaction(db, async (tx) => {
    const snap = await tx.get(lockRef);
    const now = Timestamp.now();
    const nowMs = now.toMillis();

    if (snap.exists()) {
      const data = snap.data();
      const expiresAt = data?.expiresAt;
      const isStale = !expiresAt || expiresAt.toMillis() <= nowMs;
      const isMine = data?.lockedByEmail === actorEmail;
      if (!isStale && !isMine) throw new Error("LOCK_HELD");
    }

    tx.set(lockRef, {
      target,
      jobId,
      lockedByEmail: actorEmail,
      lockedAt: now,
      expiresAt: Timestamp.fromMillis(nowMs + LOCK_TTL_MS),
      updatedAt: now,
    });
  });
  return lockRef;
}

async function heartbeatLock(target) {
  const lockRef = doc(db, "catalogSyncLocks", target);
  const now = Timestamp.now();
  await updateDoc(lockRef, {
    expiresAt: Timestamp.fromMillis(now.toMillis() + LOCK_TTL_MS),
    updatedAt: serverTimestamp(),
  });
}

async function releaseLock(lockRef) {
  try {
    await deleteDoc(lockRef);
  } catch {
    // best effort
  }
}

async function createJob({ actorEmail, target, mode, maxWrites }) {
  const jobsRef = collection(db, "catalogSyncJobs");
  const jobDoc = await addDoc(jobsRef, {
    actorEmail,
    target,
    mode,
    maxWrites,
    policyVersion: majorBrandsPolicy.version,
    status: "running",
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
    summary: null,
  });
  return jobDoc.id;
}

async function appendJobLog(jobId, actorEmail, level, message, extra = null) {
  await addDoc(collection(db, "catalogSyncJobs", jobId, "logs"), {
    jobId,
    actorEmail,
    level,
    message,
    extra,
    createdAt: serverTimestamp(),
  });
}

async function finishJob(jobId, status, summary) {
  await updateDoc(doc(db, "catalogSyncJobs", jobId), {
    status,
    summary,
    updatedAt: serverTimestamp(),
    finishedAt: serverTimestamp(),
  });
}

async function loadExistingMakesById() {
  const snap = await getDocs(collection(db, "vehicleMakes"));
  const map = new Map();
  for (const d of snap.docs) {
    map.set(d.id, d.data());
  }
  return map;
}

async function loadMakeOverrides() {
  const snap = await getDocs(collection(db, OVERRIDE_COLLECTION));
  return snap.docs.map((d) => ({
    id: d.id,
    ...d.data(),
  }));
}

async function loadActiveMakes() {
  const snap = await getDocs(query(collection(db, "vehicleMakes"), where("active", "==", true)));
  return snap.docs.map((d) => ({
    id: d.id,
    name: d.data()?.name || d.id,
    makeId: d.data()?.makeId ?? null,
  }));
}

async function loadExistingModelsByMake(activeMakes) {
  const byMake = new Map();
  for (const make of activeMakes) {
    const snap = await getDocs(query(collection(db, "vehicleModels"), where("make", "==", make.name)));
    byMake.set(
      make.name,
      new Map(
        snap.docs.map((d) => [d.id, d.data()])
      )
    );
  }
  return byMake;
}

async function applyWriteOperation(op, target) {
  await setDoc(doc(db, op.collection, op.docId), op.data, { merge: true });
  await heartbeatLock(target);
}

async function runMajorMakes(target, maxWrites, jobId, actorEmail) {
  const [carsRaw, motorcyclesRaw, existingById, overrides] = await Promise.all([
    fetchMakesForType("car"),
    fetchMakesForType("motorcycle"),
    loadExistingMakesById(),
    loadMakeOverrides(),
  ]);
  const effective = composeEffectivePolicy(majorBrandsPolicy, overrides);
  if (effective.overrideStats.blockedCollisions.length > 0) {
    const collisionError = new Error("COLLISION_FAIL_CLOSED");
    collisionError.details = effective.overrideStats.blockedCollisions;
    throw collisionError;
  }
  const majorPlan = planMajorMakes(effective.policy, carsRaw, motorcyclesRaw);
  const upsertPlan = planMajorMakesUpserts(existingById, majorPlan.selected, majorBrandsPolicy.version);
  const chunk = await applyPlanChunked(upsertPlan.operations, maxWrites, (op) => applyWriteOperation(op, target));

  const summary = {
    policyVersion: majorBrandsPolicy.version,
    rawCarMakes: carsRaw.length,
    rawMotorcycleMakes: motorcyclesRaw.length,
    selectedMajorMakes: majorPlan.selected.length,
    missingCoreMatches: majorPlan.missingCoreMatches,
    planned: chunk.planned,
    applied: chunk.applied,
    deferred: chunk.deferred,
    skipped: upsertPlan.skipped,
    existingCount: upsertPlan.existingCount,
    overrides: effective.overrideStats,
    blockedCollisions: effective.overrideStats.blockedCollisions,
  };
  await appendJobLog(jobId, actorEmail, "info", "major makes sync completed", summary);
  return summary;
}

async function runModels(target, maxWrites, jobId, actorEmail) {
  const activeMakes = await loadActiveMakes();
  const existingModelsByMake = await loadExistingModelsByMake(activeMakes);
  const modelsByMake = new Map();

  for (const make of activeMakes) {
    const models = await fetchModelsForMake(make.makeId, make.name);
    modelsByMake.set(make.name, models);
  }

  const plan = planModelsForActiveMakes(activeMakes, existingModelsByMake, modelsByMake, majorBrandsPolicy.version);
  const chunk = await applyPlanChunked(plan.operations, maxWrites, (op) => applyWriteOperation(op, target));
  const summary = {
    policyVersion: majorBrandsPolicy.version,
    activeMakesCount: plan.activeMakesCount,
    inspectedModels: plan.inspectedModels,
    planned: chunk.planned,
    applied: chunk.applied,
    deferred: chunk.deferred,
    skipped: plan.skippedNoChange,
    skippedManualConflict: plan.skippedManualConflict,
  };
  await appendJobLog(jobId, actorEmail, "info", "models sync completed", summary);
  return summary;
}

async function runCatalogSync({ target, mode, maxWrites }) {
  const actorEmail = getActorEmail();
  if (!actorEmail) throw new Error("Utente non autenticato.");
  assertRuntimeTarget(target);
  const safeMaxWrites = Math.max(1, Number(maxWrites) || 1);
  const jobId = await createJob({ actorEmail, target, mode, maxWrites: safeMaxWrites });
  const lockRef = await acquireLock(target, jobId, actorEmail);
  await appendJobLog(jobId, actorEmail, "info", "job started", { target, mode, maxWrites: safeMaxWrites });

  try {
    let summary;
    if (mode === "makes") {
      summary = await runMajorMakes(target, safeMaxWrites, jobId, actorEmail);
    } else if (mode === "models") {
      summary = await runModels(target, safeMaxWrites, jobId, actorEmail);
    } else if (mode === "reference") {
      const makes = await runMajorMakes(target, safeMaxWrites, jobId, actorEmail);
      const models = await runModels(target, safeMaxWrites, jobId, actorEmail);
      summary = { policyVersion: majorBrandsPolicy.version, makes, models };
    } else {
      throw new Error(`Mode non supportata: ${mode}`);
    }

    await finishJob(jobId, "done", summary);
    return { jobId, status: "done", summary };
  } catch (error) {
    const message = error?.message || String(error);
    const details = error?.details || null;
    await appendJobLog(jobId, actorEmail, "error", message, details);
    await finishJob(jobId, "failed", { error: message, blockedCollisions: details });
    throw error;
  } finally {
    await releaseLock(lockRef);
  }
}

async function getCatalogJob(jobId) {
  const snap = await getDoc(doc(db, "catalogSyncJobs", jobId));
  if (!snap.exists()) return null;
  return { id: snap.id, ...snap.data() };
}

async function getEffectivePolicyPreview() {
  const overrides = await loadMakeOverrides();
  const effective = composeEffectivePolicy(majorBrandsPolicy, overrides);
  const registry = buildBaselineRegistry(majorBrandsPolicy);
  const cars = new Set(effective.policy.cars.core || []);
  const motorcycles = new Set(effective.policy.motorcycles.core || []);
  const names = Array.from(new Set([...cars, ...motorcycles])).sort((a, b) => a.localeCompare(b));

  const activeBrands = names.map((name) => {
    const inCars = cars.has(name);
    const inMotorcycles = motorcycles.has(name);
    return {
      name,
      vehicleType: inCars && inMotorcycles ? "both" : inCars ? "car" : "motorcycle",
    };
  });

  return {
    policyVersion: majorBrandsPolicy.version,
    overrideStats: effective.overrideStats,
    activeBrands,
    baselineCanonical: registry.canonical,
    baselineKeys: Array.from(registry.byKey.keys()),
  };
}

export {
  getCatalogJob,
  getEffectivePolicyPreview,
  normalizeBrandName,
  normalizeOverrideId,
  normalizeVehicleType,
  runCatalogSync,
};
