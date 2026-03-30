import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import admin from "firebase-admin";

const REQUIRED_CONFIRMATION = "source=prod target=staging";
const PROD_PROJECT_ID = "cardetailingapp-e6c95";
const STAGING_PROJECT_ID = "cardetailingapp-e6c95-staging";
const COLLECTIONS = [
  "allowedUsers",
  "clients",
  "cars",
  "appointments",
  "jobTypes",
  "vehicleMakes",
  "vehicleModels",
];
const EXPORT_PAGE_SIZE = 200;

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function isRetryableFirestoreError(err) {
  const code = Number(err?.code);
  const msg = String(err?.message || "").toUpperCase();
  return (
    code === 4 ||
    code === 8 ||
    code === 10 ||
    code === 13 ||
    code === 14 ||
    msg.includes("RESOURCE_EXHAUSTED") ||
    msg.includes("DEADLINE_EXCEEDED") ||
    msg.includes("UNAVAILABLE")
  );
}

async function withRetries(label, fn, maxAttempts = 6) {
  let attempt = 0;
  while (attempt < maxAttempts) {
    attempt += 1;
    try {
      return await fn();
    } catch (err) {
      if (!isRetryableFirestoreError(err) || attempt >= maxAttempts) {
        throw err;
      }
      const delayMs = Math.min(1500 * Math.pow(2, attempt - 1), 15000);
      console.warn(`[mirror] retry ${label} attempt=${attempt}/${maxAttempts} delay=${delayMs}ms reason=${err?.message || err}`);
      await sleep(delayMs);
    }
  }
  throw new Error(`Unexpected retry loop termination for ${label}`);
}

function ensureDir(filePath) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
}

function writeJson(filePath, data) {
  ensureDir(filePath);
  fs.writeFileSync(filePath, JSON.stringify(data, null, 2));
}

function isPlainObject(value) {
  return Object.prototype.toString.call(value) === "[object Object]";
}

function isTimestamp(value) {
  return Boolean(value && typeof value.toDate === "function" && typeof value.toMillis === "function");
}

function toSerializable(value) {
  if (value === null || value === undefined) return value;
  if (Array.isArray(value)) return value.map(toSerializable);
  if (isTimestamp(value)) {
    return { __type: "timestamp", value: value.toDate().toISOString() };
  }
  if (value instanceof Date) {
    return { __type: "date", value: value.toISOString() };
  }
  if (typeof value === "bigint") {
    return value.toString();
  }
  if (typeof value === "object") {
    if (typeof value.path === "string" && typeof value.id === "string") {
      return { __type: "ref", value: value.path };
    }
    if (isPlainObject(value)) {
      const out = {};
      for (const [k, v] of Object.entries(value)) {
        out[k] = toSerializable(v);
      }
      return out;
    }
    return String(value);
  }
  return value;
}

function hashHex(input, salt) {
  return crypto.createHmac("sha256", salt).update(String(input)).digest("hex");
}

function pseudoEmail(value, salt) {
  const hash = hashHex(value, salt).slice(0, 12);
  return `user-${hash}@staging.invalid`;
}

function pseudoPhone(value, salt) {
  const digits = String(value).replace(/\D+/g, "");
  const hash = hashHex(digits || value, salt).replace(/[^0-9]/g, "");
  const body = (hash + "000000000").slice(0, 9);
  return `+39000${body}`;
}

function pseudoName(value, salt, prefix = "NAME") {
  const hash = hashHex(value, salt).slice(0, 10).toUpperCase();
  return `${prefix}-${hash}`;
}

function pseudoText(value, salt, prefix = "TXT") {
  const hash = hashHex(value, salt).slice(0, 14).toUpperCase();
  return `${prefix}-${hash}`;
}

function pseudoVin(value, salt) {
  const raw = hashHex(value, salt).toUpperCase().replace(/[^A-Z0-9]/g, "");
  return raw.slice(0, 17).padEnd(17, "X");
}

