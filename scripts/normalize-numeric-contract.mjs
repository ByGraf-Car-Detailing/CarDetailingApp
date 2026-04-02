import fs from "node:fs";
import admin from "firebase-admin";

const PROJECTS = {
  staging: "cardetailingapp-e6c95-staging",
  prod: "cardetailingapp-e6c95",
};

const BATCH_SIZE = 400;

function parseTarget() {
  const target = String(process.env.NUMERIC_CONTRACT_TARGET || "staging").toLowerCase();
  if (!Object.prototype.hasOwnProperty.call(PROJECTS, target)) {
    throw new Error(`Unsupported NUMERIC_CONTRACT_TARGET='${target}'. Allowed: ${Object.keys(PROJECTS).join(", ")}`);
  }
  const allowProd = String(process.env.ALLOW_PROD_NUMERIC_NORMALIZATION || "").toLowerCase() === "true";
  if (target === "prod" && !allowProd) {
    throw new Error("NUMERIC_CONTRACT_TARGET=prod is blocked. Set ALLOW_PROD_NUMERIC_NORMALIZATION=true only with explicit owner approval.");
  }
  return target;
}

function parseBooleanEnv(name, fallback) {
  const raw = process.env[name];
  if (raw == null) return fallback;
  return String(raw).toLowerCase() === "true";
}

function toIntOrNull(value) {
  if (typeof value === "number" && Number.isFinite(value)) return Math.trunc(value);
  if (typeof value === "string") {
    const trimmed = value.trim();
    if (!trimmed) return null;
    if (!/^-?\d+$/.test(trimmed)) return null;
    return Number.parseInt(trimmed, 10);
  }
  return null;
}

function loadServiceAccount(expectedProjectId) {
  const filePath = process.env.NUMERIC_CONTRACT_SA_PATH;
  if (!filePath || !fs.existsSync(filePath)) {
    throw new Error("Missing NUMERIC_CONTRACT_SA_PATH service account file.");
  }
  const json = JSON.parse(fs.readFileSync(filePath, "utf8"));
  if (json.project_id !== expectedProjectId) {
    throw new Error(`Service account project_id mismatch: got '${json.project_id}', expected '${expectedProjectId}'`);
  }
  return json;
}

async function commitOperations(operations, dryRun) {
  if (dryRun || operations.length === 0) return 0;
  let committed = 0;
  let batch = admin.firestore().batch();
  let count = 0;

  for (const op of operations) {
    batch.update(op.ref, op.patch);
    count += 1;
    if (count === BATCH_SIZE) {
      await batch.commit();
      committed += count;
      batch = admin.firestore().batch();
      count = 0;
    }
  }

  if (count > 0) {
    await batch.commit();
    committed += count;
  }
  return committed;
}

async function normalizeCarsYear() {
  const snap = await admin.firestore().collection("cars").get();
  const ops = [];
  const skippedNonConvertible = [];

  for (const docSnap of snap.docs) {
    const data = docSnap.data();
    const current = data.year;
    const normalized = toIntOrNull(current);
    if (normalized == null) {
      if (current != null) {
        skippedNonConvertible.push({ id: docSnap.id, value: current });
      }
      continue;
    }
    if (current !== normalized) {
      ops.push({
        ref: docSnap.ref,
        patch: { year: normalized, updatedAt: admin.firestore.FieldValue.serverTimestamp() },
      });
    }
  }

  return {
    total: snap.size,
    planned: ops.length,
    skippedNonConvertible,
    operations: ops,
  };
}

async function normalizeJobTypesDefaultPrice() {
  const snap = await admin.firestore().collection("jobTypes").get();
  const ops = [];
  const skippedNonConvertible = [];

  for (const docSnap of snap.docs) {
    const data = docSnap.data();
    const current = data.defaultPrice;
    const normalized = toIntOrNull(current);
    if (normalized == null) {
      if (current != null) {
        skippedNonConvertible.push({ id: docSnap.id, value: current });
      }
      continue;
    }
    if (current !== normalized) {
      ops.push({
        ref: docSnap.ref,
        patch: { defaultPrice: normalized },
      });
    }
  }

  return {
    total: snap.size,
    planned: ops.length,
    skippedNonConvertible,
    operations: ops,
  };
}

async function main() {
  const target = parseTarget();
  const dryRun = parseBooleanEnv("NUMERIC_CONTRACT_DRY_RUN", true);
  const expectedProjectId = PROJECTS[target];
  const sa = loadServiceAccount(expectedProjectId);
  admin.initializeApp({
    credential: admin.credential.cert(sa),
    projectId: expectedProjectId,
  });

  const carsPlan = await normalizeCarsYear();
  const jobTypesPlan = await normalizeJobTypesDefaultPrice();
  const allOps = [...carsPlan.operations, ...jobTypesPlan.operations];
  const applied = await commitOperations(allOps, dryRun);

  const summary = {
    target,
    projectId: expectedProjectId,
    dryRun,
    cars: {
      total: carsPlan.total,
      planned: carsPlan.planned,
      skippedNonConvertible: carsPlan.skippedNonConvertible,
    },
    jobTypes: {
      total: jobTypesPlan.total,
      planned: jobTypesPlan.planned,
      skippedNonConvertible: jobTypesPlan.skippedNonConvertible,
    },
    plannedTotal: allOps.length,
    applied,
  };

  console.log(JSON.stringify(summary, null, 2));
}

main().catch((error) => {
  console.error(error?.message || error);
  process.exit(1);
});
