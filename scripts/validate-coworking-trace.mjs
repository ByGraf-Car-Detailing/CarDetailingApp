#!/usr/bin/env node
import fs from "node:fs";

const args = process.argv.slice(2);
const bodyFileIdx = args.indexOf("--body-file");
if (bodyFileIdx === -1 || !args[bodyFileIdx + 1]) {
  console.error("SESSION_ID_SOURCE_MISSING: --body-file is required");
  process.exit(1);
}

const bodyFile = args[bodyFileIdx + 1];
if (!fs.existsSync(bodyFile)) {
  console.error(`SESSION_ID_SOURCE_MISSING: body file not found: ${bodyFile}`);
  process.exit(1);
}

const body = fs.readFileSync(bodyFile, "utf8");
const required = [
  "codex_session_id:",
  "claude_session_id:",
  "binding_source:",
  "timeout_ms:",
  "question:",
  "options_considered:",
  "recommendation:",
  "residual_risk:",
];
const missing = required.filter((k) => !body.includes(k));
if (missing.length) {
  console.error(`Missing coworking trace fields: ${missing.join(", ")}`);
  process.exit(1);
}

const valueByKey = (key) => {
  const regex = new RegExp(`^\\s*-\\s*${key}\\s*:\\s*(.+)$`, "im");
  const match = body.match(regex);
  return match ? match[1].trim() : "";
};

const bannedValue = /^(N\/A|TBD|placeholder|none|unknown)$/i;
for (const key of [
  "codex_session_id",
  "claude_session_id",
  "binding_source",
  "question",
  "options_considered",
  "recommendation",
  "residual_risk",
]) {
  const value = valueByKey(key);
  if (!value || bannedValue.test(value)) {
    console.error(`Coworking trace field '${key}' is empty or placeholder.`);
    process.exit(1);
  }
}

const sessionIdRegex =
  /^(?:[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})$/i;
const codexSessionId = valueByKey("codex_session_id");
const claudeSessionId = valueByKey("claude_session_id");
if (!sessionIdRegex.test(codexSessionId)) {
  console.error("SESSION_ID_SOURCE_MISSING: codex_session_id must be UUID.");
  process.exit(1);
}
if (!sessionIdRegex.test(claudeSessionId)) {
  console.error("SESSION_ID_SOURCE_MISSING: claude_session_id must be UUID.");
  process.exit(1);
}
if (codexSessionId !== claudeSessionId) {
  console.error("SESSION_BINDING_MISMATCH: codex_session_id != claude_session_id");
  process.exit(1);
}

const bindingSource = valueByKey("binding_source");
if (bindingSource !== "CODEX_THREAD_ID") {
  console.error("SESSION_ID_SOURCE_MISSING: binding_source must be CODEX_THREAD_ID");
  process.exit(1);
}

const timeoutMatch = body.match(/timeout_ms:\s*(\d+)/i);
if (!timeoutMatch || Number(timeoutMatch[1]) < 600000) {
  console.error("timeout_ms is missing or below mandatory minimum (600000).");
  process.exit(1);
}

console.log("Coworking trace validation passed.");