function pseudoPlate(value, salt) {
  const raw = hashHex(value, salt).toUpperCase().replace(/[^A-Z0-9]/g, "");
  return raw.slice(0, 7).padEnd(7, "X");
}

function maybeSanitizeByPattern(input, salt) {
  const value = String(input);
  if (/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)) {
    return pseudoEmail(value, salt);
  }
  if (/\+?\d[\d\s\-()]{7,}/.test(value)) {
    return pseudoPhone(value, salt);
  }
  return value;
}

function sanitizeStringByKey(key, value, salt) {
  const lower = key.toLowerCase();

  if (lower.includes("email")) return pseudoEmail(value, salt);
  if (lower.includes("phone") || lower.includes("mobile") || lower.includes("tel")) return pseudoPhone(value, salt);

  if (
    lower.includes("firstname") ||
    lower.includes("lastname") ||
    lower === "name" ||
    lower.includes("contactname") ||
    lower.includes("displayname") ||
    lower.includes("companyname") ||
    lower.includes("ragionesociale")
  ) {
    return pseudoName(value, salt, "NAME");
  }

  if (lower.includes("address") || lower.includes("street") || lower.includes("city") || lower.includes("zip") || lower.includes("cap")) {
    return pseudoText(value, salt, "ADDR");
  }

  if (lower.includes("plate") || lower.includes("targa")) return pseudoPlate(value, salt);
  if (lower.includes("vin") || lower.includes("chassis")) return pseudoVin(value, salt);

  if (lower.includes("note") || lower.includes("comment") || lower.includes("description") || lower.includes("memo")) {
    return pseudoText(value, salt, "NOTE");
  }

  return maybeSanitizeByPattern(value, salt);
}

function deepSanitizeValue(value, salt, parentKey = "") {
  if (value === null || value === undefined) return value;
  if (typeof value === "string") {
    return sanitizeStringByKey(parentKey, value, salt);
  }
  if (Array.isArray(value)) {
    return value.map((item) => deepSanitizeValue(item, salt, parentKey));
  }
  if (isTimestamp(value) || value instanceof Date) {
    return value;
  }
  if (isPlainObject(value)) {
    const out = {};
    for (const [k, v] of Object.entries(value)) {
      out[k] = deepSanitizeValue(v, salt, k);
    }
    return out;
  }
  return value;
}

function transformAllowedUsersDocId(docId, salt) {
  if (/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(docId)) {
    return pseudoEmail(docId, salt);
  }
  return docId;
}

async function exportCollectionRecursive(collectionRef, docsOut) {
  let cursor = null;
  let page = 0;
  while (true) {
    let query = collectionRef.orderBy(admin.firestore.FieldPath.documentId()).limit(EXPORT_PAGE_SIZE);
    if (cursor) {
      query = query.startAfter(cursor);
    }
    const snap = await withRetries(`export page ${collectionRef.path}#${page}`, () => query.get());
    if (snap.empty) break;
    for (const docSnap of snap.docs) {
      docsOut.push({ path: docSnap.ref.path, data: docSnap.data() });
      const subcollections = await withRetries(`list subcollections ${docSnap.ref.path}`, () => docSnap.ref.listCollections());
      for (const sub of subcollections) {
        await exportCollectionRecursive(sub, docsOut);
      }
    }
    cursor = snap.docs[snap.docs.length - 1];
    page += 1;
    await sleep(50);
  }
}

async function exportDataset(db, collections) {
  const exported = [];
  for (const colName of collections) {
    await exportCollectionRecursive(db.collection(colName), exported);
    await sleep(100);
  }
  return exported;
}

