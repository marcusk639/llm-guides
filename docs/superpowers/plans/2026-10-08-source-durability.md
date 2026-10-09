# Source Durability Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make a dead or moved citation in this corpus visible without making it a build failure, and let a record carry an optional archive snapshot of the page its value came from.

**Architecture:** One new read-only CLI subcommand, `sources`, collects every citation URL in the corpus from three structurally different places, fetches each, and classifies the result; it has no exit code that reports findings, so it cannot be gated on. Preservation is an optional `source_archived` record field whose value is produced by `sources --archive` into the refresh artifact and written into the record by the existing `refresh --stamp` transform, so the record write inherits atomicity, a receipt and a revert instead of growing a second transactional writer over `data/`.

**Tech Stack:** Node 22+, ESM (`.mjs`), `node:test` + `node:assert/strict`, `js-yaml` (JSON_SCHEMA), no new dependencies.

**Spec:** `docs/superpowers/specs/2026-10-07-source-durability-design.md` (commit 90874f9, `status: approved`)

## Global Constraints

- Node 22 or later. ESM only. **No new dependencies** — `fetch` is global in Node 18+.
- **The four gates must stay clean and network-free.** They are `node tools/corpus/cli.mjs render --check .` (exit 0, no `would render:` line), `node tools/corpus/cli.mjs lint .` (`lint: clean`), `node tools/corpus/cli.mjs verify .` (`verify: clean`), and `npm test` (currently 474 tests, `# fail 0`). Run all four after every task.
- **`verify` is strictly read-only.** It must never write to the tree and never open a socket.
- **`meta/ledger.yaml` must not be touched.** It is regenerated on `master` after merge. One file, one writer. No task in this plan writes it.
- **`sources` must never be added to the four gates**, to `package.json`'s gate scripts as a blocking step, or to CI as a required check.
- Exit codes for `sources`: `0` when the run completed whatever it found, `1` only when a write the command attempted failed, `2` on a usage error. No other value.
- `source_archived` must be an absolute `http(s)` URL — parseable by `new URL()` with protocol `http:` or `https:`. Not a vendor-specific URL grammar.
- **Record edits in `data/*.yaml` are single-line surgical edits, never a YAML round trip.** `data/models.yaml` carries 7 comment lines and `data/models-other.yaml` carries 29; a round trip would delete them, and `CLAUDE.md` requires them.
- **Editing `CLAUDE.md` goes through a python read → `assert s.count(old) == 1` → replace → write script run via Bash.** The native edit tool refuses files that size. That path also bypasses the Prettier hook, so table pipes must be hand-aligned.
- Creating a new directory can make a local hook drop a `.claude/` folder inside it. `rm -rf` it before staging. **Stage by filename** — never `git add -A`, `git add .`, or `git add -f`.
- Work on branch `corpus-roadmap-spec`. Commit after every task.

## Review Focus

Five input classes the spec implies but does not enumerate, each already assigned to the task that owns the code. Most likely to bite first.

1. **A record or page URL that is not a string** — `source: 123`, a YAML list, or `null` reaching the fetcher as `undefined`. A reasonable person expects it reported as malformed, not an unhandled `TypeError` that aborts the whole audit run. Pinned in Task 2.
2. **A page with no front-matter at all, or front-matter whose `sources:` is a string rather than a list.** Expect that page contributing zero URLs and the run continuing, not a crash on `.map` of a string. Pinned in Task 2.
3. **A fetch that hangs.** With no timeout, one unresponsive host stalls the audit forever and the scheduled wrapper never reports. Expect a bounded per-URL timeout classified as "does not resolve". Pinned in Task 4.
4. **A record whose `source_archived` is already present when `--stamp` runs.** Expect the existing line replaced, not a second `source_archived:` line inserted into the same record, which would make the YAML ambiguous. Pinned in Task 7.
5. **A `verified:`-looking or `source_archived:`-looking line nested deeper than the record's own field indent** — inside a `notes:` block scalar. Expect it untouched, exactly as `setRecordVerified` already guarantees for dates. Pinned in Task 7.

---

## Task 1: Share the URL-span and guide-discovery primitives

Pure extraction. No behavior change anywhere. The existing suite is the proof.

**Files:**

- Create: `tools/corpus/paths.mjs`
- Modify: `tools/corpus/lint.mjs:89` (export `urlRanges`)
- Modify: `tools/corpus/cli.mjs:53-65` (delete local `guidePaths`, import it)
- Test: `tools/corpus/test/paths.test.mjs` (create), `tools/corpus/test/lint-values.test.mjs` (append)

**Interfaces:**

- Consumes: nothing.
- Produces: `urlRanges(text) -> Array<[number, number]>` exported from `tools/corpus/lint.mjs` — start/end index pairs of every URL span in `text`. `guidePaths(root) -> string[]` exported from `tools/corpus/paths.mjs` — absolute paths of every `.md` file under `<root>/guides`, recursively, or `[]` when that directory is absent.

- [ ] **Step 1: Write the failing test for `guidePaths`**

Create `tools/corpus/test/paths.test.mjs`:

```javascript
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { guidePaths } from "../paths.mjs";

function tmpCorpus() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "paths-"));
  fs.mkdirSync(path.join(root, "guides", "alpha"), { recursive: true });
  fs.writeFileSync(path.join(root, "guides", "alpha", "one.md"), "x");
  fs.writeFileSync(path.join(root, "guides", "top.md"), "x");
  fs.writeFileSync(path.join(root, "guides", "alpha", "skip.txt"), "x");
  return root;
}

test("guidePaths finds .md files recursively and ignores other extensions", () => {
  const root = tmpCorpus();
  const found = guidePaths(root)
    .map((p) => path.relative(root, p))
    .sort();
  assert.deepEqual(found, ["guides/alpha/one.md", "guides/top.md"]);
});

test("guidePaths returns [] when guides/ is absent", () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "paths-empty-"));
  assert.deepEqual(guidePaths(root), []);
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `node --test tools/corpus/test/paths.test.mjs`
Expected: FAIL — `Cannot find module '.../tools/corpus/paths.mjs'`

- [ ] **Step 3: Create `tools/corpus/paths.mjs`**

Copy the body verbatim from `tools/corpus/cli.mjs:53-65` rather than retyping it. Extract it by line index so the token-optimizer hook cannot fold it:

```bash
cd ~/dev/llm-guides
TOKEN_OPTIMIZER_MODE=off python3 - <<'PY'
src = open("tools/corpus/cli.mjs").read().splitlines(True)
# guidePaths starts at line 53 (1-based); find its closing brace at column 0.
start = 52
end = start
while src[end].rstrip("\n") != "}":
    end += 1
