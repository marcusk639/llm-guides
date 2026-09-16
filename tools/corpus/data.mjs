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

// Literals a record contributes to the closed-world lint:
// - lint: false            -> none
// - lint_literals present  -> exactly those (full override)
// - otherwise              -> value, display, and each field named in lint_fields
function recordLiterals(r) {
  if (r.lint === false) return [];
  if (r.lint_literals != null) return r.lint_literals.map(String);
  const fields = [r.value, r.display, ...(r.lint_fields ?? []).map((f) => r[f])];
  return [...new Set(fields.filter((v) => v != null).map(String))];
}

export function literalIndex(records) {
  const index = new Map();
  for (const r of records) {
    for (const literal of recordLiterals(r)) {
      if (literal.length < MIN_LITERAL_LENGTH) continue;
      if (!index.has(literal)) index.set(literal, []);
      index.get(literal).push(r.key);
    }
  }
  return index;
}

// The index a page of `topic` is linted against: corpus-global records (no
// lint_scope) plus records whose lint_scope lists that topic. A page with no
// or a non-string topic gets unscoped records only.
export function literalIndexForTopic(records, topic) {
  return literalIndex(
    records.filter(
      (r) =>
        r.lint_scope == null ||
        (typeof topic === "string" && [].concat(r.lint_scope).includes(topic)),
    ),
  );
}

export function recordsByKey(records) {
  return new Map(records.map((r) => [r.key, r]));
}
