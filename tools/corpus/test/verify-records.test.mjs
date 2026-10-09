import test from "node:test";
import assert from "node:assert/strict";
import { checkRecordFields } from "../verify-records.mjs";

const base = {
  key: "x.one",
  value: "1",
  volatility: "high",
  source: "https://example.com/a",
  verified: "2026-01-01",
};

function archivedIssues(record) {
  return checkRecordFields(record).filter(
    (i) => i.rule === "record-archived-invalid",
  );
}

test("an absent source_archived is not an issue", () => {
  assert.deepEqual(archivedIssues(base), []);
});

test("an absolute https source_archived is accepted", () => {
  assert.deepEqual(
    archivedIssues({
      ...base,
      source_archived: "https://archive.example/w/1/x",
    }),
    [],
  );
});

test("a relative, scheme-less, non-http or non-string source_archived is an issue", () => {
  for (const bad of [
    "./snap.html",
    "/snap",
    "archive.example/snap",
    "mailto:a@b.c",
    "ftp://example.com/x",
    42,
    ["https://archive.example/x"],
  ]) {
    assert.equal(
      archivedIssues({ ...base, source_archived: bad }).length,
      1,
      `expected one issue for ${JSON.stringify(bad)}`,
    );
  }
});