body = "".join(src[start : end + 1]).replace(
    "function guidePaths(", "export function guidePaths("
)
open("tools/corpus/paths.mjs", "w").write(
    'import fs from "node:fs";\nimport path from "node:path";\n\n' + body
)
PY
node --check tools/corpus/paths.mjs 2>/dev/null || node -e "import('./tools/corpus/paths.mjs').then(m=>console.log('exports:',Object.keys(m)))"
```

Expected: `exports: [ 'guidePaths' ]`

- [ ] **Step 4: Run the test to verify it passes**

Run: `node --test tools/corpus/test/paths.test.mjs`
Expected: PASS, 2 tests.

- [ ] **Step 5: Point `cli.mjs` at the shared copy**

Delete the local `guidePaths` function from `tools/corpus/cli.mjs` and add `import { guidePaths } from "./paths.mjs";` beside the other local imports. Then confirm no duplicate definition remains:

Run: `grep -c "function guidePaths" tools/corpus/cli.mjs`
Expected: `0`

- [ ] **Step 6: Export `urlRanges` from `lint.mjs`**

Change line 89 of `tools/corpus/lint.mjs` from `function urlRanges(text) {` to `export function urlRanges(text) {`. Nothing else in that file changes.

Run: `node -e "import('./tools/corpus/lint.mjs').then(m=>console.log(typeof m.urlRanges))"`
Expected: `function`

- [ ] **Step 7: Add the `urlRanges` contract test**

Append to `tools/corpus/test/lint-values.test.mjs` (and add `urlRanges` to its existing import from `../lint.mjs`):

```javascript
test("urlRanges spans a bare URL, an autolink and a link destination", () => {
  const text = [
    "bare https://example.com/a and",
    "auto <https://example.com/b> and",
    "[text](https://example.com/c) end",
  ].join("\n");
  const found = urlRanges(text)
    .map(([a, b]) => text.slice(a, b))
    .sort();
  assert.deepEqual(found, [
    "https://example.com/a",
    "https://example.com/b",
    "https://example.com/c",
  ]);
});

test("urlRanges does not span a non-URL link destination", () => {
  const text = "call handlers[i](some-id) here";
  assert.deepEqual(urlRanges(text), []);
});
```

- [ ] **Step 8: Run the full suite — this is the behavior-preservation proof**

Run: `npm test 2>&1 | grep -E "^# (tests|pass|fail)"`
Expected: `# fail 0`, and the test count is 474 + 4.

- [ ] **Step 9: Run all four gates**

```bash
node tools/corpus/cli.mjs render --check . && node tools/corpus/cli.mjs lint . && node tools/corpus/cli.mjs verify .
```

Expected: exit 0, no `would render:` line, `lint: clean`, `verify: clean`.

- [ ] **Step 10: Commit**

```bash
git add tools/corpus/paths.mjs tools/corpus/lint.mjs tools/corpus/cli.mjs \
  tools/corpus/test/paths.test.mjs tools/corpus/test/lint-values.test.mjs
git commit -m "refactor: share urlRanges and guidePaths as library primitives"
```

---

## Task 2: Collect every citation URL, in five classes

**Files:**

- Create: `tools/corpus/citations.mjs`
- Test: `tools/corpus/test/citations.test.mjs`

**Interfaces:**

- Consumes: `guidePaths(root)` from `tools/corpus/paths.mjs`; `urlRanges(text)` from `tools/corpus/lint.mjs`; `loadRecords(dataDir)` from `tools/corpus/data.mjs` (returns records with `file` injected); `parseFrontmatter(text)` from `tools/corpus/frontmatter.mjs` (returns `{ data, body, bodyOffset }`).
- Produces: `CITATION_CLASSES` — a frozen array of the five class names in report order: `["record-source", "record-secondary", "page-frontmatter", "page-body", "snapshot"]`. `collectCitations(root) -> { citations, issues }` where each citation is `{ url, class, origin }` (`origin` is a record key or a repo-relative page path) and each issue is `{ class, origin, rule: "citation-malformed", message }`. URLs are deduplicated per `(url, class, origin)` triple.

- [ ] **Step 1: Write the failing tests**

Create `tools/corpus/test/citations.test.mjs`:

```javascript
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
```

- [ ] **Step 2: Run them to verify they fail**

Run: `node --test tools/corpus/test/citations.test.mjs`
Expected: FAIL — `Cannot find module '.../tools/corpus/citations.mjs'`

- [ ] **Step 3: Write `tools/corpus/citations.mjs`**

```javascript
import fs from "node:fs";
import path from "node:path";
import { loadRecords } from "./data.mjs";
import { parseFrontmatter } from "./frontmatter.mjs";
import { urlRanges } from "./lint.mjs";
import { guidePaths } from "./paths.mjs";

export const CITATION_CLASSES = Object.freeze([
  "record-source",
  "record-secondary",
  "page-frontmatter",
  "page-body",
  "snapshot",
]);

// Record fields that carry a citation URL, and the class each one reports as.
const RECORD_FIELDS = Object.freeze([
  ["source", "record-source"],
  ["price_source", "record-secondary"],
  ["licence_source", "record-secondary"],
  ["source_archived", "snapshot"],
]);

function malformed(cls, origin, field, value) {
  return {
    class: cls,
    origin,
    rule: "citation-malformed",
    message: `${field} is not a string: ${JSON.stringify(value)}`,
  };
}

export function collectCitations(root) {
  const citations = [];
  const issues = [];
  const seen = new Set();
  const add = (url, cls, origin) => {
    const k = `${cls}\u0000${origin}\u0000${url}`;
    if (seen.has(k)) return;
    seen.add(k);
    citations.push({ url, class: cls, origin });
  };

  for (const record of loadRecords(path.join(root, "data"))) {
    const origin = String(record.key ?? "(unkeyed)");
    for (const [field, cls] of RECORD_FIELDS) {
      const v = record[field];
      if (v == null) continue;
      if (typeof v !== "string") {
        issues.push(malformed(cls, origin, field, v));
        continue;
      }
      add(v, cls, origin);
    }
  }

  for (const abs of guidePaths(root)) {
    const origin = path.relative(root, abs).split(path.sep).join("/");
    const text = fs.readFileSync(abs, "utf8");
    const { data, body } = parseFrontmatter(text);
    const declared = data?.sources;
    if (declared != null) {
      if (!Array.isArray(declared)) {
        issues.push(malformed("page-frontmatter", origin, "sources", declared));
      } else {
        for (const v of declared) {
          if (typeof v !== "string") {
            issues.push(malformed("page-frontmatter", origin, "sources[]", v));
            continue;
          }
          add(v, "page-frontmatter", origin);
        }
      }
    }
    for (const [a, b] of urlRanges(body)) {
      add(body.slice(a, b), "page-body", origin);
    }
  }

  return { citations, issues };
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `node --test tools/corpus/test/citations.test.mjs`
Expected: PASS, 6 tests.

- [ ] **Step 5: Sanity-check it against the real corpus**

Run:

```bash
node -e "import('./tools/corpus/citations.mjs').then(m=>{
  const {citations,issues}=m.collectCitations('.');
  const n={}; for(const c of citations) n[c.class]=(n[c.class]||0)+1;
  console.log('issues:',issues.length); console.log(n);
  console.log('distinct urls:', new Set(citations.map(c=>c.url)).size);
})"
```

Expected: `issues: 0`, a non-zero count in each of `record-source`, `record-secondary`, `page-frontmatter` and `page-body`, no `snapshot` key (no record carries the field yet), and a distinct-URL count near 63. **If `record-secondary` is absent or the distinct count is near 17, the record fields are not being read — stop and fix before continuing.**

- [ ] **Step 6: Run the four gates**

```bash
npm test 2>&1 | grep -E "^# fail" && node tools/corpus/cli.mjs render --check . && node tools/corpus/cli.mjs lint . && node tools/corpus/cli.mjs verify .
```

Expected: `# fail 0`, exit 0, `lint: clean`, `verify: clean`.

- [ ] **Step 7: Commit**

```bash
git add tools/corpus/citations.mjs tools/corpus/test/citations.test.mjs
git commit -m "feat: collect every citation URL in the corpus in five classes"
```

---

## Task 3: The `record-archived-invalid` verify rule

**Files:**

- Modify: `tools/corpus/verify-records.mjs:31` (inside `checkRecordFields`)
- Test: `tools/corpus/test/verify-records.test.mjs` (create if absent, else append)

**Interfaces:**

- Consumes: the existing `checkRecordFields(record) -> issues[]` shape, where each issue carries `rule` and `message`.
- Produces: one additional issue with `rule: "record-archived-invalid"` when `source_archived` is present and is not an absolute `http(s)` URL. Absent `source_archived` produces nothing.

- [ ] **Step 1: Write the failing tests**

Create `tools/corpus/test/verify-records.test.mjs` (if the file already exists, append the three tests and merge the import):

```javascript
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
```

- [ ] **Step 2: Run them to verify they fail**

Run: `node --test tools/corpus/test/verify-records.test.mjs`
Expected: FAIL — the relative/scheme-less case returns 0 issues, not 1.

- [ ] **Step 3: Implement the check**

Add this helper above `checkRecordFields` in `tools/corpus/verify-records.mjs`:

```javascript
// `source_archived` is validated by shape only, and deliberately not against
// any archive service's URL grammar: a vendor-shaped pattern here would make
// adopting a second archive service a contract change. Liveness is the audit's
// job -- `verify` never opens a socket.
function isAbsoluteHttpUrl(value) {
  if (typeof value !== "string") return false;
  try {
    const u = new URL(value);
    return u.protocol === "http:" || u.protocol === "https:";
  } catch {
    return false;
  }
}
```

Then add this block inside `checkRecordFields`, beside the existing `record-source-missing` / `record-verified-*` checks, following their exact `issues.push({ ... })` style:

```javascript
if (
  record.source_archived != null &&
  !isAbsoluteHttpUrl(record.source_archived)
) {
  issues.push({
    rule: "record-archived-invalid",
    message: `record ${record.key}: source_archived must be an absolute http(s) URL; got ${JSON.stringify(record.source_archived)}`,
  });
}
```

Match the surrounding code's issue object shape exactly — if the neighbouring pushes also set a `file` or `line` field, set it the same way here.

- [ ] **Step 4: Run the tests to verify they pass**

Run: `node --test tools/corpus/test/verify-records.test.mjs`
Expected: PASS, 3 tests.

- [ ] **Step 5: Prove the rule can actually reject — feed it a known-bad tree**

A check that has never rejected anything is not a check. Temporarily break a real record and confirm `verify` fails, then restore it:

```bash
cp data/context.yaml /tmp/ctx-backup.yaml
TOKEN_OPTIMIZER_MODE=off python3 - <<'PY'
p = "data/context.yaml"
s = open(p).read()
old = "    volatility:"
assert s.count(old) >= 1
s = s.replace(old, '    source_archived: "./nope"\n    volatility:', 1)
open(p, "w").write(s)
PY
node tools/corpus/cli.mjs verify . ; echo "exit=$?"
cp /tmp/ctx-backup.yaml data/context.yaml && rm /tmp/ctx-backup.yaml
node tools/corpus/cli.mjs verify . ; echo "restored exit=$?"
```

Expected: the first run prints a `record-archived-invalid` line and `exit=1`; the second prints `verify: clean` and `restored exit=0`. Confirm `git status --porcelain data/` is empty afterwards.

- [ ] **Step 6: Run the four gates**

```bash
npm test 2>&1 | grep -E "^# fail" && node tools/corpus/cli.mjs render --check . && node tools/corpus/cli.mjs lint . && node tools/corpus/cli.mjs verify .
```

Expected: `# fail 0`, exit 0, `lint: clean`, `verify: clean`.

- [ ] **Step 7: Commit**

```bash
git add tools/corpus/verify-records.mjs tools/corpus/test/verify-records.test.mjs
git commit -m "feat: verify source_archived is an absolute http(s) URL"
```

---

## Task 4: Response classification and the bounded fetcher

**Files:**

- Create: `tools/corpus/sources.mjs`
- Test: `tools/corpus/test/sources.test.mjs`

**Interfaces:**

- Consumes: nothing from earlier tasks.
- Produces: `classifyResponse({ status, redirected, finalUrl }) -> "resolves" | "redirects" | "dead"`. `DEFAULT_TIMEOUT_MS` (a number). `probe(url, { fetchImpl, timeoutMs }) -> { url, outcome, status, finalUrl, error }` where `outcome` is one of the three classification strings. `auditCitations(citations, { fetchImpl, timeoutMs, concurrency }) -> Promise<results[]>`, each result being a citation object plus `outcome`, `status`, `finalUrl` and `error`. `fetchImpl` defaults to global `fetch`; every test injects it, so **no test opens a socket**.

- [ ] **Step 1: Write the failing tests**

Create `tools/corpus/test/sources.test.mjs`:

