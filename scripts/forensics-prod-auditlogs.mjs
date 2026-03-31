import fs from "node:fs";
import path from "node:path";
import { GoogleAuth } from "google-auth-library";

const PROD_PROJECT_ID = "cardetailingapp-e6c95";

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

function buildFilter(startIso, endIso) {
  return [
    'resource.type="firestore_instance"',
    "logName:cloudaudit.googleapis.com",
    `timestamp>="${startIso}"`,
    `timestamp<="${endIso}"`,
    '(protoPayload.methodName="google.firestore.v1.Firestore.Commit" OR protoPayload.methodName="google.firestore.v1.Firestore.Write")',
  ].join(" AND ");
}

async function listEntries(client, body) {
  const result = [];
  let pageToken = "";

  do {
    const reqBody = pageToken ? { ...body, pageToken } : body;
    const res = await client.request({
      url: "https://logging.googleapis.com/v2/entries:list",
      method: "POST",
      data: reqBody,
    });

    const data = res.data || {};
    for (const entry of data.entries || []) result.push(entry);
    pageToken = data.nextPageToken || "";
  } while (pageToken);

  return result;
}

function summarizeEntries(entries) {
  const events = entries.map((entry) => {
    const p = entry.protoPayload || {};
    const method = p.methodName || "";
    const principalEmail = p.authenticationInfo?.principalEmail || "unknown";
    const resourceName = p.resourceName || "";
    const request = p.request || {};

    return {
      timestamp: entry.timestamp || null,
      method,
      principalEmail,
      resourceName,
      source: "cloud-audit-log",
      requestKeys: Object.keys(request || {}).slice(0, 20),
    };
  });

  const byActor = {};
  for (const e of events) byActor[e.principalEmail] = (byActor[e.principalEmail] || 0) + 1;

  return {
    totalEntries: events.length,
    actors: byActor,
    events,
  };
}

async function main() {
  const incidentId = String(process.env.INCIDENT_ID || "").trim();
  if (!incidentId) throw new Error("INCIDENT_ID is required");

  const saPath = process.env.PROD_SA_PATH;
  const sa = assertServiceAccount(saPath);

  const now = new Date();
  const endIso = now.toISOString();
  const startIso = new Date(now.getTime() - 72 * 60 * 60 * 1000).toISOString();
  const filter = buildFilter(startIso, endIso);

  const auth = new GoogleAuth({
    credentials: sa,
    scopes: ["https://www.googleapis.com/auth/cloud-platform"],
  });
  const client = await auth.getClient();

  const body = {
    resourceNames: [`projects/${PROD_PROJECT_ID}`],
    filter,
    orderBy: "timestamp desc",
    pageSize: 1000,
  };

  const entries = await listEntries(client, body);
  const summary = summarizeEntries(entries);

  const outDir = path.resolve("artifacts", incidentId);
  fs.mkdirSync(outDir, { recursive: true });
  fs.writeFileSync(path.join(outDir, "prod-audit-write-events-72h.json"), JSON.stringify(summary, null, 2));
  fs.writeFileSync(path.join(outDir, "prod-audit-filter.txt"), filter);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
