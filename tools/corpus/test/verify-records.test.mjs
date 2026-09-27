import test from "node:test";
import assert from "node:assert/strict";
import { checkDuplicateKeys } from "../verify-records.mjs";

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
