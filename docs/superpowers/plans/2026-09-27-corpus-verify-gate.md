# Corpus Verify Gate Implementation Plan (2a-i)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship `corpus verify` — a strictly read-only CLI gate implementing twelve deterministic rules that close the gaps `CLAUDE.md` says no tool currently checks — plus the `comparison.md` section 6 cleanup and the contract amendments this makes true.

**Architecture:** Two new pure modules (`verify-records.mjs`, `verify-pages.mjs`) holding one exported function per rule family, each taking already-parsed inputs and returning `{rule, message, line?}` issue objects. `cli.mjs` gains `verifyCorpus(root)` which walks guides and records exactly as `lintCorpus` does and stamps `path` onto each issue, plus a `verify` command in `main()`. No filesystem writes anywhere in the verify path.

**Tech Stack:** Node 22+, ES modules, `js-yaml`, `node:test` + `node:assert/strict`. No new dependencies.

**Spec:** `docs/superpowers/specs/2026-09-27-corpus-refresh-loop-design.md` (revision 3)

## Global Constraints

- Node 22 or later. ES modules only (`"type": "module"`).
- **`corpus verify` never writes.** No `fs.writeFileSync`, no `fs.mkdirSync`, no mutation of any loaded structure. The spec makes this the reason the command can be a CI gate at all.
- Issue objects are `{rule, message}` with an optional `line`. `verifyCorpus` adds `path`. This matches `lintCorpus`'s existing shape exactly — the CLI printer is shared.
- Rule names are kebab-case and must match the spec's table verbatim: `record-duplicate-key`, `record-source-missing`, `record-verified-missing`, `record-verified-invalid`, `frontmatter-applies-to-shape`, `related-path-unresolved`, `lint-literals-stale`, `template-sections`, `rots-table-incomplete`, `evidence-label-invalid`, `known-lint-gap-form`, `research-required`.
- **`REQUIRED_FIELDS` in `tools/corpus/lint.mjs` is not touched.** The spec establishes that adding `research` there is mechanically impossible.
- **`seed: true` is never removed from any page.** It is permanent provenance (`CLAUDE.md:379-380`).
- Every new guard gets a mutation proof: delete the guard, confirm the tests go red, restore it. This repo's established practice; a guard without one is not considered tested.
- Both existing gates must stay green after every task: `node tools/corpus/cli.mjs render --check .` exits 0 with no `would render:` line, and `node tools/corpus/cli.mjs lint .` prints `lint: clean`.
- After creating any new directory, check for and delete a hook-generated `.claude/` folder inside it before staging. Stage by filename, never `git add -A`.

## Review Focus

Five input classes the spec implies but which no rule's happy path exercises. Each has its test assigned to the task that owns the code.

1. **A guide with no front-matter at all.** `parseFrontmatter` returns `data === null`; every page-level rule must return issues or `[]` rather than throwing on property access. → Task 4, and the adversarial fixture in Task 10.
2. **A `related` or `applies_to` entry that is not a string** (a number, an object, `null`). `applies_to` as an object is the exact shape `test/fixtures` already uses for unit tests, so this is a live case, not a hypothetical. → Task 4.
3. **A page with no `## 6.` heading at all.** `checkRotsTable` must report rather than silently pass, or a page can evade the rule by omitting the section. → Task 8.
4. **A `corpus:table` block with no `tag` attribute.** `CLAUDE.md` states this renders every record in the corpus, so the referenced-record set becomes all 25 records and section 6 must list every one. The rule must treat this deliberately and identically to render. → Task 8.
5. **An `Evidence:` line whose only bolded text is not a label** (e.g. a bolded source name). Must be reported as having no valid label rather than passing silently. → Task 7.

---

## File Structure

| File                                                 | Responsibility                                                                                                                                                                                                |
| ---------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `tools/corpus/verify-records.mjs` (create)           | Record-level rules: duplicate keys, required record fields, stale lint literals. Pure; takes records.                                                                                                         |
| `tools/corpus/verify-pages.mjs` (create)             | Page-level rules: front-matter shape, related paths, research requirement, template sections, evidence labels, section 6 completeness, known lint gap form. Pure; takes text + parsed front-matter + records. |
| `tools/corpus/cli.mjs` (modify)                      | Add `verifyCorpus(root)`; add `verify` to `main()` dispatch and the usage string.                                                                                                                             |
| `tools/corpus/test/verify-records.test.mjs` (create) | Unit tests for `verify-records.mjs`.                                                                                                                                                                          |
| `tools/corpus/test/verify-pages.test.mjs` (create)   | Unit tests for `verify-pages.mjs`.                                                                                                                                                                            |
| `tools/corpus/test/verify-cli.test.mjs` (create)     | `verifyCorpus` over the existing fixture corpus, plus spawned exit-code tests.                                                                                                                                |
| `package.json` (modify)                              | Add the `verify` script.                                                                                                                                                                                      |
| `guides/models/comparison.md` (modify)               | Relocate the foundation-era retrospective out of section 6.                                                                                                                                                   |
| `CLAUDE.md` (modify)                                 | Contract amendments this plan makes true.                                                                                                                                                                     |

Two modules rather than one because the existing codebase splits record concerns (`data.mjs`) from page concerns, and because record rules need the whole record set while page rules need one page's text — different inputs, different test fixtures.

---

### Task 1: The `verify` command and its first rule

Builds the whole vertical slice — module, CLI wiring, npm script, one working rule — so every later task only adds a function and a test.

**Files:**

- Create: `tools/corpus/verify-records.mjs`
- Create: `tools/corpus/test/verify-records.test.mjs`
- Modify: `tools/corpus/cli.mjs`
- Modify: `package.json`

**Interfaces:**

- Consumes: `loadRecords` from `./data.mjs` (returns records each carrying a `file` field).
- Produces: `checkDuplicateKeys(records) -> Array<{rule, message}>`; `verifyCorpus(root) -> Array<{rule, message, line?, path}>` exported from `cli.mjs`.

- [ ] **Step 1: Write the failing test**

Create `tools/corpus/test/verify-records.test.mjs`:

```javascript
import test from "node:test";
import assert from "node:assert/strict";
import { checkDuplicateKeys } from "../verify-records.mjs";

const rec = (key, file = "models.yaml", extra = {}) => ({
  key,
  value: "x",
  source: "https://example.invalid/docs",
  verified: "2026-09-16",
  volatility: "high",
  file,
  ...extra,
});

test("accepts a record set with unique keys", () => {
  assert.deepEqual(
    checkDuplicateKeys([rec("a.b"), rec("a.c"), rec("d.e")]),
    [],
  );
});

test("reports a key that appears twice, naming both files", () => {
  const issues = checkDuplicateKeys([
    rec("a.b", "models.yaml"),
    rec("a.b", "models-other.yaml"),
  ]);
  assert.equal(issues.length, 1);
  assert.equal(issues[0].rule, "record-duplicate-key");
  assert.equal(issues[0].file, "models.yaml");
  assert.match(issues[0].message, /a\.b/);
  assert.match(issues[0].message, /models\.yaml/);
  assert.match(issues[0].message, /models-other\.yaml/);
});

test("reports a key appearing three times exactly once", () => {
  const issues = checkDuplicateKeys([rec("a.b"), rec("a.b"), rec("a.b")]);
  assert.equal(issues.length, 1);
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `node --test tools/corpus/test/verify-records.test.mjs`
Expected: FAIL — cannot find module `../verify-records.mjs`.

- [ ] **Step 3: Write the minimal implementation**

Create `tools/corpus/verify-records.mjs`:

```javascript
// tools/corpus/verify-records.mjs
// Record-level checks the contract assigns to the Verify stage: things lint
// deliberately does not check because they are not bare-value problems.

