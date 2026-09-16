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

function page(topic, body) {
  return [
    "---",
    `title: ${topic} page`,
    "summary: s",
    `topic: ${topic}`,
    "verified: 2026-09-16",
    'applies_to: { api: "2026-09" }',
    "sources: [https://example.invalid/docs]",
    "related: []",
    "---",
    "",
    body,
    "",
  ].join("\n");
}

test("lintCorpus applies a lint_scope record only to pages of the listed topics", () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "corpus-scope-test-"));
  try {
    fs.mkdirSync(path.join(tmp, "data"));
    fs.mkdirSync(path.join(tmp, "meta"));
    fs.mkdirSync(path.join(tmp, "guides"));
    fs.writeFileSync(
      path.join(tmp, "data", "hooks.yaml"),
      [
        "records:",
        "  - key: hooks.timeout",
        '    value: "thirty seconds"',
        "    lint_scope: [claude-code]",
        "    volatility: low",
        "    source: https://example.invalid/docs",
        '    verified: "2026-09-16"',
        "  - key: global.id",
        '    value: "global-model-id"',
        "    volatility: low",
        "    source: https://example.invalid/docs",
        '    verified: "2026-09-16"',
        "",
      ].join("\n"),
    );
    fs.writeFileSync(
      path.join(tmp, "meta", "taxonomy.yaml"),
      "topics: [claude-code, models]\n",
    );
    const body = "It waits thirty seconds and calls global-model-id.";
    fs.writeFileSync(path.join(tmp, "guides", "hooks.md"), page("claude-code", body));
    fs.writeFileSync(path.join(tmp, "guides", "models.md"), page("models", body));

    const issues = lintCorpus(tmp, "2026-09-20");
    const bare = (file) =>
      issues
        .filter((i) => i.path.endsWith(file) && i.rule === "bare-value")
        .map((i) => i.message);
    assert.equal(issues.every((i) => i.rule === "bare-value"), true, JSON.stringify(issues));

    const onTopic = bare("hooks.md");
    assert.equal(onTopic.length, 2);
    assert.equal(onTopic.some((m) => /hooks\.timeout/.test(m)), true);

    const offTopic = bare("models.md");
    assert.equal(offTopic.length, 1);
    assert.match(offTopic[0], /global\.id/);
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
});

// Fix round 1 (I2): unknown lint_fields / lint_scope names are reported.
function withDataCorpus(dataLines, fn) {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "corpus-names-test-"));
  try {
    fs.mkdirSync(path.join(tmp, "data"));
    fs.mkdirSync(path.join(tmp, "meta"));
    fs.mkdirSync(path.join(tmp, "guides"));
    fs.writeFileSync(
      path.join(tmp, "data", "rows.yaml"),
      ["records:", ...dataLines, ""].join("\n"),
    );
    fs.writeFileSync(
      path.join(tmp, "meta", "taxonomy.yaml"),
      "topics: [claude-code, models]\n",
    );
    fs.writeFileSync(path.join(tmp, "guides", "p.md"), page("models", "Body."));
    return fn(lintCorpus(tmp, "2026-09-20"));
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
}

const recordHead = (key) => [
  `  - key: ${key}`,
  `    value: "${key}-value"`,
  "    volatility: low",
  "    source: https://example.invalid/docs",
  '    verified: "2026-09-16"',
];

test("lintCorpus reports a lint_fields entry naming a field the record lacks", () => {
  withDataCorpus(
    [
      ...recordHead("row.a"),
      "    context_window: 200K tokens",
      "    lint_fields: [context_window, contxt_window, max_output]",
      ...recordHead("row.b"),
      "    context_window: 1M tokens",
      "    lint_fields: [context_window]",
    ],
    (issues) => {
      const hits = issues.filter((i) => i.rule === "lint-fields-unknown");
      assert.equal(hits.length, 1, JSON.stringify(issues));
      assert.equal(hits[0].path, path.join("data", "rows.yaml"));
      assert.match(hits[0].message, /row\.a/);
      assert.match(hits[0].message, /contxt_window/);
      assert.match(hits[0].message, /max_output/);
      assert.doesNotMatch(hits[0].message, /\bcontext_window\b/);
    },
  );
});

test("lintCorpus does not report a lint_fields field that is present but null", () => {
  withDataCorpus(
    [...recordHead("row.n"), "    max_output: null", "    lint_fields: [max_output]"],
    (issues) => assert.deepEqual(issues, []),
  );
});

test("lintCorpus reports a lint_scope entry that is not a taxonomy topic", () => {
  withDataCorpus(
    [
      ...recordHead("row.s"),
      "    lint_scope: [models, claude_code]",
      ...recordHead("row.ok"),
      "    lint_scope: [claude-code, models]",
    ],
    (issues) => {
      const hits = issues.filter((i) => i.rule === "lint-scope-unknown");
      assert.equal(hits.length, 1, JSON.stringify(issues));
      assert.equal(hits[0].path, path.join("data", "rows.yaml"));
      assert.match(hits[0].message, /row\.s/);
      assert.match(hits[0].message, /claude_code/);
      assert.doesNotMatch(hits[0].message, /\bmodels\b/);
    },
  );
});

test("lintCorpus reports a lint_fields field whose value cannot be indexed", () => {
  withDataCorpus(
    [...recordHead("row.o"), "    limits: { input: 5 }", "    lint_fields: [limits]"],
    (issues) => {
      const hits = issues.filter((i) => i.rule === "lint-fields-unindexable");
      assert.equal(hits.length, 1, JSON.stringify(issues));
      assert.match(hits[0].message, /row\.o/);
      assert.match(hits[0].message, /limits/);
    },
  );
});