```javascript
import test from "node:test";
import assert from "node:assert/strict";
import {
  classifyResponse,
  probe,
  auditCitations,
  DEFAULT_TIMEOUT_MS,
} from "../sources.mjs";

test("classifyResponse maps status and redirection to the three outcomes", () => {
  assert.equal(
    classifyResponse({ status: 200, redirected: false }),
    "resolves",
  );
  assert.equal(
    classifyResponse({ status: 204, redirected: false }),
    "resolves",
  );
  assert.equal(
    classifyResponse({ status: 200, redirected: true }),
    "redirects",
  );
  assert.equal(
    classifyResponse({ status: 301, redirected: false }),
    "redirects",
  );
  assert.equal(classifyResponse({ status: 404, redirected: false }), "dead");
  assert.equal(classifyResponse({ status: 500, redirected: false }), "dead");
  assert.equal(classifyResponse({ status: 403, redirected: true }), "dead");
});

test("probe reports a resolving URL", async () => {
  const fetchImpl = async (url) => ({
    status: 200,
    redirected: false,
    url,
    body: null,
  });
  const r = await probe("https://example.com/a", { fetchImpl });
  assert.equal(r.outcome, "resolves");
  assert.equal(r.status, 200);
  assert.equal(r.error, null);
});

test("probe reports a network error as dead without throwing", async () => {
  const fetchImpl = async () => {
    throw new TypeError("getaddrinfo ENOTFOUND");
  };
  const r = await probe("https://nope.invalid/a", { fetchImpl });
  assert.equal(r.outcome, "dead");
  assert.match(r.error, /ENOTFOUND/);
});

// Review Focus 3: a hanging host must not stall the run forever.
test("probe times out and classifies the hang as dead", async () => {
  const fetchImpl = (url, opts) =>
    new Promise((_resolve, reject) => {
      opts.signal.addEventListener("abort", () =>
        reject(Object.assign(new Error("aborted"), { name: "AbortError" })),
      );
    });
  const r = await probe("https://slow.example/a", { fetchImpl, timeoutMs: 20 });
  assert.equal(r.outcome, "dead");
  assert.match(r.error, /timeout|abort/i);
});

test("DEFAULT_TIMEOUT_MS is a bounded positive number", () => {
  assert.ok(Number.isFinite(DEFAULT_TIMEOUT_MS) && DEFAULT_TIMEOUT_MS > 0);
});

test("auditCitations preserves citation fields and adds an outcome per URL", async () => {
  const citations = [
    { url: "https://example.com/a", class: "record-source", origin: "a.one" },
    {
      url: "https://example.com/b",
      class: "page-body",
      origin: "guides/t/p.md",
    },
  ];
  const fetchImpl = async (url) => ({
    status: url.endsWith("/b") ? 404 : 200,
    redirected: false,
    url,
  });
  const results = await auditCitations(citations, { fetchImpl });
  assert.equal(results.length, 2);
  const byUrl = Object.fromEntries(results.map((r) => [r.url, r]));
  assert.equal(byUrl["https://example.com/a"].outcome, "resolves");
  assert.equal(byUrl["https://example.com/a"].class, "record-source");
  assert.equal(byUrl["https://example.com/b"].outcome, "dead");
  assert.equal(byUrl["https://example.com/b"].origin, "guides/t/p.md");
});

test("auditCitations fetches each distinct URL once even across classes", async () => {
  let calls = 0;
  const fetchImpl = async (url) => {
    calls += 1;
    return { status: 200, redirected: false, url };
  };
  const citations = [
    {
      url: "https://example.com/same",
      class: "record-source",
      origin: "a.one",
    },
    {
      url: "https://example.com/same",
      class: "page-body",
      origin: "guides/t/p.md",
    },
  ];
  const results = await auditCitations(citations, { fetchImpl });
  assert.equal(calls, 1);
  assert.equal(results.length, 2);
  assert.ok(results.every((r) => r.outcome === "resolves"));
});
```

- [ ] **Step 2: Run them to verify they fail**

Run: `node --test tools/corpus/test/sources.test.mjs`
Expected: FAIL — `Cannot find module '.../tools/corpus/sources.mjs'`

- [ ] **Step 3: Write `tools/corpus/sources.mjs`**

```javascript
// The audit is the only network code in the corpus tooling outside the
// browser-side site search. It is deliberately NOT one of the four gates:
// see Decision 1 in docs/superpowers/specs/2026-10-07-source-durability-design.md.
export const DEFAULT_TIMEOUT_MS = 15000;
const DEFAULT_CONCURRENCY = 6;

export function classifyResponse({ status, redirected }) {
  const ok = status >= 200 && status < 300;
  if (ok) return redirected ? "redirects" : "resolves";
  if (status >= 300 && status < 400) return "redirects";
  return "dead";
}

export async function probe(url, options = {}) {
  const { fetchImpl = globalThis.fetch, timeoutMs = DEFAULT_TIMEOUT_MS } =
    options;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetchImpl(url, {
      method: "GET",
      redirect: "follow",
      signal: controller.signal,
    });
    return {
      url,
      outcome: classifyResponse(res),
      status: res.status ?? null,
      finalUrl: res.url ?? null,
      error: null,
    };
  } catch (e) {
    const timedOut = e?.name === "AbortError";
    return {
      url,
      outcome: "dead",
      status: null,
      finalUrl: null,
      error: timedOut
        ? `timeout after ${timeoutMs}ms`
        : String(e?.message ?? e),
    };
  } finally {
    clearTimeout(timer);
  }
}

export async function auditCitations(citations, options = {}) {
  const { concurrency = DEFAULT_CONCURRENCY } = options;
  const distinct = [...new Set(citations.map((c) => c.url))];
  const probed = new Map();
  let next = 0;
  const worker = async () => {
    while (next < distinct.length) {
      const url = distinct[next++];
      probed.set(url, await probe(url, options));
    }
  };
  await Promise.all(
    Array.from({ length: Math.min(concurrency, distinct.length) }, worker),
  );
  return citations.map((c) => {
    const { outcome, status, finalUrl, error } = probed.get(c.url);
    return { ...c, outcome, status, finalUrl, error };
  });
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `node --test tools/corpus/test/sources.test.mjs`
Expected: PASS, 7 tests.

- [ ] **Step 5: Confirm no test opened a socket**

Run: `grep -n "globalThis.fetch\|fetch(" tools/corpus/test/sources.test.mjs`
Expected: no match except the injected `fetchImpl` definitions. Every test supplies `fetchImpl`, so the suite stays offline and CI-safe.

- [ ] **Step 6: Run the four gates**

```bash
npm test 2>&1 | grep -E "^# fail" && node tools/corpus/cli.mjs render --check . && node tools/corpus/cli.mjs lint . && node tools/corpus/cli.mjs verify .
```

Expected: `# fail 0`, exit 0, `lint: clean`, `verify: clean`.

- [ ] **Step 7: Commit**

```bash
git add tools/corpus/sources.mjs tools/corpus/test/sources.test.mjs
git commit -m "feat: classify citation responses behind a bounded, injectable fetcher"
```

---

## Task 5: The `sources` subcommand

**Files:**

- Create: `tools/corpus/sources-report.mjs`
- Modify: `tools/corpus/cli.mjs` (add a `sources` branch in `main`, add `sources` to the usage string)
- Test: `tools/corpus/test/sources-report.test.mjs`, `tools/corpus/test/sources-cli.test.mjs`

**Interfaces:**

- Consumes: `collectCitations(root)` and `CITATION_CLASSES` from `tools/corpus/citations.mjs`; `auditCitations(citations, options)` from `tools/corpus/sources.mjs`.
- Produces: `summarise(results, issues) -> { counts, findings, malformed }` where `counts` is keyed by class, each value `{ resolves, redirects, dead, total }`, and `findings` holds only the non-`resolves` results. `formatText(summary) -> string` and `formatJson(summary) -> string`. The CLI gains `node tools/corpus/cli.mjs sources [--json] [dir]`.

- [ ] **Step 1: Write the failing report tests**

Create `tools/corpus/test/sources-report.test.mjs`:

```javascript
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
```

- [ ] **Step 2: Run them to verify they fail**

Run: `node --test tools/corpus/test/sources-report.test.mjs`
Expected: FAIL — `Cannot find module '.../tools/corpus/sources-report.mjs'`

- [ ] **Step 3: Write `tools/corpus/sources-report.mjs`**

```javascript
import { CITATION_CLASSES } from "./citations.mjs";

export function summarise(results, issues) {
  const counts = {};
  for (const cls of CITATION_CLASSES) {
    counts[cls] = { resolves: 0, redirects: 0, dead: 0, total: 0 };
  }
  for (const r of results) {
    const row = (counts[r.class] ??= {
      resolves: 0,
      redirects: 0,
      dead: 0,
      total: 0,
    });
    row[r.outcome] += 1;
    row.total += 1;
  }
  return {
    counts,
    findings: results.filter((r) => r.outcome !== "resolves"),
    malformed: issues,
  };
}

export function formatText(summary) {
  const lines = [];
  for (const cls of CITATION_CLASSES) {
    const c = summary.counts[cls];
    lines.push(
      `${cls}: ${c.total} checked, ${c.redirects} redirected, ${c.dead} dead`,
    );
    for (const f of summary.findings.filter((x) => x.class === cls)) {
      const detail = f.error
        ? f.error
        : f.finalUrl && f.finalUrl !== f.url
          ? `-> ${f.finalUrl}`
          : "";
      lines.push(
        `  [${f.outcome}] ${f.origin}: ${f.url} ${f.status ?? ""} ${detail}`.trimEnd(),
      );
    }
  }
  for (const m of summary.malformed) {
    lines.push(`  [${m.rule}] ${m.origin}: ${m.message}`);
  }
  return lines.join("\n");
}

export function formatJson(summary) {
  return JSON.stringify(summary, null, 2);
}
```

- [ ] **Step 4: Run the report tests to verify they pass**

Run: `node --test tools/corpus/test/sources-report.test.mjs`
Expected: PASS, 4 tests.

- [ ] **Step 5: Write the failing CLI test**

Create `tools/corpus/test/sources-cli.test.mjs`:

