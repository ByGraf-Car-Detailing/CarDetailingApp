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
];

const PATTERNS = [
  /BEGIN PRIVATE KEY/, 
  /AIza[0-9A-Za-z\-_]{35}/,
  /-----BEGIN [A-Z ]*PRIVATE KEY-----/,
  /"private_key"\s*:/,
];

const findings = [];

function shouldSkipFile(filePath) {
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