function sanitizeDataset(rawDocs, salt) {
  return rawDocs.map((entry) => {
    const segments = entry.path.split("/");
    const topCollection = segments[0];

    if (topCollection === "allowedUsers" && segments.length >= 2) {
      segments[1] = transformAllowedUsersDocId(segments[1], salt);
    }

    const sanitizedData = deepSanitizeValue(entry.data, salt);

    if (topCollection === "allowedUsers") {
      const originalId = entry.path.split("/")[1] || "";
      if (/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(originalId)) {
        sanitizedData.email = transformAllowedUsersDocId(originalId, salt);
      }
    }

    return {
      path: segments.join("/"),
      data: sanitizedData,
    };
  });
}

async function deleteDocRecursive(docRef) {
  const subs = await withRetries(`list subcollections for delete ${docRef.path}`, () => docRef.listCollections());
  for (const sub of subs) {
    await deleteCollectionRecursive(sub);
  }
  await withRetries(`delete doc ${docRef.path}`, () => docRef.delete());
}

async function deleteCollectionRecursive(collectionRef) {
  const snap = await withRetries(`delete collection read ${collectionRef.path}`, () => collectionRef.limit(200).get());
  for (const docSnap of snap.docs) {
    await deleteDocRecursive(docSnap.ref);
  }
  if (!snap.empty) {
    await sleep(75);
    await deleteCollectionRecursive(collectionRef);
  }
}

async function wipeCollections(db, collections) {
  for (const colName of collections) {
    await deleteCollectionRecursive(db.collection(colName));
  }
}

function sortByPathDepth(docs) {
  return [...docs].sort((a, b) => a.path.split("/").length - b.path.split("/").length);
}

async function importDataset(db, docs) {
  const ordered = sortByPathDepth(docs);
  for (const entry of ordered) {
    await withRetries(`import ${entry.path}`, () => db.doc(entry.path).set(entry.data, { merge: false }));
  }
}

async function listAllUsers(auth) {
  let token;
  const users = [];
  do {
    const page = await withRetries("list auth users", () => auth.listUsers(1000, token));
    users.push(...page.users);
    token = page.pageToken;
  } while (token);
  return users;
}

function sanitizeAuthUser(userRecord, salt) {
  const src = userRecord.toJSON ? userRecord.toJSON() : userRecord;
  const sanitizedEmail = src.email ? pseudoEmail(src.email, salt) : undefined;
  const sanitizedPhone = src.phoneNumber ? pseudoPhone(src.phoneNumber, salt) : undefined;

  return {
    uid: src.uid,
    email: sanitizedEmail,
    displayName: src.displayName ? pseudoName(src.displayName, salt, "USR") : undefined,
    phoneNumber: sanitizedPhone,
    disabled: !!src.disabled,
    emailVerified: !!src.emailVerified,
    customClaims: {
      ...(src.customClaims || {}),
      mirroredFromProd: true,
      mirrorTimestamp: new Date().toISOString(),
    },
  };
}

function randomPassword() {
  return `Tmp-${crypto.randomBytes(8).toString("hex")}-A1!`;
}

async function syncAuthUsers(prodAuth, stagingAuth, salt) {
  const prodUsers = await listAllUsers(prodAuth);
  const stagingUsers = await listAllUsers(stagingAuth);
  const stagingByUid = new Map(stagingUsers.map((u) => [u.uid, u]));

  let upserted = 0;
  for (const prodUser of prodUsers) {
    const user = sanitizeAuthUser(prodUser, salt);
    const payload = {
      uid: user.uid,
      disabled: user.disabled,
      emailVerified: user.emailVerified,
    };

    if (user.email) payload.email = user.email;
    if (user.displayName) payload.displayName = user.displayName;
    if (user.phoneNumber) payload.phoneNumber = user.phoneNumber;
    if (user.email) payload.password = randomPassword();

    if (stagingByUid.has(user.uid)) {
      await withRetries(`auth update ${user.uid}`, () => stagingAuth.updateUser(user.uid, payload));
    } else {
      await withRetries(`auth create ${user.uid}`, () => stagingAuth.createUser(payload));
    }
    await withRetries(`auth set claims ${user.uid}`, () => stagingAuth.setCustomUserClaims(user.uid, user.customClaims));
    upserted += 1;
  }

  const prodUids = new Set(prodUsers.map((u) => u.uid));
  let deleted = 0;
  for (const stagingUser of stagingUsers) {
    if (prodUids.has(stagingUser.uid)) continue;
    const claims = stagingUser.customClaims || {};
    if (claims.keepInStaging === true) continue;
    await withRetries(`auth delete stale ${stagingUser.uid}`, () => stagingAuth.deleteUser(stagingUser.uid));
    deleted += 1;
  }

  return {
    prodCount: prodUsers.length,
    stagingBeforeCount: stagingUsers.length,
    upserted,
    deleted,
  };
}