```javascript
import test from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const CLI = new URL("../cli.mjs", import.meta.url).pathname;

function run(args, cwd) {
  try {
    const out = execFileSync(process.execPath, [CLI, ...args], {
      cwd,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
    });
    return { code: 0, out, err: "" };
  } catch (e) {
    return { code: e.status, out: e.stdout ?? "", err: e.stderr ?? "" };
  }
}

function emptyCorpus() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "srccli-"));
  fs.mkdirSync(path.join(root, "data"), { recursive: true });
  fs.mkdirSync(path.join(root, "guides"), { recursive: true });
  return root;
}

test("sources exits 0 on a corpus with nothing to check", () => {
  const r = run(["sources", "."], emptyCorpus());
  assert.equal(r.code, 0);
});

test("sources --json emits parseable JSON on an empty corpus", () => {
  const r = run(["sources", "--json", "."], emptyCorpus());
  assert.equal(r.code, 0);
  const parsed = JSON.parse(r.out);
  assert.ok(parsed.counts["record-source"]);
});

test("sources exits 2 when --check is passed, like every other non-render command", () => {
  const r = run(["sources", "--check", "."], emptyCorpus());
  assert.equal(r.code, 2);
});
```

- [ ] **Step 6: Run it to verify it fails**

Run: `node --test tools/corpus/test/sources-cli.test.mjs`
Expected: FAIL — `sources` is not a known command, so `main` falls through to `usage()` and exits 2 on the first two tests.

- [ ] **Step 7: Wire the subcommand into `main`**

In `tools/corpus/cli.mjs`, add imports:

```javascript
import { collectCitations } from "./citations.mjs";
import { auditCitations } from "./sources.mjs";
import { summarise, formatText, formatJson } from "./sources-report.mjs";
```

Add `sources` to the first usage line so it reads
`"usage: corpus <render|lint|verify|ledger|refresh|site|sources> [--write] [dir]"`,
and add this branch beside the existing `} else if (command === "site") {`:

```javascript
} else if (command === "sources") {
  const json = rest.includes("--json");
  // Decision 1: no finding produces a nonzero exit. There is deliberately no
  // exit code to gate liveness on. Exit 1 is reserved for a failed write,
  // which only --archive can attempt; exit 2 is a usage error.
  const { citations, issues } = collectCitations(root);
  const results = await auditCitations(citations);
  const summary = summarise(results, issues);
  console.log(json ? formatJson(summary) : formatText(summary));
  process.exit(0);
}
```

`main` now awaits, so make `main` an `async function` and leave the guarded bottom-of-file call as it is — a floating promise there is fine because every branch ends in `process.exit`. Confirm the other branches are unaffected:

Run: `node tools/corpus/cli.mjs lint . && node tools/corpus/cli.mjs verify .`
Expected: `lint: clean`, `verify: clean`.

- [ ] **Step 8: Run the CLI test to verify it passes**

Run: `node --test tools/corpus/test/sources-cli.test.mjs`
Expected: PASS, 3 tests.

- [ ] **Step 9: Prove the no-gate property, which is the point of the whole design**

An exit code that never fails is a claim that must be tested against a corpus that _has_ dead sources, not just an empty one:

```bash
T=$(mktemp -d) && mkdir -p "$T/data" "$T/guides"
cat > "$T/data/x.yaml" <<'YAML'
records:
  - key: dead.one
    value: "1"
    volatility: high
    source: https://this-host-does-not-exist.invalid/a
    verified: "2026-01-01"
    tags: [t]
YAML
node tools/corpus/cli.mjs sources "$T" ; echo "exit=$?"
rm -rf "$T"
```

Expected: the report shows `record-source: 1 checked, 0 redirected, 1 dead` and **`exit=0`**. If this prints a nonzero exit, Decision 1 is violated — stop and fix.

- [ ] **Step 10: Add the npm script — non-blocking by name**

In `package.json`, add `"sources": "node tools/corpus/cli.mjs sources"` to `scripts`. Do **not** add it to any existing gate script, and do not reference it from the workflow files under `.github/workflows/`.

Run: `grep -n "sources" .github/workflows/*.yml`
Expected: no match.

- [ ] **Step 11: Run the four gates**

```bash
npm test 2>&1 | grep -E "^# fail" && node tools/corpus/cli.mjs render --check . && node tools/corpus/cli.mjs lint . && node tools/corpus/cli.mjs verify .
```

Expected: `# fail 0`, exit 0, `lint: clean`, `verify: clean`.

- [ ] **Step 12: Commit**

```bash
git add tools/corpus/sources-report.mjs tools/corpus/cli.mjs package.json \
  tools/corpus/test/sources-report.test.mjs tools/corpus/test/sources-cli.test.mjs
git commit -m "feat: add the sources audit subcommand, reporting and never blocking"
```

---

## Task 6: Reject unknown flags, globally

A mistyped `sources --achive` currently runs the read-only audit and exits 0, indistinguishable from a successful capture run. This is a precondition for trusting Task 9.

**Files:**

- Modify: `tools/corpus/cli.mjs` (inside `main`, around the existing `usage` closure)
- Test: `tools/corpus/test/sources-cli.test.mjs` (append)

**Interfaces:**

- Consumes: the existing `usage()` closure in `main`.
- Produces: no new exports. Any argument starting with `--` that is not a known flag causes `main` to print a reason line beginning `corpus: ` and exit 2.

- [ ] **Step 1: Write the failing tests**

Append to `tools/corpus/test/sources-cli.test.mjs`:

```javascript
test("an unknown flag exits 2 and names itself", () => {
  const r = run(["sources", "--achive", "."], emptyCorpus());
  assert.equal(r.code, 2);
  // Assert on the reason line's unique prefix, never on the flag name alone:
  // the static usage block also contains flag names, so a substring match
  // would pass even with the rejection code path fully removed.
  assert.match(r.err, /^corpus: unknown flag --achive$/m);
});

test("known flags on known commands are still accepted", () => {
  assert.equal(run(["sources", "--json", "."], emptyCorpus()).code, 0);
  assert.equal(run(["lint", "."], emptyCorpus()).code, 0);
});
```

- [ ] **Step 2: Run them to verify they fail**

Run: `node --test tools/corpus/test/sources-cli.test.mjs`
Expected: FAIL — the unknown-flag test gets exit 0, not 2, because `rest.includes` ignores it.

- [ ] **Step 3: Implement the rejection**

In `tools/corpus/cli.mjs`, add above `function main(argv) {`:

```javascript
// Every flag any subcommand accepts. `rest.includes(...)` silently ignores an
// unknown flag, which would make a mistyped mutating flag (e.g. --achive for
// --archive) run a read-only path and exit 0, indistinguishable from success.
const KNOWN_FLAGS = Object.freeze([
  "--write",
  "--check",
  "--json",
  "--archive",
  "--order",
  "--skeleton",
  "--stamp",
  "--revert",
]);
const KNOWN_FLAG_PREFIXES = Object.freeze([
  "--page=",
  "--artifact=",
  "--key=",
  "--base=",
]);

function unknownFlags(rest) {
  return rest.filter(
    (a) =>
      a.startsWith("--") &&
      !KNOWN_FLAGS.includes(a) &&
      !KNOWN_FLAG_PREFIXES.some((p) => a.startsWith(p)),
  );
}
```

Then, inside `main`, immediately after the `usage` closure is defined and **before** the `if (check && ...)` line:

```javascript
for (const flag of unknownFlags(rest)) {
  console.error(`corpus: unknown flag ${flag}`);
  process.exit(2);
}
```

**Before running the suite, confirm the allowlist is complete.** List every flag the existing code reads and check each appears above:

Run: `grep -oE '"--[a-z-]+(=)?"' tools/corpus/cli.mjs | sort -u`
Expected: every flag printed is either in `KNOWN_FLAGS` or matched by a prefix in `KNOWN_FLAG_PREFIXES`. **If any flag is missing, add it — an incomplete allowlist breaks a working invocation.**

- [ ] **Step 4: Run the tests to verify they pass**

Run: `node --test tools/corpus/test/sources-cli.test.mjs`
Expected: PASS, 5 tests.

- [ ] **Step 5: The completeness proof — the whole suite**

Run: `npm test 2>&1 | grep -E "^# (tests|pass|fail)"`
Expected: `# fail 0`. This is the proof that no existing invocation relied on a stray flag; the refresh and site CLI tests exercise every real flag combination.

- [ ] **Step 6: Mutation-check the test**

Temporarily delete the `process.exit(2)` line inside the new loop, re-run `node --test tools/corpus/test/sources-cli.test.mjs`, and confirm the unknown-flag test **fails**. Restore the line. A test that passes with the code removed is not a test.

- [ ] **Step 7: Run the four gates**

```bash
npm test 2>&1 | grep -E "^# fail" && node tools/corpus/cli.mjs render --check . && node tools/corpus/cli.mjs lint . && node tools/corpus/cli.mjs verify .
```

Expected: `# fail 0`, exit 0, `lint: clean`, `verify: clean`.

- [ ] **Step 8: Commit**

```bash
git add tools/corpus/cli.mjs tools/corpus/test/sources-cli.test.mjs
git commit -m "fix: reject unknown CLI flags instead of silently ignoring them"
```

---

## Task 7: Insert `source_archived` into a record, surgically

The existing `setRecordVerified` only **replaces** an existing `verified:` line at the record's own field indent. Writing `source_archived` needs an **insert** when the field is absent and a replace when it is present, with the same indent discipline and the same refusal to touch a deeper nested line.

**Files:**

- Modify: `tools/corpus/refresh-stamp.mjs` (add `setRecordArchived` and `clearRecordArchived` beside `setRecordVerified`)
- Test: `tools/corpus/test/refresh-stamp.test.mjs` (append)

**Interfaces:**

