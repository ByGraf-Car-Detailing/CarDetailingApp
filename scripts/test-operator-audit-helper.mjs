import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";

async function loadOperatorIdentityModule() {
  const modulePath = path.join(process.cwd(), "public", "src", "services", "operatorIdentity.js");
  const source = fs.readFileSync(modulePath, "utf8");
  const mod = new vm.SourceTextModule(source);
  await mod.link(() => {
    throw new Error("operatorIdentity.js should not import external modules.");
  });
  await mod.evaluate();
  return mod.namespace;
}

async function run() {
  const {
    OPERATOR_UNKNOWN_NAME,
    buildOperatorAuditActor,
    resolveOperatorAuditName,
  } = await loadOperatorIdentityModule();

  const nameFromField = resolveOperatorAuditName({ updatedByName: "Mario Rossi" });
  assert.equal(nameFromField, "Mario Rossi", "updatedByName should be preferred");

  const unknownName = resolveOperatorAuditName({});
  assert.equal(unknownName, OPERATOR_UNKNOWN_NAME, "empty input must fallback to placeholder");

  const actor = buildOperatorAuditActor({
    email: "mario.rossi@example.com",
    sessionDisplayName: "",
    authDisplayName: "",
  });
  assert.equal(actor.updatedBy, "mario.rossi@example.com", "technical id must keep email for audit");
  assert.equal(actor.updatedByName, OPERATOR_UNKNOWN_NAME, "actor name must not fallback to email");
}

await run();
console.log("test-operator-audit-helper passed");
