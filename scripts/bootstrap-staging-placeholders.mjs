import fs from "node:fs";
import admin from "firebase-admin";

const STAGING_PROJECT_ID = "cardetailingapp-e6c95-staging";
const REQUIRED_CONFIRMATION = "bootstrap=staging-placeholder-only";
const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const ROOT_COLLECTIONS = [
  "clients",
  "cars",
  "appointments",
  "jobTypes",
  "vehicleMakes",
  "vehicleModels",
  "jobTypeOverrides",
  "vehicleMakeOverrides",
  "vehicleModelOverrides",
  "catalogSyncJobs",
  "catalogSyncLocks",
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

function parseBootstrapAdminEmail(value) {
  const email = String(value || "").trim().toLowerCase();
  if (!email || !EMAIL_REGEX.test(email)) {
    throw new Error(
      "Invalid STAGING_BOOTSTRAP_ADMIN_EMAIL. Provide a valid email for allowedUsers admin seed."
    );
  }
  return email;
}

async function main() {
  const confirmation = process.env.BOOTSTRAP_CONFIRMATION || "";
  if (confirmation !== REQUIRED_CONFIRMATION) {
    throw new Error(`Invalid confirmation. Required exactly: '${REQUIRED_CONFIRMATION}'`);
  }

  const sa = parseServiceAccount(process.env.STAGING_SA_PATH);
  const bootstrapAdminEmail = parseBootstrapAdminEmail(process.env.STAGING_BOOTSTRAP_ADMIN_EMAIL);
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

  await db.doc(`allowedUsers/${bootstrapAdminEmail}`).set(
    {
      role: "admin",
      active: true,
      seededBy: "bootstrap-staging-placeholders",
      seededAt: now,
    },
    { merge: true }
  );
  upserts += 1;

  console.log(`[bootstrap] placeholders upserted=${upserts}; adminSeed=${bootstrapAdminEmail}`);
  await app.delete();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
