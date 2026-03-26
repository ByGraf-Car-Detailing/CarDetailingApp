// scripts/extract-bugs.mjs
import fs from "node:fs";
import path from "node:path";

const inFile = process.argv[2] ?? path.join("test-results", "report.json");
const outMd = path.join("test-results", "bugs.md");
const outJson = path.join("test-results", "bugs.json");

const stripAnsi = (s) => (s ?? "").replace(/\x1b\[[0-9;]*m/g, "");

function* iterSuites(suites, prefix = []) {
  for (const s of suites ?? []) {
    const title = s.title ? [...prefix, s.title] : prefix;
    for (const spec of s.specs ?? []) yield { suitePath: title, spec };
    yield* iterSuites(s.suites, title);
  }
}

const raw = JSON.parse(fs.readFileSync(inFile, "utf8"));
const bugs = [];

for (const { suitePath, spec } of iterSuites(raw.suites)) {
  if (spec.ok) continue;

  for (const t of spec.tests ?? []) {
    for (const r of t.results ?? []) {
      if (!r.error) continue;

      const attachments = (r.attachments ?? [])
        .filter((a) => a.path)
        .map((a) => ({
          name: a.name,
          contentType: a.contentType,
          path: a.path.replace(/\\/g, "/"),
        }));

      bugs.push({
        project: t.projectName,
        title: [...suitePath, spec.title].filter(Boolean).join(" > "),
        file: spec.file,
        line: spec.line,
        column: spec.column,
        error: stripAnsi(r.error.message),
        attachments,
      });
    }
  }
}

fs.mkdirSync("test-results", { recursive: true });
fs.writeFileSync(outJson, JSON.stringify({ bugs }, null, 2), "utf8");

const mdLines = [];
mdLines.push(`# Bug list (da Playwright JSON)\n`);
mdLines.push(`Totale: ${bugs.length}\n`);

bugs.forEach((b, i) => {
  mdLines.push(`## ${i + 1}) ${b.title}`);
  mdLines.push(`- Project: ${b.project}`);
  mdLines.push(`- Location: ${b.file}:${b.line}:${b.column}`);
  mdLines.push(`- Error:`);
  mdLines.push("```");
  mdLines.push(b.error.trim());
  mdLines.push("```");
  if (b.attachments.length) {
    mdLines.push(`- Attachments:`);
    for (const a of b.attachments) mdLines.push(`  - ${a.name}: ${a.path}`);
  }
  mdLines.push("");
});

fs.writeFileSync(outMd, mdLines.join("\n"), "utf8");

console.log(`Wrote: ${outMd}`);
console.log(`Wrote: ${outJson}`);
