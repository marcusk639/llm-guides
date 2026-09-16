// tools/corpus/test/data.test.mjs
import test from "node:test";
import assert from "node:assert/strict";
import { loadRecords, literalIndex, MIN_LITERAL_LENGTH } from "../data.mjs";

const DIR = new URL("./fixtures/data/", import.meta.url).pathname;

test("loads every record and tags it with its source file", () => {
  const records = loadRecords(DIR);
  assert.equal(records.length, 3);
  assert.equal(records[0].key, "example.model.context_window");
  assert.equal(records[0].file, "models.yaml");
  assert.equal(typeof records[0].verified, "string");
});

test("indexes both value and display", () => {
  const index = literalIndex(loadRecords(DIR));
  assert.deepEqual(index.get("200000"), ["example.model.context_window"]);
  assert.deepEqual(index.get("200K"), ["example.model.context_window"]);
});

test("omits records that opt out of linting", () => {
  const index = literalIndex(loadRecords(DIR));
  assert.equal(index.has("3"), false);
});

test("omits literals shorter than the minimum length", () => {
  const index = literalIndex([
    {
      key: "k",
      value: "42",
      volatility: "low",
      source: "s",
      verified: "2026-09-16",
    },
  ]);
  assert.equal(index.size, 0);
  assert.equal(MIN_LITERAL_LENGTH, 3);
});

test("honours explicit lint_literals over value and display", () => {
  const index = literalIndex([
    {
      key: "k",
      value: "7",
      display: "seven",
      lint_literals: ["seven dollars"],
      volatility: "low",
      source: "s",
      verified: "2026-09-16",
    },
  ]);
  assert.deepEqual([...index.keys()], ["seven dollars"]);
});
