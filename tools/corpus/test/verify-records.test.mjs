import test from "node:test";
import assert from "node:assert/strict";
import {
  checkDuplicateKeys,
  checkRecordFields,
  checkLintLiteralsStale,
} from "../verify-records.mjs";

const rec = (key, file = "models.yaml", extra = {}) => ({
  key,
  value: "x",
  source: "https://example.invalid/docs",
  verified: "2026-09-16",
  volatility: "high",
  file,
  ...extra,
});

test("accepts a record set with unique keys", () => {
  assert.deepEqual(
    checkDuplicateKeys([rec("a.b"), rec("a.c"), rec("d.e")]),
    [],
  );
});

test("reports a key that appears twice, naming both files", () => {
  const issues = checkDuplicateKeys([
    rec("a.b", "models.yaml"),
    rec("a.b", "models-other.yaml"),
  ]);
  assert.equal(issues.length, 1);
  assert.equal(issues[0].rule, "record-duplicate-key");
  assert.equal(issues[0].file, "models.yaml");
  assert.match(issues[0].message, /a\.b/);
  assert.match(issues[0].message, /models\.yaml/);
  assert.match(issues[0].message, /models-other\.yaml/);
});

test("reports a key appearing three times exactly once", () => {
  const issues = checkDuplicateKeys([rec("a.b"), rec("a.b"), rec("a.b")]);
  assert.equal(issues.length, 1);
});

test("accepts a record with source and a valid verified date", () => {
  assert.deepEqual(checkRecordFields(rec("a.b")), []);
});

test("reports a missing source", () => {
  const r = rec("a.b");
  delete r.source;
  const issues = checkRecordFields(r);
  assert.equal(issues.length, 1);
  assert.equal(issues[0].rule, "record-source-missing");
  assert.match(issues[0].message, /a\.b/);
});

test("reports an empty-string source", () => {
  const issues = checkRecordFields(rec("a.b", "models.yaml", { source: "" }));
  assert.equal(
    issues.some((i) => i.rule === "record-source-missing"),
    true,
  );
});

test("reports a missing verified", () => {
  const r = rec("a.b");
  delete r.verified;
  assert.equal(
    checkRecordFields(r).some((i) => i.rule === "record-verified-missing"),
    true,
  );
});

test("reports a verified that is not a real calendar date", () => {
  const issues = checkRecordFields(
    rec("a.b", "models.yaml", { verified: "2026-02-30" }),
  );
  assert.equal(
    issues.some((i) => i.rule === "record-verified-invalid"),
    true,
  );
});

test("reports a verified that is a Date or another non-string", () => {
  // NOT reachable through this repo's loader: data.mjs reads with
  // yaml.JSON_SCHEMA, so an unquoted 2026-09-16 stays a string. The guard is
  // defensive against a caller that hands over a Date, a number, or a map.
  const issues = checkRecordFields(
    rec("a.b", "models.yaml", { verified: new Date("2026-09-16") }),
  );
  assert.equal(
    issues.some((i) => i.rule === "record-verified-invalid"),
    true,
  );
});

test("does not report verified-invalid when verified is absent", () => {
  const r = rec("a.b");
  delete r.verified;
  assert.equal(
    checkRecordFields(r).some((i) => i.rule === "record-verified-invalid"),
    false,
  );
});

test("accepts a literal that is a whole field value", () => {
  const r = rec("a.b", "models.yaml", {
    display: "600 seconds for command handlers",
    lint_literals: ["600 seconds for command handlers"],
  });
  assert.deepEqual(checkLintLiteralsStale(r), []);
});

test("accepts a literal that is a fragment of a field value", () => {
  const r = rec("a.b", "models.yaml", {
    display: "a shared 1.5-second budget, raised to match a longer timeout",
    lint_literals: ["1.5-second budget"],
  });
  assert.deepEqual(checkLintLiteralsStale(r), []);
});

test("accepts a literal that matches a numeric field", () => {
  const r = rec("a.b", "models.yaml", { value: 600, lint_literals: ["600"] });
  assert.deepEqual(checkLintLiteralsStale(r), []);
});

test("reports a literal matching no field on the record", () => {
  const r = rec("a.b", "models.yaml", {
    display: "60 seconds for agent handlers",
    lint_literals: ["30 seconds for agent handlers"],
  });
  const issues = checkLintLiteralsStale(r);
  assert.equal(issues.length, 1);
  assert.equal(issues[0].rule, "lint-literals-stale");
  assert.match(issues[0].message, /30 seconds for agent handlers/);
});

test("does not let a literal satisfy itself via the lint_literals field", () => {
  const r = rec("a.b", "models.yaml", {
    value: "x",
    lint_literals: ["nowhere else on this record"],
  });
  assert.equal(checkLintLiteralsStale(r).length, 1);
});

test("ignores a record whose lint_literals is absent or malformed", () => {
  assert.deepEqual(checkLintLiteralsStale(rec("a.b")), []);
  assert.deepEqual(
    checkLintLiteralsStale(
      rec("a.b", "models.yaml", { lint_literals: "not a list" }),
    ),
    [],
  );
});

test("a literal is not satisfied by the record's own key or lint config", () => {
  // NON_CONTENT_FIELDS is partly redundant — isIndexableFieldValue already drops
  // the array-valued fields by type — but `key`, `file` and `lint_scope` are
  // load-bearing string fields, and nothing pinned them. A literal that matches
  // only one of those has not been proven to still describe the record's value.
  const viaKey = rec("timeout.value", "models.yaml", {
    value: "x",
    lint_literals: ["timeout.value"],
  });
  assert.equal(checkLintLiteralsStale(viaKey).length, 1, "key must not satisfy a literal");

  const viaScope = rec("a.b", "models.yaml", {
    value: "x",
    lint_scope: "claude-code",
    lint_literals: ["claude-code"],
  });
  assert.equal(
    checkLintLiteralsStale(viaScope).length,
    1,
    "lint_scope must not satisfy a literal",
  );

  const viaFile = rec("a.b", "models-other.yaml", {
    value: "x",
    lint_literals: ["models-other.yaml"],
  });
  assert.equal(checkLintLiteralsStale(viaFile).length, 1, "file must not satisfy a literal");
});

