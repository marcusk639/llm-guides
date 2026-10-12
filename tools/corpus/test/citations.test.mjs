import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { collectCitations, CITATION_CLASSES } from "../citations.mjs";

function corpus(files) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "cit-"));
  for (const [rel, body] of Object.entries(files)) {
    const p = path.join(root, rel);
    fs.mkdirSync(path.dirname(p), { recursive: true });
    fs.writeFileSync(p, body);
  }
  return root;
}

const RECORDS = `records:
  - key: a.one
    value: "1"
    volatility: high
    source: https://example.com/a
    verified: "2026-01-01"
    price_source: https://example.com/price
    tags: [t]
  - key: a.two
    value: "2"
    volatility: low
    source: https://example.com/a
    verified: "2026-01-01"
    source_archived: https://archive.example/snap
    licence_source: https://example.com/licence
    tags: [t]
`;

const PAGE = `---
title: P
sources:
  - https://example.com/fm-one
  - https://example.com/fm-two
---

Body cites https://example.com/body-one and [x](https://example.com/body-two).
`;

test("collectCitations finds all five classes", () => {
  const root = corpus({ "data/x.yaml": RECORDS, "guides/t/p.md": PAGE });
  const { citations, issues } = collectCitations(root);
  assert.deepEqual(issues, []);
  const byClass = {};
  for (const c of citations) (byClass[c.class] ??= []).push(c.url);
  assert.deepEqual(byClass["record-source"].sort(), [
    "https://example.com/a",
    "https://example.com/a",
  ]);
  assert.deepEqual(byClass["record-secondary"].sort(), [
    "https://example.com/licence",
    "https://example.com/price",
  ]);
  assert.deepEqual(byClass["snapshot"], ["https://archive.example/snap"]);
  assert.deepEqual(byClass["page-frontmatter"].sort(), [
    "https://example.com/fm-one",
    "https://example.com/fm-two",
  ]);
  assert.deepEqual(byClass["page-body"].sort(), [
    "https://example.com/body-one",
    "https://example.com/body-two",
  ]);
});

test("citation origin names the record key or the page path", () => {
  const root = corpus({ "data/x.yaml": RECORDS, "guides/t/p.md": PAGE });
  const { citations } = collectCitations(root);
  const snap = citations.find((c) => c.class === "snapshot");
  assert.equal(snap.origin, "a.two");
  const body = citations.find((c) => c.class === "page-body");
  assert.equal(body.origin, "guides/t/p.md");
});

// Review Focus 1: a non-string URL is reported, never thrown.
test("a non-string record source becomes an issue, not a crash", () => {
  const root = corpus({
    "data/x.yaml": `records:
  - key: bad.one
    value: "1"
    volatility: high
    source: 123
    verified: "2026-01-01"
    tags: [t]
`,
  });
  const { citations, issues } = collectCitations(root);
  assert.deepEqual(citations, []);
  assert.equal(issues.length, 1);
  assert.equal(issues[0].rule, "citation-malformed");
  assert.equal(issues[0].origin, "bad.one");
});

// Review Focus 2: pages with no front-matter, or a scalar `sources:`.
test("a page with no front-matter still contributes body URLs", () => {
  const root = corpus({ "guides/t/raw.md": "see https://example.com/raw\n" });
  const { citations, issues } = collectCitations(root);
  assert.deepEqual(issues, []);
  assert.deepEqual(
    citations.map((c) => [c.class, c.url]),
    [["page-body", "https://example.com/raw"]],
  );
});

test("a scalar sources: field is an issue and does not crash", () => {
  const root = corpus({
    "guides/t/s.md":
      "---\ntitle: S\nsources: https://example.com/one\n---\n\nbody\n",
  });
  const { citations, issues } = collectCitations(root);
  assert.equal(citations.length, 0);
  assert.equal(issues.length, 1);
  assert.equal(issues[0].class, "page-frontmatter");
});

test("page-body skips relative links, anchors and mailto", () => {
  const root = corpus({
    "guides/t/rel.md": [
      "---",
      "title: R",
      "---",
      "",
      "see [sibling](../providers/anthropic.md) and [a](#anchor)",
      "and [c](./local.md) and <mailto:a@b.c> and /abs/path",
      "but https://example.com/real is a citation",
      "",
    ].join("\n"),
  });
  const { citations, issues } = collectCitations(root);
  assert.deepEqual(issues, []);
  assert.deepEqual(
    citations.map((c) => c.url),
    ["https://example.com/real"],
  );
});

test("CITATION_CLASSES is the report order and is frozen", () => {
  assert.deepEqual(CITATION_CLASSES, [
    "record-source",
    "record-secondary",
    "page-frontmatter",
    "page-body",
    "snapshot",
  ]);
  assert.throws(() => CITATION_CLASSES.push("x"));
});
