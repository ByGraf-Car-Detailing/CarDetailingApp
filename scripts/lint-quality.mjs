import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const appPath = path.join(root, "public", "src", "app.js");

const appJs = fs.readFileSync(appPath, "utf8");
const errors = [];

function countOccurrences(haystack, needle) {
  const match = haystack.match(new RegExp(needle, "g"));
  return match ? match.length : 0;
}

function extractFunctionBody(source, functionName) {
  const start = source.indexOf(`function ${functionName}`);
  if (start === -1) return "";
  const braceStart = source.indexOf("{", start);
  if (braceStart === -1) return "";
  let depth = 0;
  for (let i = braceStart; i < source.length; i += 1) {
    const ch = source[i];
    if (ch === "{") depth += 1;
    if (ch === "}") {
      depth -= 1;
      if (depth === 0) {
        return source.slice(braceStart + 1, i);
      }
    }
  }
  return "";
}

function estimateComplexity(source) {
  const tokens = source.match(/\b(if|else if|for|while|catch|\?|&&|\|\|)\b/g);
  return 1 + (tokens ? tokens.length : 0);
}

const errorListenerCount = countOccurrences(
  appJs,
  String.raw`window\.addEventListener\(["']error["']`
);
if (errorListenerCount > 1) {
  errors.push(
    `Duplicate global error listener detected: window.addEventListener(\"error\") appears ${errorListenerCount} times`
  );
}

const rejectionListenerCount = countOccurrences(
  appJs,
  String.raw`window\.addEventListener\(["']unhandledrejection["']`
);
if (rejectionListenerCount > 1) {
  errors.push(
    `Duplicate unhandledrejection listener detected: appears ${rejectionListenerCount} times`
  );
}

const functionsToCheck = [
  { name: "updateUI", max: 22 },
  { name: "showDashboard", max: 35 },
];

for (const fn of functionsToCheck) {
  const body = extractFunctionBody(appJs, fn.name);
  if (!body) {
    errors.push(`Function ${fn.name} not found in app.js`);
    continue;
  }
  const complexity = estimateComplexity(body);
  if (complexity > fn.max) {
    errors.push(
      `Complexity gate failed for ${fn.name}: estimated ${complexity}, max ${fn.max}`
    );
  }
}

if (errors.length > 0) {
  console.error("lint:quality failed");
  for (const error of errors) {
    console.error(`- ${error}`);
  }
  process.exit(1);
}

console.log("lint:quality passed");