- Consumes: `recordBlockRange(yamlText, key)` from `tools/corpus/refresh-stamp.mjs` — the existing helper that bounds one record's text. Mirror `setRecordVerified(yamlText, key, date)` exactly: read it first, and build the new functions with the same indent-anchored regex shape it uses.
- Produces: `setRecordArchived(yamlText, key, url) -> string` and `clearRecordArchived(yamlText, key) -> string`, both exported. Both throw the same error type the surrounding code throws when the record is not found.

- [ ] **Step 1: Read the function you are mirroring**

Run:

```bash
TOKEN_OPTIMIZER_MODE=off python3 -c "
ls=open('tools/corpus/refresh-stamp.mjs','rb').read().decode().splitlines()
for i in range(44,114): print('L%d| %s'%(i+1, ls[i]))"
```

Note the exact indent-anchored regex and the exact error construction. Do not retype them from memory in Step 4 — copy them.

- [ ] **Step 2: Write the failing tests**

Append to `tools/corpus/test/refresh-stamp.test.mjs`, merging `setRecordArchived` and `clearRecordArchived` into its existing import:

```javascript
const ARCHIVE_YAML = `# top comment that must survive
records:
  - key: a.one
    value: "1"
    volatility: high
    source: https://example.com/a
    verified: "2026-01-01"
    notes: |
      a nested line that only looks like a field:
      source_archived: https://wrong.example/nested
      verified: "1999-01-01"
    tags: [t]
  - key: a.two
    value: "2"
    volatility: low
    source: https://example.com/b
    source_archived: https://archive.example/old
    verified: "2026-01-01"
    tags: [t]
`;

test("setRecordArchived inserts the field when absent, at the field indent", () => {
  const out = setRecordArchived(
    ARCHIVE_YAML,
    "a.one",
    "https://archive.example/new",
  );
  assert.match(out, /^ {4}source_archived: https:\/\/archive\.example\/new$/m);
  const block = out.slice(out.indexOf("key: a.one"), out.indexOf("key: a.two"));
  assert.equal((block.match(/^ {4}source_archived:/gm) ?? []).length, 1);
});

// Review Focus 4: a second line must never be inserted when one exists.
test("setRecordArchived replaces an existing field rather than duplicating it", () => {
  const out = setRecordArchived(
    ARCHIVE_YAML,
    "a.two",
    "https://archive.example/new",
  );
  const block = out.slice(out.indexOf("key: a.two"));
  assert.equal((block.match(/^ {4}source_archived:/gm) ?? []).length, 1);
  assert.match(block, /source_archived: https:\/\/archive\.example\/new/);
  assert.ok(!block.includes("archive.example/old"));
});

// Review Focus 5: a deeper nested look-alike line is never rewritten.
test("setRecordArchived ignores a nested source_archived inside a block scalar", () => {
  const out = setRecordArchived(
    ARCHIVE_YAML,
    "a.one",
    "https://archive.example/new",
  );
  assert.ok(out.includes("source_archived: https://wrong.example/nested"));
  assert.match(out, /^ {6}verified: "1999-01-01"$/m);
});

test("setRecordArchived preserves file comments and every other line", () => {
  const out = setRecordArchived(
    ARCHIVE_YAML,
    "a.one",
    "https://archive.example/new",
  );
  assert.ok(out.startsWith("# top comment that must survive"));
  assert.equal(
    out.split("\n").length,
    ARCHIVE_YAML.split("\n").length + 1,
    "an insert adds exactly one line",
  );
});

test("clearRecordArchived removes an inserted field and is a no-op when absent", () => {
  const added = setRecordArchived(
    ARCHIVE_YAML,
    "a.one",
    "https://archive.example/new",
  );
  assert.equal(clearRecordArchived(added, "a.one"), ARCHIVE_YAML);
  assert.equal(clearRecordArchived(ARCHIVE_YAML, "a.one"), ARCHIVE_YAML);
});

test("setRecordArchived throws for a key the file does not hold", () => {
  assert.throws(() =>
    setRecordArchived(ARCHIVE_YAML, "nope.key", "https://a.example/x"),
  );
});
```

- [ ] **Step 3: Run them to verify they fail**

Run: `node --test tools/corpus/test/refresh-stamp.test.mjs`
Expected: FAIL — `setRecordArchived is not a function`.

- [ ] **Step 4: Implement both functions**

Add beside `setRecordVerified` in `tools/corpus/refresh-stamp.mjs`, reusing `recordBlockRange` and the indent-anchored regex shape read in Step 1. Place an inserted line immediately **after** the record's `source:` line so related fields stay adjacent and the diff reads naturally. The requirements the tests pin:

- the field indent is the record's own field indent, derived the way `setRecordVerified` derives it — never hardcoded to four spaces;
- a line matching at a deeper indent is not a match;
- replace in place when the field already exists at the field indent;
- an insert adds exactly one line and changes nothing else;
- `clearRecordArchived` removes the line at the field indent and is a no-op when it is absent;
- an unknown key throws the same error type the neighbouring functions throw.

- [ ] **Step 5: Run the tests to verify they pass**

Run: `node --test tools/corpus/test/refresh-stamp.test.mjs`
Expected: PASS — the pre-existing stamp tests plus 6 new ones, `# fail 0`.

- [ ] **Step 6: Prove it against a real data file without writing to disk**

```bash
node -e "
import('./tools/corpus/refresh-stamp.mjs').then(m=>{
  const fs=require('fs');
  const before=fs.readFileSync('data/context.yaml','utf8');
  const key=before.match(/key: ([^\n]+)/)[1].trim();
  const after=m.setRecordArchived(before,key,'https://archive.example/probe');
  console.log('key:',key,'| lines added:',after.split('\n').length-before.split('\n').length);
  console.log('round-trips clean:', m.clearRecordArchived(after,key)===before);
})"
git status --porcelain data/
```

Expected: `lines added: 1`, `round-trips clean: true`, and an empty `git status` for `data/`.

- [ ] **Step 7: Run the four gates**

```bash
npm test 2>&1 | grep -E "^# fail" && node tools/corpus/cli.mjs render --check . && node tools/corpus/cli.mjs lint . && node tools/corpus/cli.mjs verify .
```

Expected: `# fail 0`, exit 0, `lint: clean`, `verify: clean`.

- [ ] **Step 8: Commit**

```bash
git add tools/corpus/refresh-stamp.mjs tools/corpus/test/refresh-stamp.test.mjs
git commit -m "feat: insert and remove source_archived as a surgical record edit"
```

---

## Task 8: Carry the capture on the refresh artifact

**Files:**

- Modify: `tools/corpus/refresh-artifact.mjs` (`validateArtifact`, `renderArtifactSkeleton`)
- Modify: `tools/corpus/verify-records.mjs` (export the absolute-URL predicate added in Task 3)
- Test: `tools/corpus/test/refresh-artifact.test.mjs` (append)

**Interfaces:**

- Consumes: the existing per-record artifact entry shape (`key`, `file`, `verdict`, `url`, `stated`, `read`, `was`) and `validateArtifact(data) -> issues[]`.
- Produces: three optional per-record entry fields — `archived` (an absolute `http(s)` URL), `archive_outcome` (one of `captured`, `refused`, `failed`), `archive_read` (a `YYYY-MM-DD` date). Exports `ARCHIVE_OUTCOMES` (frozen). `validateArtifact` reports `refresh-archive-outcome` for an out-of-vocabulary outcome, `refresh-archive-url` for a non-absolute-http URL, and `refresh-archive-date` for a malformed or future `archive_read`. All three fields are optional; an entry carrying none validates exactly as before.

- [ ] **Step 1: Write the failing tests**

Read `tools/corpus/test/refresh-artifact.test.mjs` first and reuse whatever valid-artifact factory it already defines — the helper below is named `validArtifact()` as a placeholder for that existing factory's real name. Append:

```javascript
test("an entry with no archive fields validates exactly as before", () => {
  assert.deepEqual(validateArtifact(validArtifact()), []);
});

test("a well-formed capture validates", () => {
  const data = validArtifact();
  Object.assign(data.records[0], {
    archived: "https://archive.example/w/1/x",
    archive_outcome: "captured",
    archive_read: "2026-10-08",
  });
  assert.deepEqual(validateArtifact(data), []);
});

test("refused and failed are legal outcomes without an archived URL", () => {
  for (const outcome of ["refused", "failed"]) {
    const data = validArtifact();
    Object.assign(data.records[0], {
      archive_outcome: outcome,
      archive_read: "2026-10-08",
    });
    assert.deepEqual(validateArtifact(data), [], `outcome ${outcome}`);
  }
});

test("an out-of-vocabulary outcome is reported", () => {
  const data = validArtifact();
  data.records[0].archive_outcome = "maybe";
  assert.ok(
    validateArtifact(data)
      .map((i) => i.rule)
      .includes("refresh-archive-outcome"),
  );
});

test("a relative or non-http archived URL is reported", () => {
  for (const bad of [
    "./snap.html",
    "archive.example/x",
    "ftp://a.example/x",
    7,
  ]) {
    const data = validArtifact();
    data.records[0].archived = bad;
    data.records[0].archive_outcome = "captured";
    assert.ok(
      validateArtifact(data)
        .map((i) => i.rule)
        .includes("refresh-archive-url"),
      `bad url ${JSON.stringify(bad)}`,
    );
  }
});

test("a malformed or future archive_read is reported", () => {
  for (const bad of ["2026-13-01", "08-10-2026", "2099-01-01"]) {
    const data = validArtifact();
    data.records[0].archive_outcome = "captured";
    data.records[0].archived = "https://archive.example/x";
    data.records[0].archive_read = bad;
    assert.ok(
      validateArtifact(data)
        .map((i) => i.rule)
        .includes("refresh-archive-date"),
      `bad date ${bad}`,
    );
  }
});

test("ARCHIVE_OUTCOMES is frozen and holds exactly the three outcomes", () => {
  assert.deepEqual([...ARCHIVE_OUTCOMES], ["captured", "refused", "failed"]);
  assert.throws(() => ARCHIVE_OUTCOMES.push("x"));
});
```

