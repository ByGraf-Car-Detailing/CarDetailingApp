import fs from "node:fs";
import admin from "firebase-admin";

const STAGING_PROJECT_ID = "cardetailingapp-e6c95-staging";
const REQUIRED_CONFIRMATION = "populate-catalog=staging-nhtsa";
const NHTSA_API = "https://vpic.nhtsa.dot.gov/api/vehicles";
const DEFAULT_MAX_WRITES = 1200;
const BATCH_SIZE = 400;

function parseServiceAccount(filePath) {
  if (!filePath || !fs.existsSync(filePath)) {
    throw new Error(`Missing staging service account file: ${filePath}`);
  }
  const json = JSON.parse(fs.readFileSync(filePath, "utf8"));
  if (json.project_id !== STAGING_PROJECT_ID) {
    throw new Error(`Staging project_id mismatch: got '${json.project_id}', expected '${STAGING_PROJECT_ID}'`);
  }
  return json;
}

function normalizeId(value) {
  return String(value || "")
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, "_")
    .replace(/_+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 100);
}

async function fetchJson(url) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`HTTP ${res.status} for ${url}`);
  return res.json();
}

async function commitOperations(stagingDb, operations) {
  let batch = stagingDb.batch();
  let ops = 0;
  for (const op of operations) {
    batch.set(op.ref, op.data, { merge: true });
    ops += 1;
    if (ops === BATCH_SIZE) {
      await batch.commit();
      batch = stagingDb.batch();
      ops = 0;
    }
  }
  if (ops > 0) {
    await batch.commit();
  }
}

function valuesDiffer(a, b) {
  return (a ?? null) !== (b ?? null);
}

async function upsertMakes(stagingDb) {
  const data = await fetchJson(`${NHTSA_API}/getallmakes?format=json`);
  const makes = Array.isArray(data?.Results) ? data.Results : [];
  const existingSnap = await stagingDb.collection("vehicleMakes").get();
  const existingById = new Map(existingSnap.docs.map((doc) => [doc.id, doc.data()]));
  const operations = [];
  let skipped = 0;
  let inspected = 0;
  const now = new Date().toISOString();

  for (const make of makes) {
    const name = String(make?.Make_Name || "").trim();
    if (!name) continue;
    inspected += 1;

    const docId = normalizeId(name);
    const ref = stagingDb.collection("vehicleMakes").doc(docId);
    const existing = existingById.get(docId);
    const incomingMakeId = make?.Make_ID ?? null;

    if (!existing) {
      operations.push({
        ref,
        data: {
          name,
          makeId: incomingMakeId,
          active: false,
          source: "NHTSA",
          addedAt: now,
          updatedAt: now,
        },
      });
      continue;
    }

    const patch = {};
    if (valuesDiffer(existing.name, name)) patch.name = name;
    if (valuesDiffer(existing.makeId, incomingMakeId)) patch.makeId = incomingMakeId;
    if (valuesDiffer(existing.source, "NHTSA")) patch.source = "NHTSA";
    if (Object.keys(patch).length === 0) {
      skipped += 1;
      continue;
    }
    patch.updatedAt = now;
    operations.push({ ref, data: patch });
  }

  return {
    makesInspected: inspected,
    existingMakes: existingById.size,
    makesPlannedUpserts: operations.length,
    makesSkippedNoChange: skipped,
    operations,
  };
}

async function getActiveMakeNames(stagingDb) {
  const snap = await stagingDb.collection("vehicleMakes").where("active", "==", true).get();
  const names = [];
  for (const doc of snap.docs) {
    const name = String(doc.data()?.name || "").trim();
    if (name) names.push(name);
  }
  return Array.from(new Set(names));
}

