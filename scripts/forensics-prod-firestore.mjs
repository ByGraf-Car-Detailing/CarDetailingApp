import fs from "node:fs";
import path from "node:path";
import admin from "firebase-admin";

const PROD_PROJECT_ID = "cardetailingapp-e6c95";
const CORE_COLLECTIONS = [
  "allowedUsers",
  "clients",
  "cars",
  "appointments",
  "jobTypes",
  "vehicleMakes",
  "vehicleModels",
];

function assertServiceAccount(filePath) {
  if (!filePath || !fs.existsSync(filePath)) {
    throw new Error(`Missing PROD_SA_PATH: ${filePath}`);
  }
  const json = JSON.parse(fs.readFileSync(filePath, "utf8"));
  if (json.project_id !== PROD_PROJECT_ID) {
    throw new Error(`Service account project_id mismatch: got '${json.project_id}', expected '${PROD_PROJECT_ID}'`);
  }
  return json;
}

function inferType(value) {
  if (value === null) return "null";
  if (Array.isArray(value)) return "array";
  if (value instanceof Date) return "timestamp";
  if (typeof value === "object") return "map";
  return typeof value;
}

function mergeFieldTypes(schemaMap, data, prefix = "") {
  for (const [key, value] of Object.entries(data || {})) {
    const field = prefix ? `${prefix}.${key}` : key;
    const t = inferType(value);
    if (!schemaMap[field]) schemaMap[field] = new Set();
    schemaMap[field].add(t);
    if (t === "map") mergeFieldTypes(schemaMap, value, field);
  }
}

async function summarizeCollection(db, name) {
  const ref = db.collection(name);
  const countSnap = await ref.count().get();
  const total = countSnap.data().count || 0;

  const sampleSnap = await ref.limit(50).get();
  const schema = {};
  const docIds = [];
  for (const doc of sampleSnap.docs) {
    docIds.push(doc.id);
    mergeFieldTypes(schema, doc.data());
  }

  const normalizedSchema = Object.fromEntries(
    Object.entries(schema).map(([k, v]) => [k, Array.from(v).sort()])
  );

  return { collection: name, total, sampleCount: sampleSnap.size, sampleDocIds: docIds, schema: normalizedSchema };
}

async function main() {
  const incidentId = String(process.env.INCIDENT_ID || "").trim();
  if (!incidentId) throw new Error("INCIDENT_ID is required");

  const sa = assertServiceAccount(process.env.PROD_SA_PATH);
  const app = admin.initializeApp(
    { credential: admin.credential.cert(sa), projectId: PROD_PROJECT_ID },
    `forensics-${Date.now()}`
  );

  const db = admin.firestore(app);
  const now = new Date().toISOString();
  const outDir = path.resolve("artifacts", incidentId);
  fs.mkdirSync(outDir, { recursive: true });

  const allCollections = await db.listCollections();
  const allNames = allCollections.map((c) => c.id).sort();

  const summaries = [];
  for (const name of allNames) {
    summaries.push(await summarizeCollection(db, name));
  }

  const coreSummary = summaries.filter((s) => CORE_COLLECTIONS.includes(s.collection));
  const unexpectedCollections = allNames.filter((name) => !CORE_COLLECTIONS.includes(name));

  const report = {
    incidentId,
    generatedAt: now,
    projectId: PROD_PROJECT_ID,
    totals: {
      topLevelCollections: allNames.length,
    },
    allCollections: allNames,
    unexpectedCollections,
    coreCollections: coreSummary,
  };

  fs.writeFileSync(path.join(outDir, "prod-firestore-forensics.json"), JSON.stringify(report, null, 2));

  const contract = Object.fromEntries(
    coreSummary.map((s) => [s.collection, { schema: s.schema, sampleCount: s.sampleCount, total: s.total }])
  );
  fs.writeFileSync(path.join(outDir, "prod-schema-contract-core.json"), JSON.stringify(contract, null, 2));

  await app.delete();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