async function restoreAuthBackup(stagingAuth, backupUsers) {
  const current = await listAllUsers(stagingAuth);
  for (const user of current) {
    const claims = user.customClaims || {};
    if (claims.keepInStaging === true) continue;
    await withRetries(`auth rollback delete ${user.uid}`, () => stagingAuth.deleteUser(user.uid));
  }

  for (const user of backupUsers) {
    const payload = {
      uid: user.uid,
      disabled: !!user.disabled,
      emailVerified: !!user.emailVerified,
    };
    if (user.email) payload.email = user.email;
    if (user.displayName) payload.displayName = user.displayName;
    if (user.phoneNumber) payload.phoneNumber = user.phoneNumber;
    if (user.email) payload.password = randomPassword();

    await withRetries(`auth rollback create ${user.uid}`, () => stagingAuth.createUser(payload));
    if (user.customClaims) {
      await withRetries(`auth rollback claims ${user.uid}`, () => stagingAuth.setCustomUserClaims(user.uid, user.customClaims));
    }
  }
}

function countDocsByTopCollection(docs) {
  const counts = {};
  for (const entry of docs) {
    const col = entry.path.split("/")[0];
    counts[col] = (counts[col] || 0) + 1;
  }
  return counts;
}

function stableStringify(value) {
  if (value === null || value === undefined) return JSON.stringify(value);
  if (Array.isArray(value)) {
    return `[${value.map((item) => stableStringify(item)).join(",")}]`;
  }
  if (isPlainObject(value)) {
    const keys = Object.keys(value).sort();
    return `{${keys.map((k) => `${JSON.stringify(k)}:${stableStringify(value[k])}`).join(",")}}`;
  }
  return JSON.stringify(value);
}

function buildDatasetManifest(docs) {
  const normalized = docs
    .map((entry) => ({
      path: entry.path,
      data: toSerializable(entry.data),
    }))
    .sort((a, b) => a.path.localeCompare(b.path));

  const digest = crypto.createHash("sha256");
  for (const item of normalized) {
    digest.update(item.path);
    digest.update("\n");
    digest.update(stableStringify(item.data));
    digest.update("\n");
  }

  return {
    totalDocs: normalized.length,
    byCollection: countDocsByTopCollection(normalized),
    datasetSha256: digest.digest("hex"),
  };
}

function collectProdDomains(rawDocs, prodUsers) {
  const domains = new Set();
  const emailRegex = /[A-Z0-9._%+-]+@([A-Z0-9.-]+\.[A-Z]{2,})/gi;

  const addFromValue = (value) => {
    if (typeof value === "string") {
      let m;
      while ((m = emailRegex.exec(value)) !== null) {
        domains.add(m[1].toLowerCase());
      }
      emailRegex.lastIndex = 0;
    } else if (Array.isArray(value)) {
      value.forEach(addFromValue);
    } else if (isPlainObject(value)) {
      Object.values(value).forEach(addFromValue);
    }
  };

  for (const doc of rawDocs) addFromValue(doc.data);
  for (const user of prodUsers) {
    const email = user.email || "";
    const at = email.lastIndexOf("@");
    if (at > 0) domains.add(email.slice(at + 1).toLowerCase());
  }
  domains.delete("staging.invalid");
  return domains;
}

