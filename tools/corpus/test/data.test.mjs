// tools/corpus/test/data.test.mjs
import test from "node:test";
import assert from "node:assert/strict";
import {
  loadRecords,
  literalIndex,
  literalIndexForTopic,
  MIN_LITERAL_LENGTH,
} from "../data.mjs";

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

test("omits a lint: false record even when its value is long enough to index", () => {
  const index = literalIndex([
    {
      key: "k",
      value: "long-enough-value",
      lint: false,
      volatility: "low",
      source: "s",
      verified: "2026-09-16",
    },
  ]);
  assert.equal(index.size, 0);
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

const ROW = {
  key: "row.model",
  value: "row-model-1",
  display: "Row Model One",
  api_alias: "row-model",
  context_window: "123K tokens",
  max_output: null,
  price: 42,
  short: "ab",
  lint_fields: ["api_alias", "context_window", "max_output", "price", "short", "missing"],
  volatility: "high",
  source: "s",
  verified: "2026-09-16",
};

test("lint_fields indexes value, display and each named field value", () => {
  const index = literalIndex([ROW]);
  assert.deepEqual(
    [...index.keys()].sort(),
    ["123K tokens", "Row Model One", "row-model", "row-model-1"],
  );
  assert.deepEqual(index.get("123K tokens"), ["row.model"]);
  assert.deepEqual(index.get("row-model"), ["row.model"]);
});

test("lint_fields skips null and undefined fields and still applies the minimum length", () => {
  const index = literalIndex([ROW]);
  assert.equal(index.has("null"), false);
  assert.equal(index.has("undefined"), false);
  assert.equal(index.has("ab"), false);
  assert.equal(index.has("42"), false);
});

test("lint_fields stringifies non-string field values", () => {
  const index = literalIndex([
    { ...ROW, key: "row.num", price: 1048576, lint_fields: ["price"] },
  ]);
  assert.deepEqual(index.get("1048576"), ["row.num"]);
});

test("a field value equal to value is indexed once per record", () => {
  const index = literalIndex([
    { ...ROW, api_id: "row-model-1", lint_fields: ["api_id"] },
  ]);
  assert.deepEqual(index.get("row-model-1"), ["row.model"]);
});

test("lint_literals overrides lint_fields when both are present", () => {
  const index = literalIndex([{ ...ROW, lint_literals: ["only this phrase"] }]);
  assert.deepEqual([...index.keys()], ["only this phrase"]);
});

const base = { volatility: "low", source: "s", verified: "2026-09-16" };
const SCOPED = [
  { ...base, key: "global.rec", value: "global-literal" },
  { ...base, key: "hooks.rec", value: "thirty seconds", lint_scope: ["claude-code", "harness"] },
  { ...base, key: "models.rec", value: "models-literal", lint_scope: ["models"] },
];

test("literalIndexForTopic excludes a scoped record for a topic it does not list", () => {
  const index = literalIndexForTopic(SCOPED, "models");
  assert.equal(index.has("thirty seconds"), false);
  assert.deepEqual(index.get("models-literal"), ["models.rec"]);
});

test("literalIndexForTopic includes a scoped record for any topic it lists", () => {
  for (const topic of ["claude-code", "harness"]) {
    const index = literalIndexForTopic(SCOPED, topic);
    assert.deepEqual(index.get("thirty seconds"), ["hooks.rec"]);
    assert.equal(index.has("models-literal"), false);
  }
});

test("literalIndexForTopic always includes unscoped records", () => {
  for (const topic of ["models", "claude-code", "context", undefined, null, 7]) {
    assert.deepEqual(
      literalIndexForTopic(SCOPED, topic).get("global-literal"),
      ["global.rec"],
    );
  }
});

test("literalIndexForTopic gives a page with no or invalid topic unscoped records only", () => {
  for (const topic of [undefined, null, 7, "no-such-topic"]) {
    assert.deepEqual([...literalIndexForTopic(SCOPED, topic).keys()], ["global-literal"]);
  }
});

test("literalIndexForTopic still honours lint: false, lint_literals and lint_fields", () => {
  const index = literalIndexForTopic(
    [
      { ...base, key: "off", value: "off-literal", lint: false, lint_scope: ["models"] },
      { ...base, key: "lit", value: "x", lint_literals: ["literal phrase"], lint_scope: ["models"] },
      { ...base, key: "fld", value: "fld-value", size: "900K tokens", lint_fields: ["size"], lint_scope: ["models"] },
    ],
    "models",
  );
  assert.deepEqual([...index.keys()].sort(), ["900K tokens", "fld-value", "literal phrase"]);
});

test("literalIndex itself stays corpus-global and ignores lint_scope", () => {
  assert.deepEqual(
    [...literalIndex(SCOPED).keys()].sort(),
    ["global-literal", "models-literal", "thirty seconds"],
  );
});

test("literalIndexForTopic does not match a missing topic against a null scope entry", () => {
  const records = [{ ...base, key: "odd", value: "odd-literal", lint_scope: [null] }];
  assert.equal(literalIndexForTopic(records, null).size, 0);
  assert.equal(literalIndexForTopic(records, undefined).size, 0);
});

test("lint_fields indexes only string and number field values", () => {
  const index = literalIndex([
    {
      ...base,
      key: "typed",
      value: "typed-value",
      obj: { a: 1 },
      arr: ["array-item"],
      flag: true,
      num: 65536,
      lint_fields: ["obj", "arr", "flag", "num"],
    },
  ]);
  assert.deepEqual([...index.keys()].sort(), ["65536", "typed-value"]);
});

// Final review (m1): a malformed lint_literals never crashes indexing.
test("literalIndex does not throw on a non-array lint_literals and falls back to value and display", () => {
  const index = literalIndex([
    { key: "k.str", value: "value-string", display: "display-string", lint_literals: "a-string" },
  ]);
  assert.deepEqual([...index.keys()].sort(), ["display-string", "value-string"]);
});
