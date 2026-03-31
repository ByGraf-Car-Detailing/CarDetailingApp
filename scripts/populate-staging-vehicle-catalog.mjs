import fs from "node:fs";
import path from "node:path";
import admin from "firebase-admin";

const PROJECTS = {
  staging: "cardetailingapp-e6c95-staging",
  prod: "cardetailingapp-e6c95",
};

const NHTSA_API = "https://vpic.nhtsa.dot.gov/api/vehicles";
const DEFAULT_MAX_WRITES = 400;
const BATCH_SIZE = 400;
const DEFAULT_POLICY_PATH = path.resolve("scripts/config/major-brands-policy.json");

function normalizeKey(value) {
  return String(value || "")
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, "_")
    .replace(/_+/g, "_")
    .replace(/^_+|_+$/g, "");
}

function normalizeDocId(value) {
  return normalizeKey(value).slice(0, 100);
}

function parseTarget() {
  const target = String(process.env.CATALOG_TARGET || "staging").toLowerCase();
  if (!Object.prototype.hasOwnProperty.call(PROJECTS, target)) {
    throw new Error(`Unsupported CATALOG_TARGET='${target}'. Allowed: ${Object.keys(PROJECTS).join(", ")}`);
  }
  return target;
}

function requiredConfirmationFor(target) {
  return `populate-catalog=${target}-nhtsa-major-v1`;
}

function parseServiceAccount(filePath, expectedProjectId) {
  if (!filePath || !fs.existsSync(filePath)) {
    throw new Error(`Missing service account file: ${filePath}`);
  }
  const json = JSON.parse(fs.readFileSync(filePath, "utf8"));
  if (json.project_id !== expectedProjectId) {
    throw new Error(`Service account project_id mismatch: got '${json.project_id}', expected '${expectedProjectId}'`);
  }
  return json;
}

function loadPolicy(filePath) {
  if (!fs.existsSync(filePath)) {
    throw new Error(`Missing policy file: ${filePath}`);
  }
  const policy = JSON.parse(fs.readFileSync(filePath, "utf8"));
  if (!policy?.version || !Array.isArray(policy?.cars?.core) || !Array.isArray(policy?.motorcycles?.core)) {
    throw new Error("Invalid major brands policy schema.");
  }
  policy.aliasMap = policy.aliasMap || {};
  policy.excludePatterns = Array.isArray(policy.excludePatterns) ? policy.excludePatterns : [];
  return policy;
}

async function fetchJson(url) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`HTTP ${res.status} for ${url}`);
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

function indexMakesByName(makes) {
  const byKey = new Map();
  for (const make of makes) {
    const key = normalizeKey(make?.MakeName);
    if (key && !byKey.has(key)) byKey.set(key, make);
  }
  return byKey;
}

function buildExcludeRegex(patterns) {
  return patterns.map((p) => new RegExp(p, "i"));
}

function isExcluded(value, regexes) {
  return regexes.some((rx) => rx.test(value));
}

function resolveFromIndex(canonicalName, index, aliasMap) {
  const keys = [canonicalName, ...(aliasMap[canonicalName] || [])].map((v) => normalizeKey(v)).filter(Boolean);
  for (const key of keys) {
    const match = index.get(key);
    if (match) return match;
  }
  return null;
}

function buildCoreUniverse(policy) {
  const carSet = new Set(policy.cars.core);
  const motoSet = new Set(policy.motorcycles.core);
  const canonical = Array.from(new Set([...carSet, ...motoSet]));
  return { carSet, motoSet, canonical };
}

function valuesDiffer(a, b) {
  return (a ?? null) !== (b ?? null);
}

async function commitOperations(db, operations) {
  let batch = db.batch();
  let ops = 0;
  for (const op of operations) {
    batch.set(op.ref, op.data, { merge: true });
    ops += 1;
    if (ops === BATCH_SIZE) {
      await batch.commit();
      batch = db.batch();
      ops = 0;
    }
  }
  if (ops > 0) await batch.commit();
}

