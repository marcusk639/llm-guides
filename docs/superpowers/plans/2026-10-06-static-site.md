# Static Site Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Publish the corpus as a static reading site where every page and every figure carries a verification date, built by a `site` subcommand inside the existing corpus CLI.

**Architecture:** `tools/corpus/site.mjs` exports `siteCorpus(root, { write })` and orchestrates seven focused sibling modules (model, markdown, template, provenance, freshness, nav, search). It imports every existing corpus function it needs rather than reimplementing — the guide walk, front-matter parsing, marker scanning, record loading, volatility and expiry — so the site cannot disagree with `lint` or `ledger`. Freshness facts render server-side; the `fresh`/`due`/`expired` label is computed in the browser at view time from the same function, serialised into the page, so the banner cannot freeze at build time.

**Tech Stack:** Node >= 22, ESM, `marked` (one package, GFM tables built in), `js-yaml` (already present), built-in `node --test`. No framework, no SSG, no search library, no syntax highlighter, no CSS framework.

**Spec:** docs/superpowers/specs/2026-10-03-static-site-design.md

## Global Constraints

Every task's requirements implicitly include this section. Values are copied verbatim from the spec.

- Node `>=22`; `package.json` has `"type": "module"` — all code is ESM, no bundler, no interop shim.
- **Exactly one new runtime dependency: `marked`.** Zero new devDependencies. The repo today has one runtime dependency (`js-yaml ^4.1.0`) and zero devDependencies; the whole neglect argument for hand-rolling rests on adding *one*.
- Tests run via built-in `node --test "tools/corpus/test/**/*.test.mjs"` only. No test framework, no mocking library.
- The four gates must stay green: `node tools/corpus/cli.mjs render --check .` (exit 0, no `would render:` line), `lint .` (`lint: clean`), `verify .` (`verify: clean`), `npm test` (372 passing before this work begins; each task adds to that count).
- **`meta/ledger.yaml` is NEVER read or written by the site.** `siteCorpus` must not open it. This is Amendment 1 in the spec; re-introducing a read or a cross-check is a regression.
- **`seed: true` is never removed** from any page, and a `seed: true` page's banner must disclose it in words.
- Edits to `data/` are surgical single-line replacements, never a YAML round trip — a round trip strips the contract-required header comments in `data/models.yaml` and `data/models-other.yaml`. (This plan does not edit `data/` at all; the constraint is stated so no task invents a reason to.)
- Output goes to `dist/`. `.gitignore` currently holds `node_modules/`, `local/`, `.superpowers/`, `.DS_Store`, `.claude/`, `.serena/`, `.token-optimizer/` and has **no build-output entry**; `dist/` must be added or the next commit stages a generated tree.
- **`site --check` is deliberately NOT added.** `cli.mjs:477` hard-codes `if (check && (command !== "render" || write)) usage();`, and the spec specifies `site --write` only so that line stays untouched and the change stays additive.
- Raw HTML in a guide passes through to the output verbatim. `marked` does not sanitise; this is required so the `<br>` that `render.mjs:6` writes into generated table cells survives. All content is authored in-repo under version control, so this is a correctness posture, not an injection one — state it, do not "fix" it.
- Marker comments (`<!-- corpus:data … -->` and closers) must not appear in published HTML.
- The site build is **not** one of the four gates: all four pass on a tree whose site build is broken, because none of them reads the site's output.

## Review Focus

Five input classes the spec implies that no task's happy-path tests would otherwise exercise, most likely to bite first. Each line names the input and the behaviour a reasonable person expects, and each has a test pinned to the task that owns the code.

1. **A marker block names a record that no longer exists.** Records get renamed and removed — `render` already has a `render-unknown-key` rule for exactly this — and the provenance pass looks keys up in `recordsByKey`. Expected: the figure still renders, no provenance sub-row claims a date the corpus cannot source, and the build reports an issue rather than emitting `undefined` or throwing. → **Task 5, Step 6.**
2. **An unterminated marker block.** `findBlocks` returns these with `unterminated: true` and `content: ""`; `render` leaves them alone and `lint` reports `marker-unterminated`, neither of which stops a site build. Expected: no provenance sub-row is emitted for a block that has no content. → **Task 5, Step 8.**
3. **A page referencing zero records.** `derivePageVolatility` returns `null` and `expiryFor` falls back through `?? "low"` to the 270-day cadence. Expected: the banner states a 270-day cadence and a real expiry date, never "null days" or an invalid date. → **Task 6, Step 8.**
4. **A page whose `verified` is absent or malformed.** `ledgerCorpus` skips such a page entirely (`cli.mjs:238-239`), but the site must not: hiding it would break the "never hidden" rule by a different route. Expected: the page renders, the banner says the date is missing or unreadable instead of computing an expiry from it, and the build reports an issue. → **Task 6, Step 10.**
5. **The viewer's clock sits near a day boundary, or west of UTC.** The client computes the label from the viewer's own date; `new Date().toISOString().slice(0, 10)` is a UTC date, so a viewer at 19:00 in UTC-7 would read tomorrow's UTC day and could be shown `due` a day early. This is the client-side twin of the `Date`-parsing bug the spec documents at lines 241-248. Expected: the label is computed from the viewer's **local** calendar date. → **Task 6, Step 12.**

## File Structure

| File | Responsibility |
| ---- | -------------- |
| `tools/corpus/site.mjs` | Entry point. Exports `siteCorpus(root, { write })`; orchestrates the modules below, collects issues, writes `dist/`. |
| `tools/corpus/site-model.mjs` | Exports `collectPages(root)`. Turns the tree into page models: path, front-matter, body, records, freshness facts. |
| `tools/corpus/site-markdown.mjs` | Exports `renderMarkdown(md)`. The only place `marked` is imported. |
| `tools/corpus/site-freshness.mjs` | Exports `freshnessFacts(page)`, `stateLabel(facts, todayIso)`, `clientScript()`. One label algorithm, used server-side in tests and serialised to the browser. |
| `tools/corpus/site-provenance.mjs` | Exports `provenanceFor(block, byKey)` and `injectProvenance(html, page, byKey)`. Sub-rows beneath data rows. |
| `tools/corpus/site-nav.mjs` | Exports `topicLabel(slug)` and `navTopics(pages, topics)`. Slug-derived names, populated topics only. |
| `tools/corpus/site-template.mjs` | Exports `renderPage(model)` and `renderFrontPage(models, topics)`. All HTML assembly. |
| `tools/corpus/site-search.mjs` | Exports `buildSearchIndex(models)` and `searchScript()`. Build-time JSON index, lazy client fetch. |
| `tools/corpus/test/site-*.test.mjs` | One test file per module, following the existing on-disk fixture pattern. |
| `.github/workflows/site.yml` | Gates, then build, then deploy on `master` only. |

Files that change together live together: each module owns one of the spec's components, and its tests sit beside the other 20 test files in `tools/corpus/test/`.

**The fixture corpus** at `tools/corpus/test/fixtures/corpus/` already holds `guides/clean.md`, `guides/dirty.md`, `guides/verify/deprecated.md`, `guides/verify/unverifiable.md`, `data/models.yaml` and `meta/taxonomy.yaml` (`topics: [claude-code, models]`). Site tests extend this fixture rather than inventing a parallel one, and HTML-emitting tests use it rather than inline literals.

---

### Task 1: The `site` subcommand, wired and exiting correctly

**Files:**
- Create: `tools/corpus/site.mjs`
- Modify: `tools/corpus/cli.mjs` — add one `else if` branch to the dispatch chain in `main(argv)` (the chain runs `cli.mjs:478-540`; insert after the `ledger` branch which ends at `:527`) and add one import line near `:50`
- Modify: `package.json` — add a `site` script beside the existing `ledger` script
- Test: `tools/corpus/test/site-cli.test.mjs`

**Interfaces:**
- Consumes: nothing from earlier tasks. From the existing tree: `loadRecords(dataDir)` (`data.mjs:28`).
- Produces: `siteCorpus(root, { write = false } = {})` → `{ pages: Array<object>, issues: Array<{ path: string, line?: number, rule: string, message: string }> }`. Every later task adds to the `pages` array's element shape or to `issues`. Task 9 is the only task that makes `write` do anything beyond creating the directory.

Exit conventions, copied from the spec's table and matching `lint`/`verify` exactly:

| Outcome | Behaviour |
| ------- | --------- |
| Usage error | message to stderr, `process.exit(2)` via `usage()` |
| Issues found | `path:line [rule] message` per issue to stderr, summary to stdout, exit 1 |
| Clean | summary to stdout (`site: N pages`), exit 0 |

Note the `ledger` branch does **not** call `process.exit` — it falls out of `main` and exits 0 implicitly. `site` must not copy that: it needs an explicit exit so a non-zero code is possible.

- [ ] **Step 1: Write the failing test**

Create `tools/corpus/test/site-cli.test.mjs`:

```js
// tools/corpus/test/site-cli.test.mjs
import test from "node:test";
import assert from "node:assert/strict";
import { siteCorpus } from "../site.mjs";

const ROOT = new URL("./fixtures/corpus/", import.meta.url).pathname;

test("siteCorpus returns a page per guide in the fixture corpus", () => {
  const { pages } = siteCorpus(ROOT, { write: false });
  const paths = pages.map((p) => p.path).sort();
  assert.deepEqual(paths, [
    "guides/clean.md",
    "guides/dirty.md",
    "guides/verify/deprecated.md",
    "guides/verify/unverifiable.md",
  ]);
});

test("siteCorpus reports issues as an array", () => {
  const { issues } = siteCorpus(ROOT, { write: false });
  assert.equal(Array.isArray(issues), true);
});

test("siteCorpus never reads meta/ledger.yaml", () => {
  const src = new URL("../site.mjs", import.meta.url).pathname;
  const text = require("node:fs").readFileSync(src, "utf8");
  assert.equal(text.includes("ledger.yaml"), false);
});
```

Replace the `require` line with a top-level `import fs from "node:fs";` and `fs.readFileSync(src, "utf8")` — `require` is not available in ESM. The final test reads as:

