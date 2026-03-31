import fs from "node:fs";
import path from "node:path";
import admin from "firebase-admin";

const PROD_PROJECT_ID = "cardetailingapp-e6c95";
const STAGING_PROJECT_ID = "cardetailingapp-e6c95-staging";
const REQUIRED_CONFIRMATION = "sync-reference=prod-to-staging";

function parseServiceAccount(filePath, expectedProjectId, label) {
  if (!filePath || !fs.existsSync(filePath)) {
    throw new Error(`Missing service account file for ${label}: ${filePath}`);
  }
  const json = JSON.parse(fs.readFileSync(filePath, "utf8"));
  if (json.project_id !== expectedProjectId) {
    throw new Error(`${label} project_id mismatch: got '${json.project_id}', expected '${expectedProjectId}'`);
  }
  return json;
}

function ensureDir(filePath) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
}

function writeJson(filePath, data) {
  ensureDir(filePath);
  fs.writeFileSync(filePath, JSON.stringify(data, null, 2));
}

function normalizeMakeName(name) {
  return String(name || "").trim().toUpperCase();
}

function chunk(values, size) {
  const out = [];
  for (let i = 0; i < values.length; i += size) out.push(values.slice(i, i + size));
  return out;
}

async function fetchProdReference(prodDb) {
  const jobTypesSnap = await prodDb.collection("jobTypes").get();
  const activeMakesSnap = await prodDb.collection("vehicleMakes").where("active", "==", true).get();
  const manualModelsSnap = await prodDb.collection("vehicleModels").where("source", "==", "manual").get();

  const activeMakes = activeMakesSnap.docs.map((d) => ({
    id: d.id,
    name: d.data()?.name || d.id,
  }));
  const activeMakeKeySet = new Set(activeMakes.map((m) => normalizeMakeName(m.name)));

  const manualModelsForActiveMakes = manualModelsSnap.docs
    .map((d) => ({ id: d.id, data: d.data() }))
    .filter((entry) => activeMakeKeySet.has(normalizeMakeName(entry.data?.make)));

  return {
    jobTypes: jobTypesSnap.docs.map((d) => ({ id: d.id, data: d.data() })),
    activeMakes,
    manualModelsForActiveMakes,
  };
}

async function replaceJobTypes(stagingDb, prodJobTypes) {
  const existing = await stagingDb.collection("jobTypes").get();

  for (const group of chunk(existing.docs, 400)) {
    const batch = stagingDb.batch();
    for (const doc of group) batch.delete(doc.ref);
    await batch.commit();
  }

  for (const group of chunk(prodJobTypes, 400)) {
    const batch = stagingDb.batch();
    for (const doc of group) {
      batch.set(stagingDb.collection("jobTypes").doc(doc.id), doc.data, { merge: false });
    }
    await batch.commit();
  }
}

async function alignMakeActiveFlags(stagingDb, activeMakeKeySet) {
  const stagingMakesSnap = await stagingDb.collection("vehicleMakes").get();
  const docs = stagingMakesSnap.docs;

  let activeTrue = 0;
  let activeFalse = 0;
  let unmatchedProdActives = new Set(activeMakeKeySet);

  for (const group of chunk(docs, 400)) {
    const batch = stagingDb.batch();
    for (const doc of group) {
      const data = doc.data();
      const key = normalizeMakeName(data?.name || doc.id);
      const shouldBeActive = activeMakeKeySet.has(key);
      batch.set(doc.ref, { active: shouldBeActive }, { merge: true });
      if (shouldBeActive) {
        activeTrue += 1;
        unmatchedProdActives.delete(key);
      } else {
        activeFalse += 1;
      }
    }
    await batch.commit();
  }

  return {
    stagingVehicleMakesTotal: docs.length,
    stagingVehicleMakesSetActiveTrue: activeTrue,
    stagingVehicleMakesSetActiveFalse: activeFalse,
    prodActiveMakesNotFoundInStaging: Array.from(unmatchedProdActives),
  };
}

async function upsertManualModels(stagingDb, manualModels) {
  let upserted = 0;
  for (const group of chunk(manualModels, 400)) {
    const batch = stagingDb.batch();
    for (const model of group) {
      batch.set(stagingDb.collection("vehicleModels").doc(model.id), model.data, { merge: true });
      upserted += 1;
    }
    await batch.commit();
  }
  return { manualModelsUpserted: upserted };
}

async function main() {
  const confirmation = process.env.REFERENCE_SYNC_CONFIRMATION || "";
  const dryRun = String(process.env.REFERENCE_SYNC_DRY_RUN || "true").toLowerCase() === "true";

  if (confirmation !== REQUIRED_CONFIRMATION) {
    throw new Error(`Invalid confirmation. Required exactly: '${REQUIRED_CONFIRMATION}'`);
  }

  const prodSa = parseServiceAccount(process.env.PROD_SA_PATH, PROD_PROJECT_ID, "prod");
  const stagingSa = parseServiceAccount(process.env.STAGING_SA_PATH, STAGING_PROJECT_ID, "staging");

  const artifactsDir = process.env.REFERENCE_SYNC_ARTIFACTS_DIR || "artifacts/reference-sync";
  const summaryPath = path.join(artifactsDir, "summary.json");
  const payloadPath = path.join(artifactsDir, "prod-reference-payload.json");

  const prodApp = admin.initializeApp(
    { credential: admin.credential.cert(prodSa), projectId: PROD_PROJECT_ID },
    "reference-sync-prod"
  );
  const stagingApp = admin.initializeApp(
    { credential: admin.credential.cert(stagingSa), projectId: STAGING_PROJECT_ID },
    "reference-sync-staging"
  );

  const prodDb = admin.firestore(prodApp);
  const stagingDb = admin.firestore(stagingApp);

  try {
    const payload = await fetchProdReference(prodDb);
    writeJson(payloadPath, payload);

    const activeMakeKeySet = new Set(payload.activeMakes.map((m) => normalizeMakeName(m.name)));
    const summary = {
      startedAt: new Date().toISOString(),
      dryRun,
      sourceProject: PROD_PROJECT_ID,
      targetProject: STAGING_PROJECT_ID,
      prodReferenceCounts: {
        jobTypes: payload.jobTypes.length,
        activeVehicleMakes: payload.activeMakes.length,
        manualVehicleModelsForActiveMakes: payload.manualModelsForActiveMakes.length,
      },
      actions: [],
      status: "started",
    };

    if (dryRun) {
      summary.actions.push("dry-run only: extracted prod reference payload");
      summary.status = "dry-run-success";
      summary.finishedAt = new Date().toISOString();
      writeJson(summaryPath, summary);
      console.log("[reference-sync] dry-run-success");
      return;
    }

    await replaceJobTypes(stagingDb, payload.jobTypes);
    summary.actions.push("jobTypes replaced 1:1 from prod");

    const makeStats = await alignMakeActiveFlags(stagingDb, activeMakeKeySet);
    summary.makeAlignment = makeStats;
    summary.actions.push("vehicleMakes active flags aligned to prod active set");

    const modelStats = await upsertManualModels(stagingDb, payload.manualModelsForActiveMakes);
    summary.modelAlignment = modelStats;
    summary.actions.push("manual vehicleModels for active makes upserted");

    summary.status = "success";
    summary.finishedAt = new Date().toISOString();
    writeJson(summaryPath, summary);
    console.log("[reference-sync] success");
  } finally {
    await Promise.allSettled([prodApp.delete(), stagingApp.delete()]);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

