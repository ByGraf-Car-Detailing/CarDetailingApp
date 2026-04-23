import fs from "node:fs";
import path from "node:path";
import admin from "firebase-admin";

const STAGING_PROJECT_ID = "cardetailingapp-e6c95-staging";
const REQUIRED_CONFIRMATION = "bootstrap-runtime-config=staging";
const DEFAULT_LOCATIONS = ["Lugano Centro", "Lugano Stampa"];
const ARTIFACTS_DIR = process.env.RUNTIME_CONFIG_ARTIFACTS_DIR || "artifacts/runtime-config-bootstrap";

function ensureDir(filePath) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
}

function writeJson(filePath, data) {
  ensureDir(filePath);
  fs.writeFileSync(filePath, JSON.stringify(data, null, 2));
}

function parseServiceAccount(filePath, expectedProjectId) {
  if (!filePath || !fs.existsSync(filePath)) {
    throw new Error(`Missing service account file for staging: ${filePath}`);
  }
  const json = JSON.parse(fs.readFileSync(filePath, "utf8"));
  if (json.project_id !== expectedProjectId) {
    throw new Error(
      `staging project_id mismatch: got '${json.project_id}', expected '${expectedProjectId}'`
    );
  }
  return json;
}

function sanitizeLocations(value) {
  const input = Array.isArray(value) ? value : String(value || "").split(",");
  const seen = new Set();
  const out = [];
  for (const item of input) {
    if (typeof item !== "string") continue;
    const clean = item.trim();
    if (!clean) continue;
    const key = clean.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(clean);
  }
  return out;
}

function resolveConfiguredLocations() {
  const raw = process.env.RUNTIME_CONFIG_APPOINTMENT_LOCATIONS || "";
  const parsed = sanitizeLocations(raw);
  if (parsed.length > 0) return parsed;
  return [...DEFAULT_LOCATIONS];
}

async function main() {
  const confirmation = process.env.RUNTIME_CONFIG_CONFIRMATION || "";
  const dryRun = String(process.env.RUNTIME_CONFIG_DRY_RUN || "false").toLowerCase() === "true";

  if (confirmation !== REQUIRED_CONFIRMATION) {
    throw new Error(`Invalid confirmation. Required exactly: '${REQUIRED_CONFIRMATION}'`);
  }

  const sa = parseServiceAccount(process.env.STAGING_SA_PATH, STAGING_PROJECT_ID);
  const app = admin.initializeApp(
    { credential: admin.credential.cert(sa), projectId: STAGING_PROJECT_ID },
    "runtime-config-staging-bootstrap"
  );
  const db = admin.firestore(app);

  try {
    const locations = resolveConfiguredLocations();
    const ref = db.collection("runtimeConfig").doc("appointmentLocations");
    const existingSnap = await ref.get();
    const existing = existingSnap.exists ? existingSnap.data() || {} : null;
    const previousVersion = Number.isInteger(existing?.version) ? existing.version : 0;

    const payload = {
      locations,
      enabled: true,
      version: previousVersion + 1,
      updatedBy: "bootstrap-runtime-config-staging",
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    };

    const summary = {
      startedAt: new Date().toISOString(),
      dryRun,
      projectId: STAGING_PROJECT_ID,
      documentPath: "runtimeConfig/appointmentLocations",
      existedBefore: existingSnap.exists,
      previousVersion,
      nextVersion: payload.version,
      locations,
      status: "started",
    };

    if (!dryRun) {
      await ref.set(payload, { merge: true });
    }

    summary.status = dryRun ? "dry-run-success" : "success";
    summary.finishedAt = new Date().toISOString();
    writeJson(path.join(ARTIFACTS_DIR, "summary.json"), summary);
    console.log(`[runtime-config-bootstrap] ${summary.status}`);
  } finally {
    await app.delete();
  }
}

main().catch((err) => {
  const summary = {
    failedAt: new Date().toISOString(),
    projectId: STAGING_PROJECT_ID,
    status: "failed",
    error: String(err?.message || err),
  };
  writeJson(path.join(ARTIFACTS_DIR, "summary.json"), summary);
  console.error(err);
  process.exit(1);
});