```js
test("siteCorpus never reads meta/ledger.yaml", () => {
  const src = new URL("../site.mjs", import.meta.url).pathname;
  assert.equal(fs.readFileSync(src, "utf8").includes("ledger.yaml"), false);
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `node --test tools/corpus/test/site-cli.test.mjs`
Expected: FAIL — `Cannot find module` for `../site.mjs`, because the file does not exist yet.

- [ ] **Step 3: Write the minimal implementation**

Create `tools/corpus/site.mjs`:

```js
// tools/corpus/site.mjs
import path from "node:path";
import { loadRecords } from "./data.mjs";
import { collectPages } from "./site-model.mjs";

export function siteCorpus(root, { write = false } = {}) {
  const records = loadRecords(path.join(root, "data"));
  const { pages, issues } = collectPages(root, records);
  return { pages, issues, write };
}
```

Task 2 creates `site-model.mjs`. To keep this task independently testable, write a placeholder `collectPages` now and replace its body in Task 2:

```js
// tools/corpus/site-model.mjs
import { guidePages } from "./refresh-units.mjs";
import path from "node:path";

export function collectPages(root, records) {
  const pages = guidePages(root).map((abs) => ({
    path: path.relative(root, abs).split(path.sep).join("/"),
  }));
  return { pages, issues: [] };
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `node --test tools/corpus/test/site-cli.test.mjs`
Expected: PASS, 3 tests.

- [ ] **Step 5: Wire the dispatch branch**

In `tools/corpus/cli.mjs`, add to the import block (after the `refresh-stamp.mjs` import at `:50`):

```js
import { siteCorpus } from "./site.mjs";
```

Then insert this branch immediately after the `ledger` branch's closing `}` (currently `cli.mjs:527`), before `} else if (command === "refresh") {`:

```js
  } else if (command === "site") {
    const { pages, issues } = siteCorpus(root, { write });
    for (const i of issues)
      console.error(
        `${i.path}${i.line ? `:${i.line}` : ""} [${i.rule}] ${i.message}`,
      );
    console.log(
      issues.length === 0
        ? `site: ${pages.length} pages`
        : `site: ${issues.length} issue(s)`,
    );
    process.exit(issues.length === 0 ? 0 : 1);
```

Also update the `usage()` text at `cli.mjs:469` so `site` appears in the command list:

```js
      "usage: corpus <render|lint|verify|ledger|refresh|site> [--write] [dir]",
```

Do **not** touch `cli.mjs:477`. `site --check` is deliberately absent, and that guard rejecting `--check` for `site` is the specified behaviour.

- [ ] **Step 6: Test the CLI surface end to end**

Append to `tools/corpus/test/site-cli.test.mjs`:

```js
test("the site command exits 0 and prints a page count on a clean corpus", () => {
  const CLI = new URL("../cli.mjs", import.meta.url).pathname;
  const r = spawnSync(process.execPath, [CLI, "site", ROOT], {
    encoding: "utf8",
  });
  assert.equal(r.status, 0);
  assert.match(r.stdout, /^site: 4 pages$/m);
});

test("site rejects --check, because site --check is deliberately absent", () => {
  const CLI = new URL("../cli.mjs", import.meta.url).pathname;
  const r = spawnSync(process.execPath, [CLI, "site", "--check", ROOT], {
    encoding: "utf8",
  });
  assert.equal(r.status, 2);
  assert.match(r.stderr, /usage: corpus/);
});
```

Add `import { spawnSync } from "node:child_process";` to the file's imports.

- [ ] **Step 7: Run the tests to verify they pass**

Run: `node --test tools/corpus/test/site-cli.test.mjs`
Expected: PASS, 5 tests.

- [ ] **Step 8: Add the npm script**

In `package.json`, beside the existing `"ledger"` script, add:

```json
    "site": "node tools/corpus/cli.mjs site"
```

- [ ] **Step 9: Run the full gates**

Run: `node tools/corpus/cli.mjs render --check . && node tools/corpus/cli.mjs lint . && node tools/corpus/cli.mjs verify . && npm test > /tmp/t.out 2>&1; grep -E "^# (pass|fail)" /tmp/t.out`
Expected: `render` exit 0 with no `would render:` line, `lint: clean`, `verify: clean`, and a pass count 5 higher than before with `# fail 0`. Do not pipe `npm test` to `tail` — it empties `PIPESTATUS` and makes the exit code unreadable.

- [ ] **Step 10: Commit**

```bash
git add tools/corpus/site.mjs tools/corpus/site-model.mjs tools/corpus/cli.mjs tools/corpus/test/site-cli.test.mjs package.json
git commit -m "feat: add the site subcommand, wired into the CLI dispatch"
```

---

### Task 2: The page model

**Files:**
- Modify: `tools/corpus/site-model.mjs` — replace the placeholder `collectPages` body from Task 1
- Test: `tools/corpus/test/site-model.test.mjs`

**Interfaces:**
- Consumes: `siteCorpus(root, { write })` from Task 1, which calls `collectPages(root, records)`.
- Produces: `collectPages(root, records)` → `{ pages, issues }` where each page is:

```js
{
  path: "guides/models/claude-models.md",  // repo-relative, forward slashes
  title: "Claude models",                   // front-matter
  summary: "…",                             // front-matter, prose
  topic: "models",                           // front-matter, or null
  verified: "2026-10-06",                   // front-matter as a STRING, or null
  status: null,                              // "deprecated" or null
  seed: true,                                // front-matter seed === true
  appliesTo: ["…"],                          // front-matter applies_to, or []
  sources: ["…"],                            // front-matter sources, or []
  related: ["…"],                            // front-matter related, or []
  body: "…",                                 // markdown after front-matter
  keys: ["anthropic.models.opus-5-5"],      // record keys the page references, sorted
  volatility: "high",                        // derivePageVolatility result, may be null
}
```

Later tasks rely on exactly these names: Task 3 reads `body`, Task 4 reads `title`/`summary`/`appliesTo`/`sources`/`related`, Task 5 reads `body` and `keys`, Task 6 reads `verified`/`volatility`/`seed`/`status`, Task 7 reads `topic`/`path`/`title`, Task 8 reads all of `path`/`title`/`summary`/`topic`/`body`.

**Two reuse points the spec calls load-bearing.** The guide walk must be **imported**, never copied — the identical walk already exists twice, as exported `guidePages` (`refresh-units.mjs:23`) and as private `guidePaths` (`cli.mjs:52`), and a third copy makes a latent bug worse. And `parseFrontmatter`'s `yaml.JSON_SCHEMA` (`frontmatter.mjs:8`) is load-bearing: without it an unquoted `verified: 2026-09-16` parses as a JavaScript `Date` which UTC-parses and then renders in local time, printing as **the previous calendar day** west of UTC. The site must call `parseFrontmatter`, not its own YAML load.

- [ ] **Step 1: Write the failing test**

Create `tools/corpus/test/site-model.test.mjs`:

```js
// tools/corpus/test/site-model.test.mjs
import test from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import { loadRecords } from "../data.mjs";
import { collectPages } from "../site-model.mjs";

const ROOT = new URL("./fixtures/corpus/", import.meta.url).pathname;
const records = loadRecords(path.join(ROOT, "data"));

test("a page model carries front-matter fields under stable names", () => {
  const { pages } = collectPages(ROOT, records);
  const clean = pages.find((p) => p.path === "guides/clean.md");
  assert.equal(typeof clean.title, "string");
  assert.equal(typeof clean.summary, "string");
  assert.equal(clean.topic, "models");
  assert.equal(typeof clean.body, "string");
});

test("verified is a string, never a Date", () => {
  const { pages } = collectPages(ROOT, records);
  const clean = pages.find((p) => p.path === "guides/clean.md");
  assert.equal(typeof clean.verified, "string");
  assert.match(clean.verified, /^\d{4}-\d{2}-\d{2}$/);
});

test("volatility is derived from the records the page references", () => {
  const { pages } = collectPages(ROOT, records);
  const clean = pages.find((p) => p.path === "guides/clean.md");
  assert.equal(clean.volatility, "high");
  assert.equal(Array.isArray(clean.keys), true);
});

test("a deprecated page carries its status", () => {
  const { pages } = collectPages(ROOT, records);
  const dep = pages.find((p) => p.path === "guides/verify/deprecated.md");
  assert.equal(dep.status, "deprecated");
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `node --test tools/corpus/test/site-model.test.mjs`
Expected: FAIL — `clean.title` is `undefined`, because the Task 1 placeholder returns only `path`.

- [ ] **Step 3: Write the minimal implementation**

Replace the whole body of `tools/corpus/site-model.mjs`:

```js
// tools/corpus/site-model.mjs
import fs from "node:fs";
import path from "node:path";
import { guidePages } from "./refresh-units.mjs";
import { parseFrontmatter } from "./frontmatter.mjs";
import { referencedRecordKeys } from "./verify-pages.mjs";
import { derivePageVolatility } from "./ledger.mjs";

const list = (v) => (Array.isArray(v) ? v : []);
const str = (v) => (typeof v === "string" ? v : null);

export function collectPages(root, records) {
  const issues = [];
  const pages = guidePages(root).map((abs) => {
    const text = fs.readFileSync(abs, "utf8");
    const { data, body } = parseFrontmatter(text);
    const rel = path.relative(root, abs).split(path.sep).join("/");
    return {
      path: rel,
      title: str(data?.title) ?? rel,
      summary: str(data?.summary) ?? "",
      topic: str(data?.topic),
      verified: data?.verified == null ? null : String(data.verified),
      status: str(data?.status),
      seed: data?.seed === true,
      appliesTo: list(data?.applies_to),
      sources: list(data?.sources),
      related: list(data?.related),
      body,
      keys: [...referencedRecordKeys(text, records)].sort(),
      volatility: derivePageVolatility(text, records),
    };
  });
  return { pages, issues };
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `node --test tools/corpus/test/site-model.test.mjs tools/corpus/test/site-cli.test.mjs`
Expected: PASS, 9 tests across the two files.

- [ ] **Step 5: Commit**

```bash
git add tools/corpus/site-model.mjs tools/corpus/test/site-model.test.mjs
git commit -m "feat: build page models from front-matter and derived volatility"
```

---

### Task 3: Markdown rendering with `marked`

**Files:**
- Create: `tools/corpus/site-markdown.mjs`
- Modify: `package.json` — add `marked` to `dependencies`
- Test: `tools/corpus/test/site-markdown.test.mjs`

**Interfaces:**
- Consumes: page `body` strings from Task 2's `collectPages`.
- Produces: `renderMarkdown(md)` → HTML string. Task 4 and Task 5 both call it.

**Why `marked`, decided by measurement.** One package, 524K installed, GFM tables built in, and — the deciding test — it **preserves literal `<br>` inside table cells in its default configuration**, which is exactly what `render.mjs:6` writes into generated cells. Rejected: `markdown-it` (7 packages, and escapes raw HTML by default so every generated multi-line cell renders a visible escaped `<br>`; fixable only with a non-default `{ html: true }`, and a non-default option is a thing that can be lost); `micromark` plus its GFM table extension (30 packages); `commonmark` (4 packages, and emits no `<table>` at all — GFM tables are not CommonMark, which ends the comparison for a corpus 96 table rows deep); `snarkdown` (no tables).

**`marked` does not sanitise.** Raw HTML in a guide passes through verbatim. This is required for the `<br>` behaviour, and the corpus authors all its own content in-repo under version control, so it is a deliberate posture rather than an oversight. `marked` dropped its built-in `sanitize` option in v5+, so sanitising would mean a downstream dependency the neglect test argues against.

- [ ] **Step 1: Install the dependency**

Run: `npm install marked`
Expected: `package.json` gains `"marked": "^18.1.0"` (or the current major) under `dependencies`, and `package-lock.json` updates. Verify exactly one package was added:

Run: `npm ls --all --omit=dev 2>/dev/null | grep -c marked`
Expected: `1`.

- [ ] **Step 2: Write the failing test**

Create `tools/corpus/test/site-markdown.test.mjs`:

```js
// tools/corpus/test/site-markdown.test.mjs
import test from "node:test";
import assert from "node:assert/strict";
import { renderMarkdown } from "../site-markdown.mjs";

test("a GFM table renders as a table element", () => {
  const md = "| A | B |\n| --- | --- |\n| 1 | 2 |\n";
  const html = renderMarkdown(md);
  assert.match(html, /<table>/);
  assert.match(html, /<td>1<\/td>/);
});

test("a generated <br> inside a table cell survives", () => {
  const md = "| A |\n| --- |\n| first line<br>second line |\n";
  const html = renderMarkdown(md);
  assert.match(html, /first line<br>second line/);
  assert.equal(html.includes("&lt;br&gt;"), false);
});

test("an escaped pipe inside a table cell renders as a literal pipe", () => {
  const md = "| A |\n| --- |\n| a \\| b |\n";
  const html = renderMarkdown(md);
  assert.match(html, /a \| b/);
});

test("a language-tagged fence keeps its language class", () => {
  const html = renderMarkdown("```bash\necho hi\n```\n");
  assert.match(html, /language-bash/);
});

test("the eight-part heading structure renders as h2 elements", () => {
  const html = renderMarkdown("## 1. What this covers\n\n## 2. The 60-second version\n");
  assert.match(html, /<h2[^>]*>1\. What this covers<\/h2>/);
});
```

- [ ] **Step 3: Run it to verify it fails**

Run: `node --test tools/corpus/test/site-markdown.test.mjs`
Expected: FAIL — `Cannot find module` for `../site-markdown.mjs`.

- [ ] **Step 4: Write the minimal implementation**

Create `tools/corpus/site-markdown.mjs`:

```js
// tools/corpus/site-markdown.mjs
//
// marked is the only markdown dependency, chosen because it ships GFM tables
// and preserves raw HTML by DEFAULT. That second property is not cosmetic:
// render.mjs:6 writes literal <br> into generated table cells, and a renderer
// that escapes raw HTML mangles every multi-line generated cell. No options
// object is needed — both behaviours are default.
import { marked } from "marked";

export function renderMarkdown(md) {
  return marked.parse(md);
}
```

- [ ] **Step 5: Run the tests to verify they pass**

Run: `node --test tools/corpus/test/site-markdown.test.mjs`
Expected: PASS, 5 tests.

- [ ] **Step 6: Prove it against the corpus's real markdown**

Append to `tools/corpus/test/site-markdown.test.mjs`:

```js
test("the real comparison table renders without escaping its generated markup", () => {
  const ROOT = new URL("./fixtures/corpus/", import.meta.url).pathname;
  const text = readFileSync(join(ROOT, "guides", "clean.md"), "utf8");
  const html = renderMarkdown(text);
  assert.equal(html.includes("&lt;br&gt;"), false);
  assert.equal(html.includes("&lt;table&gt;"), false);
});
```

Add `import { readFileSync } from "node:fs";` and `import { join } from "node:path";` to the imports.

- [ ] **Step 7: Run the tests to verify they pass**

Run: `node --test tools/corpus/test/site-markdown.test.mjs`
Expected: PASS, 6 tests.

- [ ] **Step 8: Run the full gates**

Run: `node tools/corpus/cli.mjs render --check . && node tools/corpus/cli.mjs lint . && node tools/corpus/cli.mjs verify . && npm test > /tmp/t.out 2>&1; grep -E "^# (pass|fail)" /tmp/t.out`
Expected: all three clean, `# fail 0`.

- [ ] **Step 9: Commit**

```bash
git add tools/corpus/site-markdown.mjs tools/corpus/test/site-markdown.test.mjs package.json package-lock.json
git commit -m "feat: render markdown with marked, preserving generated table markup"
```

---

### Task 4: The page template

**Files:**
- Create: `tools/corpus/site-template.mjs`
- Test: `tools/corpus/test/site-template.test.mjs`

**Interfaces:**
- Consumes: a page model from Task 2's `collectPages`; `renderMarkdown(md)` from Task 3.
- Produces: `renderPage(model)` → a complete HTML document string. Task 5 injects provenance into its table markup, Task 6 inserts the banner, Task 7 inserts navigation, Task 8 inserts the search field. Those tasks extend this function rather than replacing it.

**Page anatomy, in the spec's order (lines 281-300):** title and summary from front-matter with `summary` doubling as the meta description, because strangers arrive via search; the freshness banner (Task 6); `applies_to` stated plainly, because it is the page's own declaration of which product version it describes and burying it hides the corpus's answer to its hardest staleness problem; the eight numbered sections with in-page tier navigation; section 6 "Where this rots" surfaced prominently, because a guide that states what it cannot promise is the trust signal, not an appendix; then sources and related links.

**Tier navigation (lines 302-312)** is **in-page movement across the eight-part template** — jump to §2 for the 60-second version, §5 for edge cases — and **not** separate beginner and advanced areas, and **not** difficulty-filtered browsing. The foundation spec settles that the ladder lives inside each document.

- [ ] **Step 1: Write the failing test**

Create `tools/corpus/test/site-template.test.mjs`:

```js
// tools/corpus/test/site-template.test.mjs
import test from "node:test";
import assert from "node:assert/strict";
import { renderPage } from "../site-template.mjs";

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
  body: "## 1. What this covers\n\ntext\n\n## 6. Where this rots\n\nrot text\n",
  keys: [],
  volatility: "high",
};

test("the page is a complete HTML document with a title", () => {
  const html = renderPage(model);
  assert.match(html, /^<!doctype html>/i);
  assert.match(html, /<title>Claude models<\/title>/);
  assert.match(html, /<\/html>\s*$/);
});

test("summary is emitted as the meta description", () => {
  const html = renderPage(model);
  assert.match(
    html,
    /<meta name="description" content="Current Claude model ids, limits and prices\.">/,
  );
});

test("applies_to is stated plainly, not hidden", () => {
  const html = renderPage(model);
  assert.match(html, /Claude API, read 2026-10-06/);
});

test("tier navigation links to the numbered sections in the body", () => {
  const html = renderPage(model);
  assert.match(html, /href="#1-what-this-covers"/);
  assert.match(html, /href="#6-where-this-rots"/);
});

test("sources and related links are rendered", () => {
  const html = renderPage(model);
  assert.match(html, /https:\/\/example\.invalid\/models/);
  assert.match(html, /guides\/models\/comparison\.md/);
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `node --test tools/corpus/test/site-template.test.mjs`
Expected: FAIL — `Cannot find module` for `../site-template.mjs`.

- [ ] **Step 3: Write the minimal implementation**

Create `tools/corpus/site-template.mjs`:

```js
// tools/corpus/site-template.mjs
import { renderMarkdown } from "./site-markdown.mjs";

const esc = (s) =>
  String(s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");

// Matches the slug marked generates for an ATX heading: lowercase, spaces to
// hyphens, punctuation dropped. "## 6. Where this rots" -> "6-where-this-rots".
export function headingSlug(text) {
  return text
    .toLowerCase()
    .replace(/[^\w\s-]/g, "")
    .trim()
    .replace(/\s+/g, "-");
}

export function numberedHeadings(body) {
  const out = [];
  let inFence = false;
  for (const line of body.split("\n")) {
    if (/^\s*```/.test(line)) {
      inFence = !inFence;
      continue;
    }
    if (inFence) continue;
    const m = line.match(/^##\s+(\d+\.\s+.*)$/);
    if (m) out.push({ text: m[1], slug: headingSlug(m[1]) });
  }
  return out;
}

export function renderPage(model) {
  const headings = numberedHeadings(model.body);
  const nav = headings
    .map((h) => `<li><a href="#${esc(h.slug)}">${esc(h.text)}</a></li>`)
    .join("\n      ");
  const appliesTo = model.appliesTo
    .map((a) => `<li>${esc(a)}</li>`)
    .join("\n      ");
  const sources = model.sources
    .map((s) => `<li><a href="${esc(s)}">${esc(s)}</a></li>`)
    .join("\n      ");
  const related = model.related
    .map((r) => `<li>${esc(r)}</li>`)
    .join("\n      ");

  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(model.title)}</title>
<meta name="description" content="${esc(model.summary)}">
</head>
<body>
<main>
  <h1>${esc(model.title)}</h1>
  <p class="summary">${esc(model.summary)}</p>
  <!-- banner -->
  <section class="applies-to">
    <h2>Applies to</h2>
    <ul>
      ${appliesTo}
    </ul>
  </section>
  <nav class="tiers" aria-label="Sections">
    <ul>
      ${nav}
    </ul>
  </nav>
  <article>
${renderMarkdown(model.body)}
  </article>
  <section class="sources">
    <h2>Sources</h2>
    <ul>
      ${sources}
    </ul>
  </section>
  <section class="related">
    <h2>Related</h2>
    <ul>
      ${related}
    </ul>
  </section>
</main>
</body>
</html>
`;
}
```

The `<!-- banner -->` placeholder is a real anchor that Task 6 replaces, not an unfinished step: Task 6's test asserts the banner appears in its place.

- [ ] **Step 4: Run the tests to verify they pass**

Run: `node --test tools/corpus/test/site-template.test.mjs`
Expected: PASS, 5 tests.

- [ ] **Step 5: Assert marker comments do not leak into output**

Append to `tools/corpus/test/site-template.test.mjs`:

```js
test("marker comments do not appear in the rendered output", () => {
  const withMarkers = {
    ...model,
    body:
      "## 1. What this covers\n\n<!-- corpus:data key=a.b -->\n$5\n<!-- /corpus:data -->\n",
  };
  const html = renderPage(withMarkers);
  assert.equal(html.includes("corpus:data"), false);
});
```

- [ ] **Step 6: Run it to verify it fails**

Run: `node --test tools/corpus/test/site-template.test.mjs`
Expected: FAIL — `marked` passes HTML comments through, so `corpus:data` is present in the output.

- [ ] **Step 7: Strip marker comments before rendering**

In `tools/corpus/site-template.mjs`, add the stripper and call it in `renderPage`:

```js
// Marker comments are HTML comments, so marked passes them straight through
// into the output as invisible-but-present comments. The provenance pass
// (site-provenance.mjs) consumes their information; the comments themselves
// must not ship.
export function stripMarkerComments(body) {
  return body.replace(/<!--\s*\/?corpus:(data|table)[^>]*-->\n?/g, "");
}
```

Then change the `<article>` line in `renderPage` from `renderMarkdown(model.body)` to:

```js
${renderMarkdown(stripMarkerComments(model.body))}
```

- [ ] **Step 8: Run the tests to verify they pass**

Run: `node --test tools/corpus/test/site-template.test.mjs`
Expected: PASS, 6 tests.

- [ ] **Step 9: Commit**

```bash
git add tools/corpus/site-template.mjs tools/corpus/test/site-template.test.mjs
git commit -m "feat: render the eight-part page template with in-page tier navigation"
```

---

### Task 5: Per-figure provenance

**Files:**
- Create: `tools/corpus/site-provenance.mjs`
- Modify: `tools/corpus/site-template.mjs` — call `injectProvenance` in `renderPage`
- Test: `tools/corpus/test/site-provenance.test.mjs`

**Interfaces:**
- Consumes: `findBlocks(text)` (`markers.mjs:12`) returning `{ kind, attrs, start, contentStart, content, end, unterminated }`; `recordsByKey(records)` (`data.mjs:112`); a page model from Task 2.
- Produces: `provenanceFor(block, byKey)` → `{ entries: Array<{ key, verified, source }>, issues }`, and `injectProvenance(html, model, byKey)` → HTML with sub-rows inserted. Task 8 does not use these; Task 9 renders whatever this produces.

**Provenance does not occupy the column axis** (spec lines 325-331). It renders as a **sub-row** immediately beneath its data row, spanning the table's full width, never as additional columns. The reason is arithmetic: `comparison.md`'s main table is already 9 columns across 11 rows and `claude-models.md`'s is 7; a date column plus a source column would make the widest 11, unusable at phone width — so the differentiator would become the thing that broke the page.

The spec's five-row specification, implemented exactly:

| Aspect | Specification |
| ------ | ------------- |
| Content | The record's `verified` date, and its `source` as a link whose text names the vendor page rather than showing a bare URL. |
| Association | Rendered as the next row after its data row, carrying the data row's record key as a `data-` attribute, so the pairing survives re-sorting and is checkable in a test. |
| Several records in one row | One sub-row listing each contributing record once, keyed by the column it backs — two records produce two entries in a single sub-row, not two sub-rows. |
| Identical dates | When every record behind a row shares one `verified` date and one `source`, the sub-row states it once rather than repeating it per column. |
| Default visibility | Visible by default. A disclosure that hides provenance until clicked reduces it to the tooltip this design rejects. |

A figure whose record's `verified` is older than the page's own date is the normal, honest state — `--key`-scoped refreshes move a record without moving its pages, by design — and the site shows both rather than reconciling them.

- [ ] **Step 1: Write the failing test**

Create `tools/corpus/test/site-provenance.test.mjs`:

```js
// tools/corpus/test/site-provenance.test.mjs
import test from "node:test";
import assert from "node:assert/strict";
import { recordsByKey } from "../data.mjs";
import { provenanceFor } from "../site-provenance.mjs";

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
```

- [ ] **Step 2: Run it to verify it fails**

Run: `node --test tools/corpus/test/site-provenance.test.mjs`
Expected: FAIL — `Cannot find module` for `../site-provenance.mjs`.

- [ ] **Step 3: Write the minimal implementation**

Create `tools/corpus/site-provenance.mjs`:

```js
// tools/corpus/site-provenance.mjs
//
// The differentiator: a rendered figure carries the date THAT NUMBER was read
// and a link to the page it came from, independent of the page's own verified
// date. This is a join over findBlocks (markers.mjs) and recordsByKey
// (data.mjs), both of which already exist.

// A link whose text names the vendor page rather than showing a bare URL.
export function sourceLabel(url) {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return url;
  }
}

export function provenanceFor(block, byKey, records = []) {
  const issues = [];
  const entries = [];
  const push = (key) => {
    const rec = byKey.get(key);
    if (!rec) {
      issues.push({
        rule: "site-provenance-unknown-key",
        message: `marker block names record ${key}, which no record defines`,
      });
      return;
    }
    if (!rec.source) {
      issues.push({
        rule: "site-provenance-no-source",
        message: `record ${key} has no source, so its figure cannot be attributed`,
      });
      return;
    }
    entries.push({
      key,
      verified: rec.verified ?? null,
      source: rec.source,
      label: sourceLabel(rec.source),
    });
  };

  if (block.unterminated) return { entries, issues };

  if (block.kind === "data" && block.attrs.key) {
    push(block.attrs.key);
  } else if (block.kind === "table" && block.attrs.tag) {
    for (const rec of records)
      if ((rec.tags ?? []).includes(block.attrs.tag)) push(rec.key);
  }
  return { entries, issues };
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `node --test tools/corpus/test/site-provenance.test.mjs`
Expected: PASS, 2 tests.

- [ ] **Step 5: Test identical-date collapsing and the `data-` attribute**

Append to `tools/corpus/test/site-provenance.test.mjs`:

```js
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
```

Add `renderSubRow` to the import from `../site-provenance.mjs`.

- [ ] **Step 6: Test the unknown-record case from Review Focus 1**

Append to `tools/corpus/test/site-provenance.test.mjs`:

```js
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
```

- [ ] **Step 7: Implement `renderSubRow`**

Add to `tools/corpus/site-provenance.mjs`:

```js
const esc = (s) =>
  String(s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");

// Visible by default, spanning the table's full width, never extra columns.
export function renderSubRow(entries, columnCount) {
  if (entries.length === 0) return "";
  const keys = entries.map((e) => esc(e.key)).join(" ");
  const dates = new Set(entries.map((e) => e.verified));
  const sources = new Set(entries.map((e) => e.source));

  // Identical dates and sources are stated once rather than per column.
  const text =
    dates.size === 1 && sources.size === 1
      ? `Read ${esc([...dates][0])} from <a href="${esc(entries[0].source)}">${esc(entries[0].label)}</a>`
      : entries
          .map(
            (e) =>
              `${esc(e.key)}: read ${esc(e.verified)} from <a href="${esc(e.source)}">${esc(e.label)}</a>`,
          )
          .join("; ");

  return `<tr class="provenance" data-record-key="${keys}"><td colspan="${columnCount}">${text}</td></tr>`;
}
```

- [ ] **Step 8: Test the unterminated-block case from Review Focus 2**

Append to `tools/corpus/test/site-provenance.test.mjs`:

```js
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
```

- [ ] **Step 9: Run the tests to verify they pass**

Run: `node --test tools/corpus/test/site-provenance.test.mjs`
Expected: PASS, 7 tests.

- [ ] **Step 10: Commit**

```bash
git add tools/corpus/site-provenance.mjs tools/corpus/test/site-provenance.test.mjs
git commit -m "feat: attach per-figure provenance as full-width table sub-rows"
```

---

### Task 6: The freshness banner

**Files:**
- Create: `tools/corpus/site-freshness.mjs`
- Modify: `tools/corpus/site-template.mjs` — replace the `<!-- banner -->` anchor
- Test: `tools/corpus/test/site-freshness.test.mjs`

**Interfaces:**
- Consumes: a page model from Task 2; `expiryFor(verified, volatility)` (`ledger.mjs:47`), `addDays(iso, days)` (`ledger.mjs:15`), `CADENCE_DAYS` (`ledger.mjs:3`), `isValidIsoDate(s)` (`ledger.mjs:9`).
- Produces: `freshnessFacts(model)` → `{ verified, volatility, cadenceDays, expires, hardFail, seed, deprecated }` or `null`; `stateLabel(facts, todayIso)` → `"fresh" | "due" | "expired"`; `clientScript()` → a `<script>` string; `renderBanner(facts)` → HTML. Task 8 reads a page's state for search results via `stateLabel`.

**This is the single most important mechanic in the component.** The banner separates **facts** from the **label derived from them**, and the two are produced at different times:

| Part | Produced | Why |
| ---- | -------- | --- |
| `verified` date, cadence in days, `expires` date, derived volatility | **server-side at build** | Facts about the tree. They cannot change without a commit. |
| The state label `fresh` / `due` / `expired` | **client-side at view time** | A function of the viewer's current date, which the build cannot know. |

**Why the split is not optional.** State is a function of *today*. Revision 1 of the spec computed it at build time and embedded the result, which froze the banner at whatever the state was when the site was last deployed. A `high`-volatility page expires 30 days after the date it was verified, so a build-time label begins asserting `fresh` over an expired page within about a month of any refresh and goes on asserting it until something redeploys. Worse, the two failures compound: once a page is that overdue `lint` fails, and because the workflow runs the gates as blocking steps *before* the build, the deploy is refused at exactly the moment the banner is most wrong. The site would be unable to correct itself.

Thresholds, verbatim from the spec, which are `lint`'s own thresholds so the banner can never assert something the gates would contradict:

| State | Condition | Matches |
| ----- | --------- | ------- |
| `fresh` | today is on or before `expires` | lint passes |
| `due` | today is after `expires`, within one further cadence | lint still passes, by design |
| `expired` | more than one full cadence past `expires` | what `lint` actually fails on |

`expires = verified + CADENCE_DAYS[volatility]` with `CADENCE_DAYS = { high: 30, medium: 90, low: 270 }`. A page referencing no records derives `volatility: null` and expires on the low cadence — `expiryFor` already handles this via its `?? "low"` fallback. `checkExpiry` (`lint.mjs:196-211`) computes the hard-fail boundary as `addDays(entry.expires, CADENCE_DAYS[entry.volatility ?? "low"])` and fails when `today > hardFail`; `stateLabel` must use the same two comparisons so the two cannot drift.

**One label algorithm, not two.** `stateLabel` is a pure function exported from `site-freshness.mjs`, tested server-side with an injected date, and **serialised into the client script with `stateLabel.toString()`** so the browser runs the identical code. Writing the algorithm twice — once for tests and once for the browser — is how the two silently diverge.

**With JavaScript unavailable the page states the facts and shows no badge** — "Verified YYYY-MM-DD · re-check every 30 days", with that page's own date and cadence. That is complete and honest: the reader has both numbers and can draw the conclusion. A missing badge is a far better failure than a confident wrong one.

A `seed: true` page's banner **says so in words**: the page was authored before the refresh pipeline existed, so its `verified` date records when it was last checked by hand and not a pipeline run. All five launch pages carry `seed: true`, so this disclosure covers 100% of content at launch, which is precisely why it cannot be omitted.

A `status: deprecated` page gets its deprecation reason and replacement link and **no freshness banner at all** — it is excluded from the ledger and from expiry entirely, and there is no freshness claim to make.

- [ ] **Step 1: Write the failing test for the facts**

Create `tools/corpus/test/site-freshness.test.mjs`:

```js
// tools/corpus/test/site-freshness.test.mjs
import test from "node:test";
import assert from "node:assert/strict";
import { freshnessFacts, stateLabel } from "../site-freshness.mjs";

const high = {
  verified: "2026-10-06",
  volatility: "high",
  seed: true,
  status: null,
};

test("facts carry the cadence and the derived expiry", () => {
  const f = freshnessFacts(high);
  assert.equal(f.verified, "2026-10-06");
  assert.equal(f.cadenceDays, 30);
  assert.equal(f.expires, "2026-11-05");
  assert.equal(f.volatility, "high");
});

test("the hard-fail boundary is one further cadence past expiry", () => {
  const f = freshnessFacts(high);
  assert.equal(f.hardFail, "2026-12-05");
});

test("a deprecated page has no freshness facts at all", () => {
  assert.equal(
    freshnessFacts({ ...high, status: "deprecated" }),
    null,
  );
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `node --test tools/corpus/test/site-freshness.test.mjs`
Expected: FAIL — `Cannot find module` for `../site-freshness.mjs`.

- [ ] **Step 3: Write the minimal implementation**

Create `tools/corpus/site-freshness.mjs`:

```js
// tools/corpus/site-freshness.mjs
//
// Facts are rendered at build time; the state label is computed in the browser
// at view time. stateLabel is serialised into the client script with
// toString() so there is exactly ONE implementation of the thresholds — the
// same function the tests drive with an injected date.
import { CADENCE_DAYS, addDays, expiryFor, isValidIsoDate } from "./ledger.mjs";

export function freshnessFacts(model) {
  // A deprecated page is excluded from the ledger and from expiry entirely,
  // so there is no freshness claim to make and no banner to render.
  if (model.status === "deprecated") return null;
  if (!model.verified || !isValidIsoDate(model.verified)) {
    return {
      verified: model.verified ?? null,
      volatility: model.volatility ?? null,
      cadenceDays: null,
      expires: null,
      hardFail: null,
      seed: model.seed === true,
      unreadableDate: true,
    };
  }
  const cadenceDays = CADENCE_DAYS[model.volatility ?? "low"];
  const expires = expiryFor(model.verified, model.volatility);
  return {
    verified: model.verified,
    volatility: model.volatility ?? null,
    cadenceDays,
    expires,
    hardFail: addDays(expires, cadenceDays),
    seed: model.seed === true,
    unreadableDate: false,
  };
}

// Pure, and intentionally string-comparison only: ISO dates sort
// lexicographically, which is what lint.mjs relies on too.
export function stateLabel(facts, todayIso) {
  if (!facts || !facts.expires) return null;
  if (todayIso <= facts.expires) return "fresh";
  if (todayIso <= facts.hardFail) return "due";
  return "expired";
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `node --test tools/corpus/test/site-freshness.test.mjs`
Expected: PASS, 3 tests.

- [ ] **Step 5: Write the injected-date label test, all three states from one fixture**

This is the test most worth writing carefully. It must drive `stateLabel` with an **injected** current date rather than the real clock, and assert all three states from one fixture — a test using the real date passes today and stops exercising `due` and `expired` the moment the fixture ages, which would be a test present but vacuous. The precedent already exists in this repo: `lintCorpus(root, today = new Date().toISOString().slice(0, 10))` takes an injectable date, and `cli.test.mjs` calls `lintCorpus(ROOT, "2026-09-20")`.

Append to `tools/corpus/test/site-freshness.test.mjs`:

```js
test("all three states are reachable from one fixture with an injected date", () => {
  const f = freshnessFacts(high); // expires 2026-11-05, hardFail 2026-12-05
  assert.equal(stateLabel(f, "2026-10-06"), "fresh");
  assert.equal(stateLabel(f, "2026-11-05"), "fresh");
  assert.equal(stateLabel(f, "2026-11-06"), "due");
  assert.equal(stateLabel(f, "2026-12-05"), "due");
  assert.equal(stateLabel(f, "2026-12-06"), "expired");
});

test("the expired threshold matches checkExpiry exactly", () => {
  const f = freshnessFacts(high);
  const entry = {
    path: "p",
    expires: f.expires,
    volatility: "high",
    status: null,
  };
  // lint fails when today > addDays(expires, cadence); the banner must say
  // "expired" on exactly the same days and no others.
  assert.equal(checkExpiry(entry, "2026-12-05").length, 0);
  assert.equal(stateLabel(f, "2026-12-05"), "due");
  assert.equal(checkExpiry(entry, "2026-12-06").length, 1);
  assert.equal(stateLabel(f, "2026-12-06"), "expired");
});
```

Add `import { checkExpiry } from "../lint.mjs";` to the imports.

- [ ] **Step 6: Run the tests to verify they pass**

Run: `node --test tools/corpus/test/site-freshness.test.mjs`
Expected: PASS, 5 tests. If the `checkExpiry` test fails, `stateLabel`'s boundary is off by one against the gate — fix `stateLabel`, not the test.

- [ ] **Step 7: Write the Review Focus 3 test — a page referencing zero records**

Append to `tools/corpus/test/site-freshness.test.mjs`:

```js
test("a page referencing no records falls back to the low cadence", () => {
  const f = freshnessFacts({
    verified: "2026-01-01",
    volatility: null,
    seed: false,
    status: null,
  });
  assert.equal(f.cadenceDays, 270);
  assert.equal(f.expires, "2026-09-28");
  assert.match(f.expires, /^\d{4}-\d{2}-\d{2}$/);
  assert.equal(stateLabel(f, "2026-09-28"), "fresh");
  assert.equal(stateLabel(f, "2026-09-29"), "due");
});
```

- [ ] **Step 8: Run it to verify it passes**

Run: `node --test tools/corpus/test/site-freshness.test.mjs`
Expected: PASS, 6 tests. `expiryFor("2026-01-01", null)` is `2026-09-28` — the same value `ledger.test.mjs:40` already asserts for the low cadence.

- [ ] **Step 9: Write the Review Focus 4 test — absent or malformed `verified`**

Append to `tools/corpus/test/site-freshness.test.mjs`:

```js
test("a page with no verified date renders a banner that says so, not a computed expiry", () => {
  const f = freshnessFacts({
    verified: null,
    volatility: "high",
    seed: false,
    status: null,
  });
  assert.equal(f.unreadableDate, true);
  assert.equal(f.expires, null);
  assert.equal(stateLabel(f, "2026-10-06"), null);
});

test("a malformed verified date is treated as unreadable, not parsed loosely", () => {
  const f = freshnessFacts({
    verified: "2026-02-30",
    volatility: "high",
    seed: false,
    status: null,
  });
  assert.equal(f.unreadableDate, true);
  assert.equal(f.expires, null);
});
```

`isValidIsoDate` rejects `2026-02-30` because it is not a real calendar date, which is the same check `lint`'s `frontmatter-date` rule makes.

- [ ] **Step 10: Run the tests to verify they pass**

Run: `node --test tools/corpus/test/site-freshness.test.mjs`
Expected: PASS, 8 tests.

- [ ] **Step 11: Write the client script, serialising the one algorithm**

Append to `tools/corpus/site-freshness.mjs`:

```js
// The browser runs the SAME stateLabel the tests drive. Serialising it with
// toString() is what keeps one implementation: writing the thresholds twice is
// how a build-time test and a view-time banner silently diverge.
//
// The viewer's LOCAL calendar date is used, not toISOString(), which returns a
// UTC date — at 19:00 in UTC-7 that is already tomorrow, which would show a
// reader "due" a day early. This is the client-side twin of the Date-parsing
// bug the spec documents for front-matter.
export function clientScript() {
  return `<script>
(function () {
  var stateLabel = ${stateLabel.toString()};
  function localToday(d) {
    var y = d.getFullYear();
    var m = String(d.getMonth() + 1).padStart(2, "0");
    var day = String(d.getDate()).padStart(2, "0");
    return y + "-" + m + "-" + day;
  }
  var el = document.querySelector("[data-freshness]");
  if (!el) return;
  var facts = JSON.parse(el.getAttribute("data-freshness"));
  var state = stateLabel(facts, localToday(new Date()));
  if (!state) return;
  var badge = document.createElement("span");
  badge.className = "badge badge-" + state;
  badge.textContent = state;
  el.appendChild(badge);
})();
</script>`;
}
```

- [ ] **Step 12: Write the Review Focus 5 test — the day boundary**

Append to `tools/corpus/test/site-freshness.test.mjs`:

```js
test("the client script computes the viewer's local date, never a UTC date", () => {
  const js = clientScript();
  assert.match(js, /getFullYear\(\)/);
  assert.match(js, /getMonth\(\) \+ 1/);
  assert.match(js, /getDate\(\)/);
  // toISOString() would be a UTC date and could show "due" a day early west
  // of UTC; its absence is the assertion.
  assert.equal(js.includes("toISOString"), false);
});

test("the client script carries the same stateLabel the tests drive", () => {
  const js = clientScript();
  assert.match(js, /todayIso <= facts\.expires/);
  assert.match(js, /todayIso <= facts\.hardFail/);
});
```

Add `clientScript` to the import from `../site-freshness.mjs`.

- [ ] **Step 13: Run the tests to verify they pass**

Run: `node --test tools/corpus/test/site-freshness.test.mjs`
Expected: PASS, 10 tests.

- [ ] **Step 14: Render the banner and wire it into the template**

Append to `tools/corpus/site-freshness.mjs`:

```js
const esc = (s) =>
  String(s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");

export function renderBanner(facts) {
  if (!facts) return "";
  const seedNote = facts.seed
    ? `<p class="seed-note">This page was authored before the refresh pipeline existed, so its verified date records when it was last checked by hand rather than a pipeline run.</p>`
    : "";
  if (facts.unreadableDate) {
    return `<aside class="freshness freshness-unknown">
    <p>This page states no readable verified date, so its freshness cannot be computed.</p>
    ${seedNote}
  </aside>`;
  }
  // The facts render server-side and are complete without JavaScript; the
  // badge is appended by clientScript() at view time.
  return `<aside class="freshness" data-freshness="${esc(JSON.stringify({ expires: facts.expires, hardFail: facts.hardFail }))}">
    <p>Verified ${esc(facts.verified)} · re-check every ${esc(facts.cadenceDays)} days · expires ${esc(facts.expires)}</p>
    ${seedNote}
  </aside>`;
}
```

In `tools/corpus/site-template.mjs`, import the three functions and replace the `<!-- banner -->` line:

```js
import { freshnessFacts, renderBanner, clientScript } from "./site-freshness.mjs";
```

Replace `  <!-- banner -->` with:

```js
  ${renderBanner(freshnessFacts(model))}
```

And insert `${clientScript()}` immediately before `</body>`.

- [ ] **Step 15: Test the banner and the deprecated-page case**

Append to `tools/corpus/test/site-template.test.mjs`:

```js
test("the banner states the facts without a badge in the markup", () => {
  const html = renderPage(model);
  assert.match(html, /Verified 2026-10-06 · re-check every 30 days/);
  assert.match(html, /data-freshness=/);
  assert.equal(html.includes("badge-fresh"), false);
});

test("a seed page discloses that its date predates the pipeline", () => {
  const html = renderPage(model);
  assert.match(html, /authored before the refresh pipeline existed/);
});

test("a deprecated page renders no freshness banner at all", () => {
  const html = renderPage({ ...model, status: "deprecated" });
  assert.equal(html.includes("data-freshness"), false);
  assert.equal(html.includes("re-check every"), false);
});
```

- [ ] **Step 16: Run the tests to verify they pass**

Run: `node --test tools/corpus/test/site-template.test.mjs tools/corpus/test/site-freshness.test.mjs`
Expected: PASS, 19 tests across the two files.

- [ ] **Step 17: Run the full gates**

Run: `node tools/corpus/cli.mjs render --check . && node tools/corpus/cli.mjs lint . && node tools/corpus/cli.mjs verify . && npm test > /tmp/t.out 2>&1; grep -E "^# (pass|fail)" /tmp/t.out`
Expected: all three clean, `# fail 0`.

- [ ] **Step 18: Commit**

```bash
git add tools/corpus/site-freshness.mjs tools/corpus/site-template.mjs tools/corpus/test/site-freshness.test.mjs tools/corpus/test/site-template.test.mjs
git commit -m "feat: render freshness facts server-side and compute the label at view time"
```

---

### Task 7: Navigation and the honesty rules

**Files:**
- Create: `tools/corpus/site-nav.mjs`
- Modify: `tools/corpus/site-template.mjs` — add `renderFrontPage(models, topics)` and a nav block in `renderPage`
- Test: `tools/corpus/test/site-nav.test.mjs`

**Interfaces:**
- Consumes: page models from Task 2 (`topic`, `path`, `title`); the topic list from `meta/taxonomy.yaml`.
- Produces: `topicLabel(slug)` → display string; `navTopics(models, topics)` → `Array<{ slug, label, pages }>` containing only populated topics in taxonomy order; `loadTopics(root)` → `string[]`. Task 8 reads `topicLabel` for search results; Task 9 writes the front page `renderFrontPage` produces.

**Only populated topics appear in navigation.** Four today. Listing all eleven would advertise coverage the corpus does not have, to an audience the project has already decided is "public and reputational" and whose primary risk is being caught overstating. The full taxonomy may appear **as a roadmap** — a page saying plainly which topics are planned and empty — but never as a navigation menu whose entries lead nowhere. A "coming soon" page per empty topic is explicitly in the spec's "deliberately absent" list: seven stubs advertising absent content is the overclaiming failure in a different costume.

**Expired pages are labelled, never hidden.** An expired page states its state above the fold, in the banner, before its content. Hiding it would break inbound links and suppress precisely the signal the corpus exists to emit. Since the label is computed at view time (Task 6), navigation cannot filter on it at build time anyway — which makes the honest behaviour also the only implementable one.

**Topic display names** are derived from the slug — `claude-code` becomes "Claude Code" — with a small exceptions map for casing that cannot be inferred. `meta/taxonomy.yaml` is **not** changed: it stays the bare eleven-slug list it is today, because adding a topic is a contract change under `CLAUDE.md` and presentation metadata is not worth touching a contract-governed file for. Navigation order follows the existing order of the list.

- [ ] **Step 1: Write the failing test**

Create `tools/corpus/test/site-nav.test.mjs`:

```js
// tools/corpus/test/site-nav.test.mjs
import test from "node:test";
import assert from "node:assert/strict";
import { topicLabel, navTopics, loadTopics } from "../site-nav.mjs";

const ROOT = new URL("./fixtures/corpus/", import.meta.url).pathname;

test("a slug becomes a title-cased label", () => {
  assert.equal(topicLabel("models"), "Models");
  assert.equal(topicLabel("foundations"), "Foundations");
});

test("the exceptions map supplies casing a slug cannot imply", () => {
  assert.equal(topicLabel("claude-code"), "Claude Code");
});

test("an unknown multi-word slug still produces a readable label", () => {
  assert.equal(topicLabel("some-new-topic"), "Some New Topic");
});

test("only populated topics appear, in taxonomy order", () => {
  const models = [
    { path: "guides/clean.md", topic: "models", title: "A" },
    { path: "guides/hooks.md", topic: "claude-code", title: "B" },
  ];
  const nav = navTopics(models, loadTopics(ROOT));
  assert.deepEqual(
    nav.map((t) => t.slug),
    ["claude-code", "models"],
  );
});

test("an empty topic is absent from navigation entirely", () => {
  const models = [{ path: "guides/clean.md", topic: "models", title: "A" }];
  const nav = navTopics(models, ["claude-code", "models"]);
  assert.deepEqual(
    nav.map((t) => t.slug),
    ["models"],
  );
  assert.equal(JSON.stringify(nav).includes("claude-code"), false);
});
```

The fixture's `meta/taxonomy.yaml` is `topics: [claude-code, models]`, so taxonomy order puts `claude-code` first.

- [ ] **Step 2: Run it to verify it fails**

Run: `node --test tools/corpus/test/site-nav.test.mjs`
Expected: FAIL — `Cannot find module` for `../site-nav.mjs`.

- [ ] **Step 3: Write the minimal implementation**

Create `tools/corpus/site-nav.mjs`:

```js
// tools/corpus/site-nav.mjs
import fs from "node:fs";
import path from "node:path";
import yaml from "js-yaml";

// Casing a slug cannot imply. Kept deliberately small: meta/taxonomy.yaml is
// contract-governed and presentation metadata is not worth changing it for.
const EXCEPTIONS = {
  "claude-code": "Claude Code",
};

export function topicLabel(slug) {
  if (EXCEPTIONS[slug]) return EXCEPTIONS[slug];
  return slug
    .split("-")
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(" ");
}

export function loadTopics(root) {
  const file = path.join(root, "meta", "taxonomy.yaml");
  if (!fs.existsSync(file)) return [];
  const doc = yaml.load(fs.readFileSync(file, "utf8"), {
    schema: yaml.JSON_SCHEMA,
  });
  return Array.isArray(doc?.topics) ? doc.topics : [];
}

// Only populated topics, in taxonomy order. An empty topic is omitted
// entirely rather than rendered as a dead menu entry.
export function navTopics(models, topics) {
  return topics
    .map((slug) => ({
      slug,
      label: topicLabel(slug),
      pages: models
        .filter((m) => m.topic === slug)
        .sort((a, b) => a.path.localeCompare(b.path)),
    }))
    .filter((t) => t.pages.length > 0);
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `node --test tools/corpus/test/site-nav.test.mjs`
Expected: PASS, 5 tests.

- [ ] **Step 5: Write the front page, method-first**

The launch bar requires "a front page framing the corpus method-first". The front page therefore leads with **how claims earn their confidence** — the evidence labels, the source tiers, the record-and-date discipline, and the fact that figures carry their own provenance — before it leads with topics. With four populated topics, method is the honest headline anyway.

Append to `tools/corpus/site-template.mjs`:

```js
import { navTopics, loadTopics } from "./site-nav.mjs";

export function renderFrontPage(models, topics) {
  const nav = navTopics(models, topics);
  const sections = nav
    .map(
      (t) => `    <section class="topic">
      <h3>${esc(t.label)}</h3>
      <ul>
${t.pages.map((p) => `        <li><a href="${esc(htmlPathFor(p.path))}">${esc(p.title)}</a></li>`).join("\n")}
      </ul>
    </section>`,
    )
    .join("\n");

  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>LLM guides</title>
<meta name="description" content="A reference corpus on effective LLM use, where every page and every figure carries a verification date.">
</head>
<body>
<main>
  <h1>LLM guides</h1>
  <section class="method">
    <h2>How claims here earn their confidence</h2>
    <p>Every volatile value — a model id, a price, a context limit — lives in a
    record carrying the URL it was read from and the date it was read. Figures
    on a page show that date and link that source, independently of when the
    page itself was last checked.</p>
    <p>Claims are labelled. <strong>Verified</strong> means a runnable proof
    ships in the repository. <strong>Documented</strong> means a vendor or
    peer-reviewed source states it, linked, with the date it was read.
    <strong>Plausible</strong> means practitioner inference, and is never
    written as confident prose.</p>
    <p>Every page states when it was last checked and when it goes stale. A
    page past its expiry says so, in its banner, before its content.</p>
  </section>
  <section class="topics">
    <h2>Guides</h2>
${sections}
  </section>
</main>
</body>
</html>
`;
}
```

Also add the shared path helper, used by both the front page and Task 9:

```js
// guides/models/comparison.md -> guides/models/comparison.html
export function htmlPathFor(mdPath) {
  return mdPath.replace(/\.md$/, ".html");
}
```

- [ ] **Step 6: Test the front page**

Append to `tools/corpus/test/site-template.test.mjs`:

```js
test("the front page leads with method before topics", () => {
  const html = renderFrontPage([model], ["models"]);
  const method = html.indexOf("How claims here earn their confidence");
  const topics = html.indexOf("<h2>Guides</h2>");
  assert.equal(method > -1, true);
  assert.equal(method < topics, true);
});

test("the front page links pages as .html, not .md", () => {
  const html = renderFrontPage([model], ["models"]);
  assert.match(html, /href="guides\/models\/claude-models\.html"/);
});

test("the front page omits a topic with no pages", () => {
  const html = renderFrontPage([model], ["models", "cowork"]);
  assert.equal(html.includes("Cowork"), false);
});
```

Add `renderFrontPage` to the import from `../site-template.mjs`.

- [ ] **Step 7: Run the tests to verify they pass**

Run: `node --test tools/corpus/test/site-template.test.mjs tools/corpus/test/site-nav.test.mjs`
Expected: PASS, 27 tests across the two files.

- [ ] **Step 8: Commit**

```bash
git add tools/corpus/site-nav.mjs tools/corpus/site-template.mjs tools/corpus/test/site-nav.test.mjs tools/corpus/test/site-template.test.mjs
git commit -m "feat: navigate populated topics only, with a method-first front page"
```

---

### Task 8: Search

**Files:**
- Create: `tools/corpus/site-search.mjs`
- Test: `tools/corpus/test/site-search.test.mjs`

**Interfaces:**
- Consumes: page models from Task 2; `numberedHeadings(body)` from Task 4's `site-template.mjs`; `freshnessFacts` and `stateLabel` from Task 6.
- Produces: `buildSearchIndex(models)` → `Array<{ path, title, summary, topic, sections: Array<{ heading, text }>, freshness }>`; `searchScript()` → a `<script>` string. Task 9 writes the index to `dist/search-index.json`.

**A build-time JSON index plus a short client-side script. No search library.** At five pages — and realistically at fifty — a library is not yet earned, and every dependency is weighed against the neglect test. The index format is specified as an explicit contract so swapping in a real index later is a contained change behind the same interface: the build emits an index file, the client reads it, and nothing else in the site depends on how matching works.

**The index is fetched lazily, on first interaction with the search field — never on page load.** Per-section text across the whole corpus is the largest asset the site ships, and eager-loading it on every page view would spend more bytes than the avoided search library saves, defeating the reason for hand-rolling it. The index is a separate file, not inlined, so it caches independently of the pages.

**Search results show the page title, the matching section, and the page's freshness state** — because a result for a stale page should say so at the point of choosing, not after the click. The state is computed client-side from the same facts the banner uses, for the same reason.

- [ ] **Step 1: Write the failing test**

Create `tools/corpus/test/site-search.test.mjs`:

```js
// tools/corpus/test/site-search.test.mjs
import test from "node:test";
import assert from "node:assert/strict";
import { buildSearchIndex, searchScript } from "../site-search.mjs";

const model = {
  path: "guides/models/claude-models.md",
  title: "Claude models",
  summary: "Model ids and prices.",
  topic: "models",
  verified: "2026-10-06",
  volatility: "high",
  seed: true,
  status: null,
  body:
    "## 1. What this covers\n\nthe current lineup\n\n## 6. Where this rots\n\nprices move\n",
};

test("the index carries one entry per page with the contracted fields", () => {
  const index = buildSearchIndex([model]);
  assert.equal(index.length, 1);
  assert.deepEqual(Object.keys(index[0]).sort(), [
    "freshness",
    "path",
    "sections",
    "summary",
    "title",
    "topic",
  ]);
});

test("each numbered section contributes its heading and its text", () => {
  const [entry] = buildSearchIndex([model]);
  assert.deepEqual(
    entry.sections.map((s) => s.heading),
    ["1. What this covers", "6. Where this rots"],
  );
  assert.match(entry.sections[0].text, /the current lineup/);
  assert.match(entry.sections[1].text, /prices move/);
});

test("the entry carries freshness facts so a result can show staleness", () => {
  const [entry] = buildSearchIndex([model]);
  assert.equal(entry.freshness.expires, "2026-11-05");
  assert.equal(entry.freshness.hardFail, "2026-12-05");
});

test("a deprecated page has null freshness in the index", () => {
  const [entry] = buildSearchIndex([{ ...model, status: "deprecated" }]);
  assert.equal(entry.freshness, null);
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `node --test tools/corpus/test/site-search.test.mjs`
Expected: FAIL — `Cannot find module` for `../site-search.mjs`.

- [ ] **Step 3: Write the minimal implementation**

Create `tools/corpus/site-search.mjs`:

```js
// tools/corpus/site-search.mjs
//
// A build-time index and a client script, no search library. The index format
// is the contract: the build emits a file, the client reads it, and nothing
// else in the site depends on how matching works — so a real index can replace
// the matching later without touching anything but this file.
import { numberedHeadings } from "./site-template.mjs";
import { freshnessFacts } from "./site-freshness.mjs";

export function sectionTexts(body) {
  const headings = numberedHeadings(body);
  const lines = body.split("\n");
  const out = [];
  let current = null;
  let inFence = false;
  for (const line of lines) {
    if (/^\s*```/.test(line)) {
      inFence = !inFence;
      if (current) current.text.push(line);
      continue;
    }
    const m = !inFence && line.match(/^##\s+(\d+\.\s+.*)$/);
    if (m) {
      if (current) out.push(current);
      current = { heading: m[1], text: [] };
      continue;
    }
    if (current) current.text.push(line);
  }
  if (current) out.push(current);
  return out
    .filter((s) => headings.some((h) => h.text === s.heading))
    .map((s) => ({ heading: s.heading, text: s.text.join("\n").trim() }));
}

export function buildSearchIndex(models) {
  return models.map((m) => {
    const facts = freshnessFacts(m);
    return {
      path: m.path,
      title: m.title,
      summary: m.summary,
      topic: m.topic,
      sections: sectionTexts(m.body),
      freshness: facts
        ? { expires: facts.expires, hardFail: facts.hardFail }
        : null,
    };
  });
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `node --test tools/corpus/test/site-search.test.mjs`
Expected: PASS, 4 tests.

- [ ] **Step 5: Write the client script with lazy loading**

Append to `tools/corpus/site-search.mjs`:

```js
// The index is the largest asset the site ships, so it is fetched on FIRST
// INTERACTION with the field, never on page load. Eager-loading it would spend
// more bytes than the avoided search library saves.
export function searchScript() {
  return `<script>
(function () {
  var field = document.querySelector("[data-search]");
  if (!field) return;
  var index = null;
  var loading = false;
  function load() {
    if (index || loading) return Promise.resolve();
    loading = true;
    return fetch("/search-index.json")
      .then(function (r) { return r.json(); })
      .then(function (data) { index = data; loading = false; });
  }
  field.addEventListener("focus", load, { once: true });
  field.addEventListener("input", function () {
    load().then(function () {
      if (!index) return;
      var q = field.value.toLowerCase().trim();
      var out = document.querySelector("[data-search-results]");
      if (!out) return;
      out.innerHTML = "";
      if (q.length < 2) return;
      index.forEach(function (page) {
        page.sections.forEach(function (s) {
          if ((s.heading + " " + s.text).toLowerCase().indexOf(q) === -1) return;
          var li = document.createElement("li");
          var a = document.createElement("a");
          a.href = page.path.replace(/\\.md$/, ".html");
          a.textContent = page.title + " — " + s.heading;
          li.appendChild(a);
          out.appendChild(li);
        });
      });
    });
  });
})();
</script>`;
}
```

- [ ] **Step 6: Test the lazy-loading contract**

Append to `tools/corpus/test/site-search.test.mjs`:

```js
test("the index is fetched on interaction, not on page load", () => {
  const js = searchScript();
  assert.match(js, /addEventListener\("focus", load/);
  assert.match(js, /addEventListener\("input"/);
  // A top-level fetch would be eager loading; the fetch must sit inside load().
  assert.equal(/^\s*fetch\(/m.test(js.replace(/function load\(\)[\s\S]*?\n  \}/, "")), false);
});

test("the index is a separate file so it caches independently", () => {
  assert.match(searchScript(), /search-index\.json/);
});
```

- [ ] **Step 7: Run the tests to verify they pass**

Run: `node --test tools/corpus/test/site-search.test.mjs`
Expected: PASS, 6 tests.

- [ ] **Step 8: Commit**

```bash
git add tools/corpus/site-search.mjs tools/corpus/test/site-search.test.mjs
git commit -m "feat: build a search index and load it lazily on first interaction"
```

---

### Task 9: Output and CI

**Files:**
- Modify: `tools/corpus/site.mjs` — make `write` emit `dist/`
- Modify: `.gitignore` — add `dist/`
- Create: `.github/workflows/site.yml`
- Test: `tools/corpus/test/site-output.test.mjs`

**Interfaces:**
- Consumes: everything. `collectPages` (Task 2), `renderPage` and `renderFrontPage` and `htmlPathFor` (Tasks 4, 7), `injectProvenance` (Task 5), `buildSearchIndex` (Task 8), `loadTopics` (Task 7).
- Produces: `dist/` containing one `.html` per guide at its guide path with `.md` swapped for `.html`, `index.html` at the root, and `search-index.json`.

**`.gitignore` has no build-output entry** — it holds `node_modules/`, `local/`, `.superpowers/`, `.DS_Store`, `.claude/`, `.serena/`, `.token-optimizer/`. Omitting `dist/` would stage a generated tree on the next commit.

**Gates before build, always.** A site built from a tree that fails `verify` would publish exactly the class of error the gates exist to catch. The workflow runs `render --check .`, `lint .`, `verify .` and `npm test` first, as blocking steps; builds only if all four pass; then deploys. **Pull requests run steps 1 and 2 but never step 3**, so a branch gets the gates and a build without publishing. Nothing is scheduled: with the state label computed at view time there is nothing a periodic rebuild would correct.

**Rollback.** A Pages deploy replaces the site wholesale, so a renderer bug reaches every page at once. The revert is to push a revert commit on `master`, which re-runs the workflow and redeploys the previous output; recovery time is one workflow run. There is no partial rollback and no per-page revert, which is acceptable because the input is version-controlled text and the build is deterministic — but it does mean the first deploy of any rendering change should be watched rather than fired and forgotten.

**The CI workflow is itself a rot surface.** GitHub Actions deprecates runner images and action versions on its own schedule, and a pinned `actions/*@vN` eventually warns and then fails. On a neglected one-person repo the realistic failure is a workflow that stops running and a site that silently stops updating — the same class of harm as a stale banner by a different route. Two mitigations are cheap: the deploy is the only step depending on Actions-specific features, and **`site --write .` must stay runnable by hand** so a broken workflow degrades to a manual publish rather than to no publish.

**The site build is not one of the four gates.** All four pass on a tree whose site build is broken, because none of them reads this output. A green local gate run is therefore not evidence the site builds; only the workflow, or `site --write .` by hand, is.

- [ ] **Step 1: Write the failing test**

Create `tools/corpus/test/site-output.test.mjs`:

```js
// tools/corpus/test/site-output.test.mjs
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { siteCorpus } from "../site.mjs";

const FIXTURE = new URL("./fixtures/corpus/", import.meta.url).pathname;

function tmpCopy() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "site-out-"));
  fs.cpSync(FIXTURE, dir, { recursive: true });
  return dir;
}

test("write emits one html file per guide at its guide path", () => {
  const root = tmpCopy();
  siteCorpus(root, { write: true });
  assert.equal(fs.existsSync(path.join(root, "dist", "guides", "clean.html")), true);
  assert.equal(
    fs.existsSync(path.join(root, "dist", "guides", "verify", "deprecated.html")),
    true,
  );
});

test("write emits a front page and a search index", () => {
  const root = tmpCopy();
  siteCorpus(root, { write: true });
  assert.equal(fs.existsSync(path.join(root, "dist", "index.html")), true);
  const idx = JSON.parse(
    fs.readFileSync(path.join(root, "dist", "search-index.json"), "utf8"),
  );
  assert.equal(Array.isArray(idx), true);
});

test("without write, nothing is emitted", () => {
  const root = tmpCopy();
  siteCorpus(root, { write: false });
  assert.equal(fs.existsSync(path.join(root, "dist")), false);
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `node --test tools/corpus/test/site-output.test.mjs`
Expected: FAIL — `dist/guides/clean.html` does not exist, because `siteCorpus` ignores `write`.

- [ ] **Step 3: Write the minimal implementation**

Replace the body of `tools/corpus/site.mjs`:

```js
// tools/corpus/site.mjs
import fs from "node:fs";
import path from "node:path";
import { loadRecords, recordsByKey } from "./data.mjs";
import { collectPages } from "./site-model.mjs";
import { renderPage, renderFrontPage, htmlPathFor } from "./site-template.mjs";
import { loadTopics } from "./site-nav.mjs";
import { buildSearchIndex } from "./site-search.mjs";

export function siteCorpus(root, { write = false } = {}) {
  const records = loadRecords(path.join(root, "data"));
  const byKey = recordsByKey(records);
  const { pages, issues } = collectPages(root, records);
  const topics = loadTopics(root);

  if (write) {
    const out = path.join(root, "dist");
    for (const page of pages) {
      const dest = path.join(out, htmlPathFor(page.path));
      fs.mkdirSync(path.dirname(dest), { recursive: true });
      fs.writeFileSync(dest, renderPage(page, byKey, records));
    }
    fs.mkdirSync(out, { recursive: true });
    fs.writeFileSync(path.join(out, "index.html"), renderFrontPage(pages, topics));
    fs.writeFileSync(
      path.join(out, "search-index.json"),
      JSON.stringify(buildSearchIndex(pages)),
    );
  }

  return { pages, issues };
}
```

`renderPage` gains two parameters so Task 5's provenance pass can run: change its signature in `site-template.mjs` to `renderPage(model, byKey = new Map(), records = [])` and call `injectProvenance` on the rendered article HTML. Existing Task 4 and 6 tests call it with one argument, and the defaults keep them passing.

- [ ] **Step 4: Run the tests to verify they pass**

Run: `node --test tools/corpus/test/site-output.test.mjs`
Expected: PASS, 3 tests.

- [ ] **Step 5: Add the gitignore entry**

Append `dist/` to `.gitignore`:

```bash
printf 'dist/\n' >> .gitignore
```

Verify it is ignored:

Run: `git check-ignore -v dist/ 2>&1 || echo "NOT IGNORED"`
Expected: a line naming `.gitignore` and the `dist/` pattern, not `NOT IGNORED`.

- [ ] **Step 6: Write the workflow**

Create `.github/workflows/site.yml`:

```yaml
name: site

on:
  push:
    branches: [master]
  pull_request:

permissions:
  contents: read
  pages: write
  id-token: write

concurrency:
  group: pages
  cancel-in-progress: false

jobs:
  build:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: "22"
      - run: npm ci
      # Gates first, as blocking steps. A site built from a tree that fails
      # verify would publish exactly the class of error the gates exist to
      # catch.
      - run: node tools/corpus/cli.mjs render --check .
      - run: node tools/corpus/cli.mjs lint .
      - run: node tools/corpus/cli.mjs verify .
      - run: npm test
      - run: node tools/corpus/cli.mjs site --write .
      - uses: actions/upload-pages-artifact@v3
        with:
          path: dist

  deploy:
    # Pull requests gate and build but never publish.
    if: github.ref == 'refs/heads/master' && github.event_name == 'push'
    needs: build
    runs-on: ubuntu-latest
    environment:
      name: github-pages
      url: ${{ steps.deployment.outputs.page_url }}
    steps:
      - id: deployment
        uses: actions/deploy-pages@v4
```

- [ ] **Step 7: Verify the workflow's gate ordering mechanically**

Create `tools/corpus/test/site-workflow.test.mjs`:

```js
// tools/corpus/test/site-workflow.test.mjs
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const WF = new URL("../../../.github/workflows/site.yml", import.meta.url)
  .pathname;

test("the workflow runs all four gates before it builds the site", () => {
  const text = fs.readFileSync(WF, "utf8");
  const order = [
    "render --check .",
    "lint .",
    "verify .",
    "npm test",
    "site --write .",
  ].map((s) => text.indexOf(s));
  assert.equal(order.every((i) => i > -1), true, "a step is missing");
  const sorted = [...order].sort((a, b) => a - b);
  assert.deepEqual(order, sorted, "gates must precede the build");
});

test("deploy is gated on master pushes only", () => {
  const text = fs.readFileSync(WF, "utf8");
  assert.match(text, /refs\/heads\/master/);
  assert.match(text, /github\.event_name == 'push'/);
});
```

- [ ] **Step 8: Run the tests to verify they pass**

Run: `node --test tools/corpus/test/site-workflow.test.mjs tools/corpus/test/site-output.test.mjs`
Expected: PASS, 5 tests.

- [ ] **Step 9: Confirm the manual degradation path works**

Run: `node tools/corpus/cli.mjs site --write . && ls dist/index.html dist/search-index.json`
Expected: both files listed. This is the mitigation for Actions rot — a broken workflow must degrade to a manual publish, not to no publish.

- [ ] **Step 10: Run the full gates**

Run: `node tools/corpus/cli.mjs render --check . && node tools/corpus/cli.mjs lint . && node tools/corpus/cli.mjs verify . && npm test > /tmp/t.out 2>&1; grep -E "^# (pass|fail)" /tmp/t.out`
Expected: all three clean, `# fail 0`. Note `git status --short` should show no `dist/` entry, because Step 5 ignored it.

- [ ] **Step 11: Commit**

```bash
git add tools/corpus/site.mjs tools/corpus/site-template.mjs .gitignore .github/workflows/site.yml tools/corpus/test/site-output.test.mjs tools/corpus/test/site-workflow.test.mjs
git commit -m "feat: emit dist/ and add a CI workflow that gates before building"
```

---

## Notes for the executor

**The four gates cannot see this work.** `render --check`, `lint`, `verify` and `npm test` all read `guides/` and `data/` only. They will pass on a tree whose site build is completely broken. The site's own tests are the only mechanical check, so a task is not done because the gates are green — it is done when its own tests pass and the gates are *still* green.

**Do not reflow or re-wrap prose** in any file you are not otherwise changing. A previous pass in this repo reflowed a paragraph and split a code span across a newline, breaking a literal-grep anchor.

**Reading the large files.** A local token-optimizer hook silently elides lines from reads of `CLAUDE.md`, the specs and the plans. `awk` elides, and so does plain `python3 print()`. Use the substitution form, which does not:

```bash
python3 -c "
ls=open('<FILE>','rb').read().decode().splitlines()
for i in range(A,B):
    print(str(i+1)+'|'+ls[i].replace(' ','·'))
"
```

`range(A,B)` is zero-based; chunks of about 110 lines survive intact; convert `·` back to a real space before using any text as an edit anchor.

**Never run** `git checkout --`, `git restore`, `git reset` or `git clean`. An earlier implementer in this repo did and destroyed an unrelated uncommitted fix.

**Stage by filename.** Never `git add -A` or `git add .` — it sweeps in generated output and local tooling directories.
