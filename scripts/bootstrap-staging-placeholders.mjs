import fs from "node:fs";
import admin from "firebase-admin";

const STAGING_PROJECT_ID = "cardetailingapp-e6c95-staging";
const REQUIRED_CONFIRMATION = "bootstrap=staging-placeholder-only";
const ROOT_COLLECTIONS = [
  "allowedUsers",
  "clients",
  "cars",
  "appointments",
  "jobTypes",
  "vehicleMakes",
  "vehicleModels",
  "jobTypeOverrides",
  "vehicleMakeOverrides",
  "vehicleModelOverrides",
];
const PLACEHOLDER_DOC_ID = "placeholder_seed";

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

async function main() {
  const confirmation = process.env.BOOTSTRAP_CONFIRMATION || "";
  if (confirmation !== REQUIRED_CONFIRMATION) {
    throw new Error(`Invalid confirmation. Required exactly: '${REQUIRED_CONFIRMATION}'`);
  }

  const sa = parseServiceAccount(process.env.STAGING_SA_PATH);
  const app = admin.initializeApp(
    { credential: admin.credential.cert(sa), projectId: STAGING_PROJECT_ID },
    "bootstrap-staging"
  );
  const db = admin.firestore(app);

  const now = new Date().toISOString();
  let upserts = 0;

  for (const col of ROOT_COLLECTIONS) {
    const ref = db.doc(`${col}/${PLACEHOLDER_DOC_ID}`);
    await ref.set(
      {
        placeholderMarker: true,
        placeholderDocId: PLACEHOLDER_DOC_ID,
        placeholderCollection: col,
        placeholderNotes: "technical placeholder for empty-staging bootstrap",
        placeholderUpdatedAt: now,
      },
      { merge: true }
    );
    upserts += 1;
  }

  console.log(`[bootstrap] placeholders upserted=${upserts}`);
  await app.delete();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
