// tools/corpus/test/site-provenance.test.mjs
import test from "node:test";
import assert from "node:assert/strict";
import { recordsByKey } from "../data.mjs";
import { provenanceFor, renderSubRow } from "../site-provenance.mjs";
import { renderPage } from "../site-template.mjs";

const records = [
  {
    key: "a.models.one",
    value: "one",
    verified: "2026-09-16",
    source: "https://example.invalid/one",
    tags: ["t"],
  },
  {
    key: "a.models.two",
    value: "two",
    verified: "2026-10-06",
    source: "https://example.invalid/two",
    tags: ["t"],
  },
];
const byKey = recordsByKey(records);

test("a corpus:data block yields one provenance entry for its key", () => {
  const block = {
    kind: "data",
    attrs: { key: "a.models.one" },
    unterminated: false,
    content: "one",
  };
  const { entries, issues } = provenanceFor(block, byKey);
  assert.deepEqual(issues, []);
  assert.equal(entries.length, 1);
  assert.equal(entries[0].key, "a.models.one");
  assert.equal(entries[0].verified, "2026-09-16");
  assert.equal(entries[0].source, "https://example.invalid/one");
});

test("several records behind one row produce one entry each", () => {
  const block = {
    kind: "table",
    attrs: { tag: "t", fields: "value" },
    unterminated: false,
    content: "| value |\n| --- |\n| one |\n| two |\n",
  };
  const { entries } = provenanceFor(block, byKey, records);
  assert.deepEqual(
    entries.map((e) => e.key),
    ["a.models.one", "a.models.two"],
  );
});

test("a sub-row carries its record key as a data- attribute", () => {
  const html = renderSubRow(
    [
      {
        key: "a.models.one",
        verified: "2026-09-16",
        source: "https://example.invalid/one",
        label: "example.invalid",
      },
    ],
    3,
  );
  assert.match(html, /data-record-key="a\.models\.one"/);
  assert.match(html, /colspan="3"/);
});

test("one shared date and source is stated once, not per column", () => {
  const same = [
    { key: "a.one", verified: "2026-09-16", source: "https://e.invalid/x", label: "e.invalid" },
    { key: "a.two", verified: "2026-09-16", source: "https://e.invalid/x", label: "e.invalid" },
  ];
  const html = renderSubRow(same, 2);
  assert.equal(html.match(/2026-09-16/g).length, 1);
});

test("a marker naming a record that no longer exists reports an issue and emits no entry", () => {
  const block = {
    kind: "data",
    attrs: { key: "a.models.gone" },
    unterminated: false,
    content: "$5",
  };
  const { entries, issues } = provenanceFor(block, byKey);
  assert.deepEqual(entries, []);
  assert.equal(issues.length, 1);
  assert.equal(issues[0].rule, "site-provenance-unknown-key");
});

test("a record with no source reports an issue rather than emitting a broken link", () => {
  const sourceless = recordsByKey([
    { key: "a.models.bare", value: "x", verified: "2026-10-06" },
  ]);
  const block = {
    kind: "data",
    attrs: { key: "a.models.bare" },
    unterminated: false,
    content: "x",
  };
  const { entries, issues } = provenanceFor(block, sourceless);
  assert.deepEqual(entries, []);
  assert.equal(issues[0].rule, "site-provenance-no-source");
});

test("an unterminated marker block yields no provenance sub-row", () => {
  const block = {
    kind: "table",
    attrs: { tag: "t" },
    unterminated: true,
    content: "",
  };
  const { entries, issues } = provenanceFor(block, byKey, records);
  assert.deepEqual(entries, []);
  assert.deepEqual(issues, []);
});

const model = {
  path: "guides/models/claude-models.md",
  title: "Claude models",
  summary: "Current Claude model ids, limits and prices.",
  topic: "models",
  verified: "2026-10-06",
  status: null,
  seed: true,
  appliesTo: ["Claude API, read 2026-10-06"],
  sources: ["https://example.invalid/models"],
  related: ["guides/models/comparison.md"],
  body: "",
  keys: ["a.models.one", "a.models.two"],
  volatility: "high",
};

// The brief declares injectProvenance in its Files and Produces blocks and
// Task 9 relies on renderPage(page, byKey, records) running the provenance
// pass, but no brief step implements either. These tests close that gap.
const tableBody = `## 1. What this covers

<!-- corpus:table fields=key,value tag=t -->

| key | value |
| --- | ----- |
| a.models.one | one |
| a.models.two | two |

<!-- /corpus:table -->

## 6. Where this rots

| Claim | Record |
| ----- | ------ |
| hand written | none |
`;

test("each generated table row gets a provenance sub-row immediately beneath it", () => {
  const html = renderPage({ ...model, body: tableBody }, byKey, records);
  assert.match(html, /<tr class="provenance" data-record-key="a\.models\.one">/);
  assert.match(html, /<tr class="provenance" data-record-key="a\.models\.two">/);
  const firstRow = html.indexOf(">one<");
  const firstSub = html.indexOf('data-record-key="a.models.one"');
  const secondRow = html.indexOf(">two<");
  assert.ok(firstRow !== -1 && secondRow !== -1);
  assert.ok(firstRow < firstSub && firstSub < secondRow);
});

test("a sub-row spans the generated table's full width rather than adding columns", () => {
  const html = renderPage({ ...model, body: tableBody }, byKey, records);
  assert.match(html, /data-record-key="a\.models\.one"><td colspan="2">/);
});

test("a hand-written table outside any marker block gets no provenance sub-row", () => {
  const html = renderPage({ ...model, body: tableBody }, byKey, records);
  const rot = html.slice(html.indexOf("hand written"));
  assert.equal(/class="provenance"/.test(rot), false);
});

test("row sentinels never leak into the rendered output", () => {
  const html = renderPage({ ...model, body: tableBody }, byKey, records);
  assert.equal(html.includes("@@PROV"), false);
});

test("an inline corpus:data figure carries its own date and source", () => {
  const body =
    "## 1. What this covers\n\nThe value is <!-- corpus:data key=a.models.one -->one<!-- /corpus:data --> today.\n";
  const html = renderPage({ ...model, body }, byKey, records);
  assert.match(
    html,
    /<span class="provenance" data-record-key="a\.models\.one">/,
  );
  assert.match(html, /2026-09-16/);
  assert.match(html, /href="https:\/\/example\.invalid\/one"/);
});

test("provenance is absent when renderPage is called without records", () => {
  const html = renderPage({ ...model, body: tableBody });
  assert.equal(/class="provenance"/.test(html), false);
});