function planActiveMajorMakes(policy, carMakesRaw, motoMakesRaw) {
  const excludeRegexes = buildExcludeRegex(policy.excludePatterns);
  const carIndex = indexMakesByName(carMakesRaw);
  const motoIndex = indexMakesByName(motoMakesRaw);
  const { carSet, motoSet, canonical } = buildCoreUniverse(policy);
  const selected = [];
  const missing = [];

  for (const canonicalName of canonical) {
    if (isExcluded(canonicalName, excludeRegexes)) continue;
    const inCars = carSet.has(canonicalName);
    const inMotos = motoSet.has(canonicalName);
    const carMatch = inCars ? resolveFromIndex(canonicalName, carIndex, policy.aliasMap) : null;
    const motoMatch = inMotos ? resolveFromIndex(canonicalName, motoIndex, policy.aliasMap) : null;

    if (inCars && !carMatch) {
      missing.push({ canonicalName, expectedType: "car" });
    }
    if (inMotos && !motoMatch) {
      missing.push({ canonicalName, expectedType: "motorcycle" });
    }
    if (!carMatch && !motoMatch) continue;

    selected.push({
      canonicalName,
      vehicleType: inCars && inMotos ? "both" : inCars ? "car" : "motorcycle",
      makeIdCar: carMatch?.MakeId ?? null,
      makeIdMotorcycle: motoMatch?.MakeId ?? null,
      makeId: carMatch?.MakeId ?? motoMatch?.MakeId ?? null,
      nhtsaNameCar: carMatch?.MakeName ?? null,
      nhtsaNameMotorcycle: motoMatch?.MakeName ?? null,
    });
  }

  return { selected, missing };
}

async function planMakesUpserts(db, policyVersion, selectedMakes) {
  const now = new Date().toISOString();
  const existingSnap = await db.collection("vehicleMakes").get();
  const existingById = new Map(existingSnap.docs.map((doc) => [doc.id, doc.data()]));
  const selectedIds = new Set();
  const operations = [];
  let skippedNoChange = 0;
  let deactivated = 0;

  for (const make of selectedMakes) {
    const docId = normalizeDocId(make.canonicalName);
    selectedIds.add(docId);
    const ref = db.collection("vehicleMakes").doc(docId);
    const existing = existingById.get(docId);

    const base = {
      name: make.canonicalName,
      active: true,
      source: "NHTSA_MAJOR_POLICY",
      policyVersion,
      vehicleType: make.vehicleType,
      makeId: make.makeId,
      makeIdCar: make.makeIdCar,
      makeIdMotorcycle: make.makeIdMotorcycle,
      nhtsaNameCar: make.nhtsaNameCar,
      nhtsaNameMotorcycle: make.nhtsaNameMotorcycle,
    };

    if (!existing) {
      operations.push({
        ref,
        data: {
          ...base,
          addedAt: now,
          updatedAt: now,
        },
      });
      continue;
    }

    const patch = {};
    for (const [key, val] of Object.entries(base)) {
      if (valuesDiffer(existing[key], val)) patch[key] = val;
    }
    if (Object.keys(patch).length === 0) {
      skippedNoChange += 1;
      continue;
    }
    patch.updatedAt = now;
    operations.push({ ref, data: patch });
  }

  for (const [docId, data] of existingById.entries()) {
    if (selectedIds.has(docId)) continue;
    if (data?.active !== true) continue;
    operations.push({
      ref: db.collection("vehicleMakes").doc(docId),
      data: {
        active: false,
        deactivatedByPolicyVersion: policyVersion,
        updatedAt: now,
      },
    });
    deactivated += 1;
  }

  return {
    existingMakes: existingById.size,
    selectedMakes: selectedMakes.length,
    makesPlannedUpserts: operations.length,
    makesSkippedNoChange: skippedNoChange,
    makesPlannedDeactivations: deactivated,
    operations,
  };
}

async function getActiveMakes(db) {
  const snap = await db.collection("vehicleMakes").where("active", "==", true).get();
  return snap.docs.map((doc) => ({ id: doc.id, data: doc.data() }));
}

async function planModelsUpserts(db, policyVersion) {
  const now = new Date().toISOString();
  const activeMakes = await getActiveMakes(db);
  const operations = [];
  let skippedNoChange = 0;
  let skippedManualConflict = 0;
  let inspectedModels = 0;

  for (const makeDoc of activeMakes) {
    const makeName = String(makeDoc.data?.name || "").trim();
    if (!makeName) continue;
    const makeId = makeDoc.data?.makeId ?? null;
    const existingSnap = await db.collection("vehicleModels").where("make", "==", makeName).get();
    const existingById = new Map(existingSnap.docs.map((doc) => [doc.id, doc.data()]));
    const models = await fetchModelsForMake(makeId, makeName);

    for (const model of models) {
      const modelName = String(model?.Model_Name || "").trim();
      if (!modelName) continue;
      inspectedModels += 1;

      const docId = normalizeDocId(`${makeName}_${modelName}`);
      const existing = existingById.get(docId);
      if (existing?.source === "manual") {
        skippedManualConflict += 1;
        continue;
      }

      const base = {
        make: makeName,
        makeId,
        name: modelName,
        source: "api",
        policyVersion,
      };

      const ref = db.collection("vehicleModels").doc(docId);
      if (!existing) {
        operations.push({
          ref,
          data: {
            ...base,
            addedAt: now,
            updatedAt: now,
          },
        });
        continue;
      }

      const patch = {};
      for (const [key, val] of Object.entries(base)) {
        if (valuesDiffer(existing[key], val)) patch[key] = val;
      }
      if (Object.keys(patch).length === 0) {
        skippedNoChange += 1;
        continue;
      }
      patch.updatedAt = now;
      operations.push({ ref, data: patch });
    }
  }

  return {
    activeMakesCount: activeMakes.length,
    inspectedModels,
    modelPlannedUpserts: operations.length,
    modelSkippedNoChange: skippedNoChange,
    modelSkippedManualConflict: skippedManualConflict,
    operations,
  };
}

