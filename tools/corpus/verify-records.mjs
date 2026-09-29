import { isValidIsoDate } from "./ledger.mjs";
import { isIndexableFieldValue } from "./data.mjs";

// tools/corpus/verify-records.mjs
// Record-level checks the contract assigns to the Verify stage: things lint
// deliberately does not check because they are not bare-value problems.

// A duplicate key is silent in render — the later record wins — so nothing
// downstream can tell a shadowed record from a missing one.
export function checkDuplicateKeys(records) {
  const byKey = new Map();
  for (const r of records) {
    if (!byKey.has(r.key)) byKey.set(r.key, []);
    byKey.get(r.key).push(r.file ?? "(unknown file)");
  }
  const issues = [];
  for (const [key, files] of byKey) {
    if (files.length < 2) continue;
    issues.push({
      rule: "record-duplicate-key",
      // `file` is consumed by verifyCorpus to build the issue path, then dropped.
      file: files[0],
      message: `duplicate record key ${key}: defined ${files.length} times (${files.join(", ")}); render silently keeps only the last`,
    });
  }
  return issues;
}

// source and verified are required by the contract but checked by no tool:
// "The Verify stage checks them."
export function checkRecordFields(record) {
  const issues = [];
  if (record.source == null || String(record.source).trim() === "") {
    issues.push({
      rule: "record-source-missing",
      message: `record ${record.key}: no source; every value must name the URL it was read from`,
    });
  }
  if (!("verified" in record) || record.verified == null) {
    issues.push({
      rule: "record-verified-missing",
      message: `record ${record.key}: no verified date`,
    });
  } else if (
    typeof record.verified !== "string" ||
    !isValidIsoDate(record.verified)
  ) {
    issues.push({
      rule: "record-verified-invalid",
      message: `record ${record.key}: verified must be a quoted real date written YYYY-MM-DD; got ${JSON.stringify(record.verified)}`,
    });
  }
  return issues;
}

// Fields that describe lint configuration rather than the value itself. A
// literal must not be satisfied by the very list it appears in, and `key` is
// excluded so a literal cannot be justified by the record's own name.
const NON_CONTENT_FIELDS = new Set([
  "key",
  "file",
  "lint",
  "lint_literals",
  "lint_fields",
  "lint_scope",
  "tags",
]);

// Catches a literal left behind after the field it shadowed changed. It cannot
// catch the opposite and more dangerous direction — a field value now covered
// by no literal at all — which belongs to the verify agent's judgment.
export function checkLintLiteralsStale(record) {
  const literals = record.lint_literals;
  if (!Array.isArray(literals) || literals.length === 0) return [];
  const haystack = Object.entries(record)
    .filter(
      ([field, v]) =>
        !NON_CONTENT_FIELDS.has(field) && isIndexableFieldValue(v),
    )
    .map(([, v]) => String(v));
  const issues = [];
  for (const literal of literals) {
    if (!isIndexableFieldValue(literal)) continue;
    const needle = String(literal);
    if (haystack.some((h) => h.includes(needle))) continue;
    issues.push({
      rule: "lint-literals-stale",
      message: `record ${record.key}: lint_literals entry ${JSON.stringify(needle)} is not a substring of any field value on the record; the field it shadowed has probably changed`,
    });
  }
  return issues;
}