async function planModelsForActiveMakes(stagingDb) {
  const activeMakes = await getActiveMakeNames(stagingDb);
  const operations = [];
  let skippedNoChange = 0;
  let skippedManualConflict = 0;
  let inspectedModels = 0;
  const now = new Date().toISOString();

  for (const makeName of activeMakes) {
    const existingSnap = await stagingDb.collection("vehicleModels").where("make", "==", makeName).get();
    const existingById = new Map(existingSnap.docs.map((doc) => [doc.id, doc.data()]));
    const url = `${NHTSA_API}/getmodelsformake/${encodeURIComponent(makeName)}?format=json`;
    const data = await fetchJson(url);
    const models = Array.isArray(data?.Results) ? data.Results : [];

    for (const model of models) {
      const modelName = String(model?.Model_Name || "").trim();
      if (!modelName) continue;
      inspectedModels += 1;

      const docId = normalizeId(`${makeName}_${modelName}`);
      const existing = existingById.get(docId);
      if (existing?.source === "manual") {
        skippedManualConflict += 1;
        continue;
      }

      const ref = stagingDb.collection("vehicleModels").doc(docId);
      if (!existing) {
        operations.push({
          ref,
          data: {
            make: makeName,
            name: modelName,
            source: "api",
            addedAt: now,
            updatedAt: now,
          },
        });
        continue;
      }

      const patch = {};
      if (valuesDiffer(existing.make, makeName)) patch.make = makeName;
      if (valuesDiffer(existing.name, modelName)) patch.name = modelName;
      if (valuesDiffer(existing.source, "api")) patch.source = "api";
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
    skippedNoChange,
    skippedManualConflict,
    operations,
  };
}

async function main() {
  const confirmation = process.env.CATALOG_CONFIRMATION || "";
  if (confirmation !== REQUIRED_CONFIRMATION) {
    throw new Error(`Invalid confirmation. Required exactly: '${REQUIRED_CONFIRMATION}'`);
  }

  const mode = String(process.env.CATALOG_MODE || "makes").toLowerCase();
  if (!["makes", "models_active"].includes(mode)) {
    throw new Error(`Unsupported CATALOG_MODE='${mode}'. Allowed: makes, models_active`);
  }
  const maxWrites = Number.parseInt(process.env.CATALOG_MAX_WRITES || `${DEFAULT_MAX_WRITES}`, 10);
  if (!Number.isFinite(maxWrites) || maxWrites <= 0) {
    throw new Error(`Invalid CATALOG_MAX_WRITES='${process.env.CATALOG_MAX_WRITES}'. Must be positive integer.`);
  }

  const sa = parseServiceAccount(process.env.STAGING_SA_PATH);
  const app = admin.initializeApp(
    { credential: admin.credential.cert(sa), projectId: STAGING_PROJECT_ID },
    "staging-catalog"
  );
  const stagingDb = admin.firestore(app);

  try {
    const summary = {
      mode,
      maxWrites,
      startedAt: new Date().toISOString(),
      project: STAGING_PROJECT_ID,
    };

    if (mode === "makes") {
      const plan = await upsertMakes(stagingDb);
      const appliedOperations = plan.operations.slice(0, maxWrites);
      const deferredOperations = Math.max(0, plan.operations.length - appliedOperations.length);
      await commitOperations(stagingDb, appliedOperations);
      summary.result = {
        makesInspected: plan.makesInspected,
        existingMakes: plan.existingMakes,
        makesPlannedUpserts: plan.operations.length,
        makesUpserted: appliedOperations.length,
        makesDeferred: deferredOperations,
        makesSkippedNoChange: plan.makesSkippedNoChange,
      };
    } else {
      const plan = await planModelsForActiveMakes(stagingDb);
      const appliedOperations = plan.operations.slice(0, maxWrites);
      const deferredOperations = Math.max(0, plan.operations.length - appliedOperations.length);
      await commitOperations(stagingDb, appliedOperations);
      summary.result = {
        activeMakesCount: plan.activeMakesCount,
        inspectedModels: plan.inspectedModels,
        modelPlannedUpserts: plan.operations.length,
        modelUpserts: appliedOperations.length,
        modelDeferred: deferredOperations,
        modelSkippedNoChange: plan.skippedNoChange,
        modelSkippedManualConflict: plan.skippedManualConflict,
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