async function main() {
  const target = parseTarget();
  const targetProjectId = PROJECTS[target];
  const requiredConfirmation = requiredConfirmationFor(target);
  const confirmation = process.env.CATALOG_CONFIRMATION || "";
  if (confirmation !== requiredConfirmation) {
    throw new Error(`Invalid confirmation. Required exactly: '${requiredConfirmation}'`);
  }

  const mode = String(process.env.CATALOG_MODE || "makes").toLowerCase();
  if (!["makes", "models_active"].includes(mode)) {
    throw new Error(`Unsupported CATALOG_MODE='${mode}'. Allowed: makes, models_active`);
  }

  const maxWrites = Number.parseInt(process.env.CATALOG_MAX_WRITES || `${DEFAULT_MAX_WRITES}`, 10);
  if (!Number.isFinite(maxWrites) || maxWrites <= 0) {
    throw new Error(`Invalid CATALOG_MAX_WRITES='${process.env.CATALOG_MAX_WRITES}'. Must be positive integer.`);
  }

  const policyPath = process.env.CATALOG_POLICY_PATH || DEFAULT_POLICY_PATH;
  const policy = loadPolicy(policyPath);
  const sa = parseServiceAccount(process.env.CATALOG_SA_PATH, targetProjectId);
  const app = admin.initializeApp(
    { credential: admin.credential.cert(sa), projectId: targetProjectId },
    `catalog-${target}`
  );
  const db = admin.firestore(app);

  try {
    const summary = {
      target,
      targetProjectId,
      mode,
      maxWrites,
      policyVersion: policy.version,
      startedAt: new Date().toISOString(),
    };

    if (mode === "makes") {
      const carMakesRaw = await fetchMakesForType("car");
      const motoMakesRaw = await fetchMakesForType("motorcycle");
      const selection = planActiveMajorMakes(policy, carMakesRaw, motoMakesRaw);
      const plan = await planMakesUpserts(db, policy.version, selection.selected);
      const appliedOperations = plan.operations.slice(0, maxWrites);
      const deferredOperations = Math.max(0, plan.operations.length - appliedOperations.length);
      await commitOperations(db, appliedOperations);
      summary.result = {
        rawCarMakes: carMakesRaw.length,
        rawMotorcycleMakes: motoMakesRaw.length,
        selectedMajorMakes: selection.selected.length,
        missingCoreMatches: selection.missing,
        existingMakes: plan.existingMakes,
        makesPlannedUpserts: plan.makesPlannedUpserts,
        makesUpserted: appliedOperations.length,
        makesDeferred: deferredOperations,
        makesSkippedNoChange: plan.makesSkippedNoChange,
        makesPlannedDeactivations: plan.makesPlannedDeactivations,
      };
    } else {
      const plan = await planModelsUpserts(db, policy.version);
      const appliedOperations = plan.operations.slice(0, maxWrites);
      const deferredOperations = Math.max(0, plan.operations.length - appliedOperations.length);
      await commitOperations(db, appliedOperations);
      summary.result = {
        activeMakesCount: plan.activeMakesCount,
        inspectedModels: plan.inspectedModels,
        modelPlannedUpserts: plan.modelPlannedUpserts,
        modelUpserts: appliedOperations.length,
        modelDeferred: deferredOperations,
        modelSkippedNoChange: plan.modelSkippedNoChange,
        modelSkippedManualConflict: plan.modelSkippedManualConflict,
      };
    }

    summary.finishedAt = new Date().toISOString();
    console.log(`[catalog] summary=${JSON.stringify(summary)}`);
  } finally {
    await app.delete();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
