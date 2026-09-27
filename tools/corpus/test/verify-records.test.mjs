import test from "node:test";
import assert from "node:assert/strict";
import { checkDuplicateKeys, checkRecordFields } from "../verify-records.mjs";

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
