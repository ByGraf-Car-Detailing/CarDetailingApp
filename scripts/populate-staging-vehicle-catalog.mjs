import fs from "node:fs";
import admin from "firebase-admin";

const STAGING_PROJECT_ID = "cardetailingapp-e6c95-staging";
const REQUIRED_CONFIRMATION = "populate-catalog=staging-nhtsa";
const NHTSA_API = "https://vpic.nhtsa.dot.gov/api/vehicles";

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

async function upsertMakes(stagingDb) {
  const data = await fetchJson(`${NHTSA_API}/getallmakes?format=json`);
  const makes = Array.isArray(data?.Results) ? data.Results : [];
  let upserts = 0;

  for (const make of makes) {
    const name = String(make?.Make_Name || "").trim();
    if (!name) continue;

    const docId = normalizeId(name);
    const ref = stagingDb.collection("vehicleMakes").doc(docId);
    await ref.set(
      {
        name,
        makeId: make?.Make_ID ?? null,
        active: false,
        source: "NHTSA",
        addedAt: new Date().toISOString(),
      },
      { merge: true }
    );
    upserts += 1;
  }

  return { makesUpserted: upserts };
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

async function upsertModelsForActiveMakes(stagingDb) {
  const activeMakes = await getActiveMakeNames(stagingDb);
  let modelUpserts = 0;

  for (const makeName of activeMakes) {
    const url = `${NHTSA_API}/getmodelsformake/${encodeURIComponent(makeName)}?format=json`;
    const data = await fetchJson(url);
    const models = Array.isArray(data?.Results) ? data.Results : [];

    for (const model of models) {
      const modelName = String(model?.Model_Name || "").trim();
      if (!modelName) continue;

      const docId = normalizeId(`${makeName}_${modelName}`);
      await stagingDb
        .collection("vehicleModels")
        .doc(docId)
        .set(
          {
            make: makeName,
            name: modelName,
            source: "api",
            addedAt: new Date().toISOString(),
          },
          { merge: true }
        );
      modelUpserts += 1;
    }
  }

  return {
    activeMakesCount: activeMakes.length,
    modelUpserts,
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

  const sa = parseServiceAccount(process.env.STAGING_SA_PATH);
  const app = admin.initializeApp(
    { credential: admin.credential.cert(sa), projectId: STAGING_PROJECT_ID },
    "staging-catalog"
  );
  const stagingDb = admin.firestore(app);

  try {
    const summary = {
      mode,
      startedAt: new Date().toISOString(),
      project: STAGING_PROJECT_ID,
    };

    if (mode === "makes") {
      summary.result = await upsertMakes(stagingDb);
    } else {
      summary.result = await upsertModelsForActiveMakes(stagingDb);
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