- [ ] **Step 2: Run them to verify they fail**

Run: `node --test tools/corpus/test/refresh-artifact.test.mjs`
Expected: FAIL — `ARCHIVE_OUTCOMES is not defined`, and the malformed cases report no issues.

- [ ] **Step 3: Implement the validation**

In `tools/corpus/refresh-artifact.mjs`, add beside `RECORD_VERDICTS`:

```javascript
// A capture's outcome and date live on the artifact entry, not on the record:
// without them, an absent `source_archived` conflates "never attempted",
// "refused via robots.txt" and "submission failed". See Decision 4.
export const ARCHIVE_OUTCOMES = Object.freeze([
  "captured",
  "refused",
  "failed",
]);
```

Inside `validateArtifact`'s per-record loop, add the three checks. **Reuse, do not duplicate:** call the date validator that file already applies to `read` and `was`, including its future-date rejection — find it first. For the URL check, export the `isAbsoluteHttpUrl` predicate added in Task 3 from `tools/corpus/verify-records.mjs` and import it here, so the record rule and the artifact rule cannot drift apart.

- [ ] **Step 4: Run the tests to verify they pass**

Run: `node --test tools/corpus/test/refresh-artifact.test.mjs`
Expected: PASS — the pre-existing artifact tests plus 7 new ones, `# fail 0`.

- [ ] **Step 5: Confirm the skeleton still round-trips**

`renderArtifactSkeleton` must keep emitting entries that `validateArtifact` accepts, with no archive fields present.

Run: `node --test tools/corpus/test/refresh-artifact.test.mjs tools/corpus/test/refresh-cli.test.mjs`
Expected: PASS, `# fail 0`.

- [ ] **Step 6: Run the four gates**

```bash
npm test 2>&1 | grep -E "^# fail" && node tools/corpus/cli.mjs render --check . && node tools/corpus/cli.mjs lint . && node tools/corpus/cli.mjs verify .
```

Expected: `# fail 0`, exit 0, `lint: clean`, `verify: clean`.

- [ ] **Step 7: Commit**

```bash
git add tools/corpus/refresh-artifact.mjs tools/corpus/verify-records.mjs \
  tools/corpus/test/refresh-artifact.test.mjs
git commit -m "feat: carry capture URL, outcome and date on refresh artifact entries"
```

---

## Task 9: `sources --archive` writes the artifact, and nothing else

**Files:**

- Create: `tools/corpus/archive.mjs`
- Modify: `tools/corpus/cli.mjs` (extend the `sources` branch)
- Test: `tools/corpus/test/archive.test.mjs`, `tools/corpus/test/sources-cli.test.mjs` (append)

**Interfaces:**

- Consumes: `probe` and `DEFAULT_TIMEOUT_MS` from `tools/corpus/sources.mjs`; `ARCHIVE_OUTCOMES` from `tools/corpus/refresh-artifact.mjs`; `parseArtifact(text)` / `dumpArtifact(data, body)` from `tools/corpus/refresh-artifact.mjs`.
- Produces: `captureOne(url, { submitImpl, timeoutMs }) -> { url, archived, archive_outcome, error }`. `applyCaptures(artifactText, captures, { today }) -> string` — writes `archived`, `archive_outcome` and `archive_read` onto the matching per-record entries and returns the new artifact text. `ARCHIVE_SUBMIT_URL` (a string constant, so the service is configured in one place).

- [ ] **Step 1: Write the failing tests**

Create `tools/corpus/test/archive.test.mjs`:

```javascript
import test from "node:test";
import assert from "node:assert/strict";
import { captureOne, applyCaptures, ARCHIVE_SUBMIT_URL } from "../archive.mjs";
import { parseArtifact } from "../refresh-artifact.mjs";

test("ARCHIVE_SUBMIT_URL is an absolute https URL", () => {
  const u = new URL(ARCHIVE_SUBMIT_URL);
  assert.equal(u.protocol, "https:");
});

test("captureOne reports a successful capture", async () => {
  const submitImpl = async () => ({
    status: 200,
    redirected: false,
    url: "https://archive.example/w/20261008/https://e.com/a",
  });
  const r = await captureOne("https://e.com/a", { submitImpl });
  assert.equal(r.archive_outcome, "captured");
  assert.match(r.archived, /^https:\/\/archive\.example\//);
  assert.equal(r.error, null);
});

test("captureOne reports a service refusal as refused, with no URL", async () => {
  const submitImpl = async () => ({
    status: 403,
    redirected: false,
    url: null,
  });
  const r = await captureOne("https://e.com/no-robots", { submitImpl });
  assert.equal(r.archive_outcome, "refused");
  assert.equal(r.archived, null);
});

test("captureOne reports a network error or timeout as failed", async () => {
  const boom = async () => {
    throw new Error("ECONNRESET");
  };
  const r = await captureOne("https://e.com/a", { submitImpl: boom });
  assert.equal(r.archive_outcome, "failed");
  assert.equal(r.archived, null);
  assert.match(r.error, /ECONNRESET/);
});

test("captureOne never returns an outcome outside the vocabulary", async () => {
  for (const status of [200, 301, 403, 429, 500]) {
    const submitImpl = async () => ({
      status,
      redirected: false,
      url: "https://archive.example/x",
    });
    const r = await captureOne("https://e.com/a", { submitImpl });
    assert.ok(
      ["captured", "refused", "failed"].includes(r.archive_outcome),
      `status ${status}`,
    );
  }
});

const ARTIFACT = `---
kind: refresh
unit: [guides/t/p.md]
entry: guides/t/p.md
topic: t
fetched: "2026-10-08"
verdict: changed
unit_keys: [a.one, a.two]
records:
  - key: a.one
    file: data/x.yaml
    verdict: confirmed
    url: https://e.com/a
    read: "2026-10-08"
    was: "2026-01-01"
  - key: a.two
    file: data/x.yaml
    verdict: confirmed
    url: https://e.com/b
    read: "2026-10-08"
    was: "2026-01-01"
---

body
`;

test("applyCaptures writes the three fields onto the matching entry only", () => {
  const out = applyCaptures(
    ARTIFACT,
    [
      {
        key: "a.one",
        archived: "https://archive.example/s1",
        archive_outcome: "captured",
        error: null,
      },
    ],
    { today: "2026-10-08" },
  );
  const { data } = parseArtifact(out);
  assert.equal(data.records[0].archived, "https://archive.example/s1");
  assert.equal(data.records[0].archive_outcome, "captured");
  assert.equal(data.records[0].archive_read, "2026-10-08");
  assert.equal(data.records[1].archived, undefined);
  assert.equal(data.records[1].archive_outcome, undefined);
});

test("applyCaptures records a refusal with an outcome and date but no URL", () => {
  const out = applyCaptures(
    ARTIFACT,
    [{ key: "a.two", archived: null, archive_outcome: "refused", error: null }],
    { today: "2026-10-08" },
  );
  const { data } = parseArtifact(out);
  assert.equal(data.records[1].archive_outcome, "refused");
  assert.equal(data.records[1].archive_read, "2026-10-08");
  assert.ok(!("archived" in data.records[1]));
});

test("applyCaptures throws for a key the artifact does not carry", () => {
  assert.throws(() =>
    applyCaptures(
      ARTIFACT,
      [
        {
          key: "not.in.unit",
          archived: "https://archive.example/x",
          archive_outcome: "captured",
          error: null,
        },
      ],
      { today: "2026-10-08" },
    ),
  );
});
```

- [ ] **Step 2: Run them to verify they fail**

Run: `node --test tools/corpus/test/archive.test.mjs`
Expected: FAIL — `Cannot find module '.../tools/corpus/archive.mjs'`

- [ ] **Step 3: Write `tools/corpus/archive.mjs`**

