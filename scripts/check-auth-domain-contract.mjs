import fs from "node:fs";
import path from "node:path";
import { GoogleAuth } from "google-auth-library";

const CONTRACT_PATH =
  process.env.AUTH_CONTRACT_PATH || path.resolve(process.cwd(), "config/auth-domain-contract.json");

function parseServiceAccount(raw, name) {
  if (!raw || !raw.trim()) {
    throw new Error(`Missing secret ${name}`);
  }
  try {
    return JSON.parse(raw);
  } catch (error) {
    throw new Error(`Invalid JSON in ${name}: ${error.message}`);
  }
}

async function getAccessToken(credentials) {
  const auth = new GoogleAuth({
    credentials,
    scopes: ["https://www.googleapis.com/auth/cloud-platform"],
  });
  const client = await auth.getClient();
  const tokenResponse = await client.getAccessToken();
  const token = tokenResponse?.token || tokenResponse;
  if (!token) {
    throw new Error("Unable to acquire access token");
  }
  return token;
}

async function fetchJson(url, token) {
  const response = await fetch(url, {
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
  });
  if (!response.ok) {
    const body = await response.text();
    throw new Error(`${url} -> HTTP ${response.status}: ${body}`);
  }
  return response.json();
}

async function fetchProjectAuthSnapshot(projectId, credentials) {
  const token = await getAccessToken(credentials);
  const base = `https://identitytoolkit.googleapis.com/admin/v2/projects/${projectId}`;
  const config = await fetchJson(`${base}/config`, token);

  let googleEnabled = false;
  try {
    const googleConfig = await fetchJson(`${base}/defaultSupportedIdpConfigs/google.com`, token);
    googleEnabled = googleConfig?.enabled === true;
  } catch {
    googleEnabled = false;
  }

  return {
    projectId,
    emailPasswordEnabled: config?.signIn?.email?.enabled === true,
    googleEnabled,
    authorizedDomains: Array.isArray(config?.authorizedDomains) ? config.authorizedDomains : [],
  };
}

function validateSnapshot(label, contract, snapshot) {
  const failures = [];

  const providerState = {
    emailPassword: snapshot.emailPasswordEnabled,
    google: snapshot.googleEnabled,
  };

  for (const provider of contract.requiredProviders || []) {
    if (!providerState[provider]) {
      failures.push(`${label}: required provider disabled/missing -> ${provider}`);
    }
  }

  const domainSet = new Set(snapshot.authorizedDomains.map((d) => d.toLowerCase()));
  for (const domain of contract.requiredDomains || []) {
    if (!domainSet.has(domain.toLowerCase())) {
      failures.push(`${label}: missing required authorized domain -> ${domain}`);
    }
  }

  for (const domain of contract.forbiddenDomains || []) {
    if (domainSet.has(domain.toLowerCase())) {
      failures.push(`${label}: forbidden domain present -> ${domain}`);
    }
  }

  return failures;
}

function printSnapshot(label, snapshot) {
  const providers = [
    `emailPassword=${snapshot.emailPasswordEnabled ? "on" : "off"}`,
    `google=${snapshot.googleEnabled ? "on" : "off"}`,
  ].join(", ");
  console.log(`[auth-parity] ${label} providers: ${providers}`);
  console.log(
    `[auth-parity] ${label} domains(${snapshot.authorizedDomains.length}): ${snapshot.authorizedDomains
      .slice()
      .sort()
      .join(", ")}`
  );
}

async function main() {
  if (!fs.existsSync(CONTRACT_PATH)) {
    throw new Error(`Missing auth-domain contract: ${CONTRACT_PATH}`);
  }
  const contract = JSON.parse(fs.readFileSync(CONTRACT_PATH, "utf8"));

  const stagingSa = parseServiceAccount(
    process.env.FIREBASE_SERVICE_ACCOUNT_STAGING || "",
    "FIREBASE_SERVICE_ACCOUNT_STAGING"
  );
  const prodSa = parseServiceAccount(
    process.env.FIREBASE_SERVICE_ACCOUNT_PROD || "",
    "FIREBASE_SERVICE_ACCOUNT_PROD"
  );

  const staging = contract?.staging;
  const prod = contract?.prod;
  if (!staging?.projectId || !prod?.projectId) {
    throw new Error("Invalid contract: missing staging/prod projectId");
  }

  const [stagingSnapshot, prodSnapshot] = await Promise.all([
    fetchProjectAuthSnapshot(staging.projectId, stagingSa),
    fetchProjectAuthSnapshot(prod.projectId, prodSa),
  ]);

  printSnapshot("staging", stagingSnapshot);
  printSnapshot("prod", prodSnapshot);

  const failures = [
    ...validateSnapshot("staging", staging, stagingSnapshot),
    ...validateSnapshot("prod", prod, prodSnapshot),
  ];

  if (failures.length > 0) {
    console.error("[auth-parity] FAIL");
    for (const failure of failures) {
      console.error(`- ${failure}`);
    }
    process.exit(1);
  }

  console.log("[auth-parity] PASS");
}

main().catch((error) => {
  console.error("[auth-parity] ERROR:", error.message);
  process.exit(1);
});
