import fs from "node:fs";
import path from "node:path";
import yaml from "js-yaml";

export const MIN_LITERAL_LENGTH = 3;

function readDataDoc(dataDir, file) {
  return (
    yaml.load(fs.readFileSync(path.join(dataDir, file), "utf8"), {
      schema: yaml.JSON_SCHEMA,
    }) ?? {}
  );
}

// A .yaml file contributes records only through a top-level `records:` list
// (an empty `records:` is fine). Anything else is skipped by loadRecords and
// reported by checkDataFiles.
function hasRecordsList(doc) {
  return (
    doc !== null &&
    typeof doc === "object" &&
    !Array.isArray(doc) &&
    "records" in doc &&
    (doc.records == null || Array.isArray(doc.records))
  );
}

export function loadRecords(dataDir) {
  if (!fs.existsSync(dataDir)) return [];
  const out = [];
  for (const file of fs
    .readdirSync(dataDir)
    .filter((f) => f.endsWith(".yaml"))
    .sort()) {
    const doc = readDataDoc(dataDir, file);
    if (!hasRecordsList(doc)) continue;
    for (const r of doc.records ?? []) out.push({ ...r, file });
  }
  return out;
}

// Files under data/ that loadRecords silently skips: a .yml file (only .yaml
// is loaded) and a .yaml file with no top-level `records` list.
export function checkDataFiles(dataDir) {
  if (!fs.existsSync(dataDir)) return [];
  const issues = [];
  for (const file of fs.readdirSync(dataDir).sort()) {
    if (file.endsWith(".yml")) {
      issues.push({
        rule: "data-file-ignored",
        file,
        message: `${file} is not loaded: only data/*.yaml files are read; rename it to .yaml`,
      });
    } else if (file.endsWith(".yaml") && !hasRecordsList(readDataDoc(dataDir, file))) {
      issues.push({
        rule: "data-file-ignored",
        file,
        message: `${file} is not loaded: it has no top-level records: list`,
      });
    }
  }
  return issues;
}

// Literals a record contributes to the closed-world lint:
// - lint: false            -> none
// - lint_literals present  -> exactly those (full override)
// - otherwise              -> value, display, and each field named in lint_fields
function recordLiterals(r) {
  if (r.lint === false) return [];
  // A non-list lint_literals is reported by lint-literals-invalid; index the
  // default literals meanwhile rather than crash or silently unguard.
  if (Array.isArray(r.lint_literals)) return r.lint_literals.map(String);
  const fields = [].concat(r.lint_fields ?? [])
    .map((f) => r[f])
    .filter(isIndexableFieldValue);
  const literals = [r.value, r.display].filter((v) => v != null);
  return [...new Set([...literals, ...fields].map(String))];
}

// Only strings and numbers become lint_fields literals; objects, arrays and
// booleans would stringify to noise such as "[object Object]".
export function isIndexableFieldValue(v) {
  return typeof v === "string" || typeof v === "number";
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
