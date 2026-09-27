import { isValidIsoDate } from "./ledger.mjs";

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

export function checkRecordFields(record) {
  const issues = [];

  // Check for missing source
  if (record.source == null) {
    issues.push({
      rule: "record-source-missing",
      message: `Record ${record.key} is missing a source URL`,
    });
  }

  // Check for missing verified
  if (record.verified == null) {
    issues.push({
      rule: "record-verified-missing",
      message: `Record ${record.key} is missing a verified date`,
    });
  }

  // Check verified is a string and a valid ISO date (only if verified is present)
  if (record.verified != null) {
    if (typeof record.verified !== "string") {
      issues.push({
        rule: "record-verified-invalid",
        message: `Record ${record.key} verified must be a string, got ${typeof record.verified}`,
      });
    } else if (!isValidIsoDate(record.verified)) {
      issues.push({
        rule: "record-verified-invalid",
        message: `Record ${record.key} verified is not a valid YYYY-MM-DD date: ${record.verified}`,
      });
    }
  }

  return issues;
}
