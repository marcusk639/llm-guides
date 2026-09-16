import fs from "node:fs";
import path from "node:path";
import yaml from "js-yaml";

export const MIN_LITERAL_LENGTH = 3;

export function loadRecords(dataDir) {
  if (!fs.existsSync(dataDir)) return [];
  const out = [];
  for (const file of fs
    .readdirSync(dataDir)
    .filter((f) => f.endsWith(".yaml"))
    .sort()) {
    const doc =
      yaml.load(fs.readFileSync(path.join(dataDir, file), "utf8"), {
        schema: yaml.JSON_SCHEMA,
      }) ?? {};
    for (const r of doc.records ?? []) out.push({ ...r, file });
  }
  return out;
}

export function literalIndex(records) {
  const index = new Map();
  for (const r of records) {
    if (r.lint === false) continue;
    const literals =
      r.lint_literals ?? [r.value, r.display].filter((v) => v != null);
    for (const literal of literals.map(String)) {
      if (literal.length < MIN_LITERAL_LENGTH) continue;
      if (!index.has(literal)) index.set(literal, []);
      index.get(literal).push(r.key);
    }
  }
  return index;
}

export function recordsByKey(records) {
  return new Map(records.map((r) => [r.key, r]));
}
