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

// --- record-volatility-invalid (Task 15d) ---
// Reproduces the crash: a record with an invalid (or missing) volatility used
// to make lintCorpus/ledgerCorpus throw RangeError: Invalid time value when it
// was the first volatility a page referenced, and was silently ignored
// otherwise. Now it must be reported and never crash either command.
function volatilityCorpus(dataLines, guideBody) {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "corpus-volatility-test-"));
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
  fs.writeFileSync(path.join(tmp, "guides", "p.md"), page("models", guideBody));
  return tmp;
}

const badVolatilityRecord = (key) => [
  `  - key: ${key}`,
  `    value: "${key}-value"`,
  "    volatility: hi",
  "    source: https://example.invalid/docs",
  '    verified: "2026-09-16"',
];

const noVolatilityRecord = (key) => [
  `  - key: ${key}`,
  `    value: "${key}-value"`,
  "    source: https://example.invalid/docs",
  '    verified: "2026-09-16"',
];

const goodRecord = (key, volatility) => [
  `  - key: ${key}`,
  `    value: "${key}-value"`,
  `    volatility: ${volatility}`,
  "    source: https://example.invalid/docs",
  '    verified: "2026-09-16"',
];

test("lintCorpus reports record-volatility-invalid for a bad value and does not throw", () => {
  const tmp = volatilityCorpus(
    badVolatilityRecord("bad.one"),
    "<!-- corpus:data key=bad.one -->x<!-- /corpus:data -->",
  );
  try {
    let issues;
    assert.doesNotThrow(() => {
      issues = lintCorpus(tmp, "2026-09-20");
    });
    const hits = issues.filter((i) => i.rule === "record-volatility-invalid");
    assert.equal(hits.length, 1, JSON.stringify(issues));
    assert.equal(hits[0].path, path.join("data", "rows.yaml"));
    assert.match(hits[0].message, /bad\.one/);
    assert.match(hits[0].message, /hi/);
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
});

test("lintCorpus reports record-volatility-invalid for a missing volatility field", () => {
  const tmp = volatilityCorpus(
    noVolatilityRecord("bad.missing"),
    "<!-- corpus:data key=bad.missing -->x<!-- /corpus:data -->",
  );
  try {
    const issues = lintCorpus(tmp, "2026-09-20");
    const hits = issues.filter((i) => i.rule === "record-volatility-invalid");
    assert.equal(hits.length, 1, JSON.stringify(issues));
    assert.match(hits[0].message, /bad\.missing/);
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
});

test("lintCorpus does not throw when the bad record is the only referenced record", () => {
  const tmp = volatilityCorpus(
    badVolatilityRecord("bad.only"),
    "<!-- corpus:data key=bad.only -->x<!-- /corpus:data -->",
  );
  try {
    assert.doesNotThrow(() => lintCorpus(tmp, "2026-09-20"));
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
});

test("lintCorpus does not throw when the bad record is the first of two referenced records", () => {
  const tmp = volatilityCorpus(
    [...badVolatilityRecord("bad.first"), ...goodRecord("good.second", "medium")],
    "<!-- corpus:data key=bad.first -->x<!-- /corpus:data --><!-- corpus:data key=good.second -->y<!-- /corpus:data -->",
  );
  try {
    let issues;
    assert.doesNotThrow(() => {
      issues = lintCorpus(tmp, "2026-09-20");
    });
    assert.equal(
      issues.filter((i) => i.rule === "record-volatility-invalid").length,
      1,
    );
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
});

test("ledgerCorpus completes on a corpus with a bad record and uses only valid referenced records", () => {
  const tmp = volatilityCorpus(
    [...badVolatilityRecord("bad.first"), ...goodRecord("good.second", "medium")],
    "<!-- corpus:data key=bad.first -->x<!-- /corpus:data --><!-- corpus:data key=good.second -->y<!-- /corpus:data -->",
  );
  try {
    let ledger;
    assert.doesNotThrow(() => {
      ledger = ledgerCorpus(tmp, { write: false });
    });
    const entry = ledger.entries.find((e) => e.path.endsWith("p.md"));
    assert.equal(entry.volatility, "medium");
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
});

test("CLI lint exits 1 on an invalid volatility, reports the rule, and never a RangeError", () => {
  const tmp = volatilityCorpus(
    badVolatilityRecord("bad.cli"),
    "<!-- corpus:data key=bad.cli -->x<!-- /corpus:data -->",
  );
  try {
    const result = spawnSync(process.execPath, [CLI, "lint", tmp], {
      encoding: "utf8",
    });
    assert.equal(result.status, 1);
    assert.match(result.stderr, /record-volatility-invalid/);
    assert.doesNotMatch(result.stderr, /RangeError/);
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
});

// --- formatter-stable change detection (finding F9) ---

const CMP_DATA = [
  "records:",
  "  - key: cmp.alpha",
  '    value: "Alpha"',
  '    name: "Alpha"',
  '    price: "$1 / MTok"',
  '    note: "x|y"',
  "    volatility: high",
  "    source: https://example.invalid/docs",
  "    verified: 2026-09-16",
  "    tags: [cmp]",
  "  - key: cmp.beta",
  '    value: "Beta Model"',
  '    name: "Beta Model"',
  '    price: "$10 / MTok"',
  "    volatility: high",
  "    source: https://example.invalid/docs",
  "    verified: 2026-09-16",
  "    tags: [cmp]",
  "  - key: cmp.gamma",
  '    value: "Gamma"',
  '    name: "Gamma"',
  '    price: "$0.25 / MTok"',
  '    note: "plain"',
  "    volatility: high",
  "    source: https://example.invalid/docs",
  "    verified: 2026-09-16",
  "    tags: [cmp]",
  "",
].join("\n");

// What render.mjs emits for the block below: unpadded cells, no blank lines.
const CMP_UNPADDED = [
  "# Cmp",
  "",
  "Intro.",
  "",
  '<!-- corpus:table fields=name,price,note headers="Model,Input price,Note" tag=cmp -->',
  "| Model | Input price | Note |",
  "| --- | --- | --- |",
  "| Alpha | $1 / MTok | x\\|y |",
  "| Beta Model | $10 / MTok |  |",
  "| Gamma | $0.25 / MTok | plain |",
  "<!-- /corpus:table -->",
  "",
  "After.",
  "",
].join("\n");

// Captured verbatim from Prettier 3.9.7 output (`npx prettier --write`) run on
// CMP_UNPADDED: cells padded to column width, divider dashes stretched to
// column width, and a blank line added after the opener and before the closer.
const CMP_PRETTIER = [
  "# Cmp",
  "",
  "Intro.",
  "",
  '<!-- corpus:table fields=name,price,note headers="Model,Input price,Note" tag=cmp -->',
  "",
  "| Model      | Input price  | Note  |",
  "| ---------- | ------------ | ----- |",
  "| Alpha      | $1 / MTok    | x\\|y  |",
  "| Beta Model | $10 / MTok   |       |",
  "| Gamma      | $0.25 / MTok | plain |",
  "",
  "<!-- /corpus:table -->",
  "",
  "After.",
  "",
].join("\n");

function withCmpCorpus(guideText, fn) {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "corpus-stable-test-"));
  try {
    fs.mkdirSync(path.join(tmp, "data"));
    fs.mkdirSync(path.join(tmp, "guides"));
    fs.writeFileSync(path.join(tmp, "data", "cmp.yaml"), CMP_DATA);
    const guide = path.join(tmp, "guides", "cmp.md");
    fs.writeFileSync(guide, guideText);
    return fn(tmp, guide);
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
}

test("the unpadded render is a no-op", () => {
  withCmpCorpus(CMP_UNPADDED, (root) => {
    const [r] = renderCorpus(root, { write: false });
    assert.deepEqual(r.issues, []);
    assert.equal(r.changed, false);
  });
});

test("Prettier's formatting of a rendered table is not a pending change and is not rewritten", () => {
  withCmpCorpus(CMP_PRETTIER, (root, guide) => {
    assert.equal(renderCorpus(root, { write: false })[0].changed, false);
    const [r] = renderCorpus(root, { write: true });
    assert.equal(r.changed, false);
    assert.equal(fs.readFileSync(guide, "utf8"), CMP_PRETTIER);
  });
});

const genuineChanges = {
  "a cell value": (t) => t.replace("| $1 / MTok    |", "| $2 / MTok    |"),
  "row order": (t) =>
    t
      .replace("| Alpha      | $1 / MTok    | x\\|y  |", "@@ALPHA@@")
      .replace("| Gamma      | $0.25 / MTok | plain |", "| Alpha      | $1 / MTok    | x\\|y  |")
      .replace("@@ALPHA@@", "| Gamma      | $0.25 / MTok | plain |"),
  "row count": (t) => t.replace("| Beta Model | $10 / MTok   |       |\n", ""),
  "header text": (t) => t.replace("| Model      |", "| Name       |"),
};

for (const [what, mutate] of Object.entries(genuineChanges)) {
  test(`a genuine ${what} difference against Prettier-formatted text is a pending change`, () => {
    const stale = mutate(CMP_PRETTIER);
    assert.notEqual(stale, CMP_PRETTIER, "mutation must alter the fixture");
    withCmpCorpus(stale, (root, guide) => {
      assert.equal(renderCorpus(root, { write: false })[0].changed, true);
      assert.equal(renderCorpus(root, { write: true })[0].changed, true);
      assert.equal(fs.readFileSync(guide, "utf8"), CMP_UNPADDED);
    });
  });
}

// --- fix round 1, m1: normalisation scope is terminated corpus:table blocks only ---

test("a corpus:data block differing from its record only by whitespace is still a pending change", () => {
  const stale = CMP_PRETTIER.replace(
    "Intro.",
    "Intro <!-- corpus:data key=cmp.alpha --> Alpha <!-- /corpus:data -->.",
  );
  const exact = CMP_PRETTIER.replace(
    "Intro.",
    "Intro <!-- corpus:data key=cmp.alpha -->Alpha<!-- /corpus:data -->.",
  );
  withCmpCorpus(stale, (root, guide) => {
    assert.equal(renderCorpus(root, { write: false })[0].changed, true);
    assert.equal(renderCorpus(root, { write: true })[0].changed, true);
    const written = fs.readFileSync(guide, "utf8");
    assert.equal(
      written.includes("<!-- corpus:data key=cmp.alpha -->Alpha<!-- /corpus:data -->"),
      true,
    );
    assert.equal(renderCorpus(root, { write: false })[0].changed, false);
  });
  withCmpCorpus(exact, (root) => {
    assert.equal(renderCorpus(root, { write: false })[0].changed, false);
  });
});

test("whitespace in prose outside marker blocks is never reported or rewritten by render", () => {
  const odd = CMP_PRETTIER.replace("Intro.", "Intro.   ").replace(
    "After.",
    "\n\n  After.",
  );
  withCmpCorpus(odd, (root, guide) => {
    assert.equal(renderCorpus(root, { write: true })[0].changed, false);
    assert.equal(fs.readFileSync(guide, "utf8"), odd);
  });
});

// --- fix round 1, m2: only the line after the header row is a divider ---

test("a dash-placeholder data row changing '-' to '--' is a pending change", () => {
  const data = [
    "records:",
    "  - key: dash.one",
    '    value: "-"',
    '    a: "-"',
    '    b: "-"',
    "    volatility: low",
    "    source: https://example.invalid/docs",
    "    verified: 2026-09-16",
    "    tags: [dash]",
    "",
  ].join("\n");
  const guideFor = (row) =>
    [
      "<!-- corpus:table fields=a,b tag=dash -->",
      "| a | b |",
      "| --- | --- |",
      row,
      "<!-- /corpus:table -->",
      "",
    ].join("\n");
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "corpus-dash-test-"));
  try {
    fs.mkdirSync(path.join(tmp, "data"));
    fs.mkdirSync(path.join(tmp, "guides"));
    fs.writeFileSync(path.join(tmp, "data", "dash.yaml"), data);
    const guide = path.join(tmp, "guides", "dash.md");
    fs.writeFileSync(guide, guideFor("| - | - |"));
    assert.equal(renderCorpus(tmp, { write: false })[0].changed, false);
    fs.writeFileSync(guide, guideFor("| -- | - |"));
    assert.equal(renderCorpus(tmp, { write: false })[0].changed, true);
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
});
