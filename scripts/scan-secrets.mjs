import fs from "node:fs";
import path from "node:path";

const ROOT = process.cwd();
const SKIP_DIRS = new Set([
  ".git",
  "node_modules",
  "playwright-report",
  "test-results",
  ".firebase",
]);

const FILE_SKIP_SUFFIXES = [
  ".png",
  ".jpg",
  ".jpeg",
  ".gif",
  ".webm",
  ".zip",
  ".ico",
  ".woff",
  ".woff2",
  ".ttf",
  ".mp4",
  ".lock",
  ".example.json",
];

const PATTERNS = [
  /BEGIN PRIVATE KEY/,
  /-----BEGIN [A-Z ]*PRIVATE KEY-----/,
  /xox[baprs]-[0-9A-Za-z-]{10,}/,
  /ghp_[0-9A-Za-z]{20,}/,
  /gho_[0-9A-Za-z]{20,}/,
  /codex_session_id:\s*(N\/A|TBD|placeholder|none|unknown|hardcoded|test_session|REPLACE_ME)/gi,
  /claude_session_id:\s*(N\/A|TBD|placeholder|none|unknown|hardcoded|test_session|REPLACE_ME)/gi,
];

const findings = [];

function shouldSkipFile(filePath) {
  if (filePath === "scripts/scan-secrets.mjs") return true;
  return FILE_SKIP_SUFFIXES.some((suffix) => filePath.endsWith(suffix));
}

function walk(dir) {
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  for (const entry of entries) {
    const abs = path.join(dir, entry.name);
    const rel = path.relative(ROOT, abs).replace(/\\/g, "/");

    if (entry.isDirectory()) {
      if (SKIP_DIRS.has(entry.name)) continue;
      walk(abs);
      continue;
    }

    if (shouldSkipFile(rel)) continue;

    let content = "";
    try {
      content = fs.readFileSync(abs, "utf8");
    } catch {
      continue;
    }

    for (const pattern of PATTERNS) {
      if (pattern.test(content)) {
        findings.push({ file: rel, pattern: pattern.toString() });
        break;
      }
    }
  }
}

walk(ROOT);

if (findings.length > 0) {
  console.error("Secret scan failed. Suspicious content found:");
  for (const finding of findings) {
    console.error(`- ${finding.file} (${finding.pattern})`);
  }
  process.exit(1);
}

console.log("Secret scan passed.");