```javascript
import { DEFAULT_TIMEOUT_MS } from "./sources.mjs";
import { parseArtifact, dumpArtifact } from "./refresh-artifact.mjs";

// The archive service lives in exactly one place so adopting a different one
// is a configuration change, not a contract change. See Decision 3.
export const ARCHIVE_SUBMIT_URL = "https://web.archive.org/save/";

export async function captureOne(url, options = {}) {
  const { submitImpl = globalThis.fetch, timeoutMs = DEFAULT_TIMEOUT_MS } =
    options;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await submitImpl(`${ARCHIVE_SUBMIT_URL}${url}`, {
      method: "GET",
      redirect: "follow",
      signal: controller.signal,
    });
    const status = res.status ?? 0;
    if (
      status >= 200 &&
      status < 300 &&
      typeof res.url === "string" &&
      res.url
    ) {
      return {
        url,
        archived: res.url,
        archive_outcome: "captured",
        error: null,
      };
    }
    // 4xx is the service declining this URL (robots.txt opt-out, blocklist).
    // Anything else is the service itself being unavailable.
    const refused = status >= 400 && status < 500;
    return {
      url,
      archived: null,
      archive_outcome: refused ? "refused" : "failed",
      error: `archive service returned ${status}`,
    };
  } catch (e) {
    const timedOut = e?.name === "AbortError";
    return {
      url,
      archived: null,
      archive_outcome: "failed",
      error: timedOut
        ? `timeout after ${timeoutMs}ms`
        : String(e?.message ?? e),
    };
  } finally {
    clearTimeout(timer);
  }
}

export function applyCaptures(artifactText, captures, { today }) {
  const { data, body } = parseArtifact(artifactText);
  const entries = data?.records ?? [];
  for (const c of captures) {
    const entry = entries.find((e) => e?.key === c.key);
    if (!entry) {
      throw new Error(
        `applyCaptures: the artifact carries no record entry for ${c.key}`,
      );
    }
    if (c.archived != null) entry.archived = c.archived;
    entry.archive_outcome = c.archive_outcome;
    entry.archive_read = today;
  }
  return dumpArtifact(data, body);
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `node --test tools/corpus/test/archive.test.mjs`
Expected: PASS, 8 tests.

- [ ] **Step 5: Wire `--archive` into the `sources` branch**

Extend the `sources` branch in `tools/corpus/cli.mjs`. `--archive` requires `--artifact=<research/...>`, submits a capture for each **record `source`** in that artifact's `unit_keys`, and writes the artifact. It writes nothing under `data/` or `guides/`.

```javascript
if (rest.includes("--archive")) {
  const artifactRel = (
    rest.find((a) => a.startsWith("--artifact=")) ?? ""
  ).slice("--artifact=".length);
  if (!artifactRel) {
    console.error(
      "corpus: sources --archive requires --artifact=<research/...>",
    );
    process.exit(2);
  }
  const artifactPath = path.join(root, artifactRel);
  if (!fs.existsSync(artifactPath)) {
    console.error(
      `corpus: ${artifactRel} [refresh-artifact-not-found] no such file`,
    );
    process.exit(2);
  }
  const text = fs.readFileSync(artifactPath, "utf8");
  const { data } = parseArtifact(text);
  const captures = [];
  for (const entry of data?.records ?? []) {
    const c = await captureOne(entry.url);
    captures.push({ key: entry.key, ...c });
    console.error(
      `${entry.key}: ${c.archive_outcome}${c.error ? ` (${c.error})` : ""}`,
    );
  }
  const today = new Date().toISOString().slice(0, 10);
  const next = applyCaptures(text, captures, { today });
  // A failed write is a fact about this machine, not about a third party:
  // exit 1. A refused capture is a finding and must not fail the command.
  try {
    fs.writeFileSync(artifactPath, next);
  } catch (e) {
    console.error(`corpus: could not write ${artifactRel}: ${e.message}`);
    process.exit(1);
  }
  console.log(`archived: ${artifactRel}`);
  process.exit(0);
}
```

Add `--artifact=` to `KNOWN_FLAG_PREFIXES` if Task 6 did not already include it (it did), and add the imports for `captureOne`, `applyCaptures` and `parseArtifact`.

- [ ] **Step 6: Write the failing CLI tests for `--archive`**

Append to `tools/corpus/test/sources-cli.test.mjs`:

```javascript
test("sources --archive without --artifact exits 2", () => {
  const r = run(["sources", "--archive", "."], emptyCorpus());
  assert.equal(r.code, 2);
  assert.match(r.err, /^corpus: sources --archive requires --artifact=/m);
});

test("sources --archive with a missing artifact exits 2 and names the rule", () => {
  const r = run(
    ["sources", "--archive", "--artifact=research/t/nope.md", "."],
    emptyCorpus(),
  );
  assert.equal(r.code, 2);
  assert.match(r.err, /refresh-artifact-not-found/);
});
```

- [ ] **Step 7: Run them, then the whole suite**

Run: `node --test tools/corpus/test/sources-cli.test.mjs && npm test 2>&1 | grep -E "^# fail"`
Expected: PASS, then `# fail 0`.

- [ ] **Step 8: Prove `--archive` touches no tracked file but the artifact**

Build a throwaway artifact in a temp corpus, run `--archive` against it with the network unreachable, and confirm the outcome is recorded as `failed` rather than crashing, and that `data/` and `guides/` in the real repo are untouched:

```bash
git status --porcelain > /tmp/before.txt
T=$(mktemp -d) && mkdir -p "$T/data" "$T/guides" "$T/research/t"
cat > "$T/data/x.yaml" <<'YAML'
records:
  - key: a.one
    value: "1"
    volatility: high
    source: https://this-host-does-not-exist.invalid/a
    verified: "2026-01-01"
    tags: [t]
YAML
cat > "$T/research/t/a.md" <<'ART'
---
kind: refresh
unit: [guides/t/p.md]
entry: guides/t/p.md
topic: t
fetched: "2026-10-08"
verdict: changed
unit_keys: [a.one]
records:
  - key: a.one
    file: data/x.yaml
    verdict: confirmed
    url: https://this-host-does-not-exist.invalid/a
    read: "2026-10-08"
    was: "2026-01-01"
---

body
ART
node tools/corpus/cli.mjs sources --archive --artifact=research/t/a.md "$T" ; echo "exit=$?"
grep -c "archive_outcome: failed" "$T/research/t/a.md"
rm -rf "$T"
git status --porcelain > /tmp/after.txt && diff /tmp/before.txt /tmp/after.txt && echo "repo untouched"
```

Expected: `exit=0` (a failed capture is a finding, not a command failure), `1` for the grep, and `repo untouched`.

- [ ] **Step 9: Run the four gates**

```bash
npm test 2>&1 | grep -E "^# fail" && node tools/corpus/cli.mjs render --check . && node tools/corpus/cli.mjs lint . && node tools/corpus/cli.mjs verify .
```

Expected: `# fail 0`, exit 0, `lint: clean`, `verify: clean`.

- [ ] **Step 10: Commit**

```bash
git add tools/corpus/archive.mjs tools/corpus/cli.mjs \
  tools/corpus/test/archive.test.mjs tools/corpus/test/sources-cli.test.mjs
git commit -m "feat: capture snapshots into the refresh artifact, never into data/"
```

---

## Task 10: The stamp writes the record, the revert removes it

**Files:**

- Modify: `tools/corpus/refresh-stamp.mjs` (`stampUnit`, `revertUnit`)
- Test: `tools/corpus/test/refresh-stamp.test.mjs` (append)

**Interfaces:**

- Consumes: `setRecordArchived` / `clearRecordArchived` from Task 7; the `archived` / `archive_outcome` entry fields from Task 8.
- Produces: no new exports. `stampUnit` additionally writes `source_archived` into a record when its artifact entry carries `archived` and `archive_outcome: captured`, inside the existing all-or-nothing transform. The receipt gains `archived_written: true` on those record entries, and `revertUnit` removes the field from exactly those records.

- [ ] **Step 1: Write the failing tests**

Append to `tools/corpus/test/refresh-stamp.test.mjs`, reusing the existing `stampUnit` / `revertUnit` fixture helpers in that file rather than building new ones:

```javascript
test("stampUnit writes source_archived when the entry says captured", () => {
  const t = stampFixture(); // existing helper: a unit with one page and one record
  t.artifact.records[0].archived = "https://archive.example/s1";
  t.artifact.records[0].archive_outcome = "captured";
  stampUnit(...t.args);
  const yamlText = t.readRecordFile();
  assert.match(yamlText, /source_archived: https:\/\/archive\.example\/s1/);
});

test("stampUnit does not write source_archived for refused or failed", () => {
  for (const outcome of ["refused", "failed"]) {
    const t = stampFixture();
    t.artifact.records[0].archive_outcome = outcome;
    stampUnit(...t.args);
    assert.ok(
      !t.readRecordFile().includes("source_archived"),
      `outcome ${outcome}`,
    );
  }
});

test("stampUnit writes nothing at all when any record transform fails", () => {
  const t = stampFixture();
  t.artifact.records[0].archived = "https://archive.example/s1";
  t.artifact.records[0].archive_outcome = "captured";
  t.breakOneRecordFile(); // existing helper: makes one record un-writable/absent
  const before = t.readRecordFile();
  assert.throws(() => stampUnit(...t.args));
  assert.equal(t.readRecordFile(), before, "all-or-nothing must still hold");
});

test("revertUnit removes a source_archived the stamp wrote", () => {
  const t = stampFixture();
  t.artifact.records[0].archived = "https://archive.example/s1";
  t.artifact.records[0].archive_outcome = "captured";
  const before = t.readRecordFile();
  stampUnit(...t.args);
  revertUnit(...t.revertArgs);
  assert.equal(t.readRecordFile(), before);
});

test("revertUnit leaves a source_archived the stamp did not write", () => {
  const t = stampFixture({
    recordAlreadyArchived: "https://archive.example/pre",
  });
  stampUnit(...t.args); // entry carries no archived field
  revertUnit(...t.revertArgs);
  assert.match(
    t.readRecordFile(),
    /source_archived: https:\/\/archive\.example\/pre/,
  );
});
```

If the existing test file has no such helpers, build the three (`stampFixture`, `readRecordFile`, `breakOneRecordFile`) from the patterns already in `tools/corpus/test/refresh-stamp.test.mjs` and `tools/corpus/test/refresh-cli.test.mjs` — do not invent a different fixture shape.

- [ ] **Step 2: Run them to verify they fail**

Run: `node --test tools/corpus/test/refresh-stamp.test.mjs`
Expected: FAIL — no `source_archived` is written.

- [ ] **Step 3: Extend `stampUnit`**

Inside `stampUnit`, in the loop that already computes each record file's new body in memory, apply `setRecordArchived` when the entry carries `archived` and `archive_outcome === "captured"`. It must happen in the **same in-memory pass** as `setRecordVerified`, before any write, so the all-or-nothing property is unchanged. Mark the receipt entry with `archived_written: true` for exactly those records.

**Do not** touch the existing drift guards. Inserting a field does not change any `verified` value, so `refresh-record-drifted`, `refresh-record-already-dated` and their page equivalents keep working untouched — confirm by test, not by inspection.

- [ ] **Step 4: Extend `revertUnit`**

For each receipt record entry with `archived_written: true`, call `clearRecordArchived` alongside the existing date restoration. Apply the same receipt validation the revert path already applies (`refresh-receipt-shape`, `refresh-record-file-escapes-data`) to the new field: a hand-written `archived_written` must not let a revert touch a file outside `data/`.

- [ ] **Step 5: Run the tests to verify they pass**

Run: `node --test tools/corpus/test/refresh-stamp.test.mjs`
Expected: PASS — pre-existing tests plus 5 new ones, `# fail 0`.

- [ ] **Step 6: Confirm the refresh CLI end-to-end path still holds**

