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
