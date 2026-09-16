// tools/corpus/test/cli.test.mjs
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { lintCorpus, renderCorpus, ledgerCorpus } from "../cli.mjs";

const ROOT = new URL("./fixtures/corpus/", import.meta.url).pathname;
const CLI = new URL("../cli.mjs", import.meta.url).pathname;

test("the clean page produces no issues", () => {
  const issues = lintCorpus(ROOT, "2026-09-20").filter((i) =>
    i.path.endsWith("clean.md"),
  );
  assert.deepEqual(issues, []);
});

test("the dirty page trips every rule", () => {
  const rules = new Set(
    lintCorpus(ROOT, "2026-09-20")
      .filter((i) => i.path.endsWith("dirty.md"))
      .map((i) => i.rule),
  );
  for (const rule of [
    "frontmatter-required",
    "frontmatter-topic",
    "frontmatter-date",
    "frontmatter-derived-volatility",
    "bare-value",
    "marker-unterminated",
  ]) {
    assert.equal(rules.has(rule), true, `expected rule to fire: ${rule}`);
  }
});

test("render is a no-op on an already-rendered corpus", () => {
  const results = renderCorpus(ROOT, { write: false });
  const clean = results.find((r) => r.path.endsWith("clean.md"));
  assert.equal(clean.changed, false);
});

test("ledger derives high volatility for the clean page", () => {
  const ledger = ledgerCorpus(ROOT, { write: false });
  const entry = ledger.entries.find((e) => e.path.endsWith("clean.md"));
  assert.equal(entry.volatility, "high");
  assert.equal(entry.expires, "2026-10-16");
});

test("corpus render exits 0 against the existing fixture corpus", () => {
  const result = spawnSync(process.execPath, [CLI, "render", ROOT], {
    encoding: "utf8",
  });
  assert.equal(result.status, 0);
});

test("corpus render exits 1 and reports render-unknown-key for a bad reference", () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "corpus-render-test-"));
  try {
    fs.mkdirSync(path.join(tmp, "data"));
    fs.mkdirSync(path.join(tmp, "meta"));
    fs.mkdirSync(path.join(tmp, "guides"));
    fs.writeFileSync(
      path.join(tmp, "data", "models.yaml"),
      [
        "records:",
        "  - key: example.model.context_window",
        '    value: "200000"',
        '    display: "200K"',
        "    volatility: high",
        "    source: https://example.invalid/docs",
        "    verified: 2026-09-16",
        "    tags: [frontier]",
        "",
      ].join("\n"),
    );
    fs.writeFileSync(
      path.join(tmp, "meta", "taxonomy.yaml"),
      "topics: [claude-code, models]\n",
    );
    fs.writeFileSync(
      path.join(tmp, "guides", "bad.md"),
      [
        "---",
        "title: Bad",
        "summary: References a record that does not exist.",
        "topic: models",
        "verified: 2026-09-16",
        'applies_to: { api: "2026-09" }',
        "sources: [https://example.invalid/docs]",
        "related: []",
        "---",
        "",
        "<!-- corpus:data key=no.such.key -->x<!-- /corpus:data -->",
        "",
      ].join("\n"),
    );

    const result = spawnSync(process.execPath, [CLI, "render", tmp], {
      encoding: "utf8",
    });
    assert.equal(result.status, 1);
    assert.match(result.stderr, /render-unknown-key/);
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
});