function scanSanitizedDocsForPii(docs, forbiddenDomains) {
  const findings = [];
  const rawEmail = /[A-Z0-9._%+-]+@([A-Z0-9.-]+\.[A-Z]{2,})/gi;
  const strictPhone = /^\+?[0-9][0-9\s\-()]{7,}$/;

  function isPhoneLike(value) {
    if (typeof value !== "string") return false;
    const trimmed = value.trim();
    if (!strictPhone.test(trimmed)) return false;
    const digitCount = (trimmed.match(/\d/g) || []).length;
    return digitCount >= 8;
  }

  const scanValue = (pathKey, value, docPath) => {
    if (typeof value === "string") {
      let m;
      while ((m = rawEmail.exec(value)) !== null) {
        const domain = m[1].toLowerCase();
        if (domain !== "staging.invalid" || forbiddenDomains.has(domain)) {
          findings.push({ type: "email_domain", domain, docPath, pathKey });
        }
      }
      rawEmail.lastIndex = 0;

      if (isPhoneLike(value) && !value.startsWith("+39000")) {
        findings.push({ type: "phone_pattern", docPath, pathKey, value: value.slice(0, 32) });
      }
    } else if (Array.isArray(value)) {
      value.forEach((item, i) => scanValue(`${pathKey}[${i}]`, item, docPath));
    } else if (isPlainObject(value)) {
      for (const [k, v] of Object.entries(value)) {
        scanValue(pathKey ? `${pathKey}.${k}` : k, v, docPath);
      }
    }
  };

  for (const doc of docs) {
    scanValue("", doc.data, doc.path);
  }
  return findings;
}

function checkReferentialIntegrity(docs) {
  const clients = new Set();
  const cars = new Set();

  for (const doc of docs) {
    const [col, id] = doc.path.split("/");
    if (col === "clients") clients.add(id);
    if (col === "cars") cars.add(id);
  }

  const broken = [];
  for (const doc of docs) {
    const [col, id] = doc.path.split("/");
    if (col === "cars") {
      if (doc.data.customerId && !clients.has(doc.data.customerId)) {
        broken.push({ doc: `cars/${id}`, field: "customerId", target: doc.data.customerId });
      }
    }
    if (col === "appointments") {
      if (doc.data.customerId && !clients.has(doc.data.customerId)) {
        broken.push({ doc: `appointments/${id}`, field: "customerId", target: doc.data.customerId });
      }
      if (doc.data.contactPersonId && !clients.has(doc.data.contactPersonId)) {
        broken.push({ doc: `appointments/${id}`, field: "contactPersonId", target: doc.data.contactPersonId });
      }
      if (doc.data.vehicleId && !cars.has(doc.data.vehicleId)) {
        broken.push({ doc: `appointments/${id}`, field: "vehicleId", target: doc.data.vehicleId });
      }
    }
  }
  return broken;
}

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

