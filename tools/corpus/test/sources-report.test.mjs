import test from "node:test";
import assert from "node:assert/strict";
import { summarise, formatText, formatJson } from "../sources-report.mjs";

const results = [
  {
    url: "https://e.com/a",
    class: "record-source",
    origin: "a.one",
    outcome: "resolves",
    status: 200,
    finalUrl: "https://e.com/a",
    error: null,
  },
  {
    url: "https://e.com/b",
    class: "record-source",
    origin: "a.two",
    outcome: "dead",
    status: 404,
    finalUrl: null,
    error: null,
  },
  {
    url: "https://e.com/c",
    class: "page-body",
    origin: "guides/t/p.md",
    outcome: "redirects",
    status: 301,
    finalUrl: "https://e.com/c2",
    error: null,
  },
];

test("summarise counts per class and keeps only non-resolving findings", () => {
  const s = summarise(results, []);
  assert.deepEqual(s.counts["record-source"], {
    resolves: 1,
    redirects: 0,
    dead: 1,
    total: 2,
  });
  assert.deepEqual(s.counts["page-body"], {
    resolves: 0,
    redirects: 1,
    dead: 0,
    total: 1,
  });
  assert.equal(s.findings.length, 2);
  assert.ok(s.findings.every((f) => f.outcome !== "resolves"));
});

test("summarise carries malformed citation issues through untouched", () => {
  const issues = [
    {
      class: "record-source",
      origin: "bad.one",
      rule: "citation-malformed",
      message: "source is not a string: 123",
    },
  ];
  assert.deepEqual(summarise(results, issues).malformed, issues);
});

test("formatText names every class, including ones with no findings", () => {
  const out = formatText(summarise(results, []));
  for (const cls of [
    "record-source",
    "record-secondary",
    "page-frontmatter",
    "page-body",
    "snapshot",
  ]) {
    assert.match(out, new RegExp(cls));
  }
  assert.match(out, /404/);
  assert.match(out, /guides\/t\/p\.md/);
});

test("formatJson emits per-class counts and parses as JSON", () => {
  const parsed = JSON.parse(formatJson(summarise(results, [])));
  assert.equal(parsed.counts["record-source"].dead, 1);
  assert.equal(parsed.findings.length, 2);
  assert.ok(Array.isArray(parsed.malformed));
});