Run: `node --test tools/corpus/test/refresh-cli.test.mjs tools/corpus/test/refresh-units.test.mjs tools/corpus/test/refresh-artifact.test.mjs`
Expected: PASS, `# fail 0`. These cover the stamp/revert round trip and the unit topology guards.

- [ ] **Step 7: Run the four gates**

```bash
npm test 2>&1 | grep -E "^# fail" && node tools/corpus/cli.mjs render --check . && node tools/corpus/cli.mjs lint . && node tools/corpus/cli.mjs verify .
```

Expected: `# fail 0`, exit 0, `lint: clean`, `verify: clean`.

- [ ] **Step 8: Confirm the ledger is still untouched**

Run: `git status --porcelain meta/ledger.yaml`
Expected: empty output. No task in this plan writes it.

- [ ] **Step 9: Commit**

```bash
git add tools/corpus/refresh-stamp.mjs tools/corpus/test/refresh-stamp.test.mjs
git commit -m "feat: stamp source_archived into records and revert it from the receipt"
```

---

## Task 11: Amend the contract

`CLAUDE.md` wins over any spec where they disagree, so until it is amended `source_archived` is an unrecognised field and `record-archived-invalid` is an undocumented rule.

**Files:**

- Modify: `CLAUDE.md` (six amendments)
- Modify: `tools/corpus/cli.mjs` (usage string — verify `site` and `sources` both appear)
- Test: `tools/corpus/test/contract.test.mjs` (create)

**Interfaces:**

- Consumes: nothing. This task is documentation plus one guard test.
- Produces: `tools/corpus/test/contract.test.mjs`, which asserts that every rule name the tools can emit appears in `CLAUDE.md`. That test is what stops this drift recurring.

- [ ] **Step 1: Write the failing guard test**

Create `tools/corpus/test/contract.test.mjs`:

```javascript
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const contract = fs.readFileSync(
  new URL("../../../CLAUDE.md", import.meta.url),
  "utf8",
);

// Every rule name the tools can emit must be documented, or a future session
// learns the wrong mechanism from the contract. This is the check whose
// absence let `site` ship undocumented.
const RULES = [
  "record-archived-invalid",
  "citation-malformed",
  "refresh-archive-outcome",
  "refresh-archive-url",
  "refresh-archive-date",
];

for (const rule of RULES) {
  test(`CLAUDE.md documents the ${rule} rule`, () => {
    assert.ok(contract.includes(rule), `${rule} is missing from CLAUDE.md`);
  });
}

test("CLAUDE.md's command list names every CLI subcommand", () => {
  for (const cmd of [
    "render",
    "lint",
    "verify",
    "ledger",
    "refresh",
    "site",
    "sources",
  ]) {
    assert.ok(
      contract.includes(`\`${cmd}\``) || contract.includes(`|${cmd}`),
      `${cmd} is missing from CLAUDE.md`,
    );
  }
});

test("CLAUDE.md documents the source_archived record field", () => {
  assert.ok(contract.includes("source_archived"));
});
```

Check the relative path resolves before relying on it: the test lives in `tools/corpus/test/`, so `../../../CLAUDE.md` is the repo root. If `fs.readFileSync` throws, fix the path and re-run rather than adjusting the assertions.

- [ ] **Step 2: Run it to verify it fails**

Run: `node --test tools/corpus/test/contract.test.mjs`
Expected: FAIL — every rule name is missing, and `sources` is missing from the command list.

- [ ] **Step 3: Apply the six amendments to `CLAUDE.md`**

`CLAUDE.md` is far past the size the native edit tool handles, so each amendment goes through a python read → assert → replace → write script via Bash. The `assert s.count(old) == 1` is what catches a wrong anchor; re-read before each edit, because an earlier edit may have moved the text. Pipes must be hand-aligned — the Prettier hook does not fire on this path.

The six:

1. **Record field table** — a `source_archived` row: `no` under Required, and a Meaning of "Optional web-archive snapshot URL of `source`, absolute `http(s)`. Exempt from the freshness model: it carries no `verified` date and no volatility."
2. **Issue rules table** — rows for `record-archived-invalid` (verify), `citation-malformed` (sources), `refresh-archive-outcome`, `refresh-archive-url` and `refresh-archive-date` (refresh).
3. **Root-level tooling table** — a `sources` row: the command, no npm form or `npm run sources`, what it does, and the exit column reading "0 whenever the audit ran, 1 only on a failed write, 2 on a usage error — deliberately no exit code for findings, so it cannot be gated on".
4. **The CLI usage line in prose** — currently `<render|lint|verify|ledger|refresh>`; must become `<render|lint|verify|ledger|refresh|site|sources>`. This also fixes the pre-existing omission of `site`.
5. **Refresh artifact front-matter spec** — the per-record entry sentence currently lists `key`, `file`, `verdict`, `url`, `stated`, `read` and `was`; add `archived`, `archive_outcome` and `archive_read`, noting all three are optional and that `archive_outcome` is one of `captured`, `refused`, `failed`.
6. **Refresh rules table and the all-or-nothing description** — state that `--stamp` also inserts `source_archived` when the artifact entry carries a captured snapshot, and that `--revert` removes exactly the fields the receipt marks `archived_written`.

After each edit:

Run: `node --test tools/corpus/test/contract.test.mjs`
Expected: progressively fewer failures, then PASS once all six land.

- [ ] **Step 4: Verify the usage string matches the contract**

Run: `node tools/corpus/cli.mjs 2>&1 | head -1`
Expected: a usage line containing both `site` and `sources`.

- [ ] **Step 5: Check the contract edits did not corrupt the tables**

Run: `TOKEN_OPTIMIZER_MODE=off grep -n "source_archived\|record-archived-invalid\|sources" CLAUDE.md`
Expected: each amendment appears exactly where intended, with aligned pipes and no duplicated rows.

- [ ] **Step 6: Run the four gates**

```bash
npm test 2>&1 | grep -E "^# (tests|pass|fail)" && node tools/corpus/cli.mjs render --check . && node tools/corpus/cli.mjs lint . && node tools/corpus/cli.mjs verify .
```

Expected: `# fail 0`, exit 0, `lint: clean`, `verify: clean`.

- [ ] **Step 7: Walk the nine acceptance criteria explicitly**

Open the spec's "Acceptance criteria" section and check each one against the tree, recording the command that proves it. Criterion 3 is the four gates; criterion 8 is `git status --porcelain meta/ledger.yaml` being empty; criterion 4 is Task 9 Step 8's `repo untouched`; criterion 6 is the unknown-flag test. **Any criterion you cannot name a passing command for is not met** — fix it before the final commit.

- [ ] **Step 8: Commit**

```bash
git add CLAUDE.md tools/corpus/cli.mjs tools/corpus/test/contract.test.mjs
git commit -m "docs: amend the contract for source_archived, the sources command and the archive stamp"
```

---

## Self-Review

Run after the plan is written, before execution starts.

**1. Spec coverage.** Each of the spec's five decisions and its Components subsections maps to a task:

| Spec section                         | Task                                                                                                               |
| ------------------------------------ | ------------------------------------------------------------------------------------------------------------------ |
| Decision 1 (reports, never blocks)   | 5 (step 9 proves it)                                                                                               |
| Decision 2 (every citation URL)      | 2, 5                                                                                                               |
| Decision 3 (archive URL + predicate) | 3                                                                                                                  |
| Decision 4 (artifact then stamp)     | 7, 8, 9, 10                                                                                                        |
| Decision 5 (report-side escalation)  | none — it is a decision _not_ to build a mechanism; Task 11 amendment 3 records the exit semantics that enforce it |
| `record-archived-invalid`            | 3                                                                                                                  |
| `sources` subcommand                 | 5                                                                                                                  |
| Where the URL list comes from        | 1, 2                                                                                                               |
| `sources --archive`                  | 9                                                                                                                  |
| Unknown-flag rejection               | 6                                                                                                                  |
| Contract amendments                  | 11                                                                                                                 |
| Tests                                | each task's own steps                                                                                              |
| Acceptance criteria 1–9              | 11, step 7                                                                                                         |

**2. Placeholders.** None. Every code step carries runnable code. Three places deliberately instruct the implementer to _read then mirror_ existing code rather than reproducing it from memory — Task 1 step 3, Task 7 steps 1 and 4, Task 10 step 1 — because those functions' exact regex and error construction must match the originals byte-for-byte, and transcribing them from a read is unsound in this repo: the token-optimizer hook folds function bodies into spill placeholders. Each of those steps names the file, the line range, and the invariants its tests pin.

**3. Type consistency.** Checked across tasks: `collectCitations` returns `{ citations, issues }` (Task 2) and Task 5 destructures exactly that. A citation is `{ url, class, origin }` throughout; `auditCitations` spreads it and adds `outcome`, `status`, `finalUrl`, `error` (Task 4), which is what `summarise` reads (Task 5). `captureOne` returns `archived` / `archive_outcome` / `error` (Task 9), matching the artifact fields Task 8 validates and the `archived` + `archive_outcome: "captured"` condition Task 10 branches on. `setRecordArchived(yamlText, key, url)` and `clearRecordArchived(yamlText, key)` keep the `(yamlText, key, ...)` argument order of the existing `setRecordVerified`. `CITATION_CLASSES` and `ARCHIVE_OUTCOMES` are each defined once and imported everywhere else.

**4. Review Focus coverage.** All five are pinned to tasks and have tests: non-string URL (Task 2), missing or scalar front-matter (Task 2), fetch timeout (Task 4), existing `source_archived` not duplicated (Task 7), nested look-alike line untouched (Task 7).

**One risk the plan cannot remove.** Task 1 exports `urlRanges` from the lint, and Task 2 consumes it over every guide body. A behaviour change there is a corpus-wide false negative in the bare-value scan — the worst failure class available in this repo — and the only proof available is the existing suite. Task 1 is therefore a pure extraction with no edit to the function body, and its step 8 runs the whole suite rather than only the new tests. If the suite count does not land at 474 plus the new tests, stop.