async function main() {
  const start = new Date().toISOString();
  const confirmation = process.env.MIRROR_CONFIRMATION || "";
  const dryRun = String(process.env.MIRROR_DRY_RUN || "false").toLowerCase() === "true";
  const salt = process.env.MIRROR_PSEUDONYM_SALT || "";

  if (confirmation !== REQUIRED_CONFIRMATION) {
    throw new Error(`Invalid confirmation. Required exactly: '${REQUIRED_CONFIRMATION}'`);
  }
  if (!salt || salt.length < 16) {
    throw new Error("MIRROR_PSEUDONYM_SALT missing or too short (min 16 chars)");
  }

  const prodSa = parseServiceAccount(process.env.PROD_SA_PATH, PROD_PROJECT_ID, "prod");
  const stagingSa = parseServiceAccount(process.env.STAGING_SA_PATH, STAGING_PROJECT_ID, "staging");

  const prodApp = admin.initializeApp(
    { credential: admin.credential.cert(prodSa), projectId: PROD_PROJECT_ID },
    "mirror-prod"
  );
  const stagingApp = admin.initializeApp(
    { credential: admin.credential.cert(stagingSa), projectId: STAGING_PROJECT_ID },
    "mirror-staging"
  );

  const prodDb = admin.firestore(prodApp);
  const stagingDb = admin.firestore(stagingApp);
  const prodAuth = admin.auth(prodApp);
  const stagingAuth = admin.auth(stagingApp);

  const artifactsDir = process.env.MIRROR_ARTIFACTS_DIR || "artifacts/mirror";
  const summaryPath = path.join(artifactsDir, "summary.json");
  const manifestPath = path.join(artifactsDir, "manifest.json");
  const prodSnapshotPath = path.join(artifactsDir, "prod-export-raw.json");
  const sanitizedSnapshotPath = path.join(artifactsDir, "prod-export-sanitized.json");
  const stagingBackupPath = path.join(artifactsDir, "staging-backup-pre-refresh.json");
  const stagingPostPath = path.join(artifactsDir, "staging-post-import.json");

  console.log("[mirror] exporting prod firestore...");
  const prodRaw = await exportDataset(prodDb, COLLECTIONS);
  const prodUsers = await listAllUsers(prodAuth);

  console.log("[mirror] sanitizing dataset...");
  const sanitized = sanitizeDataset(prodRaw, salt);
  const sanitizedManifest = buildDatasetManifest(sanitized);

  const forbiddenDomains = collectProdDomains(prodRaw, prodUsers);
  const piiFindingsPre = scanSanitizedDocsForPii(sanitized, forbiddenDomains);
  if (piiFindingsPre.length > 0) {
    writeJson(path.join(artifactsDir, "pii-findings-pre.json"), piiFindingsPre.slice(0, 500));
    throw new Error(`PII scan failed on sanitized payload (pre-import), findings=${piiFindingsPre.length}`);
  }

  const riIssuesPre = checkReferentialIntegrity(sanitized);
  if (riIssuesPre.length > 0) {
    writeJson(path.join(artifactsDir, "ri-issues-pre.json"), riIssuesPre.slice(0, 500));
    throw new Error(`Referential integrity failed on sanitized payload (pre-import), issues=${riIssuesPre.length}`);
  }

  console.log("[mirror] creating staging backups (firestore + auth)...");
  const stagingBackup = await exportDataset(stagingDb, COLLECTIONS);
  const stagingAuthBackupRecords = await listAllUsers(stagingAuth);
  const stagingAuthBackup = stagingAuthBackupRecords.map((u) => ({
    uid: u.uid,
    email: u.email,
    displayName: u.displayName,
    phoneNumber: u.phoneNumber,
    disabled: u.disabled,
    emailVerified: u.emailVerified,
    customClaims: u.customClaims || {},
  }));

  writeJson(prodSnapshotPath, prodRaw.map((d) => ({ path: d.path, data: toSerializable(d.data) })));
  writeJson(sanitizedSnapshotPath, sanitized.map((d) => ({ path: d.path, data: toSerializable(d.data) })));
  writeJson(stagingBackupPath, stagingBackup.map((d) => ({ path: d.path, data: toSerializable(d.data) })));
  writeJson(path.join(artifactsDir, "staging-auth-backup.json"), stagingAuthBackup);

  const summary = {
    startedAt: start,
    dryRun,
    sourceProject: PROD_PROJECT_ID,
    targetProject: STAGING_PROJECT_ID,
    firestore: {
      collections: COLLECTIONS,
      prodCounts: countDocsByTopCollection(prodRaw),
      sanitizedCounts: countDocsByTopCollection(sanitized),
      sanitizedManifestSha256: sanitizedManifest.datasetSha256,
    },
    auth: {
      prodUsers: prodUsers.length,
      stagingUsersBefore: stagingAuthBackup.length,
    },
    status: "started",
  };

  if (dryRun) {
    writeJson(manifestPath, { sanitizedManifest });
    summary.status = "dry-run-success";
    writeJson(summaryPath, summary);
    console.log("[mirror] dry run complete");
    return;
  }

  let firestoreWiped = false;
  let authChanged = false;
  try {
    console.log("[mirror] wiping staging firestore collections...");
    await wipeCollections(stagingDb, COLLECTIONS);
    firestoreWiped = true;

    console.log("[mirror] importing sanitized dataset into staging...");
    await importDataset(stagingDb, sanitized);

    console.log("[mirror] syncing auth users prod -> staging...");
    const authStats = await syncAuthUsers(prodAuth, stagingAuth, salt);
    authChanged = true;

    console.log("[mirror] post-import verification...");
    const stagingPost = await exportDataset(stagingDb, COLLECTIONS);
    const stagingPostManifest = buildDatasetManifest(stagingPost);
    writeJson(stagingPostPath, stagingPost.map((d) => ({ path: d.path, data: toSerializable(d.data) })));

    const piiFindingsPost = scanSanitizedDocsForPii(stagingPost, forbiddenDomains);
    if (piiFindingsPost.length > 0) {
      writeJson(path.join(artifactsDir, "pii-findings-post.json"), piiFindingsPost.slice(0, 500));
      throw new Error(`PII scan failed on staging post-import, findings=${piiFindingsPost.length}`);
    }

    const riIssuesPost = checkReferentialIntegrity(stagingPost);
    if (riIssuesPost.length > 0) {
      writeJson(path.join(artifactsDir, "ri-issues-post.json"), riIssuesPost.slice(0, 500));
      throw new Error(`Referential integrity failed on staging post-import, issues=${riIssuesPost.length}`);
    }

    if (stagingPostManifest.totalDocs !== sanitizedManifest.totalDocs) {
      throw new Error(
        `Post-import doc count mismatch: staging=${stagingPostManifest.totalDocs}, sanitized=${sanitizedManifest.totalDocs}`
      );
    }

    if (stagingPostManifest.datasetSha256 !== sanitizedManifest.datasetSha256) {
      throw new Error(
        `Post-import manifest hash mismatch: staging=${stagingPostManifest.datasetSha256}, sanitized=${sanitizedManifest.datasetSha256}`
      );
    }

    writeJson(manifestPath, {
      sanitizedManifest,
      stagingPostManifest,
      manifestMatch: true,
    });

    summary.firestore.stagingCountsAfter = countDocsByTopCollection(stagingPost);
    summary.firestore.stagingManifestSha256 = stagingPostManifest.datasetSha256;
    summary.auth = {
      ...summary.auth,
      ...authStats,
      stagingUsersAfter: (await listAllUsers(stagingAuth)).length,
    };
    summary.status = "success";
    summary.finishedAt = new Date().toISOString();
    writeJson(summaryPath, summary);
    console.log("[mirror] success");
  } catch (err) {
    summary.status = "failed";
    summary.error = String(err?.message || err);
    summary.failedAt = new Date().toISOString();
    writeJson(summaryPath, summary);

    console.error("[mirror] failed, starting rollback...", err?.message || err);
    try {
      if (firestoreWiped) {
        await wipeCollections(stagingDb, COLLECTIONS);
      }
      await importDataset(stagingDb, stagingBackup);
      if (authChanged) {
        await restoreAuthBackup(stagingAuth, stagingAuthBackup);
      }
      writeJson(path.join(artifactsDir, "rollback-status.json"), {
        status: "rollback-success",
        at: new Date().toISOString(),
      });
    } catch (rollbackErr) {
      writeJson(path.join(artifactsDir, "rollback-status.json"), {
        status: "rollback-failed",
        at: new Date().toISOString(),
        error: String(rollbackErr?.message || rollbackErr),
      });
    }
    throw err;
  } finally {
    await Promise.allSettled([
      prodApp.delete(),
      stagingApp.delete(),
    ]);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