// A duplicate key is silent in render — the later record wins — so nothing
// downstream can tell a shadowed record from a missing one.
export function checkDuplicateKeys(records) {
  const byKey = new Map();
  for (const r of records) {
    if (!byKey.has(r.key)) byKey.set(r.key, []);
    byKey.get(r.key).push(r.file ?? "(unknown file)");
  }
  const issues = [];
  for (const [key, files] of byKey) {
    if (files.length < 2) continue;
    issues.push({
      rule: "record-duplicate-key",
      // `file` is consumed by verifyCorpus to build the issue path, then dropped.
      file: files[0],
      message: `duplicate record key ${key}: defined ${files.length} times (${files.join(", ")}); render silently keeps only the last`,
    });
  }
  return issues;
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `node --test tools/corpus/test/verify-records.test.mjs`
Expected: PASS, 3 tests.

- [ ] **Step 5: Add `verifyCorpus` to the CLI**

In `tools/corpus/cli.mjs`, add to the imports:

```javascript
import { checkDuplicateKeys } from "./verify-records.mjs";
```

Then add this function immediately after `lintCorpus`:

```javascript
// The Verify stage's deterministic half. Strictly read-only: it must never
// write, because it runs as a CI gate over the tree it is judging.
export function verifyCorpus(root) {
  const records = loadRecords(path.join(root, "data"));
  const issues = [];
  // Same destructuring as lintCorpus uses for checkDataFiles: `file` names the
  // data file for the issue path and does not survive onto the issue itself.
  for (const { file, ...i } of checkDuplicateKeys(records))
    issues.push({ ...i, path: path.join("data", file) });
  return issues;
}
```

- [ ] **Step 6: Wire the `verify` command into `main()`**

In `tools/corpus/cli.mjs`, change the `usage` arrow to:

```javascript
const usage = () => {
  console.error("usage: corpus <render|lint|verify|ledger> [--write] [dir]");
  console.error("       corpus render --check [dir]");
  process.exit(2);
};
```

Add this branch immediately after the `if (command === "lint") { ... }` block closes, before `else if (command === "render")`:

```javascript
  } else if (command === "verify") {
    if (write) usage();
    const issues = verifyCorpus(root);
    for (const i of issues)
      console.error(
        `${i.path}${i.line ? `:${i.line}` : ""} [${i.rule}] ${i.message}`,
      );
    console.log(
      issues.length === 0
        ? "verify: clean"
        : `verify: ${issues.length} issue(s)`,
    );
    process.exit(issues.length === 0 ? 0 : 1);
```

- [ ] **Step 7: Add the npm script**

In `package.json`, add to `"scripts"` after the `"lint"` entry:

```json
    "verify": "node tools/corpus/cli.mjs verify",
```

- [ ] **Step 8: Confirm the command runs clean on the real corpus**

Run: `node tools/corpus/cli.mjs verify .`
Expected: `verify: clean`, exit 0. There are no duplicate keys among the 25 records.

Run: `node tools/corpus/cli.mjs verify --write .`
Expected: the usage message and exit 2 — `verify` rejects `--write`.

- [ ] **Step 9: Mutation proof**

Temporarily change `if (files.length < 2) continue;` to `if (files.length < 3) continue;`. Run `node --test tools/corpus/test/verify-records.test.mjs` and confirm the two-file test fails. Restore the line and confirm tests pass again.

- [ ] **Step 10: Run the full suite and both existing gates**

Run: `npm test`
Expected: all tests pass, 0 failures.

Run: `node tools/corpus/cli.mjs render --check . && node tools/corpus/cli.mjs lint .`
Expected: exit 0, no `would render:` line, `lint: clean`.

- [ ] **Step 11: Commit**

```bash
git add tools/corpus/verify-records.mjs tools/corpus/test/verify-records.test.mjs tools/corpus/cli.mjs package.json
git commit -m "feat: add read-only corpus verify command with duplicate-key rule"
```

---

### Task 2: Required record fields

**Files:**

- Modify: `tools/corpus/verify-records.mjs`
- Modify: `tools/corpus/test/verify-records.test.mjs`
- Modify: `tools/corpus/cli.mjs`

**Interfaces:**

- Consumes: `isValidIsoDate` from `./ledger.mjs`.
- Produces: `checkRecordFields(record) -> Array<{rule, message}>`.

- [ ] **Step 1: Write the failing tests**

Append to `tools/corpus/test/verify-records.test.mjs`, and add `checkRecordFields` to the import at the top of that file:

```javascript
test("accepts a record with source and a valid verified date", () => {
  assert.deepEqual(checkRecordFields(rec("a.b")), []);
});

test("reports a missing source", () => {
  const r = rec("a.b");
  delete r.source;
  const issues = checkRecordFields(r);
  assert.equal(issues.length, 1);
  assert.equal(issues[0].rule, "record-source-missing");
  assert.match(issues[0].message, /a\.b/);
});

test("reports a missing verified", () => {
  const r = rec("a.b");
  delete r.verified;
  assert.equal(
    checkRecordFields(r).some((i) => i.rule === "record-verified-missing"),
    true,
  );
});

test("reports a verified that is not a real calendar date", () => {
  const issues = checkRecordFields(
    rec("a.b", "models.yaml", { verified: "2026-02-30" }),
  );
  assert.equal(
    issues.some((i) => i.rule === "record-verified-invalid"),
    true,
  );
});

test("reports a verified that YAML parsed as a Date rather than a string", () => {
  // An unquoted 2026-09-16 in YAML is a date, not a string; the contract
  // requires it quoted, and the raw value must still be rejected loudly.
  const issues = checkRecordFields(
    rec("a.b", "models.yaml", { verified: new Date("2026-09-16") }),
  );
  assert.equal(
    issues.some((i) => i.rule === "record-verified-invalid"),
    true,
  );
});

test("does not report verified-invalid when verified is absent", () => {
  const r = rec("a.b");
  delete r.verified;
  assert.equal(
    checkRecordFields(r).some((i) => i.rule === "record-verified-invalid"),
    false,
  );
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `node --test tools/corpus/test/verify-records.test.mjs`
Expected: FAIL — `checkRecordFields` is not exported.

- [ ] **Step 3: Write the minimal implementation**

At the top of `tools/corpus/verify-records.mjs` add:

```javascript
import { isValidIsoDate } from "./ledger.mjs";
```

Then append:

```javascript
// source and verified are required by the contract but checked by no tool:
// "The Verify stage checks them."
export function checkRecordFields(record) {
  const issues = [];
  if (record.source == null || String(record.source).trim() === "") {
    issues.push({
      rule: "record-source-missing",
      message: `record ${record.key}: no source; every value must name the URL it was read from`,
    });
  }
  if (!("verified" in record) || record.verified == null) {
    issues.push({
      rule: "record-verified-missing",
      message: `record ${record.key}: no verified date`,
    });
  } else if (
    typeof record.verified !== "string" ||
    !isValidIsoDate(record.verified)
  ) {
    issues.push({
      rule: "record-verified-invalid",
      message: `record ${record.key}: verified must be a quoted real date written YYYY-MM-DD; got ${JSON.stringify(record.verified)}`,
    });
  }
  return issues;
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `node --test tools/corpus/test/verify-records.test.mjs`
Expected: PASS.

- [ ] **Step 5: Wire into `verifyCorpus`**

In `tools/corpus/cli.mjs`, change the import to:

```javascript
import { checkDuplicateKeys, checkRecordFields } from "./verify-records.mjs";
```

and add inside `verifyCorpus`, after the duplicate-key loop:

```javascript
for (const record of records) {
  for (const i of checkRecordFields(record))
    issues.push({ ...i, path: path.join("data", record.file) });
}
```

- [ ] **Step 6: Confirm the real corpus is still clean**

Run: `node tools/corpus/cli.mjs verify .`
Expected: `verify: clean`. All 25 records carry a `source` and a quoted `"2026-09-16"`.

- [ ] **Step 7: Mutation proof**

Temporarily change `typeof record.verified !== "string"` to `false`. Run the tests and confirm the Date test fails. Restore and confirm green.

- [ ] **Step 8: Run the full suite and both gates**

Run: `npm test && node tools/corpus/cli.mjs render --check . && node tools/corpus/cli.mjs lint .`
Expected: tests pass, exit 0, `lint: clean`.

- [ ] **Step 9: Commit**

```bash
git add tools/corpus/verify-records.mjs tools/corpus/test/verify-records.test.mjs tools/corpus/cli.mjs
git commit -m "feat: verify required record source and verified fields"
```

---

### Task 3: Stale lint literals

`lint_literals` must stay in agreement with the record's own fields, and nothing checks it. The check is **substring-based, not equality-based**, because the contract documents `lint_literals` as context-bound _phrases_ that may be fragments of a field — `data/claude-code.yaml:6-8` says so, and `claude_code.hooks.session_end_budget` uses `"1.5-second budget"` against a longer `display`. An equality check would fire on every record in that file.

**Files:**

- Modify: `tools/corpus/verify-records.mjs`
- Modify: `tools/corpus/test/verify-records.test.mjs`
- Modify: `tools/corpus/cli.mjs`

**Interfaces:**

- Consumes: `isIndexableFieldValue` from `./data.mjs`.
- Produces: `checkLintLiteralsStale(record) -> Array<{rule, message}>`.

- [ ] **Step 1: Write the failing tests**

Add `checkLintLiteralsStale` to the import, then append:

```javascript
test("accepts a literal that is a whole field value", () => {
  const r = rec("a.b", "models.yaml", {
    display: "600 seconds for command handlers",
    lint_literals: ["600 seconds for command handlers"],
  });
  assert.deepEqual(checkLintLiteralsStale(r), []);
});

test("accepts a literal that is a fragment of a field value", () => {
  const r = rec("a.b", "models.yaml", {
    display: "a shared 1.5-second budget, raised to match a longer timeout",
    lint_literals: ["1.5-second budget"],
  });
  assert.deepEqual(checkLintLiteralsStale(r), []);
});

test("accepts a literal that matches a numeric field", () => {
  const r = rec("a.b", "models.yaml", { value: 600, lint_literals: ["600"] });
  assert.deepEqual(checkLintLiteralsStale(r), []);
});

test("reports a literal matching no field on the record", () => {
  const r = rec("a.b", "models.yaml", {
    display: "60 seconds for agent handlers",
    lint_literals: ["30 seconds for agent handlers"],
  });
  const issues = checkLintLiteralsStale(r);
  assert.equal(issues.length, 1);
  assert.equal(issues[0].rule, "lint-literals-stale");
  assert.match(issues[0].message, /30 seconds for agent handlers/);
});

test("does not let a literal satisfy itself via the lint_literals field", () => {
  const r = rec("a.b", "models.yaml", {
    value: "x",
    lint_literals: ["nowhere else on this record"],
  });
  assert.equal(checkLintLiteralsStale(r).length, 1);
});

test("ignores a record whose lint_literals is absent or malformed", () => {
  assert.deepEqual(checkLintLiteralsStale(rec("a.b")), []);
  assert.deepEqual(
    checkLintLiteralsStale(
      rec("a.b", "models.yaml", { lint_literals: "not a list" }),
    ),
    [],
  );
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `node --test tools/corpus/test/verify-records.test.mjs`
Expected: FAIL — `checkLintLiteralsStale` is not exported.

- [ ] **Step 3: Write the minimal implementation**

Add to the imports in `tools/corpus/verify-records.mjs`:

```javascript
import { isIndexableFieldValue } from "./data.mjs";
```

Append:

```javascript
// Fields that describe lint configuration rather than the value itself. A
// literal must not be satisfied by the very list it appears in, and `key` is
// excluded so a literal cannot be justified by the record's own name.
const NON_CONTENT_FIELDS = new Set([
  "key",
  "file",
  "lint",
  "lint_literals",
  "lint_fields",
  "lint_scope",
  "tags",
]);

// Catches a literal left behind after the field it shadowed changed. It cannot
// catch the opposite and more dangerous direction — a field value now covered
// by no literal at all — which belongs to the verify agent's judgment.
export function checkLintLiteralsStale(record) {
  const literals = record.lint_literals;
  if (!Array.isArray(literals) || literals.length === 0) return [];
  const haystack = Object.entries(record)
    .filter(
      ([field, v]) =>
        !NON_CONTENT_FIELDS.has(field) && isIndexableFieldValue(v),
    )
    .map(([, v]) => String(v));
  const issues = [];
  for (const literal of literals) {
    if (!isIndexableFieldValue(literal)) continue;
    const needle = String(literal);
    if (haystack.some((h) => h.includes(needle))) continue;
    issues.push({
      rule: "lint-literals-stale",
      message: `record ${record.key}: lint_literals entry ${JSON.stringify(needle)} is not a substring of any field value on the record; the field it shadowed has probably changed`,
    });
  }
  return issues;
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `node --test tools/corpus/test/verify-records.test.mjs`
Expected: PASS.

- [ ] **Step 5: Wire into `verifyCorpus`**

Add `checkLintLiteralsStale` to the `./verify-records.mjs` import in `cli.mjs`, and inside the existing per-record loop in `verifyCorpus` add:

```javascript
for (const i of checkLintLiteralsStale(record))
  issues.push({ ...i, path: path.join("data", record.file) });
```

- [ ] **Step 6: Confirm the real corpus is still clean**

Run: `node tools/corpus/cli.mjs verify .`
Expected: `verify: clean`. All 13 literal-bearing records pass under substring semantics.

If any record fires here, **the rule is what needs examining first** — the contract blesses fragment literals, so a fire means the substring logic or the excluded-field set is wrong, not that the seed is.

- [ ] **Step 7: Mutation proof**

Temporarily change `h.includes(needle)` to `h === needle`. Run `node tools/corpus/cli.mjs verify .` and confirm it now reports issues against `data/claude-code.yaml` — this is the equality bug the rule exists to avoid. Then run the tests, confirm the fragment test fails, restore, and confirm green.

- [ ] **Step 8: Run the full suite and both gates**

Run: `npm test && node tools/corpus/cli.mjs render --check . && node tools/corpus/cli.mjs lint .`
Expected: tests pass, exit 0, `lint: clean`.

- [ ] **Step 9: Commit**

```bash
git add tools/corpus/verify-records.mjs tools/corpus/test/verify-records.test.mjs tools/corpus/cli.mjs
git commit -m "feat: verify lint_literals still match their record's fields"
```

---

### Task 4: Page front-matter rules

Three rules sharing one input: the parsed front-matter object. This is also where Review Focus items 1 and 2 are pinned.

**Files:**

- Create: `tools/corpus/verify-pages.mjs`
- Create: `tools/corpus/test/verify-pages.test.mjs`
- Modify: `tools/corpus/cli.mjs`

**Interfaces:**

- Consumes: `parseFrontmatter` from `./frontmatter.mjs` (used by the caller, not the rules).
- Produces:
  - `checkAppliesToShape(data) -> Array<{rule, message}>`
  - `checkRelatedPaths(data, exists) -> Array<{rule, message}>` where `exists` is `(relPath: string) => boolean`
  - `checkResearchRequired(data) -> Array<{rule, message}>`

- [ ] **Step 1: Write the failing tests**

Create `tools/corpus/test/verify-pages.test.mjs`:

```javascript
import test from "node:test";
import assert from "node:assert/strict";
import {
  checkAppliesToShape,
  checkRelatedPaths,
  checkResearchRequired,
} from "../verify-pages.mjs";

const fm = (extra = {}) => ({
  title: "Claude models",
  summary: "Model ids, prices and limits.",
  topic: "models",
  verified: "2026-09-16",
  applies_to: ["Anthropic API, read on 2026-09-16"],
  sources: ["https://example.invalid/docs"],
  related: [],
  ...extra,
});

test("accepts applies_to as a non-empty list of strings", () => {
  assert.deepEqual(checkAppliesToShape(fm()), []);
});

test("rejects applies_to given as an object", () => {
  const issues = checkAppliesToShape(
    fm({ applies_to: { "claude-code": ">=2.0" } }),
  );
  assert.equal(issues.length, 1);
  assert.equal(issues[0].rule, "frontmatter-applies-to-shape");
});

test("rejects an empty applies_to list", () => {
  assert.equal(checkAppliesToShape(fm({ applies_to: [] })).length, 1);
});

test("rejects a non-string entry inside applies_to", () => {
  assert.equal(checkAppliesToShape(fm({ applies_to: ["ok", 42] })).length, 1);
});

test("stays silent when applies_to is absent — that is frontmatter-required's job", () => {
  const d = fm();
  delete d.applies_to;
  assert.deepEqual(checkAppliesToShape(d), []);
});

test("returns no issues rather than throwing on null front-matter", () => {
  assert.deepEqual(checkAppliesToShape(null), []);
  assert.deepEqual(
    checkRelatedPaths(null, () => true),
    [],
  );
  assert.deepEqual(checkResearchRequired(null), []);
});

test("accepts an empty related list", () => {
  assert.deepEqual(
    checkRelatedPaths(fm({ related: [] }), () => false),
    [],
  );
});

test("accepts related paths that resolve", () => {
  assert.deepEqual(
    checkRelatedPaths(
      fm({ related: ["guides/models/comparison.md"] }),
      () => true,
    ),
    [],
  );
});

test("reports a related path that does not resolve", () => {
  const issues = checkRelatedPaths(
    fm({ related: ["guides/models/ghost.md"] }),
    () => false,
  );
  assert.equal(issues.length, 1);
  assert.equal(issues[0].rule, "related-path-unresolved");
  assert.match(issues[0].message, /ghost\.md/);
});

test("reports a non-string related entry without throwing", () => {
  const issues = checkRelatedPaths(fm({ related: [42] }), () => true);
  assert.equal(issues.length, 1);
  assert.equal(issues[0].rule, "related-path-unresolved");
});

test("accepts a seed page with no research artifact", () => {
  assert.deepEqual(checkResearchRequired(fm({ seed: true })), []);
});

test("accepts a non-seed page that has a research artifact", () => {
  assert.deepEqual(
    checkResearchRequired(fm({ research: "research/models/2026-10-09-x.md" })),
    [],
  );
});

test("reports a non-seed page with no research artifact", () => {
  const issues = checkResearchRequired(fm());
  assert.equal(issues.length, 1);
  assert.equal(issues[0].rule, "research-required");
});

test("treats seed: false as not a seed", () => {
  assert.equal(checkResearchRequired(fm({ seed: false })).length, 1);
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `node --test tools/corpus/test/verify-pages.test.mjs`
Expected: FAIL — cannot find module `../verify-pages.mjs`.

- [ ] **Step 3: Write the minimal implementation**

Create `tools/corpus/verify-pages.mjs`:

```javascript
// tools/corpus/verify-pages.mjs
// Page-level checks the contract assigns to the Verify stage. Every rule
// tolerates null front-matter: a page with none is already reported by lint's
// frontmatter-missing, and these rules must not throw on top of it.

export function checkAppliesToShape(data) {
  if (data == null || !("applies_to" in data)) return [];
  const v = data.applies_to;
  const bad = !Array.isArray(v)
    ? `must be a list of strings, got ${v === null ? "null" : typeof v}`
    : v.length === 0
      ? "must not be empty; name the product or scope, its version, and the date the docs were read"
      : v.some((e) => typeof e !== "string")
        ? "must contain only strings"
        : null;
  return bad
    ? [{ rule: "frontmatter-applies-to-shape", message: `applies_to ${bad}` }]
    : [];
}

export function checkRelatedPaths(data, exists) {
  if (data == null || !Array.isArray(data.related)) return [];
  const issues = [];
  for (const entry of data.related) {
    if (typeof entry !== "string") {
      issues.push({
        rule: "related-path-unresolved",
        message: `related entry must be a repo path string, got ${JSON.stringify(entry)}`,
      });
      continue;
    }
    if (exists(entry)) continue;
    issues.push({
      rule: "related-path-unresolved",
      message: `related path does not exist in the repository: ${entry}`,
    });
  }
  return issues;
}

// seed: true is permanent provenance — a page authored before the pipeline
// existed — so seeds are exempt forever. The rule's real subject is
// pipeline-authored pages, which have a research artifact by construction.
export function checkResearchRequired(data) {
  if (data == null) return [];
  if (data.seed === true) return [];
  if (typeof data.research === "string" && data.research.trim() !== "")
    return [];
  return [
    {
      rule: "research-required",
      message:
        "page is not a seed and names no research artifact; every pipeline-authored page must point at its grounding under research/",
    },
  ];
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `node --test tools/corpus/test/verify-pages.test.mjs`
Expected: PASS.

- [ ] **Step 5: Wire into `verifyCorpus`**

In `tools/corpus/cli.mjs`, add the import:

```javascript
import {
  checkAppliesToShape,
  checkRelatedPaths,
  checkResearchRequired,
} from "./verify-pages.mjs";
```

and add a page loop to `verifyCorpus`, after the record loop:

```javascript
const exists = (rel) => fs.existsSync(path.join(root, rel));
for (const file of guidePaths(root)) {
  const text = fs.readFileSync(file, "utf8");
  const { data } = parseFrontmatter(text);
  const rel = path.relative(root, file);
  for (const i of [
    ...checkAppliesToShape(data),
    ...checkRelatedPaths(data, exists),
    ...checkResearchRequired(data),
  ])
    issues.push({ ...i, path: rel });
}
```

- [ ] **Step 6: Confirm the real corpus is still clean**

Run: `node tools/corpus/cli.mjs verify .`
Expected: `verify: clean`. All five guides carry `applies_to` as a list of strings, all six `related` entries resolve, and all five are `seed: true` so `research-required` matches nothing.

`research-required` matching zero pages today is the designed outcome, not a defect — see the spec's redesign section. Do not "fix" it by removing `seed: true` from a guide.

- [ ] **Step 7: Mutation proof**

Temporarily change `if (data.seed === true) return [];` to `return [];`. Run the tests and confirm the non-seed test fails. Restore. Then temporarily change `!Array.isArray(v)` to `false` and confirm the object-shaped test fails. Restore and confirm green.

- [ ] **Step 8: Run the full suite and both gates**

Run: `npm test && node tools/corpus/cli.mjs render --check . && node tools/corpus/cli.mjs lint .`
Expected: tests pass, exit 0, `lint: clean`.

- [ ] **Step 9: Commit**

```bash
git add tools/corpus/verify-pages.mjs tools/corpus/test/verify-pages.test.mjs tools/corpus/cli.mjs
git commit -m "feat: verify applies_to shape, related paths, and research requirement"
```

---

### Task 5: Template sections

The eight numbered headings must be present, correctly numbered, and in order. **Only `##` headings count.** `comparison.md` has an unnumbered `###` inside section 6 and `software-engineering.md` has `### 4.1`–`4.9` and `### 5.1`–`5.8`; subheadings are unconstrained. Headings inside fenced code blocks are ignored.

**Files:**

- Modify: `tools/corpus/verify-pages.mjs`
- Modify: `tools/corpus/test/verify-pages.test.mjs`
- Modify: `tools/corpus/cli.mjs`

**Interfaces:**

- Produces: `checkTemplateSections(text) -> Array<{rule, message, line?}>`; `numberedSections(text) -> Array<{n: number, line: number, title: string}>`.

- [ ] **Step 1: Write the failing tests**

Add `checkTemplateSections` and `numberedSections` to the import, then append:

````javascript
const eightSections = (mutate = (xs) => xs) =>
  mutate([
    "## 1. What this covers / who it's for",
    "## 2. The 60-second version",
    "## 3. How it actually works",
    "## 4. Patterns that hold up",
    "## 5. Edge cases and failure modes",
    "## 6. Where this rots",
    "## 7. Proofs",
    "## 8. Sources",
  ]).join("\n\nbody text\n\n");

test("accepts the eight numbered headings in order", () => {
  assert.deepEqual(checkTemplateSections(eightSections()), []);
});

test("ignores ### subheadings, numbered or not", () => {
  const text = eightSections() + "\n\n### 4.1 A subsection\n\n### Unnumbered\n";
  assert.deepEqual(checkTemplateSections(text), []);
});

test("ignores a numbered heading inside a fenced code block", () => {
  const text =
    eightSections() + "\n\n```markdown\n## 9. Not a real section\n```\n";
  assert.deepEqual(checkTemplateSections(text), []);
});

test("reports a missing section", () => {
  const text = eightSections((xs) => xs.filter((h) => !h.startsWith("## 7.")));
  const issues = checkTemplateSections(text);
  assert.equal(issues.length, 1);
  assert.equal(issues[0].rule, "template-sections");
  assert.match(issues[0].message, /7/);
});

test("reports sections in the wrong order", () => {
  const text = eightSections((xs) => {
    const out = [...xs];
    [out[2], out[3]] = [out[3], out[2]];
    return out;
  });
  assert.equal(
    checkTemplateSections(text).some((i) => i.rule === "template-sections"),
    true,
  );
});

test("reports a duplicated section number", () => {
  const text = eightSections((xs) => [...xs, "## 8. Sources again"]);
  assert.equal(checkTemplateSections(text).length >= 1, true);
});

test("numberedSections reports the line each heading sits on", () => {
  const found = numberedSections("intro\n\n## 1. First\n\n## 2. Second\n");
  assert.deepEqual(
    found.map((s) => [s.n, s.line]),
    [
      [1, 3],
      [2, 5],
    ],
  );
});
````

- [ ] **Step 2: Run the tests to verify they fail**

Run: `node --test tools/corpus/test/verify-pages.test.mjs`
Expected: FAIL — `checkTemplateSections` is not exported.

- [ ] **Step 3: Write the minimal implementation**

Append to `tools/corpus/verify-pages.mjs`:

````javascript
const EXPECTED_SECTIONS = 8;
const NUMBERED_H2 = /^##\s+(\d+)\.\s*(.*)$/;

// Lines outside fenced code blocks only: a guide may quote the template inside
// a fence, and that is documentation, not structure.
export function numberedSections(text) {
  const out = [];
  let fenced = false;
  const lines = text.split("\n");
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (/^\s*(```|~~~)/.test(line)) {
      fenced = !fenced;
      continue;
    }
    if (fenced) continue;
    const m = NUMBERED_H2.exec(line);
    if (m) out.push({ n: Number(m[1]), line: i + 1, title: m[2].trim() });
  }
  return out;
}

export function checkTemplateSections(text) {
  const found = numberedSections(text);
  const issues = [];
  const seen = found.map((s) => s.n);
  for (let n = 1; n <= EXPECTED_SECTIONS; n++) {
    if (!seen.includes(n)) {
      issues.push({
        rule: "template-sections",
        message: `missing template section: expected a "## ${n}." heading`,
      });
    }
  }
  const extras = found.filter((s) => s.n < 1 || s.n > EXPECTED_SECTIONS);
  for (const s of extras) {
    issues.push({
      rule: "template-sections",
      message: `unexpected numbered section "## ${s.n}."; the template has ${EXPECTED_SECTIONS} sections`,
      line: s.line,
    });
  }
  for (let i = 1; i < found.length; i++) {
    if (found[i].n <= found[i - 1].n) {
      issues.push({
        rule: "template-sections",
        message: `template section "## ${found[i].n}." appears after "## ${found[i - 1].n}."; sections must run 1 to ${EXPECTED_SECTIONS} in order`,
        line: found[i].line,
      });
    }
  }
  return issues;
}
````

- [ ] **Step 4: Run the tests to verify they pass**

Run: `node --test tools/corpus/test/verify-pages.test.mjs`
Expected: PASS.

- [ ] **Step 5: Wire into `verifyCorpus`**

Add `checkTemplateSections` to the `./verify-pages.mjs` import in `cli.mjs` and add `...checkTemplateSections(text),` to the spread array in the page loop.

- [ ] **Step 6: Confirm the real corpus is still clean**

Run: `node tools/corpus/cli.mjs verify .`
Expected: `verify: clean`. All five guides use `## 1.`–`## 8.` — confirmed for `software-engineering.md` at lines 40, 45, 103, 119, 252, 354, 380, 390.

- [ ] **Step 7: Mutation proof**

Temporarily remove the fence tracking (delete the `if (/^\s*(```|~~~)/...)` block and the `if (fenced) continue;` line). Run the tests and confirm the fenced-heading test fails. Restore and confirm green.

- [ ] **Step 8: Run the full suite and both gates**

Run: `npm test && node tools/corpus/cli.mjs render --check . && node tools/corpus/cli.mjs lint .`
Expected: tests pass, exit 0, `lint: clean`.

- [ ] **Step 9: Commit**

```bash
git add tools/corpus/verify-pages.mjs tools/corpus/test/verify-pages.test.mjs tools/corpus/cli.mjs
git commit -m "feat: verify the eight-part page template structure"
```

---

### Task 6: Evidence labels

Scoped to lines beginning `Evidence:` — **not** prose. Every guide explains the label system with a bolded `**Verified**` in ordinary prose (`hooks.md:130`, `context-management.md:108`, `software-engineering.md:121`, `claude-models.md:77`, `comparison.md:128`, and `hooks.md:315`); a rule that scanned the whole body would fire on all five pages and would punish them for honestly disclaiming Verified status.

Multiple labels on one `Evidence:` line are **legal and in use** (`software-engineering.md:268`, `:352`), because the contract requires each part of a mixed claim to be labeled separately.

The "**Verified** requires a shipping proof" check is deliberately **not** implemented: `proof.yaml` carries a free-text `claim` with no machine link to a guide, so it is undecidable without adding a contract element the foundation ruled out. It belongs to the verify agent.

**Files:**

- Modify: `tools/corpus/verify-pages.mjs`
- Modify: `tools/corpus/test/verify-pages.test.mjs`
- Modify: `tools/corpus/cli.mjs`

**Interfaces:**

- Produces: `checkEvidenceLabels(text) -> Array<{rule, message, line}>`; `VALID_LABELS` (a frozen array of the three exact spellings).

- [ ] **Step 1: Write the failing tests**

Add `checkEvidenceLabels` and `VALID_LABELS` to the import, then append:

````javascript
test("exports exactly the three label spellings", () => {
  assert.deepEqual([...VALID_LABELS], ["Verified", "Documented", "Plausible"]);
});

test("accepts a single-label Evidence line", () => {
  const text =
    "Evidence: **Documented** — [caching](https://x.invalid), read 2026-09-16.\n";
  assert.deepEqual(checkEvidenceLabels(text), []);
});

test("accepts a mixed-label Evidence line", () => {
  const text =
    "Evidence: the setup is **Documented** ([ref](https://x.invalid)); the failure shapes are **Plausible**.\n";
  assert.deepEqual(checkEvidenceLabels(text), []);
});

test("ignores bolded Verified in ordinary prose", () => {
  const text =
    "Nothing on this page is **Verified**: no proof in this repository backs these claims.\n";
  assert.deepEqual(checkEvidenceLabels(text), []);
});

test("reports a miscased label on an Evidence line", () => {
  const text = "Evidence: **documented** — [ref](https://x.invalid).\n";
  const issues = checkEvidenceLabels(text);
  assert.equal(issues.length, 1);
  assert.equal(issues[0].rule, "evidence-label-invalid");
  assert.match(issues[0].message, /documented/);
});

test("reports an Evidence line whose only bold text is not a label", () => {
  const text = "Evidence: **the vendor changelog** says so.\n";
  const issues = checkEvidenceLabels(text);
  assert.equal(issues.length, 1);
  assert.match(issues[0].message, /no evidence label/);
});

test("reports an Evidence line with no bold text at all", () => {
  assert.equal(checkEvidenceLabels("Evidence: it seemed right.\n").length, 1);
});

test("reports the line number of the offending Evidence line", () => {
  const text = "intro\n\nEvidence: **plausible** — a guess.\n";
  assert.equal(checkEvidenceLabels(text)[0].line, 3);
});

test("ignores an Evidence line inside a fenced code block", () => {
  const text = "```\nEvidence: **documented** — sample.\n```\n";
  assert.deepEqual(checkEvidenceLabels(text), []);
});
````

- [ ] **Step 2: Run the tests to verify they fail**

Run: `node --test tools/corpus/test/verify-pages.test.mjs`
Expected: FAIL — `checkEvidenceLabels` is not exported.

- [ ] **Step 3: Write the minimal implementation**

Append to `tools/corpus/verify-pages.mjs`:

````javascript
export const VALID_LABELS = Object.freeze([
  "Verified",
  "Documented",
  "Plausible",
]);
const LABEL_LOOKUP = new Map(VALID_LABELS.map((l) => [l.toLowerCase(), l]));
const BOLD = /\*\*([^*]+)\*\*/g;

// Only lines that ARE an Evidence line. Every guide discusses **Verified** in
// prose while disclaiming it; scanning the body would fire on all of them.
export function checkEvidenceLabels(text) {
  const issues = [];
  let fenced = false;
  const lines = text.split("\n");
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (/^\s*(```|~~~)/.test(line)) {
      fenced = !fenced;
      continue;
    }
    if (fenced || !/^Evidence:/.test(line)) continue;
    let valid = 0;
    for (const m of line.matchAll(BOLD)) {
      const bold = m[1].trim();
      const canonical = LABEL_LOOKUP.get(bold.toLowerCase());
      if (canonical === undefined) continue; // bolding something else is fine
      if (canonical === bold) {
        valid++;
      } else {
        issues.push({
          rule: "evidence-label-invalid",
          message: `evidence label ${JSON.stringify(bold)} must be spelled exactly ${JSON.stringify(canonical)}`,
          line: i + 1,
        });
      }
    }
    if (valid === 0) {
      issues.push({
        rule: "evidence-label-invalid",
        message: `Evidence line carries no evidence label; it must bold at least one of ${VALID_LABELS.join(", ")}`,
        line: i + 1,
      });
    }
  }
  return issues;
}
````

- [ ] **Step 4: Run the tests to verify they pass**

Run: `node --test tools/corpus/test/verify-pages.test.mjs`
Expected: PASS.

- [ ] **Step 5: Wire into `verifyCorpus`**

Add `checkEvidenceLabels` to the import and `...checkEvidenceLabels(text),` to the spread array.

- [ ] **Step 6: Confirm the real corpus is still clean**

Run: `node tools/corpus/cli.mjs verify .`
Expected: `verify: clean`.

If an `Evidence:` line fires here, inspect it before changing anything. The contract is the authority on how labels are written; if the page follows the contract and the rule disagrees, **the rule is wrong**. Record which line fired and why in the commit message.

- [ ] **Step 7: Mutation proof**

Temporarily change `!/^Evidence:/.test(line)` to `false` so every line is scanned. Run `node tools/corpus/cli.mjs verify .` and confirm it now reports issues on all five guides — this is the false-positive the scoping prevents. Restore, confirm `verify: clean`, run the tests, confirm green.

- [ ] **Step 8: Run the full suite and both gates**

Run: `npm test && node tools/corpus/cli.mjs render --check . && node tools/corpus/cli.mjs lint .`
Expected: tests pass, exit 0, `lint: clean`.

- [ ] **Step 9: Commit**

```bash
git add tools/corpus/verify-pages.mjs tools/corpus/test/verify-pages.test.mjs tools/corpus/cli.mjs
git commit -m "feat: verify evidence label spelling on Evidence lines only"
```

---

### Task 7: Referenced records

`rots-table-incomplete` needs the set of records a page actually references. Nothing exports that today — `derivePageVolatility` computes it internally and returns only a volatility. This task extracts it as its own tested function so Task 8 can use it.

**Files:**

- Modify: `tools/corpus/verify-pages.mjs`
- Modify: `tools/corpus/test/verify-pages.test.mjs`

**Interfaces:**

- Consumes: `findBlocks` from `./markers.mjs` (returns blocks with `kind`, `attrs`, `start`, `unterminated`).
- Produces: `referencedRecordKeys(text, records) -> Set<string>`.

- [ ] **Step 1: Write the failing tests**

Add `referencedRecordKeys` to the import, then append:

```javascript
const RECORDS = [
  { key: "a.one", value: "1", tags: ["alpha"], file: "a.yaml" },
  { key: "a.two", value: "2", tags: ["alpha", "beta"], file: "a.yaml" },
  { key: "b.one", value: "3", tags: ["beta"], file: "b.yaml" },
  { key: "c.none", value: "4", file: "c.yaml" },
];

test("collects the key of a terminated corpus:data block", () => {
  const text = "<!-- corpus:data key=a.one -->1<!-- /corpus:data -->\n";
  assert.deepEqual([...referencedRecordKeys(text, RECORDS)], ["a.one"]);
});

test("collects every record a tagged corpus:table selects", () => {
  const text =
    "<!-- corpus:table fields=key,value tag=beta -->\n\n| x |\n\n<!-- /corpus:table -->\n";
  assert.deepEqual([...referencedRecordKeys(text, RECORDS)].sort(), [
    "a.two",
    "b.one",
  ]);
});

test("a table with no tag references every record in the corpus", () => {
  const text =
    "<!-- corpus:table fields=key,value -->\n\n| x |\n\n<!-- /corpus:table -->\n";
  assert.equal(referencedRecordKeys(text, RECORDS).size, RECORDS.length);
});

test("ignores an unterminated block", () => {
  const text =
    "<!-- corpus:data key=a.one -->\n<!-- corpus:data key=a.two -->x<!-- /corpus:data -->\n";
  const keys = referencedRecordKeys(text, RECORDS);
  assert.equal(keys.has("a.one"), false);
  assert.equal(keys.has("a.two"), true);
});

test("returns an empty set for a page with no marker blocks", () => {
  assert.equal(referencedRecordKeys("just prose\n", RECORDS).size, 0);
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `node --test tools/corpus/test/verify-pages.test.mjs`
Expected: FAIL — `referencedRecordKeys` is not exported.

- [ ] **Step 3: Write the minimal implementation**

Add to the imports in `tools/corpus/verify-pages.mjs`:

```javascript
import { findBlocks } from "./markers.mjs";
```

Append:

```javascript
// The records a page actually renders. Must agree with render's selection
// exactly, including that a corpus:table with no tag selects the whole corpus
// — which is why omitting a tag makes a page as volatile as the most volatile
// record anywhere.
export function referencedRecordKeys(text, records) {
  const keys = new Set();
  for (const block of findBlocks(text)) {
    if (block.unterminated) continue;
    if (block.kind === "data") {
      if (block.attrs.key) keys.add(block.attrs.key);
      continue;
    }
    if (block.kind !== "table") continue;
    const tag = block.attrs.tag;
    for (const r of records) {
      if (tag == null || [].concat(r.tags ?? []).includes(tag)) keys.add(r.key);
    }
  }
  return keys;
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `node --test tools/corpus/test/verify-pages.test.mjs`
Expected: PASS.

- [ ] **Step 5: Mutation proof**

Temporarily change `if (block.unterminated) continue;` to a no-op. Run the tests and confirm the unterminated test fails. Restore and confirm green.

- [ ] **Step 6: Run the full suite**

Run: `npm test`
Expected: all tests pass.

- [ ] **Step 7: Commit**

```bash
git add tools/corpus/verify-pages.mjs tools/corpus/test/verify-pages.test.mjs
git commit -m "feat: extract the set of records a page references"
```

---

### Task 8: Section 6 completeness

The highest-value rule in the set. `refresh` executes section 6, so an incomplete section 6 makes a future refresh silently under-check a page **and still report success under a fresh `verified` date** — a failure invisible by construction.

**Use the loose reading: every referenced record's key must appear somewhere in section 6.** The strict reading — one table row per record — fails `comparison.md` today, which deliberately collapses three Claude records into a single row to document the shared-record relationship the refresh design depends on. That is good authoring, and a rule that punishes it is a bad rule.

**Files:**

- Modify: `tools/corpus/verify-pages.mjs`
- Modify: `tools/corpus/test/verify-pages.test.mjs`
- Modify: `tools/corpus/cli.mjs`

**Interfaces:**

- Consumes: `referencedRecordKeys` from Task 7.
- Produces: `sectionSixText(text) -> string | null`; `checkRotsTable(text, records) -> Array<{rule, message, line?}>`.

- [ ] **Step 1: Write the failing tests**

Add `checkRotsTable` and `sectionSixText` to the import, then append:

```javascript
const withRots = (body) =>
  [
    "## 5. Edge cases and failure modes",
    "prose",
    "## 6. Where this rots",
    body,
    "## 7. Proofs",
    "None yet.",
  ].join("\n\n");

test("sectionSixText returns the body between section 6 and section 7", () => {
  const got = sectionSixText(withRots("the rot table"));
  assert.match(got, /the rot table/);
  assert.equal(/None yet/.test(got), false);
});

test("sectionSixText returns null when there is no section 6", () => {
  assert.equal(sectionSixText("## 1. Intro\n\nprose\n"), null);
});

test("accepts a page whose section 6 names every referenced record", () => {
  const text =
    "<!-- corpus:data key=a.one -->1<!-- /corpus:data -->\n\n" +
    withRots("| Claim | Record |\n| --- | --- |\n| x | `a.one` |");
  assert.deepEqual(checkRotsTable(text, RECORDS), []);
});

test("accepts several records collapsed into one row", () => {
  const text =
    "<!-- corpus:table fields=key,value tag=beta -->\n\n| x |\n\n<!-- /corpus:table -->\n\n" +
    withRots("| Claim | Record |\n| --- | --- |\n| rows | `a.two`, `b.one` |");
  assert.deepEqual(checkRotsTable(text, RECORDS), []);
});

test("reports a referenced record missing from section 6", () => {
  const text =
    "<!-- corpus:table fields=key,value tag=beta -->\n\n| x |\n\n<!-- /corpus:table -->\n\n" +
    withRots("| Claim | Record |\n| --- | --- |\n| rows | `a.two` |");
  const issues = checkRotsTable(text, RECORDS);
  assert.equal(issues.length, 1);
  assert.equal(issues[0].rule, "rots-table-incomplete");
  assert.match(issues[0].message, /b\.one/);
});

test("reports a page that references records but has no section 6 at all", () => {
  const text = "<!-- corpus:data key=a.one -->1<!-- /corpus:data -->\n";
  const issues = checkRotsTable(text, RECORDS);
  assert.equal(issues.length, 1);
  assert.match(issues[0].message, /no "## 6\." section/);
});

test("stays silent on a page that references no records", () => {
  assert.deepEqual(checkRotsTable(withRots("nothing rots here"), RECORDS), []);
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `node --test tools/corpus/test/verify-pages.test.mjs`
Expected: FAIL — `checkRotsTable` is not exported.

- [ ] **Step 3: Write the minimal implementation**

Append to `tools/corpus/verify-pages.mjs`:

```javascript
// Section 6 runs from its own heading to the next numbered ## heading.
export function sectionSixText(text) {
  const sections = numberedSections(text);
  const six = sections.find((s) => s.n === 6);
  if (!six) return null;
  const after = sections.find((s) => s.line > six.line);
  const lines = text.split("\n");
  return lines
    .slice(six.line, after ? after.line - 1 : lines.length)
    .join("\n");
}

// Loose reading: the key must appear SOMEWHERE in section 6, not as its own
// table row. comparison.md deliberately collapses three shared Claude records
// into one row; that documents a real relationship and must stay legal.
export function checkRotsTable(text, records) {
  const referenced = referencedRecordKeys(text, records);
  if (referenced.size === 0) return [];
  const six = sectionSixText(text);
  if (six === null) {
    return [
      {
        rule: "rots-table-incomplete",
        message: `page references ${referenced.size} record(s) but has no "## 6." section; refresh executes section 6, so there is nothing for it to work`,
      },
    ];
  }
  const missing = [...referenced].filter((k) => !six.includes(k)).sort();
  if (missing.length === 0) return [];
  return [
    {
      rule: "rots-table-incomplete",
      message: `section 6 does not mention referenced record(s): ${missing.join(", ")}; refresh would silently skip them`,
    },
  ];
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `node --test tools/corpus/test/verify-pages.test.mjs`
Expected: PASS.

- [ ] **Step 5: Wire into `verifyCorpus`**

Add `checkRotsTable` to the import and `...checkRotsTable(text, records),` to the spread array in the page loop.

- [ ] **Step 6: Confirm the real corpus is still clean**

Run: `node tools/corpus/cli.mjs verify .`
Expected: `verify: clean`. All 29 current record references appear in their page's section 6 under the loose reading.

- [ ] **Step 7: Mutation proof**

Temporarily change `six.includes(k)` to a strict row check — `new RegExp(`^\\|[^|]_\`${k}\`[^|]_\\|`, "m").test(six)`. Run `node tools/corpus/cli.mjs verify .` and confirm it now reports against `guides/models/comparison.md` — this is the strict-reading false positive the loose reading avoids. Restore, confirm `verify: clean`, run the tests, confirm green.

- [ ] **Step 8: Run the full suite and both gates**

Run: `npm test && node tools/corpus/cli.mjs render --check . && node tools/corpus/cli.mjs lint .`
Expected: tests pass, exit 0, `lint: clean`.

- [ ] **Step 9: Commit**

```bash
git add tools/corpus/verify-pages.mjs tools/corpus/test/verify-pages.test.mjs tools/corpus/cli.mjs
git commit -m "feat: verify section 6 names every record a page references"
```

---

### Task 9: Known lint gap, Form 1

The contract documents two forms that hide a known value from the bare-value scan and tells reviewers to check for both by eye. **Only Form 1 is automated:** a URL-like link destination in angle brackets containing a space, e.g. `[x](<./text with a value>)`, where the whole bracketed span is treated as a URL and its contents escape the scan.

Form 2 — a bare URL running into following text through `.` or `;` — stays a human check. It is undecidable: `.` appears in every hostname, `;` is legal in a query string, and the only precise formulation flags the per-model vendor URLs the contract explicitly permits in a record's `source`.

**Files:**

- Modify: `tools/corpus/verify-pages.mjs`
- Modify: `tools/corpus/test/verify-pages.test.mjs`
- Modify: `tools/corpus/cli.mjs`

**Interfaces:**

- Produces: `checkKnownLintGapForm(text) -> Array<{rule, message, line}>`.

- [ ] **Step 1: Write the failing tests**

Add `checkKnownLintGapForm` to the import, then append:

```javascript
test("accepts an ordinary angle-bracket destination with no space", () => {
  assert.deepEqual(
    checkKnownLintGapForm("see [x](<./guides/models/comparison.md>)\n"),
    [],
  );
});

test("accepts an ordinary link destination", () => {
  assert.deepEqual(
    checkKnownLintGapForm("see [x](https://example.invalid/a%20b)\n"),
    [],
  );
});

test("reports an angle-bracket destination containing a space", () => {
  const issues = checkKnownLintGapForm("see [x](<./text with 200000 in it>)\n");
  assert.equal(issues.length, 1);
  assert.equal(issues[0].rule, "known-lint-gap-form");
  assert.equal(issues[0].line, 1);
});

test("reports each occurrence on its own line", () => {
  const text = "a [x](<a b>)\n\nc [y](<c d>)\n";
  assert.deepEqual(
    checkKnownLintGapForm(text).map((i) => i.line),
    [1, 3],
  );
});

test("does not report a bare URL running into text — Form 2 is not automated", () => {
  assert.deepEqual(
    checkKnownLintGapForm("see https://example.invalid/x;200000 here\n"),
    [],
  );
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `node --test tools/corpus/test/verify-pages.test.mjs`
Expected: FAIL — `checkKnownLintGapForm` is not exported.

- [ ] **Step 3: Write the minimal implementation**

Append to `tools/corpus/verify-pages.mjs`:

```javascript
// Form 1 of the documented lint gaps: an angle-bracket link destination
// containing a space is treated wholly as a URL, so a known value inside it
// escapes the bare-value scan. Form 2 is undecidable and stays a human check.
const ANGLE_DESTINATION_WITH_SPACE = /\]\(<[^>\n]*\s[^>\n]*>\)/;

export function checkKnownLintGapForm(text) {
  const issues = [];
  const lines = text.split("\n");
  for (let i = 0; i < lines.length; i++) {
    if (!ANGLE_DESTINATION_WITH_SPACE.test(lines[i])) continue;
    issues.push({
      rule: "known-lint-gap-form",
      message:
        "angle-bracket link destination contains a space; the whole span is read as a URL, so any known value inside it escapes the bare-value scan",
      line: i + 1,
    });
  }
  return issues;
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `node --test tools/corpus/test/verify-pages.test.mjs`
Expected: PASS.

- [ ] **Step 5: Wire into `verifyCorpus`**

Add `checkKnownLintGapForm` to the import and `...checkKnownLintGapForm(text),` to the spread array.

- [ ] **Step 6: Confirm the real corpus is still clean**

Run: `node tools/corpus/cli.mjs verify .`
Expected: `verify: clean`.

- [ ] **Step 7: Mutation proof**

Temporarily change `[^>\n]*\s[^>\n]*` to `[^>\n]*`. Run the tests and confirm the no-space acceptance test fails. Restore and confirm green.

- [ ] **Step 8: Run the full suite and both gates**

Run: `npm test && node tools/corpus/cli.mjs render --check . && node tools/corpus/cli.mjs lint .`
Expected: tests pass, exit 0, `lint: clean`.

- [ ] **Step 9: Commit**

```bash
git add tools/corpus/verify-pages.mjs tools/corpus/test/verify-pages.test.mjs tools/corpus/cli.mjs
git commit -m "feat: verify Form 1 of the documented lint gaps"
```

---

### Task 10: End-to-end CLI coverage and the adversarial fixture

The unit tests prove each rule in isolation. This proves `verifyCorpus` wires them all up, stamps `path` correctly, and exits with the right code — the same shape `test/cli.test.mjs` already uses for lint and render.

**Files:**

- Create: `tools/corpus/test/verify-cli.test.mjs`
- Create: `tools/corpus/test/fixtures/corpus/guides/verify/unverifiable.md`
- Modify: `tools/corpus/test/fixtures/corpus/data/` (add a fixture data file)

**Interfaces:**

- Consumes: `verifyCorpus` from `../cli.mjs`.

- [ ] **Step 1: Inspect the existing fixture corpus**

Run: `find tools/corpus/test/fixtures/corpus -type f | sort && cat tools/corpus/test/fixtures/corpus/meta/taxonomy.yaml`

Note the existing clean and dirty pages and the fixture data records. The new fixture page must not disturb the existing lint and render assertions in `test/cli.test.mjs`, which filter by filename — so give the new page a distinct name and confirm those tests still pass.

- [ ] **Step 2: Write the failing test**

Create `tools/corpus/test/verify-cli.test.mjs`:

```javascript
// tools/corpus/test/verify-cli.test.mjs
import test from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { verifyCorpus } from "../cli.mjs";

const ROOT = new URL("./fixtures/corpus/", import.meta.url).pathname;
const CLI = new URL("../cli.mjs", import.meta.url).pathname;
const REPO = new URL("../../../", import.meta.url).pathname;

test("the unverifiable fixture page trips every page-level rule", () => {
  const rules = new Set(
    verifyCorpus(ROOT)
      .filter((i) => i.path.endsWith("unverifiable.md"))
      .map((i) => i.rule),
  );
  for (const rule of [
    "frontmatter-applies-to-shape",
    "related-path-unresolved",
    "research-required",
    "template-sections",
    "evidence-label-invalid",
    "rots-table-incomplete",
    "known-lint-gap-form",
  ]) {
    assert.equal(rules.has(rule), true, `expected rule to fire: ${rule}`);
  }
});

test("every issue carries a path", () => {
  for (const i of verifyCorpus(ROOT)) {
    assert.equal(typeof i.path, "string");
    assert.equal(i.path.length > 0, true);
  }
});

test("the real corpus verifies clean", () => {
  assert.deepEqual(verifyCorpus(REPO), []);
});

test("the CLI exits 1 and prints a count when there are issues", () => {
  const r = spawnSync(process.execPath, [CLI, "verify", ROOT], {
    encoding: "utf8",
  });
  assert.equal(r.status, 1);
  assert.match(r.stdout, /verify: \d+ issue\(s\)/);
});

test("the CLI exits 0 and prints clean on the real corpus", () => {
  const r = spawnSync(process.execPath, [CLI, "verify", REPO], {
    encoding: "utf8",
  });
  assert.equal(r.status, 0);
  assert.match(r.stdout, /verify: clean/);
});

test("verify rejects --write", () => {
  const r = spawnSync(process.execPath, [CLI, "verify", "--write", REPO], {
    encoding: "utf8",
  });
  assert.equal(r.status, 2);
  assert.match(r.stderr, /usage:/);
});
```

- [ ] **Step 3: Run the test to verify it fails**

Run: `node --test tools/corpus/test/verify-cli.test.mjs`
Expected: FAIL — the fixture page does not exist, so no rules fire.

- [ ] **Step 4: Create the adversarial fixture page**

Create `tools/corpus/test/fixtures/corpus/guides/verify/unverifiable.md`. Use the topic list from the fixture taxonomy read in Step 1; substitute a real fixture topic for `models` and a real fixture record key for `fixture.value.one` if they differ.

```markdown
---
title: Unverifiable
summary: A page that trips every page-level verify rule at once.
topic: models
verified: "2026-09-16"
applies_to: { thing: ">=1.0" }
sources: ["https://example.invalid/docs"]
related: ["guides/does/not/exist.md"]
---

## 1. What this covers / who it's for

Trips every page-level rule.

## 2. The 60-second version

<!-- corpus:data key=fixture.value.one -->x<!-- /corpus:data -->

## 3. How it actually works

See [a link](<./a destination with spaces>).

## 4. Patterns that hold up

Evidence: **documented** — miscased on purpose.

## 5. Edge cases and failure modes

None.

## 7. Proofs

Section 6 is missing on purpose, and section 8 with it.
```

This page has no `## 6.` and no `## 8.`, an object-shaped `applies_to`, an unresolved `related` entry, no `seed` and no `research`, a miscased evidence label, and an angle-bracket destination containing spaces.

- [ ] **Step 5: Delete any hook-generated directory artifacts**

Run: `rm -rf tools/corpus/test/fixtures/corpus/guides/verify/.claude && find tools/corpus/test/fixtures/corpus/guides/verify -type f`
Expected: only `unverifiable.md`.

- [ ] **Step 6: Run the test to verify it passes**

Run: `node --test tools/corpus/test/verify-cli.test.mjs`
Expected: PASS.

- [ ] **Step 7: Confirm the new fixture did not disturb existing tests**

Run: `npm test`
Expected: all tests pass, 0 failures — including the existing `test/cli.test.mjs` lint, render and ledger assertions.

If a pre-existing test now fails, the fixture page is being picked up by an assertion that does not filter by filename. Fix the fixture or tighten that assertion's filter; do not weaken what it checks.

- [ ] **Step 8: Run both existing gates**

Run: `node tools/corpus/cli.mjs render --check . && node tools/corpus/cli.mjs lint .`
Expected: exit 0, no `would render:` line, `lint: clean`. The fixture lives under `test/fixtures/`, not `guides/`, so the real corpus is unaffected.

- [ ] **Step 9: Commit**

```bash
git add tools/corpus/test/verify-cli.test.mjs tools/corpus/test/fixtures/corpus/guides/verify/unverifiable.md
git commit -m "test: cover corpus verify end-to-end with an adversarial fixture page"
```

---

### Task 11: Relocate `comparison.md`'s section 6 retrospective

Section 6 of `guides/models/comparison.md` carries a long foundation-era retrospective whose content is partly stale — it describes toolchain limitations that later tasks resolved. Section 6 is what `refresh` will execute, `comparison.md` is in the first refresh unit, and `rots-table-incomplete` cannot see this problem because every record key is present.

**Files:**

- Modify: `guides/models/comparison.md`

- [ ] **Step 1: Read section 6 in full**

Run: `sed -n "$(grep -n '^## 6\.' guides/models/comparison.md | cut -d: -f1),$(grep -n '^## 7\.' guides/models/comparison.md | cut -d: -f1)p" guides/models/comparison.md`

Identify which paragraphs are (a) the contract-required content — the value table, the identifier re-check list, values lint cannot guard, dated studies, deliberately absent — and which are (b) retrospective narrative about how the corpus toolchain came to be.

- [ ] **Step 2: Verify which retrospective claims are now false**

For each retrospective claim about toolchain behavior, check it against the current code. The known-stale example: statements that row order follows load order and that per-model URLs cannot be used were resolved by the foundation's later tasks.

Run: `grep -n 'sort\|order_by\|localeCompare' tools/corpus/render.mjs | head` and `grep -n 'sources' CLAUDE.md | head`

- [ ] **Step 3: Rewrite section 6 to contain only what the contract requires**

Keep: the `Claim | Record | Volatility | Why it moves` table, the identifier re-check list with safety-relevant entries first, the values lint cannot guard, the dated-studies paragraph, and what is deliberately absent.

Remove: the toolchain retrospective. Do not relocate it into another section of the guide — it is project history, not reader-facing guidance, and it already lives in the foundation spec's "Amendments from seeds" section and in git history.

- [ ] **Step 4: Confirm every referenced record is still named**

Run: `node tools/corpus/cli.mjs verify .`
Expected: `verify: clean`. If `rots-table-incomplete` fires, a record key was removed along with the retrospective — restore that key to the table.

- [ ] **Step 5: Run both gates and the suite**

Run: `node tools/corpus/cli.mjs render --check . && node tools/corpus/cli.mjs lint . && npm test`
Expected: exit 0, no `would render:` line, `lint: clean`, all tests pass.

- [ ] **Step 6: Commit**

```bash
git add guides/models/comparison.md
git commit -m "docs: trim comparison.md section 6 to contract-required content"
```

---

### Task 12: Contract amendments

`CLAUDE.md` is the binding text and wins over the spec, so everything this plan made true must land there. This task is documentation only — no code.

**Files:**

- Modify: `CLAUDE.md`

- [ ] **Step 1: Add `corpus verify` to the root-level tooling table**

In the tooling table, add a row after the `lint` row:

| `node tools/corpus/cli.mjs verify .` | `npm run verify` | Record and page checks lint does not make: duplicate keys, record `source`/`verified`, `applies_to` shape, `related` paths, stale `lint_literals`, template sections, evidence-label spelling, section 6 completeness, lint-gap Form 1, `research:` on non-seed pages | 1 if any issue, 0 with `verify: clean` |

State in the surrounding prose that `verify` is **read-only** and never writes, which is why it can run as a gate.

- [ ] **Step 2: Add `verify` to the authoring loop**

In the authoring loop's step 3, add `corpus verify` alongside `render --check` and `lint` as a gate that must pass, and note it is also a CI gate.

- [ ] **Step 3: Add every new rule to the issue-rules table**

One row per rule, `From` = `verify`. Two rows carry a decision that must be written down or a future implementer will get it wrong:

- `rots-table-incomplete` — state the **loose** reading explicitly: the record's key must appear somewhere in section 6, not as its own table row, because a page may legitimately collapse several shared records into one row.
- `evidence-label-invalid` — state that only lines beginning `Evidence:` are scanned, that several labels on one line are legal, and that the "**Verified** needs a shipping proof" check is deliberately not automated.

- [ ] **Step 4: Correct the two statements this plan falsifies**

Find and fix:

Run: `grep -n 'Duplicates are not detected' CLAUDE.md`

That parenthetical in the `key` row of the data-records table becomes false once `record-duplicate-key` ships. Rewrite it to say duplicates are reported by `corpus verify` and that render still keeps the last one.

Run: `grep -n 'Reviewers check for them by eye' CLAUDE.md`

In "Known lint gaps", say that Form 1 is now caught by `corpus verify` as `known-lint-gap-form` and that Form 2 remains a human check because it is undecidable.

- [ ] **Step 5: Record the `research:` and `seed:` decisions**

In the front-matter section, where `research` is described as optional and as becoming required when sub-project 2 lands:

- State that `research:` is now required for pages that are **not** `seed: true`, enforced by `corpus verify` and **not** by `REQUIRED_FIELDS`, and say why: that array is consumed unconditionally, so adding `research` there would fail every seed.
- State that `seed: true` is **permanent provenance** and is never removed by a refresh.
- State that `research:` has exactly one meaning — the page's current grounding artifact — whether an initial research run or a refresh produced it.

- [ ] **Step 6: Verify the documented commands actually work**

Run: `npm run verify` and `node tools/corpus/cli.mjs verify .`
Expected: both print `verify: clean` and exit 0. Every command written into the contract must be one that runs as written.

- [ ] **Step 7: Run all three gates and the suite**

Run: `node tools/corpus/cli.mjs render --check . && node tools/corpus/cli.mjs lint . && node tools/corpus/cli.mjs verify . && npm test`
Expected: all exit 0; `lint: clean`, `verify: clean`, all tests pass.

- [ ] **Step 8: Commit**

```bash
git add CLAUDE.md
git commit -m "docs: codify the verify gate in the corpus contract"
```

---

## Out of scope

Deferred to plan 2a-ii: `refresh`, the refresh prompt, the verify agent, the evidence artifact, refresh units, the idempotence proof.

Deferred to plan 2a-iii: the scheduled audit, `AUDIT_LEAD_DAYS`, the cluster cap, the `stale-past-expiry` alarm, proof re-runs via `restamp`, the rollback and `--requeue` paths.

Deferred to later sub-projects: `write-guide`, `harvest`, the static site, and all new guide content.

Not in any plan: a machine link from a guide to the proof backing a **Verified** label, and Form 2 of the known lint gaps. Both are recorded as deliberately absent in the spec.
