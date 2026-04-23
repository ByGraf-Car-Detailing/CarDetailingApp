import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const adminDir = path.join(root, "public", "src", "admin");

const forbiddenPatterns = [
  {
    pattern: /<strong>\s*updatedBy\s*:/i,
    reason: "UI admin must not render `updatedBy` directly; use operator display name only.",
  },
  {
    pattern: /\$\{[^}]*\bupdatedBy\b(?!Name)[^}]*\}/,
    reason: "UI template interpolates technical `updatedBy`; render `updatedByName` instead.",
  },
  {
    pattern: /<strong>\s*email\s*:/i,
    reason: "UI admin must not expose operator email fields.",
  },
];

function listJsFiles(dir) {
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      files.push(...listJsFiles(full));
      continue;
    }
    if (entry.isFile() && full.endsWith(".js")) files.push(full);
  }
  return files;
}

const violations = [];
for (const file of listJsFiles(adminDir)) {
  const source = fs.readFileSync(file, "utf8");
  for (const rule of forbiddenPatterns) {
    if (rule.pattern.test(source)) {
      violations.push(`${path.relative(root, file)} -> ${rule.reason}`);
    }
  }
}

if (violations.length > 0) {
  console.error("check-admin-operator-privacy failed");
  for (const entry of violations) console.error(`- ${entry}`);
  process.exit(1);
}

console.log("check-admin-operator-privacy passed");
