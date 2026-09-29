# Corpus Refresh (sub-project 2a-ii) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the `refresh` CLI command and the verify agent so that one refresh unit can be re-verified against its sources by hand, gated adversarially, and merged — producing the `refresh-idempotence` proof and the corpus's first research artifact.

**Architecture:** The CLI owns everything deterministic: it resolves a refresh unit (a page plus, transitively, every page sharing one of its records), derives the work order from each page's section 6, writes a fail-closed artifact skeleton under `research/<topic>/`, and — only once that artifact carries real verdicts — stamps `verified` dates and `research:` fields with single-line surgical edits. Fetching sources and reaching verdicts belong to a prompt at `meta/prompts/refresh.md`, not to code. A `stamped:` receipt inside the artifact makes `--revert` a byte-exact restore **of `guides/` and `data/`** with no git involvement — byte-exact on both the insert and the replace path, because every surgical editor captures and re-emits the quote character and trailing whitespace it found. The artifact itself is deliberately not restored: it keeps what was checked. That restore is what lets a verify-agent block leave a branch harmless to merge.

**Tech Stack:** Node 22+, ESM `.mjs`, `node:test` + `node:assert/strict`, `js-yaml` (the repo's only runtime dependency). No new dependencies.

**Spec:** `docs/superpowers/specs/2026-09-27-corpus-refresh-loop-design.md` (revision 3, approved). Sub-project 2a-i (`corpus verify` + twelve rules + the `comparison.md` section 6 cleanup) is **already shipped and merged** as PR #1, merge `66e2c68`; nothing in it is re-planned here. Sub-project 2a-iii (the scheduled audit, `AUDIT_LEAD_DAYS`, the cluster cap, the `stale-past-expiry` alarm, proof re-runs) is **out of scope**.

## Global Constraints

Every task's requirements implicitly include this section.

- **Node 22 or later.** `"engines": { "node": ">=22" }` in `package.json`.
- **ESM `.mjs` only.** Source in `tools/corpus/`, tests in `tools/corpus/test/*.test.mjs`.
- **No new runtime dependencies.** `js-yaml` (`^4.1.0`) is the only one and already present.
- **`npm test` is `node --test "tools/corpus/test/**/*.test.mjs"`.** The quoted glob is required: a bare directory argument does not work on this Node.
- **Four gates green at every task end**, in this order:
  - `node tools/corpus/cli.mjs render --check .` — exit 0, no `would render:` line
  - `node tools/corpus/cli.mjs lint .` — prints `lint: clean`, exit 0
  - `node tools/corpus/cli.mjs verify .` — prints `verify: clean`, exit 0
  - `npm test` — exit 0
- **Conventional commits**, imperative mood: `feat:`, `fix:`, `test:`, `docs:`. **No `Co-Authored-By:` and no attribution trailers of any kind.**
- **Coverage discipline is mutation-based.** For each guard, the plan names the mutation that must turn the suite red. Apply it, watch it go red, restore it.
- **Prettier fires on Claude's `Edit`/`Write`, never on the code this plan ships.** The hook is `PostToolUse` on the editing tools. Every write on a refresh runtime path is `fs.writeFileSync` from inside `cli.mjs`, so **no refresh mode ever triggers Prettier** and the byte-exactness claim is safe from it — do not start fighting the formatter over it. Prettier does fire in exactly two places in this plan: Task 14 Step 3, where the artifact is hand-filled with `Edit`/`Write` (it may re-quote or re-indent the `records:` list, which is harmless — everything downstream re-parses the YAML and `withReceipt` re-dumps the whole block), and Task 13, where it reformats `CLAUDE.md`'s new tables. `render --check` compares formatter-stable forms, so table padding and blank lines are not a pending change.
- **Creating a new directory can make a local hook drop a `.claude/` folder inside it.** `research/models/`, `meta/prompts/`, `examples/refresh-idempotence/` and any new fixture directory are all new. Run `rm -rf <dir>/.claude` before `git add`, and stage by filename, never `git add -A`.
- **Cadence numbers are not touched.** `CADENCE_DAYS = { high: 30, medium: 90, low: 270 }` in `tools/corpus/ledger.mjs` stays exactly as it is. `AUDIT_LEAD_DAYS` is not introduced in this plan.
- **`refresh` must never regenerate `meta/ledger.yaml`.** One file, one writer: the ledger is rebuilt only on `master`, after a merge. This is what lets `corpus verify` be a strictly read-only CI gate.
- **`seed: true` is permanent provenance and is never removed**, on any code path, including a refresh that re-verifies every source on the page.
- **A source that cannot be reached must not bump `verified`.** All-or-nothing: `blocked` writes nothing at all. There is no partial freshness.
- **`--key` stamps records only.** A key-scoped refresh never moves a page's `verified` and never sets a page's `research:`. See "Decision: what `--key` is allowed to stamp".
- **Acceptance criterion (spec revision 4, verbatim):** "Complete when a refresh of any one refresh unit — hand-driven or audit-driven — has passed both halves of verify, been reviewed and merged by the owner, and left an evidence artifact under `research/<topic>/` for that unit's topic." Not when the code is written. The model unit is the expected target, not the required one.
- **Work on a branch:** `corpus-refresh-2a-ii`, off `master` at `66e2c68`.

## Review Focus

Five input classes the spec implies but does not pin. Each line's test is added to the task named.

1. **A record key that is a prefix of another key, or a record block with no `verified:` line.** `anthropic.models.opus-5` must not match inside `anthropic.models.opus-5-preview`, and a missing `verified:` must raise, not be silently skipped (a skipped record keeps a stale date under a freshly dated page). → **Task 4.**
2. **A `research:` value that does not resolve.** `checkResearchRequired` (`tools/corpus/verify-pages.mjs:54-66`) only checks it is a non-empty string, and no `research-path-unresolved` rule exists, so `stampUnit` is the only thing that can refuse one. → **Task 6.**
3. **An artifact asserting freshness the run did not establish.** Two shapes, one failure. (a) A `verdict: confirmed` artifact carrying an `unreachable` record: the schema must force `blocked`, and stamp must then write nothing. (b) A `--key` run bumping a page's `verified`: that date asserts the page's whole section 6 was worked, when only one record was re-read. → **Tasks 5, 6, 9.**
4. **A `status: deprecated` page inside a record-sharing unit.** It belongs to the unit but must never get a bumped `verified` or a `research:`. → **Tasks 1, 6.**
5. **A unit spanning two topics, and a page with no `## 6.` section.** The live corpus already has the first (`guides/context/context-management.md` and `guides/domains/software-engineering.md` share `claude_code.claude_md.adherence_line_threshold` across topics `context` and `domains`), and an empty checklist must not read as "nothing to check". → **Tasks 2, 3.**

---

## Decision: two units can share a `data/*.yaml` file

The spec groups units by shared **records**. It is silent on the fact that two disjoint units can still write to the same **file**. The live corpus already has this:

| Unit                                                                | Data files written                           |
| ------------------------------------------------------------------- | -------------------------------------------- |
| `guides/claude-code/hooks.md`                                       | `data/claude-code.yaml`                      |
| `context/context-management.md` + `domains/software-engineering.md` | `data/context.yaml`, `data/claude-code.yaml` |
| `models/claude-models.md` + `models/comparison.md`                  | `data/models.yaml`, `data/models-other.yaml` |

Units 1 and 2 both edit `data/claude-code.yaml`, but not through the records an earlier draft of this plan named. Derived by loading `data/` with `loadRecords` and running `referencedRecordKeys` over all five guides:

- **Unit 1 is `hooks.md` alone.** Its seven `claude_code.hooks.*` records all live in `data/claude-code.yaml` (their `- key:` lines run `data/claude-code.yaml:10` to `:70`). No other page references any of them.
- **Unit 2 is `context-management.md` + `software-engineering.md`.** The record that joins them, `claude_code.claude_md.adherence_line_threshold`, lives in **`data/context.yaml:15`** — it is what makes the unit cross-topic, not what makes two units share a file. What makes them share a file is `claude_code.sandbox.auto_allow_bash_default` (`data/claude-code.yaml:84`), referenced **only** by `software-engineering.md` and therefore belonging to **unit 2**, not unit 1.
- **Unit 3 is `claude-models.md` + `comparison.md`:** fourteen records, four in `data/models.yaml` and ten in `data/models-other.yaml`.

So the sharing is real but runs the other way round from that draft: unit 1 writes `data/claude-code.yaml` through the seven hooks records, and unit 2 writes the same file through the one sandbox record. Their hunks are far apart — the last `hooks.*` record's `verified:` line is `data/claude-code.yaml:78` and the sandbox record's is `:90`, twelve lines apart and well outside git's three-line hunk context — so the two units' edits auto-merge.

**Decision: allow it, and make the edits line-disjoint by construction.**

1. **Record edits are single-line surgical replacements, never a YAML round trip.** `setRecordVerified` locates the record by its `- key:` line, finds that block's `verified:` line, and rewrites that one line in place. Two units therefore produce non-overlapping hunks in the same file, and git auto-merges them. A YAML round trip would rewrite the whole file — stripping the contract-required comments at the top of `data/models.yaml` and `data/models-other.yaml`, and guaranteeing a conflict on every concurrent run.
2. **`stampUnit` refuses to write any record key outside the unit's own `unit_keys`** (`refresh-record-out-of-unit`). A mis-resolved unit cannot widen its footprint into a neighbouring unit's records.
3. **`revertUnit` refuses on drift** (`refresh-revert-drift`): it re-reads each record's current `verified` and requires it to equal the value the receipt says stamp wrote. A revert therefore never clobbers a date another unit already landed.

**Why not the obvious alternative.** Grouping units by data file — or taking a file lock — would merge `hooks.md`, `context-management.md` and `software-engineering.md` into one unit, because `software-engineering.md` bridges `data/context.yaml` and `data/claude-code.yaml`. Three pages across three topics would land in one pull request with one slug and one pile of unrelated identifier re-checks, for a conflict class that single-line edits already eliminate. Record granularity plus a write guard buys the same safety without collapsing the review unit.

**Corollary that must be stated in the contract:** the transitive closure is over records, and it is a closure, not one hop. If A shares `r1` with B and B shares `r2` with C, C joins A's unit — otherwise B and C would both edit `r2` on two branches, which is the exact conflict the unit concept exists to remove. On today's corpus the closure and the one-hop reading give the same three units — checked on the live tree: `comparison.md`'s eleven non-Claude records and `software-engineering.md`'s sandbox record are each referenced by one page only — so this costs nothing to adopt now.

---

## Decision: what `--key` is allowed to stamp

The spec is one sentence: "A `--key` flag still handles the surgical case: one record repriced, no page-wide sweep."

The obvious implementation narrows the record list and leaves everything else alone — and that is the trap. A unit is a set of *pages*; narrowing `records` while still iterating the unit's pages re-dates every page in the unit on the strength of one record having been re-read. On the live corpus, `refresh --page=guides/models/claude-models.md --key=anthropic.models.opus-5 --skeleton` followed by `--stamp` would mark **both** model pages fully re-verified with neither page's identifier re-check list, lint-unguardable values, nor dated studies worked at all — and the artifact would validate clean, because the coverage rule only walks `unit_keys`. That is a wrong-but-plausible freshness claim written under a fresh date by the tool built to prevent exactly that.

**Decision: a key-scoped refresh stamps records only. It never moves a page's `verified` and never sets a page's `research:`.**

The reason is what a page's `verified` means. The contract defines it as the date the page was last checked against its sources, and section 6 defines what checking a page is: every record, every identifier tied to `applies_to`, every value the lint cannot guard, every dated study. A `--key` run works exactly one item on that list. Moving the page date would be a claim about work that did not happen.

**Why not the narrower alternative.** Stamping only the pages that actually reference the key is better than stamping the whole unit, but wrong for the same reason — those pages' checklists were not worked either — and it costs a second page-selection rule for no gain. A page whose record was repriced gets its date when someone works its section 6, which is what a full refresh is for.

**The consequence to accept.** A key-scoped run leaves the page's `verified` older than the record's. That is the honest state: the record was re-read on that date, the page was not. Nothing in `lint`, `verify` or `ledger` compares the two, so nothing breaks; page cadence still derives from record volatility, not from record dates.

How it is encoded:

1. `workOrder` records the narrowing on the order itself as `key: string|null` (Task 3).
2. `renderArtifactSkeleton` writes `key_scoped: <boolean>` into the artifact's front-matter, and `key_scoped` joins `ARTIFACT_FIELDS`, so a hand-written artifact cannot omit it (Task 5).
3. `stampUnit` skips the page loop entirely when `key_scoped` is true. The receipt then carries no page entries, so `revertUnit` — which walks `receipt.pages` — has nothing to undo and stays correct without a second branch (Task 6).
4. `stampUnit` also refuses a `key_scoped` artifact whose `unit_keys` does not hold exactly one key (`refresh-key-scope-widened`). `--key` narrows to exactly one record by construction, so more than one means the artifact was widened by hand after `--skeleton` (Task 6).
5. Task 9 tests it end to end: `--skeleton --key=` then `--stamp`, asserting the record's date moved and that **no page `verified` moved and no `research:` was added**.

---

## File Structure

| File                                                         | Create/Modify | Responsibility                                                                                                                    |
| ------------------------------------------------------------ | ------------- | --------------------------------------------------------------------------------------------------------------------------------- |
| `tools/corpus/refresh-units.mjs`                             | Create        | `RefreshError`, page facts, `resolveUnit`, `unitSlug`, `unitTopic`, `artifactPathFor`                                             |
| `tools/corpus/refresh-order.mjs`                             | Create        | `workOrder`, `renderWorkOrder` — the mechanical record list plus each page's section 6 verbatim                                   |
| `tools/corpus/refresh-artifact.mjs`                          | Create        | Artifact schema: `parseArtifact`, `dumpArtifact`, `renderArtifactSkeleton`, `validateArtifact`, `withReceipt`, `withRevertMark`   |
| `tools/corpus/refresh-stamp.mjs`                             | Create        | Surgical editors (`setRecordVerified`, `setPageVerified`, `setPageResearch`, `removePageResearch`) and `stampUnit` / `revertUnit` |
| `tools/corpus/refresh-review.mjs`                            | Create        | `REVIEW_PATHSPECS`, `reviewPacket`, `sourcesFor` — what the verify agent is shown                                                 |
| `tools/corpus/cli.mjs`                                       | Modify        | Wire the `refresh` subcommand and its flags; extend `usage()`                                                                     |
| `meta/prompts/refresh.md`                                    | Create        | The refresh prompt: fetching and verdicts                                                                                         |
| `meta/prompts/verify-agent.md`                               | Create        | The verify agent's rubric and blocking semantics                                                                                  |
| `examples/refresh-idempotence/proof.yaml`                    | Create        | Proof manifest                                                                                                                    |
| `examples/refresh-idempotence/run.mjs`                       | Create        | Proof: an unchanged unit diffs only in dates                                                                                      |
| `examples/refresh-idempotence/README.md`                     | Create        | What the proof falsifies                                                                                                          |
| `CLAUDE.md`                                                  | Modify        | Contract amendments for 2a-ii                                                                                                     |
| `tools/corpus/test/fixtures/refresh/**`                      | Create        | A refresh-only fixture corpus: cross-topic unit, deprecated member, page with no `## 6.`                                          |
| `tools/corpus/test/refresh-units.test.mjs`                   | Create        | Tasks 1–2                                                                                                                         |
| `tools/corpus/test/refresh-order.test.mjs`                   | Create        | Task 3                                                                                                                            |
| `tools/corpus/test/refresh-stamp.test.mjs`                   | Create        | Tasks 4, 6, 7                                                                                                                     |
| `tools/corpus/test/refresh-artifact.test.mjs`                | Create        | Task 5                                                                                                                            |
| `tools/corpus/test/refresh-review.test.mjs`                  | Create        | Task 8                                                                                                                            |
| `tools/corpus/test/refresh-cli.test.mjs`                     | Create        | Task 9                                                                                                                            |
| `tools/corpus/test/refresh-prompts.test.mjs`                 | Create        | Tasks 10, 11 — keep prompt vocabulary and code vocabulary in sync                                                                 |
| `tools/corpus/test/refresh-proof.test.mjs`                   | Create        | Task 12 — re-runs the new proof under `npm test`, so it cannot outlive the behaviour it proves                                   |
| `research/models/<date>-claude-models-comparison-refresh.md` | Create        | Task 14, the first real artifact                                                                                                  |

**Why a separate fixture tree.** `tools/corpus/test/fixtures/corpus/` is shared, and `cli.test.mjs` asserts `renderCorpus` has zero issues over the whole of it without filtering by filename — adding a page with an unknown `corpus:data` key there turns a test red for a reason that looks unrelated. `tools/corpus/test/fixtures/refresh/` is a fresh tree with its own `data/`, `guides/` and `meta/taxonomy.yaml`, so the refresh tests can shape unit membership deliberately. Tests that mutate files copy the tree into `fs.mkdtempSync(path.join(os.tmpdir(), "refresh-"))` first.

**Why `research/*.md` may carry bare figures.** `guidePaths(root)` (`tools/corpus/cli.mjs:41-54`) walks `guides/` only, so neither `lint` nor `verify` reads anything under `research/`. The artifact records what a source actually stated, which would be a `bare-value` violation inside a guide; it is safe here, and only here.

---

### Task 1: Refresh unit resolution

**Files:**

- Create: `tools/corpus/refresh-units.mjs`
- Create: `tools/corpus/test/fixtures/refresh/meta/taxonomy.yaml`
- Create: `tools/corpus/test/fixtures/refresh/data/units.yaml`
- Create: `tools/corpus/test/fixtures/refresh/guides/alpha/one.md`
- Create: `tools/corpus/test/fixtures/refresh/guides/alpha/two.md`
- Create: `tools/corpus/test/fixtures/refresh/guides/beta/three.md`
- Create: `tools/corpus/test/fixtures/refresh/guides/beta/gone.md`
- Create: `tools/corpus/test/fixtures/refresh/guides/gamma/lonely.md`
- Test: `tools/corpus/test/refresh-units.test.mjs`

**Interfaces:**

- Consumes: `referencedRecordKeys(text, records) -> Set<string>` from `tools/corpus/verify-pages.mjs`; `parseFrontmatter(text) -> { data, body, bodyOffset }` from `tools/corpus/frontmatter.mjs`; `loadRecords(dataDir) -> Record[]` from `tools/corpus/data.mjs` (each record carries `file`, the bare basename such as `"models.yaml"`).
- Produces:
  - `class RefreshError extends Error` with fields `rule: string`, `message: string`.
  - `guidePages(root: string) -> string[]` — absolute paths, sorted.
  - `pageFacts(root: string, records: Record[]) -> PageFact[]` where `PageFact = { path: string, topic: string|null, status: string|null, keys: string[] }` and `path` is repo-root-relative with `/` separators.
  - `resolveUnit(root: string, entry: string, records: Record[]) -> Unit` where `Unit = { entry: string, pages: PageFact[], keys: string[], topics: (string|null)[], dataFiles: string[] }`. `pages` sorted by `path`; `keys` and `dataFiles` sorted; `dataFiles` entries are `data/<basename>`.

- [ ] **Step 1: Write the fixture corpus**

`tools/corpus/test/fixtures/refresh/meta/taxonomy.yaml`:

```yaml
topics: [alpha, beta, gamma]
```

`tools/corpus/test/fixtures/refresh/data/units.yaml`:

```yaml
# Fixture records for the refresh tests. Deliberately spread across two files
# so a unit can span data files the way the live corpus does.
records:
  - key: fix.shared.one
    value: "shared-one"
    volatility: high
    source: https://example.invalid/one
    verified: "2026-09-16"
    tags: [linked]
  - key: fix.bridge.two
    value: "bridge-two"
    volatility: medium
    source: https://example.invalid/two
    verified: "2026-09-16"
  - key: fix.tail.three
    value: "tail-three"
    volatility: low
    source: https://example.invalid/three
    verified: "2026-09-16"
  - key: fix.alone.four
    value: "alone-four"
    volatility: low
    source: https://example.invalid/four
    verified: "2026-09-16"
  - key: fix.noverified.five
    value: "noverified-five"
    volatility: low
    source: https://example.invalid/five
  - key: fix.nosource.six
    value: "nosource-six"
    volatility: low
    verified: "2026-09-16"
  # Reserved for Task 3's guides/gamma/nosix.md. It is referenced by that page
  # and by nothing else, so nosix.md stays a unit of ONE and lonely.md keeps its
  # own "unit of one" and "lonely" slug assertions below. Declaring it here
  # rather than in Task 3 means Task 3 adds a file and amends no committed test.
  - key: fix.solo.seven
    value: "solo-seven"
    volatility: low
    source: https://example.invalid/seven
    verified: "2026-09-16"
```

`tools/corpus/test/fixtures/refresh/guides/alpha/one.md`:

```markdown
---
title: One
summary: Entry page of the cross-topic fixture unit.
topic: alpha
verified: 2026-09-16
applies_to:
  - "Fixture 1.0, read on 2026-09-16"
sources:
  - https://example.invalid/one
related: []
seed: true
---

# One

## 1. What this covers / who it's for

Fixture page one.

## 2. The 60-second version

Shared: <!-- corpus:data key=fix.shared.one -->shared-one<!-- /corpus:data -->

## 3. How it actually works

Nothing.

## 4. Patterns that hold up

Evidence: **Documented** — [fixture](https://example.invalid/one), read 2026-09-16.

## 5. Edge cases and failure modes

None.

## 6. Where this rots

| Claim  | Record           | Volatility | Why it moves |
| ------ | ---------------- | ---------- | ------------ |
| Shared | `fix.shared.one` | high       | Fixture      |

Re-check on refresh: the fixture identifier `FIXTURE_FLAG`.

Not lint-guarded: nothing.

Deliberately absent: everything else.

## 7. Proofs

None ships.

## 8. Sources

- https://example.invalid/one
```

`tools/corpus/test/fixtures/refresh/guides/alpha/two.md`: identical structure, `title: Two`, `topic: alpha`, and one deliberate difference in front-matter — it already carries a **quoted** `research:` line, immediately before `seed: true`:

```yaml
research: "research/alpha/prior.md"
seed: true
```

That is the only page in the fixture tree in that state, and it exists so `setPageResearch`'s **replace** path is exercised by every test that stamps this unit. Without it the whole suite only ever walks the insert path, and the byte-exact revert claim goes untested on the branch where it is hardest to hold (Task 4 Step 1 and Task 7 Step 1 both depend on this). The path need not resolve: nothing resolves a page's `research:` value — `checkResearchRequired` only checks it is a non-empty string, and `stampUnit` resolves the artifact's own `path`, not a page's existing field.

Section 2 body:

```markdown
Shared: <!-- corpus:data key=fix.shared.one -->shared-one<!-- /corpus:data -->
Bridge: <!-- corpus:data key=fix.bridge.two -->bridge-two<!-- /corpus:data -->
```

and section 6's table listing both `fix.shared.one` and `fix.bridge.two`.

`tools/corpus/test/fixtures/refresh/guides/beta/three.md`: same structure, `title: Three`, **`topic: beta`**, section 2 body:

```markdown
Bridge: <!-- corpus:data key=fix.bridge.two -->bridge-two<!-- /corpus:data -->
Tail: <!-- corpus:data key=fix.tail.three -->tail-three<!-- /corpus:data -->
```

and section 6 listing `fix.bridge.two` and `fix.tail.three`. This page is what makes the unit transitive and cross-topic: it shares no record with `one.md` at all.

`tools/corpus/test/fixtures/refresh/guides/beta/gone.md`: `title: Gone`, `topic: beta`, **`status: deprecated`** in front-matter, a one-line deprecation notice at the top of the body, and — **unlike every other fixture page** — headings `## 1.` through `## 5.`, then `## 7.` and `## 8.`, with **no `## 6.` section at all**.

That shape is load-bearing, not incidental. Task 3's deprecation carve-out mutation (Step 6, mutation 2) can only turn the suite red if this page has no section 6: with one, the carve-out never fires and the mutation survives silently, which would let a passing mutation step read as evidence of coverage. Write it without a `## 6.` and Task 3 asserts the mutation unconditionally. A deprecated page having no "Where this rots" section is also the realistic case — `corpus verify` exempts deprecated pages from both `template-sections` and `rots-table-incomplete` for exactly this reason.

Section 2 body:

```markdown
Tail: <!-- corpus:data key=fix.tail.three -->tail-three<!-- /corpus:data -->
```

`tools/corpus/test/fixtures/refresh/guides/gamma/lonely.md`: same structure, `title: Lonely`, `topic: gamma`, section 2 body:

```markdown
Alone: <!-- corpus:data key=fix.alone.four -->alone-four<!-- /corpus:data -->
```

- [ ] **Step 2: Write the failing test**

`tools/corpus/test/refresh-units.test.mjs`:

```javascript
// tools/corpus/test/refresh-units.test.mjs
import test from "node:test";
import assert from "node:assert/strict";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { loadRecords } from "../data.mjs";
import { RefreshError, pageFacts, resolveUnit } from "../refresh-units.mjs";

const FIX = fileURLToPath(new URL("./fixtures/refresh/", import.meta.url));
const REPO = fileURLToPath(new URL("../../../", import.meta.url));
const fixRecords = () => loadRecords(path.join(FIX, "data"));
const repoRecords = () => loadRecords(path.join(REPO, "data"));

test("pageFacts reports repo-relative paths, topic, status and keys", () => {
  const facts = pageFacts(FIX, fixRecords());
  const byPath = new Map(facts.map((f) => [f.path, f]));
  assert.equal(byPath.get("guides/alpha/one.md").topic, "alpha");
  assert.equal(byPath.get("guides/beta/gone.md").status, "deprecated");
  assert.deepEqual(byPath.get("guides/alpha/one.md").keys, ["fix.shared.one"]);
});

test("a unit is the transitive closure over shared records, not one hop", () => {
  const unit = resolveUnit(FIX, "guides/alpha/one.md", fixRecords());
  assert.deepEqual(
    unit.pages.map((p) => p.path),
    [
      "guides/alpha/one.md",
      "guides/alpha/two.md",
      "guides/beta/gone.md",
      "guides/beta/three.md",
    ],
  );
  assert.deepEqual(unit.keys, [
    "fix.bridge.two",
    "fix.shared.one",
    "fix.tail.three",
  ]);
});

// Review Focus 4: a deprecated page belongs to the unit. It is excluded from
// the date bump later, in stampUnit, never from membership — its records are
// shared and must be fetched once for the whole unit.
test("a deprecated page is a unit member", () => {
  const unit = resolveUnit(FIX, "guides/alpha/one.md", fixRecords());
  const gone = unit.pages.find((p) => p.path === "guides/beta/gone.md");
  assert.equal(gone.status, "deprecated");
});

test("a page sharing no record is a unit of one", () => {
  const unit = resolveUnit(FIX, "guides/gamma/lonely.md", fixRecords());
  assert.deepEqual(
    unit.pages.map((p) => p.path),
    ["guides/gamma/lonely.md"],
  );
  assert.deepEqual(unit.dataFiles, ["data/units.yaml"]);
});

test("an unknown entry page raises rather than returning an empty unit", () => {
  assert.throws(
    () => resolveUnit(FIX, "guides/alpha/nope.md", fixRecords()),
    (err) => err instanceof RefreshError && err.rule === "refresh-page-unknown",
  );
});

// One live assertion, pinning the spec invariant by name: "The two model pages
// are therefore one unit, refreshed on one branch, in one pull request."
test("the live model pages resolve to one unit", () => {
  const unit = resolveUnit(
    REPO,
    "guides/models/claude-models.md",
    repoRecords(),
  );
  assert.equal(
    unit.pages.some((p) => p.path === "guides/models/comparison.md"),
    true,
  );
  assert.deepEqual(unit.dataFiles, [
    "data/models-other.yaml",
    "data/models.yaml",
  ]);
});
```

- [ ] **Step 3: Run the test to verify it fails**

Run: `node --test tools/corpus/test/refresh-units.test.mjs`
Expected: FAIL — `Cannot find module '.../tools/corpus/refresh-units.mjs'`.

- [ ] **Step 4: Write the implementation**

`tools/corpus/refresh-units.mjs`:

```javascript
// tools/corpus/refresh-units.mjs
// A refresh unit is a page plus every page that shares one of its records,
// closed TRANSITIVELY. If A shares r1 with B and B shares r2 with C, C joins:
// otherwise B and C would both edit r2 on two branches, which is the exact
// conflict the unit concept exists to remove. On today's corpus the closure and
// the one-hop reading give the same three units.
import fs from "node:fs";
import path from "node:path";
import { parseFrontmatter } from "./frontmatter.mjs";
import { referencedRecordKeys } from "./verify-pages.mjs";

export class RefreshError extends Error {
  constructor(rule, message) {
    super(message);
    this.name = "RefreshError";
    this.rule = rule;
  }
}

// Same walk as cli.mjs's guidePaths: guides/ only, .md only, sorted. Nothing
// under research/ or meta/ is ever a unit member.
export function guidePages(root) {
  const dir = path.join(root, "guides");
  if (!fs.existsSync(dir)) return [];
  const out = [];
  const walk = (d) => {
    for (const e of fs.readdirSync(d, { withFileTypes: true })) {
      const p = path.join(d, e.name);
      if (e.isDirectory()) walk(p);
      else if (e.name.endsWith(".md")) out.push(p);
    }
  };
  walk(dir);
  return out.sort();
}

export function pageFacts(root, records) {
  return guidePages(root).map((abs) => {
    const text = fs.readFileSync(abs, "utf8");
    const { data } = parseFrontmatter(text);
    return {
      path: path.relative(root, abs).split(path.sep).join("/"),
      topic: typeof data?.topic === "string" ? data.topic : null,
      status: typeof data?.status === "string" ? data.status : null,
      keys: [...referencedRecordKeys(text, records)].sort(),
    };
  });
}

export function resolveUnit(root, entry, records) {
  const facts = pageFacts(root, records);
  const start = facts.find((p) => p.path === entry);
  if (start === undefined)
    throw new RefreshError(
      "refresh-page-unknown",
      `no guide at ${entry}; --page takes a repo-root-relative path under guides/`,
    );
  const members = new Map([[start.path, start]]);
  const keys = new Set(start.keys);
  let grew = true;
  while (grew) {
    grew = false;
    for (const p of facts) {
      if (members.has(p.path)) continue;
      if (!p.keys.some((k) => keys.has(k))) continue;
      members.set(p.path, p);
      for (const k of p.keys) keys.add(k);
      grew = true;
    }
  }
  const byKey = new Map(records.map((r) => [r.key, r]));
  const pages = [...members.values()].sort((a, b) =>
    a.path.localeCompare(b.path),
  );
  const dataFiles = [
    ...new Set(
      [...keys].map((k) => byKey.get(k)?.file).filter((f) => f != null),
    ),
  ]
    .sort()
    .map((f) => `data/${f}`);
  return {
    entry,
    pages,
    keys: [...keys].sort(),
    topics: [...new Set(pages.map((p) => p.topic))].sort(),
    dataFiles,
  };
}
```

- [ ] **Step 5: Run the test to verify it passes**

Run: `node --test tools/corpus/test/refresh-units.test.mjs`
Expected: PASS, 6 tests.

- [ ] **Step 6: Prove the closure loop is load-bearing**

Mutation: replace the `while (grew)` loop body's growth with a single pass — delete `grew = true;` inside the inner loop. Run `node --test tools/corpus/test/refresh-units.test.mjs`. Expected: the transitive-closure test goes red, because `guides/beta/three.md` and `guides/beta/gone.md` join only on the second pass. Restore the line.

- [ ] **Step 7: Run the four gates**

```bash
node tools/corpus/cli.mjs render --check . && node tools/corpus/cli.mjs lint . && node tools/corpus/cli.mjs verify . && npm test
```

Expected: no `would render:`, `lint: clean`, `verify: clean`, tests pass. The fixture tree is not under `guides/`, so `lint` and `verify` never see it.

- [ ] **Step 8: Commit**

```bash
rm -rf tools/corpus/test/fixtures/refresh/.claude tools/corpus/test/fixtures/refresh/guides/.claude tools/corpus/test/fixtures/refresh/guides/alpha/.claude tools/corpus/test/fixtures/refresh/guides/beta/.claude tools/corpus/test/fixtures/refresh/guides/gamma/.claude tools/corpus/test/fixtures/refresh/data/.claude tools/corpus/test/fixtures/refresh/meta/.claude
git add tools/corpus/refresh-units.mjs tools/corpus/test/refresh-units.test.mjs tools/corpus/test/fixtures/refresh/meta/taxonomy.yaml tools/corpus/test/fixtures/refresh/data/units.yaml tools/corpus/test/fixtures/refresh/guides/alpha/one.md tools/corpus/test/fixtures/refresh/guides/alpha/two.md tools/corpus/test/fixtures/refresh/guides/beta/three.md tools/corpus/test/fixtures/refresh/guides/beta/gone.md tools/corpus/test/fixtures/refresh/guides/gamma/lonely.md
git commit -m "feat: resolve a refresh unit as the transitive closure over shared records"
```

---

### Task 2: Unit naming and the artifact's home

**Files:**

- Modify: `tools/corpus/refresh-units.mjs`
- Test: `tools/corpus/test/refresh-units.test.mjs`

**Interfaces:**

- Consumes: `Unit` and `RefreshError` from Task 1.
- Produces:
  - `MAX_SLUG_PAGES = 3` (number).
  - `unitSlug(unit: Unit) -> string` — page basenames without `.md`, sorted, joined with `-`; above `MAX_SLUG_PAGES` pages it collapses to `` `${first}-plus-${n - 1}` ``.
  - `unitTopic(unit: Unit) -> string` — the `topic` of the page named on the command line; throws `RefreshError("refresh-topic-unknown", …)` if it has none.
  - `artifactPathFor(unit: Unit, fetched: string) -> string` — `` `research/${unitTopic(unit)}/${fetched}-${unitSlug(unit)}-refresh.md` ``.

- [ ] **Step 1: Write the failing test**

Append to `tools/corpus/test/refresh-units.test.mjs`:

```javascript
import {
  MAX_SLUG_PAGES,
  unitSlug,
  unitTopic,
  artifactPathFor,
} from "../refresh-units.mjs";

test("a slug joins sorted basenames", () => {
  const unit = resolveUnit(FIX, "guides/gamma/lonely.md", fixRecords());
  assert.equal(unitSlug(unit), "lonely");
  const live = resolveUnit(
    REPO,
    "guides/models/claude-models.md",
    repoRecords(),
  );
  assert.equal(unitSlug(live), "claude-models-comparison");
});

test("a slug above MAX_SLUG_PAGES collapses to first-plus-N", () => {
  const unit = resolveUnit(FIX, "guides/alpha/one.md", fixRecords());
  assert.equal(unit.pages.length, 4);
  assert.equal(unit.pages.length > MAX_SLUG_PAGES, true);
  assert.equal(unitSlug(unit), "gone-plus-3");
});

// Review Focus 5, first half: the fixture unit spans alpha and beta, and the
// live corpus spans context and domains. The artifact files under the topic of
// the page NAMED ON THE COMMAND LINE, so the same unit entered from either end
// files under either topic — which is intended: the entry page is the one the
// author asked about.
test("a cross-topic unit files under the entry page's topic", () => {
  const fromAlpha = resolveUnit(FIX, "guides/alpha/one.md", fixRecords());
  assert.deepEqual(fromAlpha.topics, ["alpha", "beta"]);
  assert.equal(unitTopic(fromAlpha), "alpha");
  assert.equal(
    artifactPathFor(fromAlpha, "2026-09-28"),
    "research/alpha/2026-09-28-gone-plus-3-refresh.md",
  );
  const fromBeta = resolveUnit(FIX, "guides/beta/three.md", fixRecords());
  assert.deepEqual(fromBeta.topics, ["alpha", "beta"]);
  assert.equal(unitTopic(fromBeta), "beta");
});

test("the live cross-topic unit really spans two topics", () => {
  const unit = resolveUnit(
    REPO,
    "guides/context/context-management.md",
    repoRecords(),
  );
  assert.deepEqual(unit.topics, ["context", "domains"]);
  assert.equal(unitTopic(unit), "context");
});

test("an entry page with no topic cannot name an artifact home", () => {
  const unit = {
    entry: "guides/x/y.md",
    pages: [{ path: "guides/x/y.md", topic: null, status: null, keys: [] }],
    keys: [],
    topics: [null],
    dataFiles: [],
  };
  assert.throws(
    () => artifactPathFor(unit, "2026-09-28"),
    (err) =>
      err instanceof RefreshError && err.rule === "refresh-topic-unknown",
  );
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `node --test tools/corpus/test/refresh-units.test.mjs`
Expected: FAIL — `SyntaxError: The requested module '../refresh-units.mjs' does not provide an export named 'MAX_SLUG_PAGES'`.

- [ ] **Step 3: Write the implementation**

Append to `tools/corpus/refresh-units.mjs`:

```javascript
// Above this many pages a joined slug becomes unreadable and starts colliding
// with filesystem name limits, so it collapses to first-plus-N.
export const MAX_SLUG_PAGES = 3;

export function unitSlug(unit) {
  const names = unit.pages
    .map((p) => path.basename(p.path, ".md"))
    .sort((a, b) => a.localeCompare(b));
  if (names.length > MAX_SLUG_PAGES)
    return `${names[0]}-plus-${names.length - 1}`;
  return names.join("-");
}

// The topic of the page named on the command line, not a merge of the unit's
// topics: a cross-topic unit has no single home, and the entry page is the one
// the author asked about. `unit.topics` records the span for the artifact.
export function unitTopic(unit) {
  const entry = unit.pages.find((p) => p.path === unit.entry);
  if (
    entry === undefined ||
    typeof entry.topic !== "string" ||
    entry.topic === ""
  )
    throw new RefreshError(
      "refresh-topic-unknown",
      `${unit.entry} has no front-matter topic, so the refresh artifact has no home under research/`,
    );
  return entry.topic;
}

export function artifactPathFor(unit, fetched) {
  return `research/${unitTopic(unit)}/${fetched}-${unitSlug(unit)}-refresh.md`;
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `node --test tools/corpus/test/refresh-units.test.mjs`
Expected: PASS, 11 tests.

- [ ] **Step 5: Prove the bound and the entry-topic rule are load-bearing**

Two mutations, one at a time:

1. Change `MAX_SLUG_PAGES` to `10`. Expected: "a slug above MAX_SLUG_PAGES collapses to first-plus-N" goes red. Restore.
2. In `unitTopic`, replace the entry lookup with `unit.pages[0]`. Expected: "a cross-topic unit files under the entry page's topic" goes red on the `fromBeta` assertion (`unit.pages[0]` is `guides/alpha/one.md`). Restore.

Run `node --test tools/corpus/test/refresh-units.test.mjs` after each.

- [ ] **Step 6: Run the four gates**

```bash
node tools/corpus/cli.mjs render --check . && node tools/corpus/cli.mjs lint . && node tools/corpus/cli.mjs verify . && npm test
```

Expected: no `would render:`, `lint: clean`, `verify: clean`, tests pass.

- [ ] **Step 7: Commit**

```bash
git add tools/corpus/refresh-units.mjs tools/corpus/test/refresh-units.test.mjs
git commit -m "feat: name a refresh unit and place its artifact under the entry page's topic"
```

---

### Task 3: The work order from section 6

**Files:**

- Create: `tools/corpus/refresh-order.mjs`
- Create: `tools/corpus/test/fixtures/refresh/guides/gamma/nosix.md`
- Test: `tools/corpus/test/refresh-order.test.mjs`

**Interfaces:**

- Consumes: `Unit`, `RefreshError`, `unitSlug`, `unitTopic` from `tools/corpus/refresh-units.mjs`; `sectionSixText(text) -> string|null` from `tools/corpus/verify-pages.mjs`.
- Produces:
  - `workOrder(root: string, unit: Unit, records: Record[], opts?: { key?: string|null }) -> Order` where

    ```
    Order = {
      unit: Unit,
      slug: string,
      topic: string,
      key: string|null,
      pages: Array<PageFact & { sectionSix: string|null }>,
      records: Array<{
        key: string, file: string|null, source: string|null,
        price_source: string|null, value: unknown, display: unknown,
        volatility: string|null, verified: string|null
      }>,
      blocking: Array<{ rule: string, path: string, message: string }>
    }
    ```

  - `renderWorkOrder(order: Order) -> string` — the markdown the refresh prompt is handed.

**Deliberate non-parsing.** The record list is derived mechanically from `referencedRecordKeys`, which is exact. The prose lists in section 6 — identifiers to re-check, values lint cannot guard, dated studies — are **not parsed**. They are free prose in five different authorial voices, and a parser would silently drop items it did not recognise, which is precisely the "refresh under-checks a unit and still reports success under a fresh date" failure the spec calls invisible by construction. Section 6 goes to the prompt verbatim instead, and the prompt is responsible for working it.

- [ ] **Step 1: Write the no-section-6 fixture**

`tools/corpus/test/fixtures/refresh/guides/gamma/nosix.md` — a page with `topic: gamma`, `## 1.` through `## 5.` then `## 7.` and `## 8.` (no `## 6.`), and section 2 body:

```markdown
Solo: <!-- corpus:data key=fix.solo.seven -->solo-seven<!-- /corpus:data -->
```

**It references `fix.solo.seven` and nothing else, so it is a unit of one.** That is deliberate. Pointing it at `fix.alone.four` instead would pull it into `lonely.md`'s unit and silently invalidate two assertions Tasks 1 and 2 already committed — `resolveUnit(FIX, "guides/gamma/lonely.md")` yielding exactly `["guides/gamma/lonely.md"]`, and `unitSlug(lonelyUnit) === "lonely"` — both of which would go red at this task's own `npm test` gate. Keeping `nosix.md` separate preserves Task 1's "unit of one" case, which is otherwise the only one in the tree, and lets the no-section-6 block be tested from its own entry page. `fix.solo.seven` is declared in Task 1's `data/units.yaml`, so this task adds a file and amends no committed test.

- [ ] **Step 2: Write the failing test**

`tools/corpus/test/refresh-order.test.mjs`:

```javascript
// tools/corpus/test/refresh-order.test.mjs
import test from "node:test";
import assert from "node:assert/strict";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { loadRecords } from "../data.mjs";
import { RefreshError, resolveUnit } from "../refresh-units.mjs";
import { workOrder, renderWorkOrder } from "../refresh-order.mjs";

const FIX = fileURLToPath(new URL("./fixtures/refresh/", import.meta.url));
const fixRecords = () => loadRecords(path.join(FIX, "data"));
const order = (entry, opts) =>
  workOrder(FIX, resolveUnit(FIX, entry, fixRecords()), fixRecords(), opts);

test("the work order carries every record in the unit, with its source", () => {
  const o = order("guides/alpha/one.md");
  assert.deepEqual(
    o.records.map((r) => r.key),
    ["fix.bridge.two", "fix.shared.one", "fix.tail.three"],
  );
  const shared = o.records.find((r) => r.key === "fix.shared.one");
  assert.equal(shared.source, "https://example.invalid/one");
  assert.equal(shared.file, "data/units.yaml");
  assert.equal(shared.volatility, "high");
});

test("the work order carries each page's section 6 verbatim", () => {
  const o = order("guides/alpha/one.md");
  const one = o.pages.find((p) => p.path === "guides/alpha/one.md");
  assert.match(
    one.sectionSix,
    /Re-check on refresh: the fixture identifier `FIXTURE_FLAG`\./,
  );
  assert.equal(o.blocking.length, 0);
});

// Review Focus 5, second half: an empty checklist is not "nothing to check".
// nosix.md is its own unit of one, so this enters from nosix.md itself.
test("a page with no section 6 blocks the work order", () => {
  const o = order("guides/gamma/nosix.md");
  assert.deepEqual(
    o.pages.map((p) => p.path),
    ["guides/gamma/nosix.md"],
  );
  const issue = o.blocking.find(
    (b) => b.rule === "refresh-section-six-missing",
  );
  assert.equal(issue.path, "guides/gamma/nosix.md");
  assert.match(issue.message, /empty checklist/);
});

// lonely.md stays a unit of one and stays clean: nosix.md is not in its unit.
test("the neighbouring unit of one is unaffected and has no blocking issue", () => {
  const o = order("guides/gamma/lonely.md");
  assert.deepEqual(
    o.pages.map((p) => p.path),
    ["guides/gamma/lonely.md"],
  );
  assert.deepEqual(o.blocking, []);
});

// A deprecated page cannot be refreshed, so it is exempt from this block the
// same way corpus verify exempts it from template-sections.
test("a deprecated page with no section 6 does not block", () => {
  const o = order("guides/alpha/one.md");
  assert.equal(
    o.blocking.some((b) => b.path === "guides/beta/gone.md"),
    false,
  );
});

test("a record with no source blocks: there is nothing to re-read it against", () => {
  const records = [...fixRecords()];
  const unit = {
    entry: "guides/gamma/lonely.md",
    pages: [
      {
        path: "guides/gamma/lonely.md",
        topic: "gamma",
        status: null,
        keys: ["fix.nosource.six"],
      },
    ],
    keys: ["fix.nosource.six"],
    topics: ["gamma"],
    dataFiles: ["data/units.yaml"],
  };
  const o = workOrder(FIX, unit, records);
  assert.equal(
    o.blocking.some((b) => b.rule === "refresh-record-source-missing"),
    true,
  );
});

test("--key narrows a unit, records the narrowing, and refuses to widen one", () => {
  const o = order("guides/alpha/one.md", { key: "fix.tail.three" });
  assert.equal(o.key, "fix.tail.three");
  assert.equal(order("guides/alpha/one.md").key, null);
  assert.deepEqual(
    o.records.map((r) => r.key),
    ["fix.tail.three"],
  );
  assert.deepEqual(
    o.pages.map((p) => p.path),
    ["guides/beta/gone.md", "guides/beta/three.md"],
  );
  assert.throws(
    () => order("guides/alpha/one.md", { key: "fix.alone.four" }),
    (err) =>
      err instanceof RefreshError && err.rule === "refresh-key-out-of-unit",
  );
});

test("renderWorkOrder names the unit, its records and its blocking issues", () => {
  const text = renderWorkOrder(order("guides/gamma/nosix.md"));
  assert.match(text, /^# Refresh work order: /m);
  assert.match(text, /^## Records to re-read$/m);
  assert.match(text, /^## Section 6 verbatim: guides\/gamma\/nosix\.md$/m);
  assert.match(text, /^## Blocking before any fetch$/m);
  assert.match(text, /refresh-section-six-missing/);
});
```

- [ ] **Step 3: Run the test to verify it fails**

Run: `node --test tools/corpus/test/refresh-order.test.mjs`
Expected: FAIL — `Cannot find module '.../tools/corpus/refresh-order.mjs'`.

- [ ] **Step 4: Write the implementation**

`tools/corpus/refresh-order.mjs`:

```javascript
// tools/corpus/refresh-order.mjs
// Section 6 is already an executable work order. This module builds the
// mechanical half of it — the exact record list — and hands each page's
// section 6 through VERBATIM. The prose lists (identifiers, values lint cannot
// guard, dated studies) are deliberately NOT parsed: a parser would silently
// drop items it did not recognise, and refresh would then under-check a unit
// and still report success under a fresh date.
import fs from "node:fs";
import path from "node:path";
import { sectionSixText } from "./verify-pages.mjs";
import { RefreshError, unitSlug, unitTopic } from "./refresh-units.mjs";

export function workOrder(root, unit, records, { key = null } = {}) {
  const byKey = new Map(records.map((r) => [r.key, r]));
  const wanted = key === null ? unit.keys : unit.keys.filter((k) => k === key);
  if (key !== null && wanted.length === 0)
    throw new RefreshError(
      "refresh-key-out-of-unit",
      `record ${key} is not referenced by this unit; --key narrows a unit, it never widens one`,
    );
  const blocking = [];
  const pages = unit.pages
    .filter((p) => key === null || p.keys.includes(key))
    .map((p) => {
      const text = fs.readFileSync(path.join(root, p.path), "utf8");
      const six = sectionSixText(text);
      // A deprecated page could not be refreshed, so it is exempt — the same
      // carve-out corpus verify makes for template-sections.
      if (six === null && p.status !== "deprecated")
        blocking.push({
          rule: "refresh-section-six-missing",
          path: p.path,
          message:
            'no "## 6." section, so this page contributes an empty checklist; an empty checklist is not "nothing to check"',
        });
      return { ...p, sectionSix: six };
    });
  const recordsOut = wanted.map((k) => {
    const r = byKey.get(k) ?? {};
    if (r.source == null || String(r.source).trim() === "")
      blocking.push({
        rule: "refresh-record-source-missing",
        path: r.file ? `data/${r.file}` : "data/",
        message: `record ${k} has no source, so there is nothing to re-read it against`,
      });
    return {
      key: k,
      file: r.file ? `data/${r.file}` : null,
      source: r.source ?? null,
      price_source: r.price_source ?? null,
      value: r.value ?? null,
      display: r.display ?? null,
      volatility: r.volatility ?? null,
      verified: r.verified ?? null,
    };
  });
  return {
    unit,
    slug: unitSlug(unit),
    topic: unitTopic(unit),
    // Carried on the order so the artifact can record it. A key-scoped refresh
    // stamps records only; see "Decision: what `--key` is allowed to stamp".
    key,
    pages,
    records: recordsOut,
    blocking,
  };
}

export function renderWorkOrder(order) {
  const lines = [
    `# Refresh work order: ${order.slug}`,
    "",
    `Topic: ${order.topic}`,
    `Topics spanned: ${order.unit.topics.map((t) => String(t)).join(", ")}`,
    `Entry page: ${order.unit.entry}`,
    `Pages in unit: ${order.unit.pages.map((p) => p.path).join(", ")}`,
    `Data files written: ${order.unit.dataFiles.join(", ") || "(none)"}`,
    order.key === null
      ? "Scope: the whole unit."
      : `Scope: --key=${order.key} — records only. No page's verified moves and no research: is set.`,
    "",
    "## Records to re-read",
    "",
  ];
  for (const r of order.records)
    lines.push(
      `- \`${r.key}\` in ${r.file ?? "(no file)"} — value ${JSON.stringify(r.value)}, display ${JSON.stringify(r.display)}, volatility ${r.volatility ?? "(none)"}, verified ${r.verified ?? "(none)"}, source ${r.source ?? "(none)"}${r.price_source ? `, price_source ${r.price_source}` : ""}`,
    );
  lines.push("");
  for (const p of order.pages) {
    lines.push(`## Section 6 verbatim: ${p.path}`, "");
    lines.push(
      p.sectionSix ??
        (p.status === "deprecated"
          ? "(deprecated page, no section 6 — exempt)"
          : "(no section 6 — BLOCKING)"),
    );
    lines.push("");
  }
  if (order.blocking.length > 0) {
    lines.push("## Blocking before any fetch", "");
    for (const b of order.blocking)
      lines.push(`- ${b.path} [${b.rule}] ${b.message}`);
    lines.push("");
  }
  return lines.join("\n");
}
```

- [ ] **Step 5: Run the test to verify it passes**

Run: `node --test tools/corpus/test/refresh-order.test.mjs`
Expected: PASS, 8 tests.

- [ ] **Step 6: Prove the two blocking guards are load-bearing**

Two mutations, one at a time:

1. Delete the `refresh-section-six-missing` push. Expected: "a page with no section 6 blocks the work order" and the `renderWorkOrder` test both go red. Restore.
2. Change the deprecation carve-out from `p.status !== "deprecated"` to `true`. Expected: "a deprecated page with no section 6 does not block" goes red — unconditionally, because Task 1 writes `gone.md` with headings `## 1.`–`## 5.`, `## 7.`, `## 8.` and no `## 6.`, so the carve-out is the only thing keeping it out of `blocking`. If it does not go red, the fixture was written with a `## 6.` section: fix the fixture, not the test, and re-run. Restore.

Run `node --test tools/corpus/test/refresh-order.test.mjs` after each.

- [ ] **Step 7: Run the four gates**

```bash
node tools/corpus/cli.mjs render --check . && node tools/corpus/cli.mjs lint . && node tools/corpus/cli.mjs verify . && npm test
```

Expected: no `would render:`, `lint: clean`, `verify: clean`, tests pass.

- [ ] **Step 8: Commit**

```bash
rm -rf tools/corpus/test/fixtures/refresh/guides/gamma/.claude
git add tools/corpus/refresh-order.mjs tools/corpus/test/refresh-order.test.mjs tools/corpus/test/fixtures/refresh/guides/gamma/nosix.md
git commit -m "feat: derive a refresh work order from each page's section 6"
```

---

### Task 4: Surgical date and `research:` editors

**Files:**

- Create: `tools/corpus/refresh-stamp.mjs`
- Test: `tools/corpus/test/refresh-stamp.test.mjs`

**Interfaces:**

- Consumes: `RefreshError` from `tools/corpus/refresh-units.mjs`.
- Produces:
  - `recordBlockRange(yamlText: string, key: string) -> { lines: string[], start: number, end: number } | null`
  - `setRecordVerified(yamlText: string, key: string, date: string) -> { text: string, previous: string }`
  - `setPageVerified(pageText: string, date: string) -> { text: string, previous: string }`
  - `setPageResearch(pageText: string, researchPath: string) -> { text: string, added: boolean, previous: string|null }`
  - `removePageResearch(pageText: string) -> { text: string, removed: boolean }`

  All throw `RefreshError` with rules `refresh-record-not-found`, `refresh-record-verified-missing`, `refresh-frontmatter-missing`, `refresh-page-verified-missing`.

**Why single-line edits and not a YAML round trip.** Dumping `data/*.yaml` would strip the contract-required comments at the top of `data/models.yaml` and `data/models-other.yaml` and rewrite every line, so two units editing the same file would conflict on every concurrent run. See "Decision: two units can share a `data/*.yaml` file".

**Every editor preserves the quote character and the trailing whitespace it found, on every path.** `setPageResearch` has two: it inserts a line when the page has no `research:`, and rewrites one when it has. The rewrite path is the one that makes `--revert` byte-exact rather than merely value-exact — a page on its *second* refresh already carries a `research:` line, and if the rewrite normalised `research: "a.md"` to `research: a.md` then a later revert would restore the value and not the bytes, quietly falsifying the claim the whole receipt mechanism rests on. Both paths are therefore built on the same four-capture pattern as `setPageVerified`, and `two.md` in the fixture tree carries a quoted `research:` so the rewrite path is exercised here and again in Task 7.

- [ ] **Step 1: Write the failing test**

`tools/corpus/test/refresh-stamp.test.mjs`:

```javascript
// tools/corpus/test/refresh-stamp.test.mjs
import test from "node:test";
import assert from "node:assert/strict";
import { RefreshError } from "../refresh-units.mjs";
import {
  recordBlockRange,
  setRecordVerified,
  setPageVerified,
  setPageResearch,
  removePageResearch,
} from "../refresh-stamp.mjs";

// Review Focus 1: opus-5 must not match inside opus-5-preview, and the longer
// record's block must not be entered at all.
const PREFIX_YAML = [
  "# leading comment the loader needs",
  "records:",
  "  - key: anthropic.models.opus-5",
  "    value: claude-opus-5",
  '    verified: "2026-09-16"',
  "  - key: anthropic.models.opus-5-preview",
  "    value: claude-opus-5-preview",
  '    verified: "2026-09-01"',
  "",
].join("\n");

test("a record key is matched whole, never as a prefix of a longer key", () => {
  const { text, previous } = setRecordVerified(
    PREFIX_YAML,
    "anthropic.models.opus-5",
    "2026-09-28",
  );
  assert.equal(previous, "2026-09-16");
  assert.equal(text.includes('verified: "2026-09-28"'), true);
  // The longer key's own date is untouched.
  assert.equal(text.includes('verified: "2026-09-01"'), true);
  // And the comment survives: this is a line edit, not a YAML round trip.
  assert.equal(text.startsWith("# leading comment the loader needs"), true);
});

test("the longer key can still be addressed on its own", () => {
  const { previous } = setRecordVerified(
    PREFIX_YAML,
    "anthropic.models.opus-5-preview",
    "2026-09-28",
  );
  assert.equal(previous, "2026-09-01");
});

test("recordBlockRange stops at the next - key: line", () => {
  const range = recordBlockRange(PREFIX_YAML, "anthropic.models.opus-5");
  assert.equal(range.start, 2);
  assert.equal(range.end, 5);
});

test("an unknown key raises", () => {
  assert.throws(
    () => setRecordVerified(PREFIX_YAML, "anthropic.models.nope", "2026-09-28"),
    (err) =>
      err instanceof RefreshError && err.rule === "refresh-record-not-found",
  );
});

// Review Focus 1, second half: a silently skipped record keeps a stale date
// under a freshly dated page — exactly the laundering the blocked outcome
// exists to prevent — so a missing verified: line must raise.
test("a record block with no verified: line raises rather than being skipped", () => {
  const yaml = [
    "records:",
    "  - key: fix.noverified.five",
    "    value: noverified-five",
    "",
  ].join("\n");
  assert.throws(
    () => setRecordVerified(yaml, "fix.noverified.five", "2026-09-28"),
    (err) =>
      err instanceof RefreshError &&
      err.rule === "refresh-record-verified-missing",
  );
});

test("an unquoted date stays unquoted and a quoted one keeps its quotes", () => {
  const unquoted = "records:\n  - key: a.b\n    verified: 2026-09-16\n";
  assert.equal(
    setRecordVerified(unquoted, "a.b", "2026-09-28").text,
    "records:\n  - key: a.b\n    verified: 2026-09-28\n",
  );
  const quoted = "records:\n  - key: a.b\n    verified: '2026-09-16'\n";
  assert.equal(
    setRecordVerified(quoted, "a.b", "2026-09-28").text,
    "records:\n  - key: a.b\n    verified: '2026-09-28'\n",
  );
});

const PAGE = [
  "---",
  "title: One",
  "topic: alpha",
  "verified: 2026-09-16",
  "sources:",
  "  - https://example.invalid/one",
  "seed: true",
  "---",
  "",
  "# One",
  "",
].join("\n");

test("a page's verified date is bumped in front-matter only", () => {
  const { text, previous } = setPageVerified(PAGE, "2026-09-28");
  assert.equal(previous, "2026-09-16");
  assert.equal(text.includes("verified: 2026-09-28"), true);
  assert.equal(text.endsWith("# One\n"), true);
});

test("a page with no front-matter raises", () => {
  assert.throws(
    () => setPageVerified("# No front-matter\n", "2026-09-28"),
    (err) =>
      err instanceof RefreshError && err.rule === "refresh-frontmatter-missing",
  );
});

test("a page with no verified: line raises", () => {
  assert.throws(
    () => setPageVerified("---\ntitle: X\n---\n\nbody\n", "2026-09-28"),
    (err) =>
      err instanceof RefreshError &&
      err.rule === "refresh-page-verified-missing",
  );
});

test("research: is inserted before seed:, and seed: is never removed", () => {
  const { text, added, previous } = setPageResearch(
    PAGE,
    "research/alpha/2026-09-28-one-refresh.md",
  );
  assert.equal(added, true);
  assert.equal(previous, null);
  assert.match(
    text,
    /research: research\/alpha\/2026-09-28-one-refresh\.md\nseed: true/,
  );
  assert.equal(text.includes("seed: true"), true);
});

test("an existing research: value is replaced, not duplicated", () => {
  const once = setPageResearch(PAGE, "research/alpha/a.md").text;
  const twice = setPageResearch(once, "research/alpha/b.md");
  assert.equal(twice.added, false);
  assert.equal(twice.previous, "research/alpha/a.md");
  assert.equal(twice.text.match(/^research: /gm).length, 1);
});

test("removePageResearch restores the original bytes exactly", () => {
  const added = setPageResearch(PAGE, "research/alpha/a.md").text;
  const { text, removed } = removePageResearch(added);
  assert.equal(removed, true);
  assert.equal(text, PAGE);
});

// The replace path must be byte-preserving, not just value-preserving: a page
// on its second refresh already carries research:, and a revert that restored
// the value but not the quoting would falsify the byte-exact claim.
const PAGE_QUOTED_RESEARCH = [
  "---",
  "title: Two",
  "topic: alpha",
  "verified: 2026-09-16",
  'research: "research/alpha/prior.md"  ',
  "seed: true",
  "---",
  "",
  "# Two",
  "",
].join("\n");

test("a quoted research: value keeps its quotes and its trailing whitespace", () => {
  const first = setPageResearch(
    PAGE_QUOTED_RESEARCH,
    "research/alpha/2026-09-28-one-refresh.md",
  );
  assert.equal(first.added, false);
  assert.equal(first.previous, "research/alpha/prior.md");
  assert.equal(
    first.text.includes(
      'research: "research/alpha/2026-09-28-one-refresh.md"  ',
    ),
    true,
  );
  // And restoring the previous value reproduces the original bytes exactly.
  const back = setPageResearch(first.text, "research/alpha/prior.md");
  assert.equal(back.text, PAGE_QUOTED_RESEARCH);
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `node --test tools/corpus/test/refresh-stamp.test.mjs`
Expected: FAIL — `Cannot find module '.../tools/corpus/refresh-stamp.mjs'`.

- [ ] **Step 3: Write the implementation**

`tools/corpus/refresh-stamp.mjs`:

```javascript
// tools/corpus/refresh-stamp.mjs
// Single-line surgical edits, never a YAML round trip. Dumping data/*.yaml
// would strip the contract-required comments at the top of data/models.yaml and
// data/models-other.yaml and rewrite every line, so two units editing the same
// file would conflict on every concurrent run. Record-scoped line edits are
// disjoint by construction and git auto-merges them.
import { RefreshError } from "./refresh-units.mjs";

// Three capture groups so the body can be rebuilt byte-exactly: the opening
// fence, the body without its trailing newline, and the closing fence. Mirrors
// frontmatter.mjs's FM pattern.
const FRONTMATTER = /^(---\r?\n)([\s\S]*?)(\r?\n---[ \t]*\r?\n?)/;

function escapeKey(key) {
  return key.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

// A record block runs from its own `- key:` line to the next one, or EOF. The
// key is anchored to end of line, so `anthropic.models.opus-5` cannot match
// inside `anthropic.models.opus-5-preview`.
export function recordBlockRange(yamlText, key) {
  const lines = yamlText.split("\n");
  const open = new RegExp(
    `^\\s*-\\s+key:\\s*(["']?)${escapeKey(key)}\\1\\s*$`,
  );
  const anyOpen = /^\s*-\s+key:\s/;
  let start = -1;
  for (let i = 0; i < lines.length; i++) {
    if (open.test(lines[i])) {
      start = i;
      break;
    }
  }
  if (start === -1) return null;
  let end = lines.length;
  for (let i = start + 1; i < lines.length; i++) {
    if (anyOpen.test(lines[i])) {
      end = i;
      break;
    }
  }
  return { lines, start, end };
}

// The quote character is captured and re-emitted, so a quoted date stays quoted
// and an unquoted one stays unquoted: the corpus uses both (records quote,
// guides do not) and rewriting the style would widen every diff.
const RECORD_DATE = /^(\s*verified:\s*)(["']?)([^"'\s]*)\2([ \t]*)$/;

export function setRecordVerified(yamlText, key, date) {
  const range = recordBlockRange(yamlText, key);
  if (range === null)
    throw new RefreshError(
      "refresh-record-not-found",
      `no record with key ${key} in this data file`,
    );
  const { lines, start, end } = range;
  for (let i = start; i < end; i++) {
    const m = RECORD_DATE.exec(lines[i]);
    if (m === null) continue;
    const previous = m[3];
    lines[i] = `${m[1]}${m[2]}${date}${m[2]}${m[4]}`;
    return { text: lines.join("\n"), previous };
  }
  throw new RefreshError(
    "refresh-record-verified-missing",
    `record ${key} has no verified: line to bump; skipping it would leave a stale record date under a freshly dated page`,
  );
}

function frontmatterParts(pageText) {
  const m = FRONTMATTER.exec(pageText);
  if (m === null)
    throw new RefreshError(
      "refresh-frontmatter-missing",
      "page has no --- front-matter block",
    );
  return {
    open: m[1],
    body: m[2],
    close: m[3],
    rest: pageText.slice(m[0].length),
  };
}

function rebuild(fm, lines) {
  return fm.open + lines.join("\n") + fm.close + fm.rest;
}

const PAGE_DATE = /^(verified:\s*)(["']?)([^"'\s]*)\2([ \t]*)$/;

export function setPageVerified(pageText, date) {
  const fm = frontmatterParts(pageText);
  const lines = fm.body.split("\n");
  for (let i = 0; i < lines.length; i++) {
    const m = PAGE_DATE.exec(lines[i]);
    if (m === null) continue;
    const previous = m[3];
    lines[i] = `${m[1]}${m[2]}${date}${m[2]}${m[4]}`;
    return { text: rebuild(fm, lines), previous };
  }
  throw new RefreshError(
    "refresh-page-verified-missing",
    "page front-matter has no verified: line",
  );
}

// Four captures, exactly like PAGE_DATE: the label and its spacing, the quote
// character, the value, and any trailing whitespace. The replace path re-emits
// all of them, so rewriting a research: line preserves bytes and not merely the
// value — which is what makes --revert byte-exact on a page's second refresh.
const PAGE_RESEARCH = /^(research:\s*)(["']?)([^"'\s]*)\2([ \t]*)$/;

// Never touches `seed:`. It is permanent provenance — "a document authored
// before the pipeline existed" — not a status a refresh clears.
export function setPageResearch(pageText, researchPath) {
  const fm = frontmatterParts(pageText);
  const lines = fm.body.split("\n");
  for (let i = 0; i < lines.length; i++) {
    const m = PAGE_RESEARCH.exec(lines[i]);
    if (m === null) continue;
    const previous = m[3];
    lines[i] = `${m[1]}${m[2]}${researchPath}${m[2]}${m[4]}`;
    return { text: rebuild(fm, lines), added: false, previous };
  }
  const seedAt = lines.findIndex((l) => /^seed:\s/.test(l));
  const verifiedAt = lines.findIndex((l) => /^verified:\s/.test(l));
  const at =
    seedAt !== -1 ? seedAt : verifiedAt !== -1 ? verifiedAt + 1 : lines.length;
  lines.splice(at, 0, `research: ${researchPath}`);
  return { text: rebuild(fm, lines), added: true, previous: null };
}

export function removePageResearch(pageText) {
  const fm = frontmatterParts(pageText);
  const lines = fm.body.split("\n");
  const at = lines.findIndex((l) => PAGE_RESEARCH.test(l));
  if (at === -1) return { text: pageText, removed: false };
  lines.splice(at, 1);
  return { text: rebuild(fm, lines), removed: true };
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `node --test tools/corpus/test/refresh-stamp.test.mjs`
Expected: PASS, 13 tests.

- [ ] **Step 5: Prove the prefix anchor, the missing-line raise and the byte preservation are load-bearing**

Three mutations, one at a time:

1. In `recordBlockRange`, drop the trailing `\\s*$` from `open`, leaving `` `^\\s*-\\s+key:\\s*(["']?)${escapeKey(key)}\\1` ``. Expected: "the longer key can still be addressed on its own" goes red — `previous` comes back `"2026-09-16"`, the wrong record. Restore.
2. Replace the final `throw` in `setRecordVerified` with `return { text: yamlText, previous: null };`. Expected: "a record block with no verified: line raises rather than being skipped" goes red. Restore.
3. In `setPageResearch`'s replace branch, change the rewrite back to the unconditional form it had before this revision, `lines[i] = "research: " + researchPath;`. Expected: "a quoted research: value keeps its quotes and its trailing whitespace" goes red on the first `includes` assertion — the quotes and the two trailing spaces are gone. Restore.

Run `node --test tools/corpus/test/refresh-stamp.test.mjs` after each.

- [ ] **Step 6: Run the four gates**

```bash
node tools/corpus/cli.mjs render --check . && node tools/corpus/cli.mjs lint . && node tools/corpus/cli.mjs verify . && npm test
```

Expected: no `would render:`, `lint: clean`, `verify: clean`, tests pass.

- [ ] **Step 7: Commit**

```bash
git add tools/corpus/refresh-stamp.mjs tools/corpus/test/refresh-stamp.test.mjs
git commit -m "feat: add surgical verified and research editors for pages and records"
```


---

### Task 5: The refresh artifact schema

**Files:**

- Create: `tools/corpus/refresh-artifact.mjs`
- Test: `tools/corpus/test/refresh-artifact.test.mjs`

**Interfaces:**

- Consumes: `parseFrontmatter` from `tools/corpus/frontmatter.mjs`; `isValidIsoDate(s) -> boolean` from `tools/corpus/ledger.mjs`; `RefreshError` from `tools/corpus/refresh-units.mjs`; `Order` from `tools/corpus/refresh-order.mjs`.
- Produces:
  - `UNIT_VERDICTS = ["confirmed", "changed", "blocked"]` (frozen)
  - `RECORD_VERDICTS = ["confirmed", "corrected", "unreachable"]` (frozen)
  - `ARTIFACT_FIELDS` (frozen) — the required front-matter keys
  - `parseArtifact(text: string) -> { data: object|null, body: string }`
  - `dumpArtifact(data: object, body: string) -> string`
  - `renderArtifactSkeleton(order: Order, opts: { fetched: string, artifactPath: string }) -> string`
  - `validateArtifact(data: unknown) -> Array<{ rule: string, message: string }>`
  - `withReceipt(artifactText: string, receipt: Receipt) -> string`
  - `withRevertMark(artifactText: string, at: string) -> string`

  where `Receipt = { at: string, pages: Array<{ path: string, previous_verified: string, research_added: boolean, previous_research: string|null }>, records: Array<{ key: string, file: string, previous_verified: string, new_verified: string }> }`.

  `withRevertMark` moves that receipt to `reverted:` and re-keys its date so **both** dates survive: `RevertMark = { stamped_at: string|null, at: string, pages: Receipt["pages"], records: Receipt["records"] }`, where `at` is the revert date and `stamped_at` is the receipt's original `at`. A plain `{ at, ...stamped }` spread would silently overwrite the revert date with the stamp date — a later spread wins, and `Receipt` carries its own `at` — so the spread order and the re-keying are both load-bearing, and Step 5 mutates them. Both dates matter: 2a-iii's audit needs to know when a block happened, not only when the stamp did.

**Two vocabularies, deliberately.** The unit verdict is `confirmed | changed | blocked`; a record verdict is `confirmed | corrected | unreachable`. They are not the same axis: a record is corrected or could not be read, a unit shipped or did not. Any `unreachable` record forces the unit to `blocked` (`refresh-verdict-incoherent`), and `blocked` writes nothing at all — there is no partial freshness.

**The artifact is the one file refresh round-trips through YAML.** It is machine-generated and carries no comments, so `dumpArtifact` is safe on it. `data/*.yaml` and `guides/**.md` never are.

**`key_scoped` is a required field, not an option.** It records whether the run was narrowed with `--key`, and `stampUnit` reads it to decide whether any page is touched at all. Making it required means a hand-written or hand-edited artifact cannot omit it and inherit the whole-unit behaviour by default — the failure would be silent and would write a page-wide freshness claim. See "Decision: what `--key` is allowed to stamp".

**Narrative belongs in the pull request body, not here.** The artifact records verdicts, URLs, stated figures and dates only. Conflating a refresh log with a grounding research artifact would make `research-required` satisfiable by a log rather than by real grounding, quietly weakening the field the contract reserved.

- [ ] **Step 1: Write the failing test**

`tools/corpus/test/refresh-artifact.test.mjs`:

```javascript
// tools/corpus/test/refresh-artifact.test.mjs
import test from "node:test";
import assert from "node:assert/strict";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { loadRecords } from "../data.mjs";
import { resolveUnit, artifactPathFor } from "../refresh-units.mjs";
import { workOrder } from "../refresh-order.mjs";
import {
  UNIT_VERDICTS,
  RECORD_VERDICTS,
  parseArtifact,
  dumpArtifact,
  renderArtifactSkeleton,
  validateArtifact,
  withReceipt,
  withRevertMark,
} from "../refresh-artifact.mjs";

const FIX = fileURLToPath(new URL("./fixtures/refresh/", import.meta.url));
const fixRecords = () => loadRecords(path.join(FIX, "data"));

function skeleton() {
  const unit = resolveUnit(FIX, "guides/alpha/one.md", fixRecords());
  const order = workOrder(FIX, unit, fixRecords());
  const artifactPath = artifactPathFor(unit, "2026-09-28");
  return {
    artifactPath,
    text: renderArtifactSkeleton(order, { fetched: "2026-09-28", artifactPath }),
  };
}

test("the vocabularies are the two the contract names", () => {
  assert.deepEqual([...UNIT_VERDICTS], ["confirmed", "changed", "blocked"]);
  assert.deepEqual(
    [...RECORD_VERDICTS],
    ["confirmed", "corrected", "unreachable"],
  );
});

// Fail-closed: a skeleton nobody filled in cannot be stamped.
test("a fresh skeleton is blocked with every record unreachable", () => {
  const { text, artifactPath } = skeleton();
  const { data, body } = parseArtifact(text);
  assert.equal(data.kind, "refresh");
  assert.equal(data.verdict, "blocked");
  assert.equal(data.path, artifactPath);
  assert.equal(data.entry, "guides/alpha/one.md");
  assert.deepEqual(data.topics, ["alpha", "beta"]);
  assert.equal(
    data.records.every((r) => r.verdict === "unreachable"),
    true,
  );
  assert.equal(data.key_scoped, false);
  assert.match(body, /Narrative belongs in the pull request body/);
});

// Review Focus 3(b): the artifact must carry the narrowing, or stampUnit cannot
// know not to sweep the unit's pages.
test("a --key skeleton is marked key_scoped and covers only that record", () => {
  const unit = resolveUnit(FIX, "guides/alpha/one.md", fixRecords());
  const order = workOrder(FIX, unit, fixRecords(), { key: "fix.tail.three" });
  const artifactPath = artifactPathFor(unit, "2026-09-28");
  const { data } = parseArtifact(
    renderArtifactSkeleton(order, { fetched: "2026-09-28", artifactPath }),
  );
  assert.equal(data.key_scoped, true);
  assert.deepEqual(data.unit_keys, ["fix.tail.three"]);
  // The unit is still recorded in full, so a reader can see what was NOT swept.
  assert.equal(data.unit.length, 4);
});

test("a skeleton round-trips through parse and dump", () => {
  const { text } = skeleton();
  const { data, body } = parseArtifact(text);
  assert.equal(dumpArtifact(data, body), text);
});

test("a skeleton covers every record in the unit", () => {
  const { text } = skeleton();
  const { data } = parseArtifact(text);
  assert.deepEqual(
    data.records.map((r) => r.key).sort(),
    [...data.unit_keys].sort(),
  );
  assert.equal(
    data.records.every((r) => r.file === "data/units.yaml"),
    true,
  );
});

function confirmed() {
  const { text } = skeleton();
  const { data } = parseArtifact(text);
  return {
    ...data,
    verdict: "confirmed",
    records: data.records.map((r) => ({
      ...r,
      verdict: "confirmed",
      url: "https://example.invalid/one",
      stated: "unchanged",
      read: "2026-09-28",
    })),
  };
}

test("a filled-in confirmed artifact validates clean", () => {
  assert.deepEqual(validateArtifact(confirmed()), []);
});

// Review Focus 3: an unreachable record forces blocked.
test("an unreachable record with a confirmed unit verdict is incoherent", () => {
  const data = confirmed();
  data.records[0] = { ...data.records[0], verdict: "unreachable" };
  const rules = validateArtifact(data).map((i) => i.rule);
  assert.equal(rules.includes("refresh-verdict-incoherent"), true);
  data.verdict = "blocked";
  assert.deepEqual(
    validateArtifact(data).filter(
      (i) => i.rule === "refresh-verdict-incoherent",
    ),
    [],
  );
});

test("a record in the unit with no verdict entry is a coverage gap", () => {
  const data = confirmed();
  data.records = data.records.slice(1);
  const issue = validateArtifact(data).find(
    (i) => i.rule === "refresh-artifact-coverage",
  );
  assert.match(issue.message, /has no verdict entry/);
});

test("kind, required fields, verdicts and dates are all checked", () => {
  assert.equal(
    validateArtifact({ ...confirmed(), kind: "research" }).some(
      (i) => i.rule === "refresh-artifact-kind",
    ),
    true,
  );
  const { fetched, ...noFetched } = confirmed();
  assert.equal(
    validateArtifact(noFetched).some((i) => i.rule === "refresh-artifact-field"),
    true,
  );
  assert.equal(
    validateArtifact({ ...confirmed(), verdict: "ok" }).some(
      (i) => i.rule === "refresh-artifact-verdict",
    ),
    true,
  );
  assert.equal(
    validateArtifact({ ...confirmed(), fetched: "2026-02-30" }).some(
      (i) => i.rule === "refresh-artifact-date",
    ),
    true,
  );
  const badRead = confirmed();
  badRead.records[0] = { ...badRead.records[0], read: "28-09-2026" };
  assert.equal(
    validateArtifact(badRead).some((i) => i.rule === "refresh-artifact-date"),
    true,
  );
  assert.deepEqual(validateArtifact("not a mapping"), [
    {
      rule: "refresh-artifact-shape",
      message: "artifact front-matter is not a mapping",
    },
  ]);
});

test("key_scoped must be a boolean", () => {
  assert.equal(
    validateArtifact({ ...confirmed(), key_scoped: "yes" }).some(
      (i) => i.rule === "refresh-artifact-field",
    ),
    true,
  );
  const { key_scoped, ...noScope } = confirmed();
  assert.equal(
    validateArtifact(noScope).some((i) => i.rule === "refresh-artifact-field"),
    true,
  );
});

test("a confirmed record must cite the url it was read from", () => {
  const data = confirmed();
  data.records[0] = { ...data.records[0], url: "" };
  assert.equal(
    validateArtifact(data).some((i) => i.rule === "refresh-artifact-field"),
    true,
  );
});

const RECEIPT = {
  at: "2026-09-28",
  pages: [
    {
      path: "guides/alpha/one.md",
      previous_verified: "2026-09-16",
      research_added: true,
      previous_research: null,
    },
  ],
  records: [
    {
      key: "fix.shared.one",
      file: "data/units.yaml",
      previous_verified: "2026-09-16",
      new_verified: "2026-09-28",
    },
  ],
};

test("a receipt is written into and read back out of the artifact", () => {
  const { text } = skeleton();
  const stamped = withReceipt(text, RECEIPT);
  assert.deepEqual(parseArtifact(stamped).data.stamped, RECEIPT);
  assert.equal(parseArtifact(stamped).body, parseArtifact(text).body);
});

test("a revert moves the receipt to reverted: and forces verdict blocked", () => {
  const { text } = skeleton();
  const { data, body } = parseArtifact(text);
  const stamped = withReceipt(
    dumpArtifact({ ...data, verdict: "confirmed" }, body),
    RECEIPT,
  );
  const reverted = parseArtifact(withRevertMark(stamped, "2026-09-29")).data;
  assert.equal("stamped" in reverted, false);
  assert.equal(reverted.verdict, "blocked");
  // The revert date, not the stamp date. RECEIPT.at is "2026-09-28"; a
  // `{ at, ...stamped }` spread would silently put that back here.
  assert.equal(reverted.reverted.at, "2026-09-29");
  assert.equal(reverted.reverted.stamped_at, "2026-09-28");
  assert.equal("at" in RECEIPT, true);
  assert.deepEqual(reverted.reverted.records, RECEIPT.records);
  assert.deepEqual(reverted.reverted.pages, RECEIPT.pages);
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `node --test tools/corpus/test/refresh-artifact.test.mjs`
Expected: FAIL — `Cannot find module '.../tools/corpus/refresh-artifact.mjs'`.

- [ ] **Step 3: Write the implementation**

`tools/corpus/refresh-artifact.mjs`:

```javascript
// tools/corpus/refresh-artifact.mjs
// The evidence artifact is MACHINE-READABLE: verdicts, URLs, stated figures and
// dates in front-matter. Narrative belongs in the pull request body, not here —
// conflating a refresh log with a grounding research artifact would make
// research-required satisfiable by a log rather than by real grounding.
//
// This is also the one file refresh round-trips through YAML. It is generated
// and carries no comments, so dumpArtifact is safe on it; data/*.yaml and
// guides/**.md get single-line surgical edits instead.
import yaml from "js-yaml";
import { parseFrontmatter } from "./frontmatter.mjs";
import { isValidIsoDate } from "./ledger.mjs";
import { RefreshError } from "./refresh-units.mjs";

// Two axes, not one: a record is corrected or could not be read; a unit shipped
// or did not.
export const UNIT_VERDICTS = Object.freeze([
  "confirmed",
  "changed",
  "blocked",
]);
export const RECORD_VERDICTS = Object.freeze([
  "confirmed",
  "corrected",
  "unreachable",
]);

export const ARTIFACT_FIELDS = Object.freeze([
  "kind",
  "unit",
  "entry",
  "topic",
  "topics",
  "slug",
  "path",
  "fetched",
  "verdict",
  "key_scoped",
  "unit_keys",
  "records",
]);

export function parseArtifact(text) {
  const { data, body } = parseFrontmatter(text);
  return { data, body };
}

export function dumpArtifact(data, body) {
  return `---\n${yaml.dump(data)}---\n${body}`;
}

export function renderArtifactSkeleton(order, { fetched, artifactPath }) {
  const data = {
    kind: "refresh",
    unit: order.unit.pages.map((p) => p.path),
    entry: order.unit.entry,
    topic: order.topic,
    topics: order.unit.topics.map((t) => (t == null ? "" : t)),
    slug: order.slug,
    path: artifactPath,
    fetched,
    // Fail closed. A skeleton nobody filled in must not be stampable.
    verdict: "blocked",
    // Carried from the order. stampUnit reads it to decide whether any page is
    // touched: a key-scoped refresh stamps records only.
    key_scoped: order.key !== null,
    unit_keys: order.records.map((r) => r.key),
    records: order.records.map((r) => ({
      key: r.key,
      file: r.file,
      verdict: "unreachable",
      url: r.source ?? "",
      stated: "",
      read: fetched,
    })),
  };
  const body = [
    `# Refresh: ${order.slug} (${fetched})`,
    "",
    "Verdicts, URLs and the figures the sources actually stated live in the front-matter above. Narrative belongs in the pull request body, not here.",
    "",
    ...(order.key === null
      ? []
      : [
          `Scope: \`--key=${order.key}\` — records only. No page's \`verified\` moves and no \`research:\` is set, because a page's date asserts its whole section 6 was worked and this run worked one record.`,
          "",
        ]),
    ...order.pages.flatMap((p) => [
      `## ${p.path}`,
      "",
      "Section 6 as executed:",
      "",
      // FOUR backticks. Section 6 is copied verbatim and a section 6 that
      // itself contains a three-backtick fence would otherwise close this one
      // early and corrupt the artifact's markdown. No section 6 on the live
      // corpus carries a fence today; this costs nothing and stops the first
      // one that does from being a silent corruption.
      "````",
      p.sectionSix ?? "(no section 6)",
      "````",
      "",
      "- Identifiers re-checked against `applies_to`, safety-relevant first:",
      "- Values lint cannot guard, checked by hand:",
      "- Dated studies, citation still resolves:",
      "",
    ]),
  ].join("\n");
  return dumpArtifact(data, body);
}

export function validateArtifact(data) {
  if (data == null || typeof data !== "object" || Array.isArray(data))
    return [
      {
        rule: "refresh-artifact-shape",
        message: "artifact front-matter is not a mapping",
      },
    ];
  const issues = [];
  if (data.kind !== "refresh")
    issues.push({
      rule: "refresh-artifact-kind",
      message: `kind must be "refresh", got ${JSON.stringify(data.kind)}`,
    });
  for (const f of ARTIFACT_FIELDS)
    if (!(f in data))
      issues.push({
        rule: "refresh-artifact-field",
        message: `missing required field: ${f}`,
      });
  if (!UNIT_VERDICTS.includes(data.verdict))
    issues.push({
      rule: "refresh-artifact-verdict",
      message: `verdict must be one of ${UNIT_VERDICTS.join(", ")}, got ${JSON.stringify(data.verdict)}`,
    });
  if (typeof data.fetched !== "string" || !isValidIsoDate(data.fetched))
    issues.push({
      rule: "refresh-artifact-date",
      message: `fetched must be a real date written YYYY-MM-DD, got ${JSON.stringify(data.fetched)}`,
    });
  if (typeof data.key_scoped !== "boolean")
    issues.push({
      rule: "refresh-artifact-field",
      message: `key_scoped must be true or false, got ${JSON.stringify(data.key_scoped)}; it decides whether any page verified moves`,
    });
  if (!Array.isArray(data.records))
    issues.push({
      rule: "refresh-artifact-field",
      message: "records must be a list",
    });
  const entries = Array.isArray(data.records) ? data.records : [];
  const seen = new Set();
  for (const e of entries) {
    const key = e?.key;
    seen.add(key);
    if (!RECORD_VERDICTS.includes(e?.verdict))
      issues.push({
        rule: "refresh-artifact-verdict",
        message: `record ${key}: verdict must be one of ${RECORD_VERDICTS.join(", ")}, got ${JSON.stringify(e?.verdict)}`,
      });
    if (typeof e?.read !== "string" || !isValidIsoDate(e.read))
      issues.push({
        rule: "refresh-artifact-date",
        message: `record ${key}: read must be a real date written YYYY-MM-DD, got ${JSON.stringify(e?.read)}`,
      });
    // A record that could not be reached has no url to cite; every other
    // verdict asserts a figure was read somewhere, so it must say where.
    if (
      e?.verdict !== "unreachable" &&
      (typeof e?.url !== "string" || e.url.trim() === "")
    )
      issues.push({
        rule: "refresh-artifact-field",
        message: `record ${key}: url is required unless the verdict is unreachable`,
      });
    if (typeof e?.file !== "string" || !e.file.startsWith("data/"))
      issues.push({
        rule: "refresh-artifact-field",
        message: `record ${key}: file must name the data/ file the record lives in`,
      });
  }
  if (
    entries.some((e) => e?.verdict === "unreachable") &&
    data.verdict !== "blocked"
  )
    issues.push({
      rule: "refresh-verdict-incoherent",
      message:
        'a record verdict of "unreachable" forces the unit verdict "blocked"; a refresh that could not reach a source must not bump verified',
    });
  for (const k of Array.isArray(data.unit_keys) ? data.unit_keys : [])
    if (!seen.has(k))
      issues.push({
        rule: "refresh-artifact-coverage",
        message: `record ${k} is in the unit but has no verdict entry; refresh would leave it unchecked under a fresh page date`,
      });
  return issues;
}

export function withReceipt(artifactText, receipt) {
  const { data, body } = parseArtifact(artifactText);
  if (data == null)
    throw new RefreshError(
      "refresh-artifact-frontmatter",
      "artifact has no --- front-matter to carry a receipt",
    );
  return dumpArtifact({ ...data, stamped: receipt }, body);
}

// A blocked branch must be harmless to merge, and the artifact must say so: the
// receipt moves to `reverted:` so the next attempt can read what was checked,
// and the verdict goes back to blocked.
export function withRevertMark(artifactText, at) {
  const { data, body } = parseArtifact(artifactText);
  if (data == null)
    throw new RefreshError(
      "refresh-artifact-frontmatter",
      "artifact has no --- front-matter to mark reverted",
    );
  const { stamped, ...rest } = data;
  // The receipt carries its own `at` — the stamp date. Spreading it AFTER `at`
  // would overwrite the revert date with the stamp date, because a later spread
  // wins; spreading it BEFORE would lose the stamp date entirely. So the
  // receipt's date is re-keyed to `stamped_at` and both survive: the audit needs
  // to know when a block happened, not only when the stamp did.
  const { at: stampedAt, ...receiptRest } = stamped ?? {};
  return dumpArtifact(
    {
      ...rest,
      verdict: "blocked",
      reverted: {
        stamped_at: stampedAt ?? null,
        at,
        ...receiptRest,
      },
    },
    body,
  );
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `node --test tools/corpus/test/refresh-artifact.test.mjs`
Expected: PASS, 13 tests.

- [ ] **Step 5: Prove the coherence, coverage, fail-closed, key-scope and revert-date guards are load-bearing**

Five mutations, one at a time:

1. Delete the `refresh-verdict-incoherent` push. Expected: "an unreachable record with a confirmed unit verdict is incoherent" goes red. Restore.
2. Delete the `refresh-artifact-coverage` loop. Expected: "a record in the unit with no verdict entry is a coverage gap" goes red. Restore.
3. Change the skeleton's `verdict` from `"blocked"` to `"confirmed"`. Expected: "a fresh skeleton is blocked with every record unreachable" goes red. Restore.
4. In `renderArtifactSkeleton`, change `key_scoped: order.key !== null` to `key_scoped: false`. Expected: "a --key skeleton is marked key_scoped and covers only that record" goes red. Restore.
5. In `withRevertMark`, replace the whole `reverted:` construction with `reverted: { at, ...(stamped ?? {}) }`. Expected: "a revert moves the receipt to reverted: and forces verdict blocked" goes red on `reverted.reverted.at` — it comes back `"2026-09-28"`, the stamp date, because the receipt's own `at` overwrites it. Restore.

Run `node --test tools/corpus/test/refresh-artifact.test.mjs` after each.

- [ ] **Step 6: Run the four gates**

```bash
node tools/corpus/cli.mjs render --check . && node tools/corpus/cli.mjs lint . && node tools/corpus/cli.mjs verify . && npm test
```

Expected: no `would render:`, `lint: clean`, `verify: clean`, tests pass.

- [ ] **Step 7: Commit**

```bash
git add tools/corpus/refresh-artifact.mjs tools/corpus/test/refresh-artifact.test.mjs
git commit -m "feat: add the machine-readable refresh artifact schema and its receipt"
```


---

### Task 6: `stampUnit` — all-or-nothing freshness

**Files:**

- Modify: `tools/corpus/refresh-stamp.mjs`
- Test: `tools/corpus/test/refresh-stamp.test.mjs`

**Interfaces:**

- Consumes: `setRecordVerified`, `setPageVerified`, `setPageResearch` from Task 4; `validateArtifact`, `withReceipt` from Task 5; `parseFrontmatter` from `tools/corpus/frontmatter.mjs`; `RefreshError` from `tools/corpus/refresh-units.mjs`.
- Produces: `stampUnit(root: string, artifact: object, opts?: { today?: string }) -> { receipt: Receipt, written: string[] }`, where `Receipt` is the shape Task 5 defines. Throws `RefreshError` with rules `refresh-blocked`, `refresh-already-stamped`, `refresh-research-unresolved`, `refresh-record-out-of-unit`, `refresh-key-scope-widened`, or any rule `validateArtifact` returned.

**Dates come from the artifact, not from the clock.** A page's `verified` is the artifact's `fetched`; each record's `verified` is that entry's own `read`. That is more honest — the date on a record is the date the source was actually read — and it makes the idempotence proof time-independent.

**All-or-nothing.** Every new file body is computed in memory first. Only if every edit succeeded does anything reach disk, and the artifact's receipt is the last write. A partial stamp is the one outcome that would leave the corpus asserting freshness it cannot revert.

**A key-scoped artifact stamps records only.** When `artifact.key_scoped` is true the page loop does not run at all: no page's `verified` moves, no `research:` is set, and the receipt's `pages` list is empty — which is also why `revertUnit` needs no second branch, since it walks `receipt.pages`. Alongside it, `refresh-key-scope-widened` refuses a key-scoped artifact whose `unit_keys` does not hold exactly one key: `--key` narrows to one record by construction, so more than one means the artifact was widened by hand between `--skeleton` and `--stamp`. See "Decision: what `--key` is allowed to stamp".

- [ ] **Step 1: Write the failing test**

Append to `tools/corpus/test/refresh-stamp.test.mjs`:

```javascript
import fs from "node:fs";
import os from "node:os";
import nodePath from "node:path";
import { fileURLToPath } from "node:url";
import { loadRecords } from "../data.mjs";
import { resolveUnit, artifactPathFor } from "../refresh-units.mjs";
import { workOrder } from "../refresh-order.mjs";
import {
  parseArtifact,
  dumpArtifact,
  renderArtifactSkeleton,
  validateArtifact,
} from "../refresh-artifact.mjs";
import { stampUnit } from "../refresh-stamp.mjs";

const FIXTURE = fileURLToPath(new URL("./fixtures/refresh/", import.meta.url));

// Stamp and revert mutate files, so every test works on a throwaway copy.
function sandbox() {
  const dir = fs.mkdtempSync(nodePath.join(os.tmpdir(), "refresh-"));
  fs.cpSync(FIXTURE, dir, { recursive: true });
  return dir;
}

// Builds a filled-in, stampable artifact on disk and returns its parsed data.
function prepared(root, { verdict = "confirmed", read = "2026-09-28" } = {}) {
  const records = loadRecords(nodePath.join(root, "data"));
  const unit = resolveUnit(root, "guides/alpha/one.md", records);
  const order = workOrder(root, unit, records);
  const artifactPath = artifactPathFor(unit, "2026-09-28");
  const skeleton = renderArtifactSkeleton(order, {
    fetched: "2026-09-28",
    artifactPath,
  });
  const { data, body } = parseArtifact(skeleton);
  const filled = {
    ...data,
    verdict,
    records: data.records.map((r) => ({
      ...r,
      verdict: verdict === "blocked" ? "unreachable" : "confirmed",
      url: "https://example.invalid/one",
      stated: "unchanged",
      read,
    })),
  };
  fs.mkdirSync(nodePath.join(root, nodePath.dirname(artifactPath)), {
    recursive: true,
  });
  fs.writeFileSync(
    nodePath.join(root, artifactPath),
    dumpArtifact(filled, body),
  );
  return filled;
}

// The same, narrowed with --key. fix.tail.three is referenced by three.md and
// gone.md, so a page-wide sweep here would be visible on both.
function preparedKeyScoped(root, { read = "2026-09-28" } = {}) {
  const records = loadRecords(nodePath.join(root, "data"));
  const unit = resolveUnit(root, "guides/alpha/one.md", records);
  const order = workOrder(root, unit, records, { key: "fix.tail.three" });
  const artifactPath = artifactPathFor(unit, "2026-09-28");
  const { data, body } = parseArtifact(
    renderArtifactSkeleton(order, {
      fetched: "2026-09-28",
      artifactPath,
    }),
  );
  const filled = {
    ...data,
    verdict: "confirmed",
    records: data.records.map((r) => ({
      ...r,
      verdict: "confirmed",
      url: "https://example.invalid/three",
      stated: "unchanged",
      read,
    })),
  };
  fs.mkdirSync(nodePath.join(root, nodePath.dirname(artifactPath)), {
    recursive: true,
  });
  fs.writeFileSync(
    nodePath.join(root, artifactPath),
    dumpArtifact(filled, body),
  );
  return filled;
}

const read = (root, rel) => fs.readFileSync(nodePath.join(root, rel), "utf8");

test("a confirmed stamp bumps pages to fetched and records to their read date", () => {
  const root = sandbox();
  const artifact = prepared(root, { read: "2026-09-27" });
  const { receipt, written } = stampUnit(root, artifact, {
    today: "2026-09-28",
  });
  assert.equal(read(root, "guides/alpha/one.md").includes("verified: 2026-09-28"), true);
  // The record takes the date it was actually read, not today.
  assert.equal(
    read(root, "data/units.yaml").includes('verified: "2026-09-27"'),
    true,
  );
  assert.equal(receipt.at, "2026-09-28");
  assert.equal(written.includes(artifact.path), true);
});

// Review Focus 2: verify-pages.mjs:54-66 only checks research: is a non-empty
// string, and there is no research-path-unresolved rule, so stampUnit is the
// only thing that can refuse a path that does not resolve.
test("a research: path that does not resolve is refused, and nothing is written", () => {
  const root = sandbox();
  const artifact = prepared(root);
  fs.rmSync(nodePath.join(root, artifact.path));
  const before = read(root, "guides/alpha/one.md");
  assert.throws(
    () => stampUnit(root, artifact, { today: "2026-09-28" }),
    (err) =>
      err instanceof RefreshError &&
      err.rule === "refresh-research-unresolved",
  );
  assert.equal(read(root, "guides/alpha/one.md"), before);
});

// Review Focus 3, second half: blocked writes nothing at all.
test("a blocked artifact writes nothing", () => {
  const root = sandbox();
  const artifact = prepared(root, { verdict: "blocked" });
  const beforePage = read(root, "guides/alpha/one.md");
  const beforeData = read(root, "data/units.yaml");
  assert.throws(
    () => stampUnit(root, artifact, { today: "2026-09-28" }),
    (err) => err instanceof RefreshError && err.rule === "refresh-blocked",
  );
  assert.equal(read(root, "guides/alpha/one.md"), beforePage);
  assert.equal(read(root, "data/units.yaml"), beforeData);
});

test("an incoherent artifact is refused before anything is written", () => {
  const root = sandbox();
  const artifact = prepared(root);
  artifact.records[0] = { ...artifact.records[0], verdict: "unreachable" };
  const before = read(root, "data/units.yaml");
  assert.throws(
    () => stampUnit(root, artifact, { today: "2026-09-28" }),
    (err) =>
      err instanceof RefreshError &&
      err.rule === "refresh-verdict-incoherent",
  );
  assert.equal(read(root, "data/units.yaml"), before);
});

// Review Focus 4: a deprecated page belongs to the unit but never gets a fresh
// date or a research: field.
test("a deprecated unit member gets neither a bumped date nor a research: field", () => {
  const root = sandbox();
  const artifact = prepared(root);
  const before = read(root, "guides/beta/gone.md");
  const { receipt } = stampUnit(root, artifact, { today: "2026-09-28" });
  assert.equal(read(root, "guides/beta/gone.md"), before);
  assert.equal(
    receipt.pages.some((p) => p.path === "guides/beta/gone.md"),
    false,
  );
  // Every other member of the unit was stamped.
  assert.deepEqual(
    receipt.pages.map((p) => p.path).sort(),
    ["guides/alpha/one.md", "guides/alpha/two.md", "guides/beta/three.md"],
  );
});

test("a record outside unit_keys is refused before anything is written", () => {
  const root = sandbox();
  const artifact = prepared(root);
  artifact.records = [
    ...artifact.records,
    {
      key: "fix.alone.four",
      file: "data/units.yaml",
      verdict: "confirmed",
      url: "https://example.invalid/four",
      stated: "unchanged",
      read: "2026-09-28",
    },
  ];
  const before = read(root, "data/units.yaml");
  assert.throws(
    () => stampUnit(root, artifact, { today: "2026-09-28" }),
    (err) =>
      err instanceof RefreshError && err.rule === "refresh-record-out-of-unit",
  );
  assert.equal(read(root, "data/units.yaml"), before);
});

test("stamping twice is refused: the receipt is already there", () => {
  const root = sandbox();
  const artifact = prepared(root);
  stampUnit(root, artifact, { today: "2026-09-28" });
  const again = parseArtifact(read(root, artifact.path)).data;
  assert.throws(
    () => stampUnit(root, again, { today: "2026-09-28" }),
    (err) =>
      err instanceof RefreshError && err.rule === "refresh-already-stamped",
  );
});

test("seed: true survives a stamp", () => {
  const root = sandbox();
  stampUnit(root, prepared(root), { today: "2026-09-28" });
  assert.equal(read(root, "guides/alpha/one.md").includes("seed: true"), true);
});

// Review Focus 3(b): one record repriced, no page-wide sweep. The record's date
// moves; not one page's does, and no research: appears anywhere.
test("a key-scoped stamp moves the record and no page at all", () => {
  const root = sandbox();
  const pagesBefore = Object.fromEntries(
    [
      "guides/alpha/one.md",
      "guides/alpha/two.md",
      "guides/beta/three.md",
      "guides/beta/gone.md",
    ].map((rel) => [rel, read(root, rel)]),
  );
  const { receipt } = stampUnit(root, preparedKeyScoped(root), {
    today: "2026-09-28",
  });
  for (const [rel, before] of Object.entries(pagesBefore))
    assert.equal(read(root, rel), before, `${rel} must not move`);
  assert.deepEqual(receipt.pages, []);
  assert.deepEqual(
    receipt.records.map((r) => r.key),
    ["fix.tail.three"],
  );
  assert.equal(
    read(root, "data/units.yaml").includes('verified: "2026-09-28"'),
    true,
  );
});

// Widened coherently, so no other guard catches it: unit_keys and records agree,
// so validateArtifact's coverage rule passes and every key is in unit_keys, so
// refresh-record-out-of-unit passes too. Only the key-scope guard is left.
test("a key-scoped artifact widened by hand is refused before anything is written", () => {
  const root = sandbox();
  const artifact = preparedKeyScoped(root);
  artifact.unit_keys = [...artifact.unit_keys, "fix.shared.one"];
  artifact.records = [
    ...artifact.records,
    {
      key: "fix.shared.one",
      file: "data/units.yaml",
      verdict: "confirmed",
      url: "https://example.invalid/one",
      stated: "unchanged",
      read: "2026-09-28",
    },
  ];
  assert.deepEqual(validateArtifact(artifact), []);
  const before = read(root, "data/units.yaml");
  assert.throws(
    () => stampUnit(root, artifact, { today: "2026-09-28" }),
    (err) =>
      err instanceof RefreshError && err.rule === "refresh-key-scope-widened",
  );
  assert.equal(read(root, "data/units.yaml"), before);
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `node --test tools/corpus/test/refresh-stamp.test.mjs`
Expected: FAIL — `SyntaxError: The requested module '../refresh-stamp.mjs' does not provide an export named 'stampUnit'`.

- [ ] **Step 3: Write the implementation**

Append to `tools/corpus/refresh-stamp.mjs` (and add the three imports at the top of the file):

```javascript
import fs from "node:fs";
import nodePath from "node:path";
import { parseFrontmatter } from "./frontmatter.mjs";
import { validateArtifact, withReceipt } from "./refresh-artifact.mjs";
```

```javascript
// All-or-nothing. Every new file body is computed in memory first; only when
// every edit has succeeded does anything reach disk, and the artifact's receipt
// is the last write. A partial stamp is the one outcome that would leave the
// corpus asserting freshness it cannot revert.
export function stampUnit(
  root,
  artifact,
  { today = new Date().toISOString().slice(0, 10) } = {},
) {
  const issues = validateArtifact(artifact);
  if (issues.length > 0)
    throw new RefreshError(
      issues[0].rule,
      `artifact is not stampable: ${issues[0].message}`,
    );
  if (artifact.verdict === "blocked")
    throw new RefreshError(
      "refresh-blocked",
      "verdict is blocked; a refresh that could not reach a source must not bump verified, so nothing was written",
    );
  if (artifact.stamped != null)
    throw new RefreshError(
      "refresh-already-stamped",
      "artifact already carries a stamped: receipt; revert it before stamping again",
    );
  // checkResearchRequired only checks research: is a non-empty string, and no
  // research-path-unresolved rule exists, so this is the only place a path that
  // does not resolve can be refused.
  if (!fs.existsSync(nodePath.join(root, artifact.path)))
    throw new RefreshError(
      "refresh-research-unresolved",
      `artifact path ${artifact.path} does not exist under ${root}; research: must point at a file that resolves`,
    );

  const unitKeys = new Set(artifact.unit_keys);
  const pending = new Map();
  const readPending = (rel) =>
    pending.has(rel)
      ? pending.get(rel)
      : fs.readFileSync(nodePath.join(root, rel), "utf8");

  const recordReceipts = [];
  for (const entry of artifact.records) {
    if (!unitKeys.has(entry.key))
      throw new RefreshError(
        "refresh-record-out-of-unit",
        `record ${entry.key} is not in unit_keys; a unit must not widen its footprint into another unit's records`,
      );
    // The record's date is the date THIS entry was read, not today: two sources
    // in one unit can legitimately be read on different days, and using the
    // entry's own date also makes the idempotence proof time-independent.
    const { text, previous } = setRecordVerified(
      readPending(entry.file),
      entry.key,
      entry.read,
    );
    pending.set(entry.file, text);
    recordReceipts.push({
      key: entry.key,
      file: entry.file,
      previous_verified: previous,
      new_verified: entry.read,
    });
  }

  const pageReceipts = [];
  // --key is surgical: "one record repriced, no page-wide sweep". A page's
  // `verified` asserts its WHOLE section 6 was worked — every record, every
  // identifier tied to applies_to, every value the lint cannot guard, every
  // dated study — and a key-scoped run worked one item on that list. So a
  // key-scoped artifact stamps records only, and the receipt's empty `pages`
  // list is what makes revertUnit correct here without a second branch.
  if (artifact.key_scoped === true) {
    if (artifact.unit_keys.length !== 1)
      throw new RefreshError(
        "refresh-key-scope-widened",
        `a key_scoped artifact must carry exactly one key, got ${artifact.unit_keys.length}; --key narrows a unit to one record, so this artifact was widened by hand after --skeleton`,
      );
  } else {
    for (const rel of artifact.unit) {
      const text = readPending(rel);
      const { data } = parseFrontmatter(text);
      // A deprecated page belongs to the unit — its records are shared and were
      // fetched once for the whole unit — but it could not be refreshed, so it
      // never gets a fresh date or a research: field.
      if (data?.status === "deprecated") continue;
      const bumped = setPageVerified(text, artifact.fetched);
      const set = setPageResearch(bumped.text, artifact.path);
      pending.set(rel, set.text);
      pageReceipts.push({
        path: rel,
        previous_verified: bumped.previous,
        research_added: set.added,
        previous_research: set.previous,
      });
    }
  }

  const receipt = { at: today, pages: pageReceipts, records: recordReceipts };
  pending.set(
    artifact.path,
    withReceipt(readPending(artifact.path), receipt),
  );
  for (const [rel, text] of pending)
    fs.writeFileSync(nodePath.join(root, rel), text);
  return { receipt, written: [...pending.keys()].sort() };
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `node --test tools/corpus/test/refresh-stamp.test.mjs`
Expected: PASS, 23 tests.

- [ ] **Step 5: Prove the six refusals are load-bearing**

Six mutations, one at a time:

1. Delete the `refresh-blocked` throw. Expected: "a blocked artifact writes nothing" goes red. Restore.
2. Delete the `fs.existsSync` check. Expected: "a research: path that does not resolve is refused, and nothing is written" goes red. Restore.
3. Delete the `refresh-record-out-of-unit` throw. Expected: "a record outside unit_keys is refused before anything is written" goes red. Restore.
4. Change `if (data?.status === "deprecated") continue;` to `if (false) continue;`. Expected: "a deprecated unit member gets neither a bumped date nor a research: field" goes red. Restore.
5. Change `if (artifact.key_scoped === true) {` to `if (false) {` so the page loop runs on a key-scoped artifact. Expected: "a key-scoped stamp moves the record and no page at all" goes red on the first page it reaches. Restore.
6. Delete the `refresh-key-scope-widened` throw. Expected: "a key-scoped artifact widened by hand is refused before anything is written" goes red. Restore.

Run `node --test tools/corpus/test/refresh-stamp.test.mjs` after each.

- [ ] **Step 6: Run the four gates**

```bash
node tools/corpus/cli.mjs render --check . && node tools/corpus/cli.mjs lint . && node tools/corpus/cli.mjs verify . && npm test
```

Expected: no `would render:`, `lint: clean`, `verify: clean`, tests pass.

- [ ] **Step 7: Commit**

```bash
git add tools/corpus/refresh-stamp.mjs tools/corpus/test/refresh-stamp.test.mjs
git commit -m "feat: stamp a refresh unit all-or-nothing from its artifact"
```

---

### Task 7: `revertUnit` — a byte-exact undo with no git

**Files:**

- Modify: `tools/corpus/refresh-stamp.mjs`
- Test: `tools/corpus/test/refresh-stamp.test.mjs`

**Interfaces:**

- Consumes: `stampUnit` and the surgical editors from Tasks 4 and 6; `withRevertMark` from Task 5.
- Produces: `revertUnit(root: string, artifact: object, opts?: { today?: string }) -> { restored: string[] }`. Throws `RefreshError` with rules `refresh-no-receipt` or `refresh-revert-drift`.

**Why no git.** A verify-agent block must revert every freshness assertion on the branch before the pull request opens, and the audit that will drive this in 2a-iii has no reliable base commit to diff against mid-run. The receipt makes the undo self-contained: the artifact alone carries what was written and what it replaced.

- [ ] **Step 1: Write the failing test**

Append to `tools/corpus/test/refresh-stamp.test.mjs`:

```javascript
import { revertUnit } from "../refresh-stamp.mjs";

const TRACKED = [
  "guides/alpha/one.md",
  "guides/alpha/two.md",
  "guides/beta/three.md",
  "guides/beta/gone.md",
  "guides/gamma/lonely.md",
  "guides/gamma/nosix.md",
  "data/units.yaml",
];

const snapshot = (root) =>
  Object.fromEntries(TRACKED.map((rel) => [rel, read(root, rel)]));

// The whole point: a blocked branch must be harmless to merge. guides/ and
// data/ come back byte-exact. The artifact itself is allowed to change — it
// keeps what was checked, which is what the next attempt needs.
//
// This exercises BOTH setPageResearch paths, which is why two.md carries a
// quoted `research:` in the fixture: one.md and three.md take the insert path
// (research_added: true, removed on revert) and two.md takes the replace path
// (research_added: false, previous value and its quoting restored on revert).
// Without a page in the second state the test structurally cannot see a replace
// branch that dropped the quote character.
test("stamp then revert is a byte-exact round trip over guides/ and data/", () => {
  const root = sandbox();
  const before = snapshot(root);
  const artifact = prepared(root);
  const { receipt } = stampUnit(root, artifact, { today: "2026-09-28" });
  assert.notDeepEqual(snapshot(root), before);
  const byPath = new Map(receipt.pages.map((p) => [p.path, p]));
  assert.equal(byPath.get("guides/alpha/one.md").research_added, true);
  assert.equal(byPath.get("guides/alpha/one.md").previous_research, null);
  // Both halves of the claim: the replace path was taken, and it is what the
  // revert below has to put back byte-for-byte.
  assert.equal(byPath.get("guides/alpha/two.md").research_added, false);
  assert.equal(
    byPath.get("guides/alpha/two.md").previous_research,
    "research/alpha/prior.md",
  );
  const stamped = parseArtifact(read(root, artifact.path)).data;
  const { restored } = revertUnit(root, stamped, { today: "2026-09-29" });
  assert.deepEqual(snapshot(root), before);
  assert.equal(restored.includes(artifact.path), true);
});

test("a revert marks the artifact blocked and keeps what was checked", () => {
  const root = sandbox();
  const artifact = prepared(root);
  stampUnit(root, artifact, { today: "2026-09-28" });
  const stamped = parseArtifact(read(root, artifact.path)).data;
  revertUnit(root, stamped, { today: "2026-09-29" });
  const after = parseArtifact(read(root, artifact.path)).data;
  assert.equal(after.verdict, "blocked");
  assert.equal("stamped" in after, false);
  // The revert date and the stamp date are both kept, under distinct keys.
  assert.equal(after.reverted.at, "2026-09-29");
  assert.equal(after.reverted.stamped_at, "2026-09-28");
  assert.equal(stamped.stamped.at, "2026-09-28");
  assert.deepEqual(after.reverted.records, stamped.stamped.records);
  // The artifact stays on disk: what was checked and what was found is exactly
  // what the next attempt needs.
  assert.equal(fs.existsSync(nodePath.join(root, artifact.path)), true);
});

test("an artifact with no receipt has nothing to revert", () => {
  const root = sandbox();
  const artifact = prepared(root);
  assert.throws(
    () => revertUnit(root, artifact, { today: "2026-09-29" }),
    (err) => err instanceof RefreshError && err.rule === "refresh-no-receipt",
  );
});

// A key-scoped stamp touched no page, so its revert must restore the record and
// still touch no page. revertUnit needs no key_scoped branch for this: it walks
// receipt.pages, and a key-scoped receipt has none.
test("a key-scoped stamp reverts the record and still touches no page", () => {
  const root = sandbox();
  const before = snapshot(root);
  const artifact = preparedKeyScoped(root);
  stampUnit(root, artifact, { today: "2026-09-28" });
  assert.notDeepEqual(snapshot(root), before);
  const stamped = parseArtifact(read(root, artifact.path)).data;
  revertUnit(root, stamped, { today: "2026-09-29" });
  assert.deepEqual(snapshot(root), before);
  const after = parseArtifact(read(root, artifact.path)).data;
  assert.deepEqual(after.reverted.pages, []);
  assert.equal(after.reverted.stamped_at, "2026-09-28");
  assert.equal(after.reverted.at, "2026-09-29");
});

// Two units can share a data file. A revert must never clobber a date another
// unit already landed there.
test("a revert refuses on drift and writes nothing", () => {
  const root = sandbox();
  const artifact = prepared(root);
  stampUnit(root, artifact, { today: "2026-09-28" });
  const stamped = parseArtifact(read(root, artifact.path)).data;
  // Someone else moved fix.shared.one on afterwards.
  fs.writeFileSync(
    nodePath.join(root, "data/units.yaml"),
    setRecordVerified(read(root, "data/units.yaml"), "fix.shared.one", "2026-10-05").text,
  );
  const before = read(root, "data/units.yaml");
  const beforePage = read(root, "guides/alpha/one.md");
  assert.throws(
    () => revertUnit(root, stamped, { today: "2026-09-29" }),
    (err) => err instanceof RefreshError && err.rule === "refresh-revert-drift",
  );
  assert.equal(read(root, "data/units.yaml"), before);
  assert.equal(read(root, "guides/alpha/one.md"), beforePage);
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `node --test tools/corpus/test/refresh-stamp.test.mjs`
Expected: FAIL — `SyntaxError: The requested module '../refresh-stamp.mjs' does not provide an export named 'revertUnit'`.

- [ ] **Step 3: Write the implementation**

Add `withRevertMark` to the `./refresh-artifact.mjs` import at the top of `tools/corpus/refresh-stamp.mjs`, then append:

```javascript
// The undo a verify-agent block needs, with no git involved: the receipt alone
// says what was written and what it replaced, so a blocked branch can be made
// harmless to merge before the pull request is opened.
export function revertUnit(
  root,
  artifact,
  { today = new Date().toISOString().slice(0, 10) } = {},
) {
  const receipt = artifact.stamped;
  if (receipt == null)
    throw new RefreshError(
      "refresh-no-receipt",
      "artifact carries no stamped: receipt, so there is nothing to revert",
    );
  const pending = new Map();
  const readPending = (rel) =>
    pending.has(rel)
      ? pending.get(rel)
      : fs.readFileSync(nodePath.join(root, rel), "utf8");

  for (const r of receipt.records ?? []) {
    const probe = setRecordVerified(
      readPending(r.file),
      r.key,
      r.previous_verified,
    );
    // `previous` is what was on disk a moment ago. If it is not the date this
    // receipt wrote, another unit has landed on the same file and reverting
    // would clobber its work.
    if (probe.previous !== r.new_verified)
      throw new RefreshError(
        "refresh-revert-drift",
        `record ${r.key} in ${r.file} now reads verified ${probe.previous}, not the ${r.new_verified} this receipt wrote; another unit has already changed it`,
      );
    pending.set(r.file, probe.text);
  }

  for (const p of receipt.pages ?? []) {
    const bumped = setPageVerified(readPending(p.path), p.previous_verified);
    if (bumped.previous !== artifact.fetched)
      throw new RefreshError(
        "refresh-revert-drift",
        `${p.path} now reads verified ${bumped.previous}, not the ${artifact.fetched} this receipt wrote`,
      );
    let out = bumped.text;
    if (p.research_added) out = removePageResearch(out).text;
    else if (p.previous_research != null)
      out = setPageResearch(out, p.previous_research).text;
    pending.set(p.path, out);
  }

  pending.set(
    artifact.path,
    withRevertMark(readPending(artifact.path), today),
  );
  for (const [rel, text] of pending)
    fs.writeFileSync(nodePath.join(root, rel), text);
  return { restored: [...pending.keys()].sort() };
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `node --test tools/corpus/test/refresh-stamp.test.mjs`
Expected: PASS, 28 tests.

- [ ] **Step 5: Prove the round trip and the drift guard are load-bearing**

Three mutations, one at a time:

1. Delete the line `if (p.research_added) out = removePageResearch(out).text;` — just that line, keeping the `else if` branch below it, which is then unreachable for a page that had no prior `research:`. (Do **not** try to replace it with a second `let out = bumped.text;`: that is a redeclaration in the same block and will not compile, so it would prove nothing.) Expected: "stamp then revert is a byte-exact round trip over guides/ and data/" goes red — the `research:` line the refresh added to `one.md` and `three.md` survives the revert. Restore.
2. Delete the `else if (p.previous_research != null)` branch and its body. Expected: the same test goes red on a different page — `two.md`'s prior `research: "research/alpha/prior.md"` is not put back. Restore. (This is the branch a fixture without a pre-existing `research:` could not reach at all.)
3. Delete the record-level `refresh-revert-drift` throw. Expected: "a revert refuses on drift and writes nothing" goes red. Restore.

Run `node --test tools/corpus/test/refresh-stamp.test.mjs` after each.

- [ ] **Step 6: Run the four gates**

```bash
node tools/corpus/cli.mjs render --check . && node tools/corpus/cli.mjs lint . && node tools/corpus/cli.mjs verify . && npm test
```

Expected: no `would render:`, `lint: clean`, `verify: clean`, tests pass.

- [ ] **Step 7: Commit**

```bash
git add tools/corpus/refresh-stamp.mjs tools/corpus/test/refresh-stamp.test.mjs
git commit -m "feat: revert a stamped refresh unit byte-exactly from its receipt"
```


---

### Task 8: The verify agent's review packet

**Files:**

- Create: `tools/corpus/refresh-review.mjs`
- Test: `tools/corpus/test/refresh-review.test.mjs`

**Interfaces:**

- Consumes: `RefreshError` from `tools/corpus/refresh-units.mjs`; `spawnSync` from `node:child_process`.
- Produces:
  - `REVIEW_PATHSPECS = ["guides", "data"]` (frozen)
  - `reviewPacket(root: string, baseRef: string, opts?: { run?: (cmd: string, args: string[]) => { status: number, stdout: string, stderr: string } }) -> { pathspecs: string[], argv: string[], diff: string }`
  - `sourcesFor(artifact: object) -> Array<{ key: string, url: string, stated: string }>`

**Independence is the point.** A reviewer shown the reasoning it is meant to audit tends to ratify it. The packet is the branch diff over `guides` and `data` **only** — `research/` is excluded entirely, so the refresh's own verdicts and stated figures do not reach the agent through the diff. The agent gets the changed bytes plus the cited URLs, and goes and reads them itself. The artifact still lands on the branch for the human reviewer.

- [ ] **Step 1: Write the failing test**

`tools/corpus/test/refresh-review.test.mjs`:

```javascript
// tools/corpus/test/refresh-review.test.mjs
import test from "node:test";
import assert from "node:assert/strict";
import { RefreshError } from "../refresh-units.mjs";
import {
  REVIEW_PATHSPECS,
  reviewPacket,
  sourcesFor,
} from "../refresh-review.mjs";

const ok = (stdout) => () => ({ status: 0, stdout, stderr: "" });

test("the packet's pathspecs are exactly guides and data", () => {
  assert.deepEqual([...REVIEW_PATHSPECS], ["guides", "data"]);
});

// The agent must not be shown the refresh's own reasoning, and the artifact is
// the refresh's own reasoning.
test("research/ never reaches the agent through the diff", () => {
  const packet = reviewPacket("/repo", "master", { run: ok("diff bytes") });
  assert.deepEqual(packet.pathspecs, ["guides", "data"]);
  assert.equal(
    packet.argv.some((a) => a.includes("research")),
    false,
  );
  assert.deepEqual(packet.argv, [
    "git",
    "-C",
    "/repo",
    "diff",
    "master",
    "--",
    "guides",
    "data",
  ]);
  assert.equal(packet.diff, "diff bytes");
});

test("a failing git diff raises rather than returning an empty packet", () => {
  assert.throws(
    () =>
      reviewPacket("/repo", "master", {
        run: () => ({ status: 128, stdout: "", stderr: "bad revision" }),
      }),
    (err) =>
      err instanceof RefreshError &&
      err.rule === "refresh-review-diff-failed",
  );
});

test("sourcesFor hands over the cited urls and stated figures, nothing else", () => {
  const artifact = {
    records: [
      {
        key: "a.b",
        url: "https://example.invalid/a",
        stated: "$5 / MTok",
        verdict: "confirmed",
      },
      { key: "c.d", url: "", stated: "", verdict: "unreachable" },
    ],
  };
  assert.deepEqual(sourcesFor(artifact), [
    { key: "a.b", url: "https://example.invalid/a", stated: "$5 / MTok" },
  ]);
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `node --test tools/corpus/test/refresh-review.test.mjs`
Expected: FAIL — `Cannot find module '.../tools/corpus/refresh-review.mjs'`.

- [ ] **Step 3: Write the implementation**

`tools/corpus/refresh-review.mjs`:

```javascript
// tools/corpus/refresh-review.mjs
// What the verify agent is shown, and deliberately what it is not. A reviewer
// handed the reasoning it is meant to audit tends to ratify it, so the packet
// is the branch diff over guides/ and data/ only. research/ — which is where
// the refresh's own verdicts live — is excluded entirely. The artifact still
// lands on the branch for the human reviewer.
import { spawnSync } from "node:child_process";
import { RefreshError } from "./refresh-units.mjs";

export const REVIEW_PATHSPECS = Object.freeze(["guides", "data"]);

const defaultRun = (cmd, args) => spawnSync(cmd, args, { encoding: "utf8" });

export function reviewPacket(root, baseRef, { run = defaultRun } = {}) {
  const args = ["-C", root, "diff", baseRef, "--", ...REVIEW_PATHSPECS];
  const r = run("git", args);
  if (r.status !== 0)
    throw new RefreshError(
      "refresh-review-diff-failed",
      `git diff ${baseRef} failed: ${r.stderr ?? ""}`,
    );
  return {
    pathspecs: [...REVIEW_PATHSPECS],
    argv: ["git", ...args],
    diff: r.stdout,
  };
}

// The URLs the refresh says it read, so the agent can read them itself. Not the
// verdicts, not the reasoning — an unreachable record contributes nothing.
export function sourcesFor(artifact) {
  return (artifact.records ?? [])
    .filter((e) => typeof e.url === "string" && e.url.trim() !== "")
    .map((e) => ({ key: e.key, url: e.url, stated: e.stated ?? "" }));
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `node --test tools/corpus/test/refresh-review.test.mjs`
Expected: PASS, 4 tests.

- [ ] **Step 5: Prove the exclusion is load-bearing**

Mutation: change `REVIEW_PATHSPECS` to `Object.freeze(["guides", "data", "research"])`. Run `node --test tools/corpus/test/refresh-review.test.mjs`. Expected: both "the packet's pathspecs are exactly guides and data" and "research/ never reaches the agent through the diff" go red. Restore.

- [ ] **Step 6: Run the four gates**

```bash
node tools/corpus/cli.mjs render --check . && node tools/corpus/cli.mjs lint . && node tools/corpus/cli.mjs verify . && npm test
```

Expected: no `would render:`, `lint: clean`, `verify: clean`, tests pass.

- [ ] **Step 7: Commit**

```bash
git add tools/corpus/refresh-review.mjs tools/corpus/test/refresh-review.test.mjs
git commit -m "feat: build the verify agent's review packet from guides and data only"
```

---

### Task 9: Wire the `refresh` subcommand

**Files:**

- Modify: `tools/corpus/cli.mjs` (imports at `:1-39`; `main()` at `:242-305`)
- Test: `tools/corpus/test/refresh-cli.test.mjs`

**Interfaces:**

- Consumes: everything from Tasks 1–7.
- Produces: `refreshCorpus(root: string, argv: string[], opts?: { today?: string }) -> { code: number, out: string[], err: string[] }` exported from `tools/corpus/cli.mjs`, plus the `refresh` branch in `main()`. Exit codes: `0` success, `1` a blocking issue or a `RefreshError`, `2` usage.

**`--page` is a flag, never a positional.** `main()` resolves the corpus root as `rest.find((a) => !a.startsWith("--")) ?? process.cwd()` (`tools/corpus/cli.mjs:246`). A bare page path would be swallowed as the root, silently pointing the whole command at a directory that is not a corpus. `--page=<path>` is the only safe form, and the same applies to `--artifact=` and `--key=`.

**`--requeue` is deliberately not implemented here.** It only means something against the audit's expiry-ordered selection, which is 2a-iii. Hand-driving `--page=` already does everything `--requeue` would, so shipping a flag now would be dead code with a misleading name. The spec files it under "Rollback and re-queue" rather than under the audit, so this deferral is a judgment call and not a reading of the spec: **it needs the owner's explicit agreement at the plan-approval gate**, recorded in the Execution Handoff, rather than being allowed to lapse silently.

**Two `--skeleton` runs for the same unit on the same day write the same path.** `artifactPathFor` is keyed on the unit and the date, not on `--key`, so the second run overwrites the first. That is harmless for an untouched skeleton, which carries no work — but it means **never re-run `--skeleton` after filling an artifact in**: the filled artifact is what `--stamp` consumes, and a second `--skeleton` would discard it. Nothing in the code prevents this; it is a procedural rule, stated in the refresh prompt and in Task 14.

**Usage errors say which rule was broken.** Every `code: 2` path pushes one reason line into `err` before returning, and `main()` prints `err` before the usage block. Returning a bare `2` and letting the generic three-line usage text speak for itself means a user who typed `--stamp` without `--artifact=`, or `--stamp --revert` together, has to guess which of four rules they broke — and none of the twenty-five refresh rules can ever be emitted for a usage error, so the usage text is the only channel there is.

- [ ] **Step 1: Write the failing test**

`tools/corpus/test/refresh-cli.test.mjs`:

```javascript
// tools/corpus/test/refresh-cli.test.mjs
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { refreshCorpus } from "../cli.mjs";
import { parseArtifact } from "../refresh-artifact.mjs";

const FIXTURE = fileURLToPath(new URL("./fixtures/refresh/", import.meta.url));
const CLI = fileURLToPath(new URL("../cli.mjs", import.meta.url));

function sandbox() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "refresh-cli-"));
  fs.cpSync(FIXTURE, dir, { recursive: true });
  return dir;
}

test("the default mode prints the work order and exits 0 for a clean unit", () => {
  const root = sandbox();
  const r = refreshCorpus(root, ["--page=guides/alpha/one.md"], {
    today: "2026-09-28",
  });
  assert.equal(r.code, 0);
  assert.match(r.out.join("\n"), /^# Refresh work order: gone-plus-3$/m);
});

test("a unit with a blocking issue exits 1 and names the rule", () => {
  const root = sandbox();
  const r = refreshCorpus(root, ["--page=guides/gamma/nosix.md"], {
    today: "2026-09-28",
  });
  assert.equal(r.code, 1);
  assert.match(r.err.join("\n"), /refresh-section-six-missing/);
});

test("--skeleton writes a fail-closed artifact under research/<topic>/", () => {
  const root = sandbox();
  const r = refreshCorpus(
    root,
    ["--page=guides/alpha/one.md", "--skeleton"],
    { today: "2026-09-28" },
  );
  assert.equal(r.code, 0);
  const rel = "research/alpha/2026-09-28-gone-plus-3-refresh.md";
  assert.match(r.out.join("\n"), new RegExp(`wrote ${rel.replace(/\//g, "\\/")}`));
  const { data } = parseArtifact(fs.readFileSync(path.join(root, rel), "utf8"));
  assert.equal(data.verdict, "blocked");
  assert.equal(data.path, rel);
});

test("--skeleton refuses to write for a unit with a blocking issue", () => {
  const root = sandbox();
  const r = refreshCorpus(
    root,
    ["--page=guides/gamma/nosix.md", "--skeleton"],
    { today: "2026-09-28" },
  );
  assert.equal(r.code, 1);
  assert.equal(fs.existsSync(path.join(root, "research")), false);
});

test("--stamp then --revert leaves guides/ and data/ byte-exact", () => {
  const root = sandbox();
  const rel = "research/alpha/2026-09-28-gone-plus-3-refresh.md";
  const before = fs.readFileSync(path.join(root, "data/units.yaml"), "utf8");
  refreshCorpus(root, ["--page=guides/alpha/one.md", "--skeleton"], {
    today: "2026-09-28",
  });
  // Fill the skeleton in the way the refresh prompt would.
  const { data, body } = parseArtifact(
    fs.readFileSync(path.join(root, rel), "utf8"),
  );
  fs.writeFileSync(
    path.join(root, rel),
    `---\n${JSON.stringify(
      {
        ...data,
        verdict: "confirmed",
        records: data.records.map((e) => ({
          ...e,
          verdict: "confirmed",
          url: "https://example.invalid/one",
          stated: "unchanged",
        })),
      },
      null,
      2,
    )}\n---\n${body}`,
  );
  const stamped = refreshCorpus(
    root,
    ["--page=guides/alpha/one.md", "--stamp", `--artifact=${rel}`],
    { today: "2026-09-28" },
  );
  assert.equal(stamped.code, 0);
  assert.notEqual(
    fs.readFileSync(path.join(root, "data/units.yaml"), "utf8"),
    before,
  );
  const reverted = refreshCorpus(
    root,
    ["--page=guides/alpha/one.md", "--revert", `--artifact=${rel}`],
    { today: "2026-09-29" },
  );
  assert.equal(reverted.code, 0);
  assert.equal(
    fs.readFileSync(path.join(root, "data/units.yaml"), "utf8"),
    before,
  );
});

// Review Focus 3(b), end to end. This is the assertion the whole --key decision
// exists for: the record's date moves and not one page's does.
test("--key stamps the record and moves no page verified and adds no research:", () => {
  const root = sandbox();
  const rel = "research/alpha/2026-09-28-gone-plus-3-refresh.md";
  const pages = [
    "guides/alpha/one.md",
    "guides/alpha/two.md",
    "guides/beta/three.md",
    "guides/beta/gone.md",
  ];
  const before = Object.fromEntries(
    pages.map((p) => [p, fs.readFileSync(path.join(root, p), "utf8")]),
  );
  const skeleton = refreshCorpus(
    root,
    [
      "--page=guides/alpha/one.md",
      "--skeleton",
      "--key=fix.tail.three",
    ],
    { today: "2026-09-28" },
  );
  assert.equal(skeleton.code, 0);
  const { data, body } = parseArtifact(
    fs.readFileSync(path.join(root, rel), "utf8"),
  );
  assert.equal(data.key_scoped, true);
  assert.deepEqual(data.unit_keys, ["fix.tail.three"]);
  fs.writeFileSync(
    path.join(root, rel),
    `---\n${JSON.stringify(
      {
        ...data,
        verdict: "confirmed",
        records: data.records.map((e) => ({
          ...e,
          verdict: "confirmed",
          url: "https://example.invalid/three",
          stated: "unchanged",
        })),
      },
      null,
      2,
    )}\n---\n${body}`,
  );
  const stamped = refreshCorpus(
    root,
    ["--page=guides/alpha/one.md", "--stamp", `--artifact=${rel}`],
    { today: "2026-09-28" },
  );
  assert.equal(stamped.code, 0);
  // The record moved — `fix.tail.three` specifically, and nothing else in the
  // file. A whole-file substring search for the date would pass just as happily
  // if some other record had been stamped instead, which is the one thing a
  // --key run must never do.
  const unitBlocks = fs
    .readFileSync(path.join(root, "data/units.yaml"), "utf8")
    .split(/^ {2}- key: /m);
  const blockFor = (k) => unitBlocks.find((b) => b.startsWith(`${k}\n`)) ?? "";
  assert.match(
    blockFor("fix.tail.three"),
    /^ {4}verified: "2026-09-28"$/m,
    "fix.tail.three must carry the stamped date",
  );
  for (const other of ["fix.shared.one", "fix.bridge.two", "fix.alone.four"])
    assert.match(
      blockFor(other),
      /^ {4}verified: "2026-09-16"$/m,
      `${other} must keep its own date on a --key run`,
    );
  // No page did, and no page gained a research: it did not already have.
  for (const p of pages)
    assert.equal(
      fs.readFileSync(path.join(root, p), "utf8"),
      before[p],
      `${p} must not move on a --key run`,
    );
});

// One file, one writer. refresh must never touch the ledger.
test("no refresh mode regenerates meta/ledger.yaml", () => {
  const root = sandbox();
  const ledger = path.join(root, "meta", "ledger.yaml");
  fs.writeFileSync(ledger, "generated: 1970-01-01\nentries: []\n");
  const before = fs.readFileSync(ledger, "utf8");
  refreshCorpus(root, ["--page=guides/alpha/one.md"], { today: "2026-09-28" });
  refreshCorpus(root, ["--page=guides/alpha/one.md", "--skeleton"], {
    today: "2026-09-28",
  });
  assert.equal(fs.readFileSync(ledger, "utf8"), before);
});

test("an artifact path that disagrees with the artifact's own path is refused", () => {
  const root = sandbox();
  refreshCorpus(root, ["--page=guides/alpha/one.md", "--skeleton"], {
    today: "2026-09-28",
  });
  const r = refreshCorpus(
    root,
    [
      "--page=guides/alpha/one.md",
      "--stamp",
      "--artifact=research/alpha/wrong.md",
    ],
    { today: "2026-09-28" },
  );
  assert.equal(r.code, 1);
});

test("a missing --page, two modes, or --write is a usage error that says which", () => {
  const root = sandbox();
  const noPage = refreshCorpus(root, []);
  assert.equal(noPage.code, 2);
  assert.match(noPage.err.join("\n"), /--page=/);
  const twoModes = refreshCorpus(root, [
    "--page=guides/alpha/one.md",
    "--stamp",
    "--revert",
  ]);
  assert.equal(twoModes.code, 2);
  assert.match(twoModes.err.join("\n"), /one mode/);
  const write = refreshCorpus(root, [
    "--page=guides/alpha/one.md",
    "--write",
  ]);
  assert.equal(write.code, 2);
  assert.match(write.err.join("\n"), /--write/);
  // --stamp and --revert both need an artifact to work from.
  const noArtifact = refreshCorpus(root, [
    "--page=guides/alpha/one.md",
    "--stamp",
  ]);
  assert.equal(noArtifact.code, 2);
  assert.match(noArtifact.err.join("\n"), /--artifact=/);
});

// --page must be a flag: main()'s "first non-flag arg is root" rule would
// otherwise swallow the page path as the corpus root.
test("the spawned CLI takes the page as a flag and the root as the positional", () => {
  const root = sandbox();
  const r = spawnSync(
    process.execPath,
    [CLI, "refresh", "--page=guides/alpha/one.md", root],
    { encoding: "utf8" },
  );
  assert.equal(r.status, 0);
  assert.match(r.stdout, /# Refresh work order: gone-plus-3/);
});

test("usage names the refresh command", () => {
  const r = spawnSync(process.execPath, [CLI, "nonsense"], {
    encoding: "utf8",
  });
  assert.equal(r.status, 2);
  assert.match(r.stderr, /refresh/);
});

// A usage error prints the reason ABOVE the usage block, not instead of it.
test("the spawned CLI prints the reason for a refresh usage error", () => {
  const root = sandbox();
  const r = spawnSync(process.execPath, [CLI, "refresh", root], {
    encoding: "utf8",
  });
  assert.equal(r.status, 2);
  assert.match(r.stderr, /--page=/);
  assert.match(r.stderr, /usage: corpus/);
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `node --test tools/corpus/test/refresh-cli.test.mjs`
Expected: FAIL — `SyntaxError: The requested module '../cli.mjs' does not provide an export named 'refreshCorpus'`.

- [ ] **Step 3: Add the imports to `tools/corpus/cli.mjs`**

After the existing `import { derivePageVolatility, ... } from "./ledger.mjs";` block (`tools/corpus/cli.mjs:34-39`):

```javascript
import {
  RefreshError,
  resolveUnit,
  artifactPathFor,
} from "./refresh-units.mjs";
import { workOrder, renderWorkOrder } from "./refresh-order.mjs";
import {
  parseArtifact,
  renderArtifactSkeleton,
} from "./refresh-artifact.mjs";
import { stampUnit, revertUnit } from "./refresh-stamp.mjs";
```

- [ ] **Step 4: Add `refreshCorpus` to `tools/corpus/cli.mjs`**

Insert after `ledgerCorpus` (which ends at `tools/corpus/cli.mjs:240`):

```javascript
// Returns its output rather than printing it, so the whole command is testable
// without spawning a process. main() does the printing and the exiting.
//
// Every option is a --flag=value, never a positional: main() resolves the
// corpus root as the first argument that does not start with "--", so a bare
// page path would be swallowed as the root and silently point the command at a
// directory that is not a corpus.
export function refreshCorpus(
  root,
  argv,
  { today = new Date().toISOString().slice(0, 10) } = {},
) {
  const out = [];
  const err = [];
  const flag = (name) => {
    const hit = argv.find(
      (a) => a === `--${name}` || a.startsWith(`--${name}=`),
    );
    if (hit === undefined) return undefined;
    const eq = hit.indexOf("=");
    return eq === -1 ? true : hit.slice(eq + 1);
  };
  // Every usage exit says which rule was broken. main() prints `err` above the
  // generic usage block; none of the refresh rules can be emitted for a usage
  // error, so this reason line is the only channel a user has.
  const usageError = (reason) => {
    err.push(`refresh: ${reason}`);
    return { code: 2, out, err };
  };
  const page = flag("page");
  const modes = ["order", "skeleton", "stamp", "revert"].filter(
    (m) => flag(m) !== undefined,
  );
  if (typeof page !== "string" || page === "")
    return usageError(
      "--page=<guides/topic/page.md> is required, and takes a value; it is a flag, never a positional, because the first non-flag argument is the corpus root",
    );
  if (modes.length > 1)
    return usageError(
      `pass one mode, not ${modes.length}: --order, --skeleton, --stamp or --revert (got ${modes.map((m) => `--${m}`).join(" ")})`,
    );
  if (flag("write") !== undefined || flag("check") !== undefined)
    return usageError(
      "--write and --check belong to render, not to refresh; refresh writes when the mode says so",
    );
  const mode = modes[0] ?? "order";
  const key = typeof flag("key") === "string" ? flag("key") : null;
  const artifactRel =
    typeof flag("artifact") === "string" ? flag("artifact") : null;
  if ((mode === "stamp" || mode === "revert") && artifactRel === null)
    return usageError(
      `--${mode} needs --artifact=<research/topic/...-refresh.md>: the artifact is what carries the verdicts and the receipt`,
    );

  try {
    const records = loadRecords(path.join(root, "data"));
    const unit = resolveUnit(root, page, records);
    if (mode === "order" || mode === "skeleton") {
      const order = workOrder(root, unit, records, { key });
      if (mode === "order") out.push(renderWorkOrder(order));
      for (const b of order.blocking)
        err.push(`${b.path} [${b.rule}] ${b.message}`);
      if (order.blocking.length > 0) return { code: 1, out, err };
      if (mode === "skeleton") {
        const rel = artifactPathFor(unit, today);
        fs.mkdirSync(path.join(root, path.dirname(rel)), { recursive: true });
        fs.writeFileSync(
          path.join(root, rel),
          renderArtifactSkeleton(order, {
            fetched: today,
            artifactPath: rel,
          }),
        );
        out.push(`refresh: wrote ${rel}`);
      }
      return { code: 0, out, err };
    }

    const { data } = parseArtifact(
      fs.readFileSync(path.join(root, artifactRel), "utf8"),
    );
    if (data?.path !== artifactRel)
      throw new RefreshError(
        "refresh-artifact-path-mismatch",
        `--artifact=${artifactRel} but the artifact's own path field says ${JSON.stringify(data?.path)}`,
      );
    if (mode === "stamp") {
      const { receipt, written } = stampUnit(root, data, { today });
      for (const w of written) out.push(`refresh: stamped ${w}`);
      out.push(`refresh: receipt at ${receipt.at}`);
    } else {
      const { restored } = revertUnit(root, data, { today });
      for (const r of restored) out.push(`refresh: reverted ${r}`);
    }
    // refresh never regenerates meta/ledger.yaml. One file, one writer: the
    // ledger is rebuilt on master after a merge, which is what lets corpus
    // verify be a strictly read-only CI gate.
    return { code: 0, out, err };
  } catch (e) {
    if (!(e instanceof RefreshError)) throw e;
    err.push(`${page} [${e.rule}] ${e.message}`);
    return { code: 1, out, err };
  }
}
```

- [ ] **Step 5: Wire it into `main()`**

Replace the usage helper (`tools/corpus/cli.mjs:247-251`) with:

```javascript
  const usage = () => {
    console.error(
      "usage: corpus <render|lint|verify|ledger|refresh> [--write] [dir]",
    );
    console.error("       corpus render --check [dir]");
    console.error(
      "       corpus refresh --page=<guides/...> [--order|--skeleton|--stamp|--revert] [--artifact=<research/...>] [--key=<record.key>] [dir]",
    );
    process.exit(2);
  };
```

and add this branch immediately before the final `} else { usage(); }`:

```javascript
  } else if (command === "refresh") {
    const { code, out, err: errs } = refreshCorpus(root, rest);
    // A usage error prints its reason ABOVE the usage block, not instead of it:
    // usage() exits 2 itself, so the reason has to be written first.
    if (code === 2) {
      for (const line of errs) console.error(line);
      usage();
    }
    for (const line of out) console.log(line);
    for (const line of errs) console.error(line);
    process.exit(code);
```

- [ ] **Step 6: Run the test to verify it passes**

Run: `node --test tools/corpus/test/refresh-cli.test.mjs`
Expected: PASS, 12 tests.

- [ ] **Step 7: Prove the flag form, the ledger abstention, the key scope and the usage reasons are load-bearing**

Four mutations, one at a time:

1. In `refreshCorpus`, change `const page = flag("page");` to `const page = argv.find((a) => !a.startsWith("--"));`. Expected: "the spawned CLI takes the page as a flag and the root as the positional" goes red — the sandbox root is picked up as the page path and `resolveUnit` raises `refresh-page-unknown`. Restore.
2. Add `ledgerCorpus(root, { write: true });` just before `return { code: 0, out, err };` in the skeleton branch. Expected: "no refresh mode regenerates meta/ledger.yaml" goes red. Restore.
3. In `refreshCorpus`, drop `{ key }` from the `workOrder(root, unit, records, { key })` call. Expected: "--key stamps the record and moves no page verified and adds no research:" goes red — `key_scoped` comes back `false`, the page loop runs, all four pages move, and `fix.shared.one` and `fix.bridge.two` are stamped alongside `fix.tail.three`, so both halves of the test go red. Restore. (This is the end-to-end guard for the whole `--key` decision; run it before trusting any of the others.)
4. Change `usageError` to `const usageError = () => ({ code: 2, out, err });`. Expected: "a missing --page, two modes, or --write is a usage error that says which" and "the spawned CLI prints the reason for a refresh usage error" both go red. Restore.

Run `node --test tools/corpus/test/refresh-cli.test.mjs` after each.

- [ ] **Step 8: Run the four gates**

```bash
node tools/corpus/cli.mjs render --check . && node tools/corpus/cli.mjs lint . && node tools/corpus/cli.mjs verify . && npm test
```

Expected: no `would render:`, `lint: clean`, `verify: clean`, tests pass.

- [ ] **Step 9: Commit**

```bash
git add tools/corpus/cli.mjs tools/corpus/test/refresh-cli.test.mjs
git commit -m "feat: wire the refresh subcommand into the corpus CLI"
```


---

### Task 10: The refresh prompt

**Files:**

- Create: `meta/prompts/refresh.md`
- Test: `tools/corpus/test/refresh-prompts.test.mjs`

**Interfaces:**

- Consumes: `UNIT_VERDICTS`, `RECORD_VERDICTS` from `tools/corpus/refresh-artifact.mjs`; the flags `refreshCorpus` accepts (Task 9).
- Produces: `meta/prompts/refresh.md` — no code surface. The test is the interface: it pins that the prompt names every verdict the schema accepts and every mode the CLI offers, so the two cannot drift apart silently.

**Why `meta/prompts/`.** `CLAUDE.md` already blesses `meta/` as holding "the research prompt library"; this gives it a concrete path. `meta/` is inert to the toolchain — `loadTopics` reads `meta/taxonomy.yaml` only — so a prompt file there is version-controlled with the corpus and read by nothing. The owner's own Claude Code configuration is explicitly not a source: the contract forbids using `~/.claude` as a source or example because those files embed private project details.

- [ ] **Step 1: Write the failing test**

`tools/corpus/test/refresh-prompts.test.mjs`:

```javascript
// tools/corpus/test/refresh-prompts.test.mjs
// The prompts carry the procedure; the code carries the schema. These tests
// exist so the two vocabularies cannot drift apart silently — a renamed verdict
// or mode that the prompt still uses under its old name would produce artifacts
// that validateArtifact rejects, at fetch time, after the network work is done.
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { fileURLToPath } from "node:url";
import {
  UNIT_VERDICTS,
  RECORD_VERDICTS,
  ARTIFACT_FIELDS,
} from "../refresh-artifact.mjs";

const REPO = fileURLToPath(new URL("../../../", import.meta.url));
const read = (rel) => fs.readFileSync(new URL(rel, `file://${REPO}`), "utf8");

test("the refresh prompt names every verdict the schema accepts", () => {
  const prompt = read("meta/prompts/refresh.md");
  for (const v of [...UNIT_VERDICTS, ...RECORD_VERDICTS])
    assert.match(prompt, new RegExp(`\\b${v}\\b`), `prompt omits verdict ${v}`);
});

test("the refresh prompt names every artifact field it must fill", () => {
  const prompt = read("meta/prompts/refresh.md");
  for (const f of ["verdict", "url", "stated", "read", "fetched"])
    assert.match(prompt, new RegExp(`\`${f}\``), `prompt omits field ${f}`);
  // The fields the CLI fills are named so a reader knows not to hand-edit them.
  for (const f of ["unit_keys", "slug", "path"])
    assert.equal(ARTIFACT_FIELDS.includes(f), true);
});

test("the refresh prompt names every CLI mode", () => {
  const prompt = read("meta/prompts/refresh.md");
  for (const mode of ["--order", "--skeleton", "--stamp", "--revert", "--key"])
    assert.match(prompt, new RegExp(mode.replace(/-/g, "\\-")), `prompt omits ${mode}`);
});

// `key_scoped` and `refresh-key-scope-widened` are the two names the --key path
// adds to the vocabulary: the field renderArtifactSkeleton writes, and the rule
// stampUnit refuses a hand-widened artifact with. Both are enforced in code
// (Tasks 5 and 6); this pins only that the prompt spells them the way the code
// does, so a reader who hits the rule can find it in the procedure.
test("the refresh prompt names the key-scoped field and its guard rule", () => {
  const prompt = read("meta/prompts/refresh.md");
  assert.equal(ARTIFACT_FIELDS.includes("key_scoped"), true);
  assert.match(prompt, /`key_scoped`/, "prompt omits field key_scoped");
  assert.match(
    prompt,
    /`refresh-key-scope-widened`/,
    "prompt omits rule refresh-key-scope-widened",
  );
});

// C4's path has to live in the prompt, not only in Task 14, or the procedure and
// the hand-driven run disagree about the most likely outcome of the first run.
test("the refresh prompt distinguishes a rotted URL from a withdrawn figure", () => {
  const prompt = read("meta/prompts/refresh.md");
  assert.match(prompt, /rotted/i);
  assert.match(prompt, /withdrawn/i);
  // A repointed source is a `changed` outcome, not a `blocked` one.
  assert.match(prompt, /repoint/i);
});

test("the refresh prompt states the rules a refresh must not break", () => {
  const prompt = read("meta/prompts/refresh.md");
  assert.match(prompt, /seed: true/);
  assert.match(prompt, /meta\/ledger\.yaml/);
  assert.match(prompt, /never write a value from memory/i);
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `node --test tools/corpus/test/refresh-prompts.test.mjs`
Expected: FAIL — `ENOENT: no such file or directory, open '.../meta/prompts/refresh.md'`.

- [ ] **Step 3: Write the prompt**

`meta/prompts/refresh.md`:

```markdown
# Refresh prompt

You are re-verifying one refresh unit of this corpus against its live sources.
The CLI has already worked out what to check. Your job is the part no code can
do: reading the sources and reaching a verdict.

**Never write a value from memory.** A wrong-but-plausible number is worse than
no number, and an autonomous refresh is the single largest source of one. Every
figure you record must come from a page you fetched in this run, and you record
what the page actually said, not what you expected it to say.

## What the CLI gives you

Run the work order first:

    node tools/corpus/cli.mjs refresh --page=<guides/topic/page.md> --order .

It prints the unit (every page sharing one of the entry page's records,
transitively), the exact record list with each record's current `value`,
`display`, `volatility`, `verified` and `source`, and each page's section 6
**verbatim**. Section 6 is the work order: the contract required its author to
list every record, every identifier tied to `applies_to`, every value the lint
cannot guard, and every dated study. Work that list; do not infer your own.

If `--order` exits 1, stop. A `refresh-section-six-missing` or
`refresh-record-source-missing` issue means the checklist is incomplete before
any fetch, and an incomplete checklist is not "nothing to check" — fix the page
or the record first.

Use `--key=<record.key>` to narrow a unit to one repriced record. It never
widens one, and it **stamps records only**: no page's `verified` moves and no
page's `research:` is set. A page's `verified` asserts its whole section 6 was
worked, and a key-scoped run works one item on that list. If you want the page
dates to move, do a full refresh of the unit.

The skeleton records that narrowing as `key_scoped: true`, with that one key in
`unit_keys`, and the stamp reads `key_scoped` to skip the page loop entirely. Do
not hand-edit either field between `--skeleton` and `--stamp`: a `key_scoped`
artifact carrying more than one key is refused at stamp time with
`refresh-key-scope-widened`, and the fix is to regenerate the skeleton with the
`--key` you actually meant.

## The procedure

1. Write the artifact skeleton:

       node tools/corpus/cli.mjs refresh --page=<page> --skeleton .

   It lands at `research/<topic>/<YYYY-MM-DD>-<slug>-refresh.md`. It starts
   `verdict: blocked` with every record `unreachable`, on purpose: a skeleton
   nobody filled in must not be stampable.

   **Run `--skeleton` once.** The path is keyed on the unit and the date, not on
   `--key`, so a second run on the same day overwrites the first — which would
   silently discard the artifact you filled in. Nothing in the code stops this.

2. For each record in the unit, fetch its `source` once (and `price_source`
   where the record has one) and compare the live figure to `value` and
   `display`. Fill that record's entry:
   - `verdict: confirmed` — the source states the same figure.
   - `verdict: corrected` — the source states a different figure. Correct the
     record in `data/` and adjust the prose around it, then re-render.
   - `verdict: unreachable` — you could not read the figure, and guessing is the
     one thing this loop exists to prevent. Before settling on it, decide which
     of two different things happened, because only one of them blocks:
     - **The URL rotted.** The page moved, the vendor reorganised its docs, or
       the host served a challenge page instead of content. A 200 response whose
       body reads like a bot check is this case, not a confirmation — a challenge
       page is worse than a 404 because it looks like prose. Find the vendor's
       current page for the same figure, **repoint the record's `source` in
       `data/`**, re-fetch, and record the new URL in `url`. The record's verdict
       is then `confirmed` or `corrected` as the figure dictates, and the unit's
       is `changed`, because `data/` changed. Say in the pull request body that
       the `source` was repointed and from what.
     - **The figure was withdrawn.** The vendor's current documentation no longer
       states it anywhere, or the identifier `applies_to` pins is gone. There is
       nothing to repoint to. This is `unreachable`, the unit is `blocked`, and
       nothing is written. Propose `status: deprecated` with a reason and a
       replacement link where the whole page can no longer be refreshed.

     Bound the search: at most two attempts per host, then stop and report. A
     third attempt on a host that is challenge-walling you is not going to work
     and the run has already told you what you need to know.
   - `url` — the page you actually read.
   - `stated` — what that page said, in its own words or figures.
   - `read` — the date you read it. This becomes the record's `verified`, so it
     must be the real read date, not today by default.

3. For every identifier on each page's re-check list, confirm it still exists at
   the version `applies_to` pins. Safety-relevant identifiers first — the
   contract puts them first in section 6 for this reason. Record the result under
   that page's heading in the artifact body.

4. For every value the lint cannot guard, check it by hand. Nothing else will:
   the lint is closed-world and these are the values it cannot see.

5. For dated studies, confirm the citation still resolves and note if it has been
   superseded. Studies do not change; they age.

6. Set the unit `verdict`:
   - `confirmed` — nothing moved. The only diff is dates plus, on a page's first
     refresh, a new `research:` field. This is still a real change: it asserts a
     reviewed agent re-read these sources on this date.
   - `changed` — records corrected, prose adjusted, pages re-rendered.
   - `blocked` — **any** record came back `unreachable`. The schema enforces
     this, and a blocked unit writes nothing at all. Where a page cannot be
     refreshed at all, propose `status: deprecated` with a reason and a
     replacement link, which is what the contract already prescribes.

7. Re-render and re-lint, then stamp:

       node tools/corpus/cli.mjs render --write .
       node tools/corpus/cli.mjs lint .
       node tools/corpus/cli.mjs refresh --page=<page> --stamp --artifact=<artifact> .

   Stamping sets each page's `verified` to the artifact's `fetched`, each
   record's `verified` to that entry's `read`, and every non-deprecated page's
   `research:` to the artifact. It writes a `stamped:` receipt into the artifact.
   It is all-or-nothing.

8. Run all four gates before opening anything:

       node tools/corpus/cli.mjs render --check .
       node tools/corpus/cli.mjs lint .
       node tools/corpus/cli.mjs verify .
       npm test

## Rules you must not break

- **`seed: true` is never removed.** It marks a document authored before the
  pipeline existed — permanent provenance, not a status a page grows out of. A
  refreshed seed is a seed with fresh sources.
- **Never regenerate `meta/ledger.yaml`.** One file, one writer: it is rebuilt on
  `master` after a merge. Touching it on a refresh branch guarantees a conflict
  and breaks `corpus verify` as a read-only gate.
- **Narrative goes in the pull request body, not in the artifact.** The artifact
  carries verdicts, URLs, stated figures and dates. It is a grounding artifact,
  not a log.
- **Do not use `~/.claude` or anything under `local/` as a source or example.**
  Examples are synthetic and sourced from public documentation.
- **A source you could not reach must not bump `verified`.** There is no partial
  freshness; `--revert` exists for when the gate disagrees with you.
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `node --test tools/corpus/test/refresh-prompts.test.mjs`
Expected: PASS, 6 tests.

- [ ] **Step 5: Prove the sync tests are load-bearing**

Three mutations, one at a time:

1. In `meta/prompts/refresh.md`, rename `corrected` to `amended` throughout step 2. Expected: "the refresh prompt names every verdict the schema accepts" goes red with `prompt omits verdict corrected`. Restore.
2. Delete the "**The URL rotted.**" bullet and its body from step 2. Expected: "the refresh prompt distinguishes a rotted URL from a withdrawn figure" goes red on the `/rotted/i` and `/repoint/i` probes. Restore.
3. In `meta/prompts/refresh.md`, delete the paragraph that names `key_scoped` and `refresh-key-scope-widened` from the `--key` section. Expected: "the refresh prompt names the key-scoped field and its guard rule" goes red on both of its prompt probes — first the `key_scoped` one. Restore.

Run `node --test tools/corpus/test/refresh-prompts.test.mjs` after each.

- [ ] **Step 6: Run the four gates**

```bash
node tools/corpus/cli.mjs render --check . && node tools/corpus/cli.mjs lint . && node tools/corpus/cli.mjs verify . && npm test
```

Expected: no `would render:`, `lint: clean`, `verify: clean`, tests pass. `meta/` is not under `guides/`, so `lint` and `verify` never read the prompt.

- [ ] **Step 7: Commit**

```bash
rm -rf meta/prompts/.claude
git add meta/prompts/refresh.md tools/corpus/test/refresh-prompts.test.mjs
git commit -m "docs: add the refresh prompt and pin its vocabulary to the schema"
```

---

### Task 11: The verify agent

**Files:**

- Create: `meta/prompts/verify-agent.md`
- Test: `tools/corpus/test/refresh-prompts.test.mjs` (modify)

**Interfaces:**

- Consumes: `REVIEW_PATHSPECS`, `reviewPacket`, `sourcesFor` from Task 8; `VALID_LABELS` from `tools/corpus/verify-pages.mjs`.
- Produces: `meta/prompts/verify-agent.md` — no code surface. The test pins that the rubric covers all six open-world checks the spec names, that it names every evidence label, and that it states the blocking semantics.

**The agent runs before the pull request is composed**, on the branch diff plus the sources. The refresh report becomes the PR body afterwards, with the verdict appended. Revision 1 of the spec contradicted itself here by making the refresh report the PR body and then claiming the agent could not see it.

- [ ] **Step 1: Write the failing test**

Append to `tools/corpus/test/refresh-prompts.test.mjs`:

```javascript
import { REVIEW_PATHSPECS } from "../refresh-review.mjs";
import { VALID_LABELS } from "../verify-pages.mjs";

test("the verify agent rubric covers all six open-world checks", () => {
  const rubric = read("meta/prompts/verify-agent.md");
  for (const probe of [
    /figure in prose that reads like a value but has no record/i,
    /no `lint_literals` entry covers/i,
    /formatting variants/i,
    /source tier/i,
    /still "runs"/i,
    /privacy/i,
  ])
    assert.match(rubric, probe);
});

test("the verify agent rubric names every evidence label", () => {
  const rubric = read("meta/prompts/verify-agent.md");
  for (const label of VALID_LABELS)
    assert.match(rubric, new RegExp(`\\*\\*${label}\\*\\*`));
});

test("the verify agent rubric states what it is and is not shown", () => {
  const rubric = read("meta/prompts/verify-agent.md");
  for (const spec of REVIEW_PATHSPECS)
    assert.match(rubric, new RegExp(`\`${spec}\``));
  assert.match(rubric, /research\//);
  assert.match(rubric, /--revert/);
  assert.match(rubric, /draft/i);
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `node --test tools/corpus/test/refresh-prompts.test.mjs`
Expected: FAIL — `ENOENT: no such file or directory, open '.../meta/prompts/verify-agent.md'`.

- [ ] **Step 3: Write the rubric**

`meta/prompts/verify-agent.md`:

```markdown
# Verify agent

You are the adversarial half of this corpus's gate. `corpus verify` has already
run every deterministic check. You exist for the open-world problems only
judgment catches, and your job is to find reasons to block, not reasons to
agree.

## What you are shown, and what you are not

You get the branch diff over `guides` and `data` only, plus the list of URLs the
refresh says it read and the figure it says each one stated. You go and read
those pages yourself.

You are **not** shown anything under `research/` — the refresh's own verdicts and
reasoning. That exclusion is deliberate: a reviewer handed the reasoning it is
meant to audit tends to ratify it. Do not go looking for the artifact.

You run **before** the pull request is composed.

## Rubric

Work all six. Each is something the deterministic half structurally cannot see.

1. **A figure in prose that reads like a value but has no record.** The lint is
   closed-world by design: it checks the body against values the corpus already
   knows about, so a value nobody has recorded is invisible to it. Would a reader
   paste this into their own config or spreadsheet? Is it a name or a magnitude?
   A magnitude, price, id or default outside a marker block is a finding.
2. **A field value on a record that no `lint_literals` entry covers.**
   `lint-literals-stale` catches a literal left behind after a field changed. It
   structurally cannot catch the opposite and more dangerous direction — a field
   value now guarded by nothing. Check every record the diff touches.
3. **Formatting variants of a tracked value.** The lint is exact-string:
   `200,000` and `200K` do not match a record of `200000`, nor does a
   markdown-escaped id, nor a multi-word `display` that Prettier wrapped across
   two lines. Catching variants is your job.
4. **Label discipline against source tier.** Tier 1 and 2 (vendor docs, papers,
   changelogs, official cookbooks, engineering blogs) ceiling at
   **Documented**. Tier 3 and 4 (practitioners, talks, gists, forums, one-off
   repositories) ceiling at **Plausible**. **Verified** requires a proof that
   ships under `examples/` and passes — there is no machine link from a guide to
   its proof, so this is a judgment call `corpus verify` cannot make. A recipe
   mixing a documented fact with inference must label each part separately on the
   same Evidence line; an inference under a Documented label is a finding.
5. **Whether each example still "runs"** by the contract's definition — a reader
   can execute it verbatim, substituting only inputs the page names explicitly —
   and whether dated studies carry their scope (models, tasks, dates) where they
   are cited.
6. **Privacy.** Nothing traceable to `local/`, to session transcripts, or to a
   personal Claude Code configuration may have reached the page. Examples are
   synthetic and sourced from public documentation.

If the diff repoints a record's `source`, treat that URL as the claim most worth
attacking. A repointed `source` is how a refresh escapes a `blocked` outcome, so
it is where the incentive to accept a plausible-looking page is strongest. Open
it: does it state the same kind of figure for the same subject, is it the vendor's
own documentation rather than a mirror or a summary, and is it a real page rather
than a challenge or consent wall that returned 200? If you cannot confirm all
three, block.

## Verdict

Return **pass**, or **block with findings**. Name the file and line for each
finding and say what a reader would get wrong because of it.

On a block, the refresh's freshness assertions are reverted on the branch before
the pull request opens:

    node tools/corpus/cli.mjs refresh --page=<page> --revert --artifact=<artifact> .

Page and record `verified` dates go back to their prior values and any
`research:` the refresh added is removed. The evidence artifact stays on disk,
stamped `verdict: blocked`, because what was checked and what was found is
exactly what the next attempt needs. A blocked branch must be harmless to merge.

The pull request then opens as a **draft**, labelled, with your findings in the
body. Never silently skipped, never auto-merged.

## What you are not for

Do not re-run the deterministic rules — `record-duplicate-key`,
`template-sections`, `rots-table-incomplete`, `evidence-label-invalid` spelling,
`known-lint-gap-form` and the rest already ran and already passed. Do not
rewrite prose you merely dislike. Block on what would make a reader wrong.
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `node --test tools/corpus/test/refresh-prompts.test.mjs`
Expected: PASS, 8 tests.

- [ ] **Step 5: Prove the rubric-coverage test is load-bearing**

Mutation: delete rubric item 6 (Privacy) from `meta/prompts/verify-agent.md`. Run `node --test tools/corpus/test/refresh-prompts.test.mjs`. Expected: "the verify agent rubric covers all six open-world checks" goes red on the `/privacy/i` probe. Restore.

- [ ] **Step 6: Run the four gates**

```bash
node tools/corpus/cli.mjs render --check . && node tools/corpus/cli.mjs lint . && node tools/corpus/cli.mjs verify . && npm test
```

Expected: no `would render:`, `lint: clean`, `verify: clean`, tests pass.

- [ ] **Step 7: Commit**

```bash
git add meta/prompts/verify-agent.md tools/corpus/test/refresh-prompts.test.mjs
git commit -m "docs: add the verify agent rubric and pin its coverage"
```


---

### Task 12: The `refresh-idempotence` proof

**Files:**

- Create: `examples/refresh-idempotence/proof.yaml`
- Create: `examples/refresh-idempotence/run.mjs`
- Create: `examples/refresh-idempotence/README.md`
- Create: `tools/corpus/test/refresh-proof.test.mjs`

**Interfaces:**

- Consumes: `resolveUnit`, `artifactPathFor` from `tools/corpus/refresh-units.mjs`; `workOrder` from `tools/corpus/refresh-order.mjs`; `parseArtifact`, `dumpArtifact`, `renderArtifactSkeleton` from `tools/corpus/refresh-artifact.mjs`; `stampUnit`, `revertUnit` from `tools/corpus/refresh-stamp.mjs`; `loadRecords` from `tools/corpus/data.mjs`.
- Produces: a proof directory discoverable by `discoverProofs` (`tools/corpus/proofs.mjs`), run as `node run.mjs` from its own directory, plus `tools/corpus/test/refresh-proof.test.mjs`, a wrapper that spawns that command under `npm test`.

**Why the wrapper.** `npm test` globs `tools/corpus/test/**/*.test.mjs` only, so without it this proof runs exactly once — by hand, in Step 5 — and `result: pass` then sits in the manifest unchallenged while the code it guards keeps changing. A proof that never re-runs can outlive the behaviour it proves. The wrapper is deliberately the minimum: it spawns `node run.mjs` in the proof's own directory and asserts exit 0. It does **not** discover proofs, does not read or rewrite any manifest, and does not touch `last_run` or `result` — that is `proofs.mjs#restamp`, which stays in 2a-iii, and it is not re-implemented here under another name.

**The claim it falsifies:** "Refreshing an unchanged refresh unit changes only `verified` dates, plus a one-time `research:` field per page." It is time-independent because every date it writes comes from the artifact, never from the clock, so it does not start failing the day after it is written.

- [ ] **Step 1: Write the proof**

`examples/refresh-idempotence/run.mjs`:

```javascript
// Falsifies: refreshing an unchanged refresh unit changes only `verified` dates,
// plus a one-time `research:` field per page. Time-independent: every date
// written comes from the artifact, never from the clock.
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { loadRecords } from "../../tools/corpus/data.mjs";
import {
  resolveUnit,
  artifactPathFor,
} from "../../tools/corpus/refresh-units.mjs";
import { workOrder } from "../../tools/corpus/refresh-order.mjs";
import {
  parseArtifact,
  dumpArtifact,
  renderArtifactSkeleton,
} from "../../tools/corpus/refresh-artifact.mjs";
import { stampUnit, revertUnit } from "../../tools/corpus/refresh-stamp.mjs";

const FETCHED = "2026-09-28";
const READ = "2026-09-27";

const PAGE = (title) =>
  [
    "---",
    `title: ${title}`,
    "summary: Synthetic page for the refresh idempotence proof.",
    "topic: models",
    "verified: 2026-09-16",
    "applies_to:",
    '  - "Synthetic fixture 1.0, read on 2026-09-16"',
    "sources:",
    "  - https://example.invalid/docs",
    "related: []",
    "seed: true",
    "---",
    "",
    `# ${title}`,
    "",
    "## 1. What this covers / who it's for",
    "",
    "A synthetic page.",
    "",
    "## 2. The 60-second version",
    "",
    "Window: <!-- corpus:data key=proof.model.context -->200K<!-- /corpus:data -->",
    "",
    "## 3. How it actually works",
    "",
    "Nothing moves.",
    "",
    "## 4. Patterns that hold up",
    "",
    "Evidence: **Documented** — [docs](https://example.invalid/docs), read 2026-09-16.",
    "",
    "## 5. Edge cases and failure modes",
    "",
    "None.",
    "",
    "## 6. Where this rots",
    "",
    "| Claim  | Record                | Volatility | Why it moves |",
    "| ------ | --------------------- | ---------- | ------------ |",
    "| Window | `proof.model.context` | high       | Synthetic    |",
    "",
    "Re-check on refresh: the synthetic identifier `PROOF_FLAG`.",
    "",
    "Deliberately absent: everything else.",
    "",
    "## 7. Proofs",
    "",
    "This page is the proof's own fixture.",
    "",
    "## 8. Sources",
    "",
    "- https://example.invalid/docs",
    "",
  ].join("\n");

const DATA = [
  "# Synthetic records for the refresh idempotence proof.",
  "records:",
  "  - key: proof.model.context",
  '    value: "200000"',
  '    display: "200K"',
  "    volatility: high",
  "    source: https://example.invalid/docs",
  '    verified: "2026-09-16"',
  "    tags: [proof]",
  "",
].join("\n");

const root = fs.mkdtempSync(path.join(os.tmpdir(), "refresh-idempotence-"));
fs.mkdirSync(path.join(root, "guides", "models"), { recursive: true });
fs.mkdirSync(path.join(root, "data"), { recursive: true });
fs.mkdirSync(path.join(root, "meta"), { recursive: true });
fs.writeFileSync(path.join(root, "meta", "taxonomy.yaml"), "topics: [models]\n");
fs.writeFileSync(path.join(root, "data", "proof.yaml"), DATA);
fs.writeFileSync(path.join(root, "guides", "models", "one.md"), PAGE("One"));
fs.writeFileSync(path.join(root, "guides", "models", "two.md"), PAGE("Two"));

const TRACKED = [
  "guides/models/one.md",
  "guides/models/two.md",
  "data/proof.yaml",
];
const readAll = () =>
  Object.fromEntries(
    TRACKED.map((rel) => [rel, fs.readFileSync(path.join(root, rel), "utf8")]),
  );

// An unchanged unit: the live figure equals the record, so every verdict is
// confirmed and nothing but a date should move.
function writeConfirmedArtifact() {
  const records = loadRecords(path.join(root, "data"));
  const unit = resolveUnit(root, "guides/models/one.md", records);
  assert.equal(unit.pages.length, 2, "the two pages share a record");
  const order = workOrder(root, unit, records);
  assert.deepEqual(order.blocking, [], "the fixture's section 6 is complete");
  const rel = artifactPathFor(unit, FETCHED);
  const { data, body } = parseArtifact(
    renderArtifactSkeleton(order, { fetched: FETCHED, artifactPath: rel }),
  );
  const filled = {
    ...data,
    verdict: "confirmed",
    records: data.records.map((e) => ({
      ...e,
      verdict: "confirmed",
      url: "https://example.invalid/docs",
      stated: "the same figure the record already holds",
      read: READ,
    })),
  };
  fs.mkdirSync(path.join(root, path.dirname(rel)), { recursive: true });
  fs.writeFileSync(path.join(root, rel), dumpArtifact(filled, body));
  return filled;
}

// A line-multiset difference: every line of `after` that `before` does not also
// contain, counting duplicates. Deliberately NOT a positional walk with a
// one-line lookahead: that mis-aligns on a two-line insertion or on a deletion
// and then reports lines as unchanged that are not, which makes the proof report
// a false PASS. A false pass is the wrong direction for a proof, and a multiset
// difference cannot desynchronise because it has no cursor to lose.
function linesNotIn(haystack, needleText) {
  const counts = new Map();
  for (const line of haystack.split("\n"))
    counts.set(line, (counts.get(line) ?? 0) + 1);
  const out = [];
  for (const line of needleText.split("\n")) {
    const n = counts.get(line) ?? 0;
    if (n > 0) counts.set(line, n - 1);
    else out.push(line);
  }
  return out;
}

// Both directions. Added-or-changed lines alone would miss a deletion; the proof
// has to see a line that vanished as well as one that appeared.
const addedLines = (before, after) => linesNotIn(before, after);
const removedLines = (before, after) => linesNotIn(after, before);

const before = readAll();
stampUnit(root, writeConfirmedArtifact(), { today: FETCHED });
const after = readAll();

// 1. Only date lines and added research: lines differ, in BOTH directions.
for (const rel of TRACKED) {
  const added = addedLines(before[rel], after[rel]);
  const removed = removedLines(before[rel], after[rel]);
  assert.notEqual(added.length, 0, `${rel} should have changed`);
  for (const line of [...added, ...removed])
    assert.match(
      line,
      /^\s*(verified:|research:)/,
      `${rel}: only verified: and research: lines may appear or disappear, got ${JSON.stringify(line)}`,
    );
  // A page gains exactly one line, its research:, and loses none.
  if (rel.startsWith("guides/")) {
    assert.equal(
      added.filter((l) => l.startsWith("research:")).length,
      1,
      `${rel}: exactly one research: line is added`,
    );
    assert.equal(
      removed.filter((l) => l.startsWith("research:")).length,
      0,
      `${rel}: no research: line disappears on a first refresh`,
    );
  }
}

// 2. The dates written are the artifact's, not the clock's.
assert.equal(
  after["guides/models/one.md"].includes(`verified: ${FETCHED}`),
  true,
  "page verified comes from the artifact's fetched",
);
assert.equal(
  after["data/proof.yaml"].includes(`verified: "${READ}"`),
  true,
  "record verified comes from that entry's read date",
);

// 3. seed: true survived.
assert.equal(
  after["guides/models/one.md"].includes("seed: true"),
  true,
  "seed: true is permanent provenance",
);

// 4. Revert restores the prior bytes exactly: a blocked branch is harmless.
const artifactRel = artifactPathFor(
  resolveUnit(root, "guides/models/one.md", loadRecords(path.join(root, "data"))),
  FETCHED,
);
const stamped = parseArtifact(
  fs.readFileSync(path.join(root, artifactRel), "utf8"),
).data;
revertUnit(root, stamped, { today: "2026-09-29" });
assert.deepEqual(readAll(), before, "revert must restore guides/ and data/");

// 5. Stamping the same confirmed artifact again reproduces the same bytes:
// idempotent, and independent of when the proof runs.
stampUnit(root, writeConfirmedArtifact(), { today: FETCHED });
assert.deepEqual(readAll(), after, "a second identical refresh is a no-op");

fs.rmSync(root, { recursive: true, force: true });
console.log("PASS: an unchanged refresh unit diffs only in dates");
```

- [ ] **Step 2: Run it and confirm it bites**

Run: `cd examples/refresh-idempotence && node run.mjs`

If it exits 0 straight away, prove the proof is not vacuous before trusting it. Two temporary mutations, one at a time, each restored before the next:

1. Make `setPageResearch` in `tools/corpus/refresh-stamp.mjs` also delete the `seed:` line. Expected: assertion 3, `seed: true is permanent provenance`, fails.
2. Make `setPageVerified` also insert a second line — `lines.splice(i + 1, 0, "# injected");` right after the rewrite. Expected: assertion 1 fails naming `# injected`. This is the case the previous positional-walk diff would have swallowed, so it is worth watching fail once.

Then restore both and re-run.

- [ ] **Step 3: Write the manifest**

`examples/refresh-idempotence/proof.yaml`:

```yaml
kind: proof
claim: Refreshing an unchanged refresh unit changes only verified dates, plus a one-time research field per page.
origin: docs/superpowers/specs/2026-09-27-corpus-refresh-loop-design.md
tier: 4
command: node run.mjs
passes_when: exit code 0
last_run: 2026-09-28
result: pass
```

Set `last_run` to the date the proof actually ran.

- [ ] **Step 4: Write the README**

`examples/refresh-idempotence/README.md`:

```markdown
# refresh-idempotence

Falsifies: **refreshing an unchanged refresh unit changes only `verified` dates,
plus a one-time `research:` field per page.**

Run it from this directory:

    node run.mjs

It builds a two-page synthetic corpus in a temporary directory, resolves the unit
(both pages share one record), fills an artifact with `confirmed` verdicts whose
stated figures match the record, and stamps it. Then it checks five things:

1. Every line that appeared **or disappeared** in `guides/` or `data/` is a
   `verified:` line or a `research:` line — nothing else moved, and each page
   gained exactly one `research:` line and lost none.
2. The page date came from the artifact's `fetched` and the record date from that
   entry's `read`, not from the clock. This is what makes the proof
   time-independent: it does not start failing the day after it is written.
3. `seed: true` survived. It is permanent provenance.
4. `--revert` restores the prior bytes exactly, which is what makes a blocked
   branch harmless to merge.
5. Stamping the same artifact again reproduces the same bytes.

It does not touch the real corpus and makes no network calls.
```

- [ ] **Step 5: Run it to verify it passes**

Run: `cd examples/refresh-idempotence && node run.mjs`
Expected: `PASS: an unchanged refresh unit diffs only in dates`, exit 0.

- [ ] **Step 6: Make `npm test` re-run the proof**

`tools/corpus/test/refresh-proof.test.mjs`:

```javascript
// tools/corpus/test/refresh-proof.test.mjs
// npm test globs tools/corpus/test/**/*.test.mjs only, so without this the
// refresh-idempotence proof runs once by hand and its `result: pass` then sits
// in the manifest unchallenged while the code it guards keeps changing. This is
// the minimum that stops that: spawn the manifest's command in the proof's own
// directory and require exit 0. It does not read or rewrite the manifest —
// re-stamping `last_run` and `result` across every proof is proofs.mjs#restamp,
// which belongs to the scheduled audit and is not re-implemented here.
import test from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const DIR = fileURLToPath(
  new URL("../../../examples/refresh-idempotence/", import.meta.url),
);

test("the refresh-idempotence proof still passes", () => {
  const r = spawnSync(process.execPath, ["run.mjs"], {
    cwd: DIR,
    encoding: "utf8",
  });
  assert.equal(
    r.status,
    0,
    `proof failed:\n${r.stdout}\n${r.stderr}`,
  );
  assert.match(r.stdout, /^PASS: an unchanged refresh unit diffs only in dates$/m);
});
```

Run: `node --test tools/corpus/test/refresh-proof.test.mjs`
Expected: PASS, 1 test.

Mutation: in `examples/refresh-idempotence/run.mjs`, change assertion 3's expected value to `false`. Expected: this wrapper goes red and names the failing assertion in its message. Restore.

- [ ] **Step 7: Confirm the proof is discoverable**

```bash
node -e 'import("./tools/corpus/proofs.mjs").then(({discoverProofs})=>console.log(discoverProofs("examples").map((p)=>p.claim)))'
```

Expected: two claims, the marker-render one and the new one.

- [ ] **Step 8: Run the four gates**

```bash
node tools/corpus/cli.mjs render --check . && node tools/corpus/cli.mjs lint . && node tools/corpus/cli.mjs verify . && npm test
```

Expected: no `would render:`, `lint: clean`, `verify: clean`, tests pass — `npm test` now includes the proof, so it runs twice in this step and that is fine, it builds its own temporary corpus each time. `examples/` is not under `guides/`, so the synthetic page text inside `run.mjs` is never linted — which is why it may carry `200K` and `200000` literally.

- [ ] **Step 9: Commit**

```bash
rm -rf examples/refresh-idempotence/.claude
git add examples/refresh-idempotence/proof.yaml examples/refresh-idempotence/run.mjs examples/refresh-idempotence/README.md tools/corpus/test/refresh-proof.test.mjs
git commit -m "test: prove an unchanged refresh unit diffs only in dates"
```


---

### Task 13: Contract amendments

**Files:**

- Modify: `CLAUDE.md` — the root-level tooling table, the authoring loop, the issue-rules table, the `research` front-matter paragraph, and a new "Refresh units and the one-writer ledger" section

**Interfaces:**

- Consumes: every rule name and behaviour Tasks 1–12 shipped.
- Produces: no code surface. `CLAUDE.md` is binding and wins over the spec where they disagree, so these behaviours must land in it or a future reader will "fix" them.

**Scope.** 2a-i already landed the `corpus verify` amendments. This task lands only what 2a-ii shipped. The audit's weekly cadence, `AUDIT_LEAD_DAYS` with its `?? "low"` fallback, the `effective interval = cadence - lead` relationship, the cluster cap, the duplicate-PR skip, the `stale-past-expiry` alarm and proof re-runs all belong to 2a-iii and must **not** be written here — documenting machinery that does not exist is how a contract starts lying.

- [ ] **Step 1: Add `refresh` to the root-level tooling table**

In the "Root-level tooling" section, change the usage line to:

```
`node tools/corpus/cli.mjs <render|lint|verify|ledger|refresh> [--write] [dir]`
```

and add this row to the command table, after the `verify` row:

```markdown
| `node tools/corpus/cli.mjs refresh --page=<guides/...> .` | — | Re-verify one refresh unit against its sources. `--order` (the default) prints the work order; `--skeleton` writes a fail-closed artifact under `research/<topic>/`; `--stamp --artifact=<path>` bumps dates and sets `research:`, all-or-nothing; `--revert --artifact=<path>` restores the prior bytes from the artifact's receipt. `--key=<record.key>` narrows a run to one record and then stamps **records only** — no page `verified`, no `research:`. Writes `guides/`, `data/` and `research/` — **never `meta/ledger.yaml`**. | 2 on a usage error, 1 on a blocking issue, else 0 |
```

- [ ] **Step 2: Add a "Refresh units and the one-writer ledger" section**

Insert immediately after the "Freshness: cadence, ledger, expiry, deprecation" section:

```markdown
### Refresh units and the one-writer ledger

**A refresh unit is a page plus every page that shares one of its records, closed
transitively.** If A shares a record with B and B shares another with C, C is in
the unit: otherwise B and C would both edit that record on two branches and
neither could see the other's bump. One unit, one branch, one pull request — the
two model pages are therefore one unit.

**`--key=<record.key>` narrows a unit to one repriced record, never widens one, and
stamps records only.** A key-scoped run moves that record's `verified` and nothing
else: no page's `verified` and no page's `research:`. A page's `verified` asserts the
whole of its section 6 was worked — every record, every identifier tied to
`applies_to`, every value the lint cannot guard, every dated study — and a key-scoped
run works one item on that list, so moving the page date would claim work that did not
happen. The artifact records the narrowing as `key_scoped: true`, `stampUnit` skips
pages entirely when it is set, and `refresh-key-scope-widened` refuses a key-scoped
artifact carrying more than one key. The visible consequence is that a page's
`verified` can sit older than a record's; that is the honest state, and nothing in
`lint`, `verify` or `ledger` compares the two.

**Two units may share a `data/*.yaml` file, and that is allowed.** Units group by
record, not by file, so `data/claude-code.yaml` is written by both the `hooks.md`
unit and the `context-management.md` + `software-engineering.md` unit. This is safe
only because record edits are **single-line surgical replacements, never a YAML
round trip**: the hunks are disjoint and git auto-merges them. A round trip would
also strip the contract-required comments at the top of `data/models.yaml` and
`data/models-other.yaml`. Two guards back it up: `refresh-record-out-of-unit`
refuses to write a record outside the unit's own key set, and
`refresh-revert-drift` refuses a revert whose record no longer carries the date the
receipt wrote. Do not "fix" this by grouping units per file — `software-engineering.md`
bridges `data/context.yaml` and `data/claude-code.yaml`, so that would merge three
pages across three topics into one pull request.

**The ledger is regenerated only on `master`, after a merge, never on a refresh
branch.** One file, one writer. Refresh branches touch `guides/`, `data/` and
`research/` only. This is what lets `corpus verify` be strictly read-only, and it
makes reverting a bad merged refresh a clean single-commit operation.

**The evidence artifact.** Each run writes
`research/<topic>/<YYYY-MM-DD>-<unit-slug>-refresh.md`, under the topic of the page
named on the command line — a cross-topic unit has no single home, and the entry
page is the one the author asked about. The slug joins the pages' sorted basenames,
collapsing to `<first>-plus-N` above three pages. Its front-matter is
machine-readable: `kind: refresh`, `unit`, `entry`, `topic`, `topics`, `slug`,
`path`, `fetched`, `verdict`, `key_scoped`, `unit_keys`, and one `records` entry per
record carrying `key`, `file`, `verdict`, `url`, `stated` and `read`. The same unit
entered from its other end files its artifact under that page's topic instead; both
artifacts name the same `unit` and the same `entry`, so neither is lost and either can
be found from either page. **Narrative belongs
in the pull request body, not in the artifact** — conflating a refresh log with a
grounding artifact would make `research-required` satisfiable by a log. Nothing
under `research/` is linted, because `guidePaths` walks `guides/` only, which is why
the artifact may state figures verbatim.

**Two verdict vocabularies.** A unit verdict is `confirmed`, `changed` or
`blocked`. A record verdict is `confirmed`, `corrected` or `unreachable`. Any
`unreachable` record forces the unit to `blocked`, and **a blocked unit writes
nothing at all** — there is no partial freshness. A page's `verified` becomes the
artifact's `fetched`; each record's `verified` becomes that entry's own `read`,
which is the date that source was actually read.

**A rotted `source` URL is `changed`, not `blocked`.** Source URLs rot faster than
values, so the common case is that the figure is still published and only the address
moved — including a host that answers a scripted fetch with a challenge page, which
returns 200 with prose that reads like content and must never be taken for a
confirmation. Repoint the record's `source` in `data/`, re-fetch, cite the new URL in
the artifact's `url`, and say in the pull request body what was repointed and from
what: `data/` changed, so the unit verdict is `changed`. `unreachable` is reserved for
a figure the vendor no longer publishes anywhere, where there is nothing to repoint
to; that blocks, and where a whole page can no longer be refreshed the answer is
`status: deprecated` with a reason and a replacement link. The verify agent treats a
repointed `source` as the claim most worth attacking, because it is the one that lets
a run escape a blocked outcome.

**A block must be harmless to merge.** When the verify agent blocks,
`refresh --revert` restores every page and record date to its prior value and
removes any `research:` the refresh added, from the artifact's `stamped:` receipt
alone — no git needed. The artifact stays on disk, marked `verdict: blocked` with
the receipt moved to `reverted:`, because what was checked and what was found is
exactly what the next attempt needs. The pull request then opens as a **draft**,
labelled, findings in the body: never silently skipped, never auto-merged.

**Prompts live in `meta/prompts/`.** `meta/prompts/refresh.md` carries the fetching
and verdict procedure; `meta/prompts/verify-agent.md` carries the adversarial rubric
and the blocking semantics. The agent's review packet is the branch diff over
`guides` and `data` only — `research/` is excluded, because a reviewer shown the
reasoning it is meant to audit tends to ratify it. The agent runs **before** the
pull request body is composed.
```

- [ ] **Step 3: Add the new rules to the issue-rules table**

Append these rows after `known-lint-gap-form`:

```markdown
| `refresh-page-unknown`            | refresh | `--page` names no guide under `guides/`.                                                             | Pass a repo-root-relative path; it is a `--page=` flag, never a positional. |
| `refresh-topic-unknown`           | refresh | The entry page has no front-matter `topic`, so the artifact has no home under `research/`.           | Give the page a taxonomy `topic`. |
| `refresh-section-six-missing`     | refresh | A non-deprecated page in the unit has no `## 6.` section, so its checklist is empty.                 | Write section 6. An empty checklist is not "nothing to check". |
| `refresh-record-source-missing`   | refresh | A referenced record has no `source`, so there is nothing to re-read it against.                       | Add the canonical URL the value was read from. |
| `refresh-key-out-of-unit`         | refresh | `--key` names a record the unit does not reference.                                                  | `--key` narrows a unit; enter from a page that references the record. |
| `refresh-record-not-found`        | refresh | The data file holds no record with that key.                                                         | Fix the key, or the artifact entry's `file`. |
| `refresh-record-verified-missing` | refresh | A record block has no `verified:` line to bump.                                                      | Add `verified:`; skipping it would leave a stale record date under a freshly dated page. |
| `refresh-frontmatter-missing`     | refresh | A page in the unit has no `---` front-matter.                                                        | Add front-matter. |
| `refresh-page-verified-missing`   | refresh | A page's front-matter has no `verified:` line.                                                        | Add it. |
| `refresh-artifact-shape`          | refresh | The artifact's front-matter is not a mapping.                                                        | Regenerate it with `--skeleton`. |
| `refresh-artifact-kind`           | refresh | The artifact's `kind` is not `refresh`.                                                               | Set `kind: refresh`. |
| `refresh-artifact-field`          | refresh | A required artifact field is missing, a record entry lacks `file`, or a reachable record lacks `url`. | Fill the named field. |
| `refresh-artifact-date`           | refresh | `fetched`, or a record entry's `read`, is not a real date written `YYYY-MM-DD`.                        | Fix the date. |
| `refresh-artifact-verdict`        | refresh | A unit or record verdict is outside its vocabulary.                                                   | Use `confirmed`/`changed`/`blocked`, or `confirmed`/`corrected`/`unreachable`. |
| `refresh-verdict-incoherent`      | refresh | A record is `unreachable` while the unit verdict is not `blocked`.                                     | Set the unit verdict to `blocked`; an unreachable source must not bump `verified`. |
| `refresh-artifact-coverage`       | refresh | A record in `unit_keys` has no verdict entry.                                                         | Give every record in the unit a verdict, or refresh silently under-checks it under a fresh date. |
| `refresh-artifact-path-mismatch`  | refresh | `--artifact` disagrees with the artifact's own `path` field.                                           | Pass the path the artifact names. |
| `refresh-blocked`                 | refresh | `--stamp` on a `blocked` artifact. Nothing was written.                                               | Resolve the unreachable sources, or deprecate the page. |
| `refresh-already-stamped`         | refresh | `--stamp` on an artifact that already carries a `stamped:` receipt.                                    | `--revert` first. |
| `refresh-research-unresolved`     | refresh | The artifact's own `path` does not exist on disk. `checkResearchRequired` only checks the string is non-empty, so this is the only guard. | Write the artifact before stamping. |
| `refresh-record-out-of-unit`      | refresh | A record entry names a key outside `unit_keys`.                                                        | Do not widen a unit's footprint into another unit's records. |
| `refresh-key-scope-widened`       | refresh | A `key_scoped: true` artifact carries more than one key in `unit_keys`.                                | `--key` narrows to exactly one record; the artifact was widened by hand after `--skeleton`. Regenerate it. |
| `refresh-no-receipt`              | refresh | `--revert` on an artifact with no `stamped:` receipt.                                                  | There is nothing to revert. |
| `refresh-revert-drift`            | refresh | A page or record no longer carries the date the receipt wrote.                                         | Another unit has landed on the same file; resolve by hand rather than clobbering it. |
| `refresh-review-diff-failed`      | refresh | `git diff <baseRef> -- guides data` failed.                                                            | Check the base ref exists on the branch. |
```

- [ ] **Step 4: Correct two now-incomplete statements**

In the **Authoring loop**, add a sentence after step 4: "`ledger --write` stays for hand edits and for the post-merge regeneration on `master`; it is never run on a refresh branch."

In the **`research` front-matter paragraph**, add one sentence: "`refresh --stamp` is what sets it on an existing page, and `refresh --revert` removes it again if that run added it; `seed: true` is untouched either way."

- [ ] **Step 5: Run the four gates**

```bash
node tools/corpus/cli.mjs render --check . && node tools/corpus/cli.mjs lint . && node tools/corpus/cli.mjs verify . && npm test
```

Expected: no `would render:`, `lint: clean`, `verify: clean`, tests pass. `CLAUDE.md` is not under `guides/`, so nothing lints it — but Prettier will reformat the new tables, which is expected.

- [ ] **Step 6: Commit**

```bash
git add CLAUDE.md
git commit -m "docs: codify refresh units, the one-writer ledger and the refresh rules"
```


---

### Task 14: The hand-driven run that closes the acceptance criterion

**Files:**

- Create: `research/models/<fetched>-claude-models-comparison-refresh.md` — the first real artifact
- Modify: `guides/models/claude-models.md` — front-matter `verified`, new `research:`
- Modify: `guides/models/comparison.md` — front-matter `verified`, new `research:`
- Modify: `data/models.yaml` — record `verified` lines, any field the sources corrected, and any `source` URL that had to be repointed (Step 3a)
- Modify: `data/models-other.yaml` — same, for the rows the unit pulls in

**Interfaces:**

- Consumes: the whole of Tasks 1–13.
- Produces: no code. `<fetched>` throughout this task is the date in the filename printed by Step 2; substitute it literally.

**Hand-driven, with the owner watching.** This is the first time live source fetches happen, and the point of 2a-ii is that a human drives the procedure once before 2a-iii automates it.

**Know the exposure before starting.** Counted on the live tree: the unit `guides/models/claude-models.md` + `guides/models/comparison.md` carries **fourteen records across four hosts** — `platform.claude.com` (4 records), `developers.openai.com` (3), `ai.google.dev` (3) and `huggingface.co` (4). All-or-nothing means a single host that bot-walls, rate-limits or 404s forces `verdict: blocked`, `stampUnit` throws `refresh-blocked`, and nothing is written. The spec is explicit that this is the likely first outcome: "Expect blocked refreshes to be the common early failure and some `source` fields to need repointing by hand." Two of those hosts serve a challenge page to a scripted fetch rather than a 404, and a challenge page is worse than a 404 because it returns 200 with prose that reads like content.

So this task has a path through a blocked run that ends in a decision, not in a shrug. Step 3a is that path, and Step 0 and Step 9 are the two points where the owner — not the executing agent — decides.

- [ ] **Step 0: Confirm the first live unit with the owner**

Ask once, before any fetch, and record the answer in the pull request body:

> The acceptance criterion is satisfied by any one refresh unit, and names `guides/models/claude-models.md` as the expected target — a fourteen-record, four-host run. `guides/claude-code/hooks.md` closes the same loop end to end — unit of one, seven records, all in `data/claude-code.yaml`, all sourced from a single vendor host — at roughly a quarter of the exposure. Proving the loop on `hooks.md` first, then running the model unit, or going straight at the model unit?

Default, absent an answer: **go straight at the model unit**, because SPEC:434 names it the expected target and it is the page that expires first (its records are the only `high`-volatility ones in the corpus; everything else is `medium`). The fallback matters at Step 9, not here: the criterion is a merged pull request, and if the model unit blocks twice on the same host, proving the loop on `hooks.md` is how 2a-ii still closes while the model unit's sources get repointed.

Whichever unit is chosen, substitute its entry page for `guides/models/claude-models.md` throughout the rest of this task; the commands are otherwise identical.

- [ ] **Step 1: Read the work order**

```bash
node tools/corpus/cli.mjs refresh --page=guides/models/claude-models.md --order .
```

Expected: exit 0, `# Refresh work order: claude-models-comparison`. The unit is `guides/models/claude-models.md` plus `guides/models/comparison.md`; the data files are `data/models-other.yaml` and `data/models.yaml`; both pages' section 6 prints verbatim. If it exits 1, fix the named page or record and re-run — do not fetch anything yet.

- [ ] **Step 2: Write the skeleton**

```bash
node tools/corpus/cli.mjs refresh --page=guides/models/claude-models.md --skeleton .
rm -rf research/models/.claude research/.claude
```

Expected: `refresh: wrote research/models/<fetched>-claude-models-comparison-refresh.md`, with `verdict: blocked` and every record `unreachable`. Note the exact filename; every later step needs it.

- [ ] **Step 3: Work the checklist**

Follow `meta/prompts/refresh.md` exactly. Fetch each record's `source` (and `price_source` where the record has one) once, and for each record fill `verdict`, `url`, `stated` and `read`. Then fill the three prose lines under each page's heading in the artifact body — identifiers re-checked against `applies_to` with safety-relevant ones first, values the lint cannot guard, dated studies. Then set the unit `verdict`.

This is the one step in the whole plan where **Prettier fires**: the artifact is edited with `Edit`/`Write`, and the hook reformats YAML front matter, so it may re-quote or re-indent the `records:` list. That is harmless and must not be fought — everything downstream re-parses the YAML, and `withReceipt` re-dumps the whole block on the next write. It does not break `parseArtifact`'s round trip. Nothing else in this plan's runtime path goes through `Edit`/`Write`, so nothing else triggers it.

Do not re-run `--skeleton` after filling the artifact in: the path is keyed on the unit and the date, so a second skeleton overwrites your work. If a source cannot be read, go to Step 3a before writing `unreachable` anywhere.

- [ ] **Step 3a: A source you could not read — rotted URL or withdrawn figure**

Do not write `unreachable` on the first failure, and do not guess a value. Decide which of two different things happened, because only one of them blocks.

**The URL rotted.** The page moved, the vendor reorganised its docs, the host redirected to a locale root, or it answered with a challenge, consent or login wall. Symptoms: a 404; a 3xx to something that is not the figure; a 200 whose body is a bot check, a cookie banner or a marketing page; a 200 that is the vendor's current docs but no longer carries that figure at that address.

1. Find the vendor's **current** page for the same figure, starting from their documentation index rather than from a search result.
2. Repoint that record's `source` in `data/` to the new URL. Leave every other field alone for now.
3. Re-fetch and fill the record entry from the page you actually read, putting the new URL in `url`.
4. The record verdict is `confirmed` or `corrected` as the figure dictates. The **unit** verdict is `changed`, not `blocked`: `data/` changed, because a `source` changed.
5. Note in the pull request body what was repointed, from what, to what, and why you believe the new page is the vendor's own.

**The figure was withdrawn.** The vendor's current documentation no longer states it anywhere, or the identifier `applies_to` pins is gone from the pinned version. There is nothing to repoint to, so there is nothing to confirm. Set that record `unreachable`, set the unit `blocked`, and go to Step 9. Where the whole page can no longer be refreshed, propose `status: deprecated` with a reason and a replacement link.

**Bounded retry.** At most two attempts per host, counting the original fetch. A third attempt on a host that is challenge-walling you does not work and the run has already told you what you need to know. Record the attempt count per host in the artifact body so Step 9 has it.

**What you must not do:** write a figure you did not read on a page you fetched in this run; accept a mirror, a summary, an aggregator or a model card that is not the vendor's own documentation as a repoint target; treat a challenge page's prose as a confirmation; or repoint a `source` to a URL that states a different figure and call it `confirmed`.

- [ ] **Step 4: Re-render and re-lint before stamping**

```bash
node tools/corpus/cli.mjs render --write .
node tools/corpus/cli.mjs lint .
```

Expected: `lint: clean`. A corrected figure that the prose still states in its old spelling surfaces here as `bare-value`; fix the prose, not the record.

- [ ] **Step 5: Stamp**

```bash
node tools/corpus/cli.mjs refresh --page=guides/models/claude-models.md --stamp \
  --artifact=research/models/<fetched>-claude-models-comparison-refresh.md .
```

Expected: exit 0, one `refresh: stamped` line per page and data file plus the artifact, then `refresh: receipt at <today>`. If it exits 1, read the rule name. `refresh-verdict-incoherent` means an `unreachable` record is still in the artifact while the unit verdict is not `blocked` — fix whichever of the two is wrong and re-run. `refresh-blocked` means the unit verdict is `blocked`: nothing was written, nothing needs undoing, and the run goes to **Step 9**, not to Step 6. `refresh-key-scope-widened` means a `--key` artifact was widened by hand; regenerate it.

- [ ] **Step 6: Run all four gates**

```bash
node tools/corpus/cli.mjs render --check . && node tools/corpus/cli.mjs lint . && node tools/corpus/cli.mjs verify . && npm test
```

Expected: no `would render:`, `lint: clean`, `verify: clean`, tests pass.

- [ ] **Step 7: Commit and push the branch**

```bash
git add guides/models/claude-models.md guides/models/comparison.md data/models.yaml data/models-other.yaml research/models/<fetched>-claude-models-comparison-refresh.md
git commit -m "refresh: re-verify the Claude model pages against their sources"
git push -u origin corpus-refresh-2a-ii
```

- [ ] **Step 8: Run the verify agent**

Print the packet — the diff over `guides` and `data` only, plus the cited URLs — and hand exactly that to a fresh agent whose instructions are `meta/prompts/verify-agent.md`:

```bash
node -e '
const [artifact] = process.argv.slice(1);
Promise.all([
  import("./tools/corpus/refresh-review.mjs"),
  import("./tools/corpus/refresh-artifact.mjs"),
  import("node:fs"),
]).then(([review, art, fs]) => {
  const data = art.parseArtifact(fs.readFileSync(artifact, "utf8")).data;
  console.log(review.reviewPacket(process.cwd(), "master").diff);
  console.log(JSON.stringify(review.sourcesFor(data), null, 2));
});
' research/models/<fetched>-claude-models-comparison-refresh.md
```

The agent gets the diff and the sources list only — never the artifact body, never the refresh reasoning.

- [ ] **Step 9: On a block — which block, then the owner's decision**

Two different things are called a block, and only one of them has anything to revert.

**(a) The unit never stamped** — Step 5 exited 1 with `refresh-blocked`, because a figure was withdrawn and Step 3a left a record `unreachable`. Nothing was written, so there is nothing to undo: `--revert` would exit 1 with `refresh-no-receipt`, correctly. Skip straight to the decision below; the artifact already records which host failed, how many attempts it took, and what each reachable source stated.

**(b) The verify agent blocked a stamped unit.** Revert the freshness assertions before the pull request exists:

```bash
node tools/corpus/cli.mjs refresh --page=guides/models/claude-models.md --revert \
  --artifact=research/models/<fetched>-claude-models-comparison-refresh.md .
git add guides/models/claude-models.md guides/models/comparison.md data/models.yaml data/models-other.yaml research/models/<fetched>-claude-models-comparison-refresh.md
git commit -m "fix: revert the refresh freshness assertions after a verify-agent block"
git push
```

Expected: exit 0, `refresh: reverted` per file. `refresh-revert-drift` means another unit has landed on a shared data file since the stamp — do not force it; resolve by hand and say so in the body. The artifact stays on disk marked `verdict: blocked` with its receipt moved to `reverted:`, carrying both dates (`stamped_at` and `at`), because what was checked and what was found is what the next attempt needs.

In either case, open the pull request as a **draft**, labelled, with the findings or the blocked hosts in the body. A blocked branch must be harmless to merge — and in case (b) the whole point of the revert is that it now is.

**Then stop and put one decision to the owner.** This is the named decision point; the executing agent does not make it:

> Run N of the model unit blocked on `<host>` after two attempts. The figure is/is not still published elsewhere. Options: (1) repoint the `source` per Step 3a and retry the unit — appropriate when the figure is published at a new address; (2) refresh `guides/claude-code/hooks.md` instead as the proving run — SPEC:434 is satisfied by a refresh of **any one** refresh unit, so a unit of one over a single vendor host closes 2a-ii's acceptance criterion outright, with its evidence artifact under `research/claude-code/` — and leave the model unit's repointing as follow-on work; (3) deprecate the affected page per the contract, with a reason and a replacement link. Which?

Bound the loop: **at most two blocked attempts on the same unit** before that question is asked. A third attempt without a decision is how a deliverable becomes a phase that never comes. Record the answer in the pull request body so the next run inherits it.

If option (2) is taken, restart at Step 0 with `--page=guides/claude-code/hooks.md`; every command in this task is identical apart from the entry page, the slug (`hooks`) and the artifact's topic directory (`research/claude-code/`). SPEC:434 (revision 4) is satisfied by any one refresh unit, and names the model unit only as the *expected* target because it expires first — a run that closes on `hooks.md`, with its evidence artifact under `research/claude-code/`, satisfies the criterion as written. Say so explicitly in the pull request body, and leave the model unit's refresh as a named follow-on item rather than a silent gap.

- [ ] **Step 10: On a pass, open the pull request**

The body is the refresh report — what was fetched, what each source stated, what moved — with the agent's verdict appended, ending with the attribution line:

```bash
gh pr create --base master --head corpus-refresh-2a-ii \
  --title "refresh: re-verify the Claude model pages" \
  --body "$(cat <<'BODY'
## What was refreshed

Unit: `guides/models/claude-models.md` + `guides/models/comparison.md` — one unit, because they share the Claude model records.

## What each source stated

One line per record: key, URL, the figure the page stated, verdict.

## What moved

Records corrected and prose adjusted, or: nothing, verdict confirmed.

## Gates

`render --check` clean, `lint: clean`, `verify: clean`, `npm test` passing.

## Verify agent verdict

Pass, with any non-blocking observations.

Evidence artifact: `research/models/<fetched>-claude-models-comparison-refresh.md`

🤖 Generated with [Claude Code](https://claude.com/claude-code)
BODY
)"
```

Replace each placeholder line with the real content before running it. Then hand the pull request to the owner to review and merge. **The plan does not merge it.**

- [ ] **Step 11: After the owner merges, regenerate the ledger on `master`**

```bash
git checkout master && git pull
node tools/corpus/cli.mjs ledger --write .
git add meta/ledger.yaml
git commit -m "chore: regenerate the ledger after the first refresh"
git push
```

This is the one writer. Expected: `ledger: 5 entries written` — five guides, none deprecated — and the refreshed unit's pages' `verified` and `expires` move. If the run was key-scoped, no page's `verified` moved and therefore no `expires` does either; that is correct, not a missed write.

- [ ] **Step 12: Confirm the acceptance criterion**

```bash
# The unit actually run at Step 0. Substitute its entry page; nothing else in
# this step names a topic, a slug or a directory.
PAGE=guides/models/claude-models.md

git log --oneline -3 master
node tools/corpus/cli.mjs verify .
node tools/corpus/cli.mjs lint .
PAGE="$PAGE" node -e '
const fs = require("node:fs");
const page = process.env.PAGE;
const fm = fs.readFileSync(page, "utf8").split(/^---[ \t]*\r?$/m)[1] ?? "";
const field = (name) => {
  const m = new RegExp(`^${name}:[ \\t]*(.+)$`, "m").exec(fm);
  return m ? m[1].trim().replace(/^["\x27]|["\x27]$/g, "") : null;
};
const topic = field("topic");
const research = field("research");
if (!topic) throw new Error(`no topic: in ${page}`);
if (!research) throw new Error(`no research: in ${page} — the refresh never stamped it`);
const dir = `research/${topic}/`;
if (!research.startsWith(dir)) throw new Error(`artifact ${research} is not under ${dir}`);
if (!fs.existsSync(research)) throw new Error(`missing evidence artifact ${research}`);
console.log(`criterion: ${page} (topic ${topic}) carries ${research}, which exists`);
'
```

Expected: the three commits of the merge on `master`, `verify: clean`, `lint: clean`, and one `criterion:` line. Any other outcome throws with the reason; a non-zero exit here means the criterion is **not** met.

The criterion (SPEC:434, revision 4) is met when a refresh of **any one** refresh unit — hand-driven here, audit-driven later — has passed both halves of verify, been reviewed and merged by the owner, and left an evidence artifact under `research/<topic>/` for that unit's own topic. That is why this step derives the directory from the refreshed page's `topic` instead of naming `research/models/`: whichever unit Step 0 or Step 9 settled on is the unit that closes the loop. The model unit stays the expected target because it expires first, not because the criterion only counts there. And it is met when the loop has closed once in reality — not when the code is written.


---

## Self-Review

**1. Spec coverage.** Walked every section of the spec against the tasks.

| Spec section                                                                        | Where                                                                                                          |
| ----------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------- |
| Component 1 — the unit is a record-sharing group                                    | Task 1                                                                                                         |
| Component 1 — the `--key` surgical case, "no page-wide sweep"                        | "Decision: what `--key` is allowed to stamp"; Task 3 (`order.key`), Task 5 (`key_scoped`), Task 6 (the page-loop skip and `refresh-key-scope-widened`), Task 9 (the flag and the end-to-end test) |
| Component 1 — procedure steps 1–4 (fetch, identifiers, unguardable values, studies) | Task 3 builds the order; Task 10's prompt executes it                                                          |
| Component 1 — procedure steps 5–6 (re-render, bump, set `research:`)                | Task 6, and Task 14 steps 4–5                                                                                  |
| `seed: true` never removed                                                          | Task 4 (`setPageResearch` never touches it), Task 6's `seed: true` survives a stamp, Task 12 proof assertion 3 |
| `refresh` does not regenerate the ledger                                             | Task 9's no-ledger test, Task 13, Task 14 step 11                                                              |
| Three outcomes: confirmed / changed / blocked                                        | Task 5 (`UNIT_VERDICTS`), Task 6 (`refresh-blocked` writes nothing)                                            |
| The evidence artifact, and `research:` having exactly one meaning                    | Task 5, Task 13                                                                                                |
| Idempotence earns a proof under `examples/`                                          | Task 12, re-run under `npm test` by `tools/corpus/test/refresh-proof.test.mjs`                                  |
| Risk: "source URLs rot faster than values"; blocked is the common early failure       | Task 10's prompt (the rotted-URL fork), Task 13 (the contract text), Task 14 Steps 0, 3a and 9                  |
| Where the ledger is written                                                          | Task 9, Task 13, Task 14 step 11                                                                               |
| Component 2 — `corpus verify` and the twelve rules                                   | **Shipped in 2a-i (PR #1, `66e2c68`).** Not re-planned.                                                        |
| Component 3 — the verify agent, its rubric, its independence                         | Task 8 (the packet), Task 11 (the rubric)                                                                      |
| Blocking semantics, and what a block must undo                                       | Task 7 (`revertUnit`), Task 11, Task 14 step 9                                                                 |
| Component 4 — the scheduled audit, lead days, guards, alarms, proof re-runs           | **Out of scope: 2a-iii.** Task 13 explicitly declines to document it.                                          |
| Rollback and re-queue                                                                | Task 7 covers the branch case; `--requeue` deferred to 2a-iii with the reason stated in Task 9                  |
| `comparison.md` section 6 prerequisite                                               | **Shipped in 2a-i.**                                                                                           |
| Testing strategy — unit tests, mutation proofs, dry runs                             | Every task carries a mutation step; `--order` and `--skeleton` are the network-free dry runs                    |
| Acceptance criterion                                                                 | Task 14                                                                                                        |
| Contract amendments                                                                  | Task 13, scoped to what 2a-ii shipped                                                                          |

Four gaps in the spec found and closed inline, each flagged as a judgment call rather than smuggled in, and each with its rejected alternative named:

- (a) The spec never says whether record-sharing closure is transitive — Task 1 makes it transitive and gives the reason.
- (b) The spec never addresses two units sharing a data file — resolved in "Decision: two units can share a `data/*.yaml` file".
- (c) The spec's one sentence on `--key` does not say what it stamps — resolved in "Decision: what `--key` is allowed to stamp": records only. This is the gap whose obvious reading is actively wrong, so it carries an end-to-end test and two mutations.
- (d) The spec's three outcomes do not cover "the value is fine, the URL moved" — resolved as `changed`, in Task 10's prompt, Task 13's contract text and Task 14 Step 3a.

One judgment call the spec does not resolve and this plan deliberately leaves open: which topic a cross-topic unit's artifact belongs to when the same unit can be entered from either end. Task 2 files it under the entry page's topic and Task 13 states that both artifacts name the same `unit` and `entry`, so neither is lost. Pinning a canonical entry page per unit is a **selection** question, and selection is 2a-iii; inventing a rule for it here would be documenting machinery that does not exist.

**2. Placeholder scan.** No `TBD`, no "add error handling", no "add validation", no "handle edge cases", no "similar to Task N", no "write tests for the above". Every code step carries real code, and every mutation step names the exact edit and the exact test that must go red. The angle-bracket placeholders are all in Task 14 and all stand for values the run itself produces: `<fetched>` (defined by Step 2's output, which Step 2 tells the executor to note), the PR-body content lines, and `<host>` and `N` inside Step 9's quoted question to the owner, which are the failing host and the attempt count that Step 3a says to record in the artifact body. Every function, type and rule name used across task boundaries is defined by an earlier task or exists in the tree — including the three this revision adds: `order.key` (Task 3), `key_scoped` and `RevertMark` (Task 5), and `refresh-key-scope-widened` (Task 6, tabled in Task 13).

**3. Type consistency.** Checked every name used across task boundaries.

- `RefreshError(rule, message)` — defined Task 1; thrown in Tasks 2, 3, 4, 5, 6, 7, 8; caught in exactly one place, `refreshCorpus` (Task 9).
- `Unit = { entry, pages, keys, topics, dataFiles }` — produced Task 1; consumed Tasks 2, 3, 5.
- `PageFact = { path, topic, status, keys }` — produced Task 1; Task 3 spreads it and adds `sectionSix`.
- `Order = { unit, slug, topic, key, pages, records, blocking }` — produced Task 3; consumed by `renderArtifactSkeleton` (Task 5), `renderWorkOrder` (Task 3) and `refreshCorpus` (Task 9). `key` is `string|null`, and `renderArtifactSkeleton` is the only place it changes type: it becomes the boolean `key_scoped` via `order.key !== null`.
- `artifact.key_scoped` — a required boolean in `ARTIFACT_FIELDS` (Task 5), shape-checked by `validateArtifact` (Task 5), read by `stampUnit` to skip the page loop and to guard `refresh-key-scope-widened` (Task 6), and never read by `revertUnit`, which walks `receipt.pages` and correctly finds it empty (Task 7).
- `RevertMark = { stamped_at, at, pages, records }` — produced by `withRevertMark` (Task 5) and asserted in Tasks 5 and 7. It is **not** a `Receipt`: the receipt's `at` is re-keyed to `stamped_at` and `at` becomes the revert date, so the two dates cannot collide. Nothing consumes `RevertMark` in this sub-project; 2a-iii's audit is its reader.
- `order.records[].file` is spelled `data/<basename>`, and the artifact's `records[].file` and the receipt's `records[].file` use that identical spelling — which is what lets `validateArtifact` require the `data/` prefix and lets `stampUnit` hand the value straight to `fs.readFileSync`.
- `artifact.path` is the artifact's own repo-relative path: set by `renderArtifactSkeleton` from `artifactPathFor`, required by `ARTIFACT_FIELDS`, checked by the CLI as `refresh-artifact-path-mismatch` and by `stampUnit` as `refresh-research-unresolved`, and written into pages as the `research:` value.
- `Receipt` — produced by `stampUnit` (Task 6), persisted by `withReceipt` (Task 5), consumed by `revertUnit` (Task 7). The field names `at`, `previous_verified`, `new_verified`, `research_added`, `previous_research` are identical in all three.
- `setRecordVerified` returns `{ text, previous }`, and Task 7's drift guard depends on `previous` being the pre-write on-disk value — exactly what Task 4 defines it as.
- `today` is an injectable option on `stampUnit`, `revertUnit` and `refreshCorpus`; no code path a test exercises reads the clock.
- `parseArtifact` returns `{ data, body }` in Tasks 5, 6, 9, 12 and 14 alike.

One real inconsistency found and fixed while writing: an earlier draft of Task 6 treated `artifact.unit` as a list of `{ path, status }` objects, while Task 5's skeleton emits a list of path strings. Resolved in favour of strings, with `stampUnit` reading each page's own front-matter for `status` — the on-disk status is the truth, not a copy in the artifact that could go stale between `--skeleton` and `--stamp`.

**4. Review Focus.** Each of the five lines has a test in the task named, and each of those tests has a mutation that must kill it.

1. **Prefix keys and a missing `verified:` line** — Task 4: a record key matched whole and never as a prefix; the longer key still addressable on its own; a record block with no `verified:` line raising rather than being skipped. Mutations: drop the end-of-line anchor from the key pattern; replace the throw with a silent return.
2. **An unresolvable `research:`** — Task 6: a `research:` path that does not resolve is refused and nothing is written. Mutation: delete the `fs.existsSync` check.
3. **An artifact asserting freshness the run did not establish** — both shapes, each with tests and mutations.
   - (a) `confirmed` with an `unreachable` record — Task 5: an unreachable record with a confirmed unit verdict is incoherent; Task 6: a blocked artifact writes nothing, and an incoherent artifact is refused before anything is written. Mutations: delete the `refresh-verdict-incoherent` push; delete the `refresh-blocked` throw.
   - (b) A `--key` run bumping a page — Task 5: a `--key` skeleton is marked `key_scoped`; Task 6: a key-scoped stamp moves the record and no page at all, and a key-scoped artifact widened by hand is refused; Task 9: end to end, `--skeleton --key=` then `--stamp` moves no page `verified` and adds no `research:`. Mutations: set `key_scoped: false` in the skeleton; make the page-loop condition `if (false)`; delete the `refresh-key-scope-widened` throw; drop `{ key }` from `refreshCorpus`'s `workOrder` call.
4. **A `deprecated` page in a unit** — Task 1: a deprecated page is a unit member; Task 6: a deprecated unit member gets neither a bumped date nor a `research:` field. Mutation: replace the deprecated guard with a constant false.
5. **A cross-topic unit, and a page with no `## 6.`** — Task 2: a cross-topic unit files under the entry page's topic, and the live cross-topic unit really spans two topics; Task 3: a page with no section 6 blocks the work order. Mutations: make `unitTopic` use `unit.pages[0]`; delete the `refresh-section-six-missing` push.

---

## Execution Handoff

Plan complete and saved to `docs/superpowers/plans/2026-09-28-corpus-refresh-2a-ii.md`. Please review the plan. Which execution approach would you prefer?

- **Subagent-driven** — A fresh subagent implements each task and a fresh reviewer checks it before the next one starts, then a whole-branch review at the end. Most thorough; costs a fresh context per task and per review.
- **Native** — Every task implemented in one session, then one fresh reviewer on the most capable model checks the whole branch. Cheapest and fastest; no independent review until the end.

**Recommendation: Subagent-driven, because fourteen tasks share five module interfaces that later tasks call by exact signature, and a mistake that ships here writes a wrong `verified` date into a public corpus — the one failure the whole design exists to prevent.** Does the plan capture what you want, and which approach should we use?

**Two things need your answer before Task 1 starts, and one before Task 14 starts:**

1. **`--key` stamps records only** — no page `verified`, no `research:`. The spec's one sentence does not say, the obvious implementation is wrong, and the reasoning is in "Decision: what `--key` is allowed to stamp". Confirm before Task 3 is written, because Tasks 3, 5, 6 and 9 all encode it.
2. **`--requeue` is deferred to 2a-iii.** The spec files it under "Rollback and re-queue" rather than under the audit, so this is a judgment call, not a reading. Confirm rather than letting it lapse silently — the reason is in Task 9's notes.
3. **Which unit goes first in Task 14** — the model unit SPEC:434 names as the expected target (fourteen records, four hosts) or `hooks.md` (seven records, one host) as the proving run. Task 14 Step 0 asks this and defaults to the model unit; Step 9 is where a twice-blocked run comes back to you.

---

## Revision history

**Revision 2 (2026-09-28)** — closes the five blockers and six missing considerations in `docs/superpowers/plans/2026-09-28-corpus-refresh-2a-ii-REVIEW.md` (verdict: *Needs significant rework*). Every tree fact asserted below was re-derived from `master` (`66e2c68`) rather than inherited from revision 1.

| Finding | What changed                                                                                                                                                                                                                                                                                                                                                                                                                                              |
| ------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **C1**  | `guides/gamma/nosix.md` now references a new unshared fixture record, `fix.solo.seven`, declared in **Task 1**'s `data/units.yaml`, so it is a unit of one. Task 1's "a page sharing no record is a unit of one" and Task 2's `unitSlug(lonely) === "lonely"` therefore stay true, and Task 3 adds a file while amending no committed test. Task 3's no-section-6 and `renderWorkOrder` tests, and Task 9's two blocking-issue tests, now enter from `nosix.md`. A new Task 3 test pins that `lonely.md` is unaffected and clean. |
| **C2**  | `withRevertMark` destructures the receipt's own `at` out and re-keys it: `reverted: { stamped_at, at, ...receiptRest }`. Both dates survive — the audit needs to know when a block happened, not only when the stamp did — and the spread order can no longer overwrite the revert date. Tasks 5 and 7 assert both dates, and Task 5 Step 5 adds the mutation that restores the old `{ at, ...stamped }` spread and watches the revert-date assertion go red. |
| **C3**  | New section, **"Decision: what `--key` is allowed to stamp"**: a key-scoped refresh stamps **records only**, because a page's `verified` asserts its whole section 6 was worked. Encoded as `Order.key` (Task 3), a required `key_scoped` boolean in `ARTIFACT_FIELDS` (Task 5), a page-loop skip plus `refresh-key-scope-widened` in `stampUnit` (Task 6), and an end-to-end Task 9 test asserting no page `verified` moved and no `research:` was added. Review Focus line 3 was widened to own it, and the Global Constraints gained the invariant. The review's suggested `refresh-key-scoped-page-bump` rule was **not** added — see the note below. |
| **C4**  | **Task 14** gained the exposure count (14 records, 4 hosts, named), **Step 0** (the owner picks the first live unit, with `hooks.md` as the named fallback and the model unit as the default), **Step 3a** (rotted URL versus withdrawn figure, a repoint procedure, a two-attempts-per-host bound, and an explicit list of what must not be done), and a rewritten **Step 9** that separates a never-stamped block from a verify-agent block, bounds the loop at two blocked attempts, and puts one named decision to the owner. A repointed `source` is a `changed` outcome, which also answers the review's open question 3. The same fork was added to Task 10's prompt with a test and a mutation, and to Task 13's contract text; Task 11's rubric now treats a repointed `source` as the claim most worth attacking. |
| **C5**  | **Task 1** pins `gone.md` as headings `## 1.`–`## 5.`, `## 7.`, `## 8.` with **no `## 6.`**, and says why the shape is load-bearing. **Task 3** Step 6 mutation 2 is now unconditional.                                                                                                                                                                                                                                                              |
| **M1**  | The worked example in "Decision: two units can share a `data/*.yaml` file" was wrong in both halves and is replaced with the derived truth: the sandbox record belongs to **unit 2**, and the `claude_md` record lives in **`data/context.yaml`**. See the corrected truth below.                                                                                                                                                                             |
| **M2**  | `PAGE_RESEARCH` now mirrors `PAGE_DATE` with four captures, so the **replace** path re-emits the quote character and trailing whitespace. Fixture `two.md` carries a quoted `research:` so that path is exercised by every test that stamps the unit; Task 4 adds a byte-exactness test and a mutation, Task 7 asserts `research_added`/`previous_research` on both paths and adds a second mutation for the restore branch, and the Architecture paragraph's byte-exact claim is now scoped to `guides/` and `data/` with the reason stated. |
| **M3**  | The Prettier constraint now says where the threat is: the hook is `PostToolUse` on `Edit`/`Write`, every refresh write is `fs.writeFileSync` from `cli.mjs`, so **no refresh mode triggers Prettier**. The two places it does fire — Task 14 Step 3's hand-filled artifact and Task 13's `CLAUDE.md` tables — are named, and Task 14 Step 3 explains why the reformatting is harmless so the executor does not fight it.                                    |
| **M4**  | (1) The artifact's section-6 blocks use **four** backticks, with the reason in a comment. (2) `changedLines` is replaced by a symmetric line-multiset difference (`linesNotIn`, `addedLines`, `removedLines`); the proof now checks both directions and pins exactly one added `research:` line per page. Task 12 Step 2 adds a second non-vacuity mutation — a two-line insertion — which is precisely what the old positional walk would have swallowed into a false pass. |
| **M5**  | `refreshCorpus` has a `usageError(reason)` helper; all four usage paths push a specific reason, and `main()` prints `err` above the usage block. Task 9 asserts a reason for each of the four, adds a spawned-CLI test that the reason appears above `usage:`, and adds the mutation that strips the reasons.                                                                                                                                                  |
| **M6**  | New `tools/corpus/test/refresh-proof.test.mjs` (Task 12 Step 6) spawns `node run.mjs` in the proof's directory under `npm test` and requires exit 0 plus the PASS line, with its own mutation. It is deliberately the minimum: it does not discover proofs and does not touch `last_run` or `result`, so `proofs.mjs#restamp` stays in 2a-iii and is not re-implemented under another name.                                                                    |

**Two review items taken differently, with the reason.**

- **C3's suggested `refresh-key-scoped-page-bump` rule was not added.** Implemented as a rule it would be either redundant with the page-loop skip — and therefore mutation-survivable, which is the exact defect C5 raised — or unreachable in the normal flow, because `validateArtifact` runs before `refresh-already-stamped` and so never sees a stamped artifact. What replaces it is one mechanism that does bite: the skip itself, mutation-covered by Task 6's key-scoped test and by Task 9's end-to-end test, plus a second, independently reachable guard, `refresh-key-scope-widened`, which refuses a key-scoped artifact carrying more than one key — the state a hand edit between `--skeleton` and `--stamp` can actually produce.
- **Low suggestion 14 is disputed as unreachable.** `refreshCorpus`'s catch block cannot interpolate the boolean `true` for `page`: a bare `--page` makes `flag("page")` return `true`, and `if (typeof page !== "string" || page === "")` returns `2` before the `try` block is entered. The only values that reach the catch are non-empty strings. No change made.

**Low suggestions taken:** 11 (four-backtick fence), 12 (where Prettier fires, in Task 14 Step 3 and in the Global Constraints), 13 (the `node --test` wrapper re-running the proof). 14 disputed, above.

**The corrected truth behind M1.** Derived by loading `data/` with `loadRecords` and running `referencedRecordKeys` over all five guides:

| Unit                                                            | Records | Data files                                   | Hosts |
| --------------------------------------------------------------- | ------- | -------------------------------------------- | ----- |
| `claude-code/hooks.md`                                          | 7       | `data/claude-code.yaml`                      | 1     |
| `context/context-management.md` + `domains/software-engineering.md` | 4   | `data/context.yaml`, `data/claude-code.yaml` | 2     |
| `models/claude-models.md` + `models/comparison.md`              | 14      | `data/models.yaml`, `data/models-other.yaml` | 4     |

`claude_code.sandbox.auto_allow_bash_default` (`data/claude-code.yaml:84`) is referenced only by `software-engineering.md`, so it is **unit 2**'s record, not unit 1's. `claude_code.claude_md.adherence_line_threshold` lives in **`data/context.yaml:15`**, is shared by `context-management.md` and `software-engineering.md`, and is what makes unit 2 cross-topic — not what makes two units share a file. The conclusion the section draws survives: unit 1 and unit 2 do both write `data/claude-code.yaml`, unit 1 through the seven `claude_code.hooks.*` records and unit 2 through the one sandbox record, and their `verified:` lines (`:78` and `:90`) are twelve lines apart, outside git's three-line hunk context, so the edits auto-merge.

**Out of scope, unchanged.** 2a-i stays shipped and is not re-planned. 2a-iii — the scheduled audit, `AUDIT_LEAD_DAYS`, the cluster cap, the duplicate-PR skip, the `stale-past-expiry` alarm, `--requeue`, and `proofs.mjs#restamp` re-stamping manifests — stays out, and Task 12's proof wrapper was scoped narrowly so as not to drift into it.



**Revision 3 (2026-09-28)** — closes the four defects in `docs/superpowers/plans/2026-09-28-corpus-refresh-2a-ii-REVIEW-2.md` (verdict: *Needs clarification*; ten findings closed, one closed differently, none left open). C1–C5 and M1–M6 are untouched.

| Finding | What changed |
| ------- | ------------ |
| **N1**  | Task 14 **Step 12** no longer hard-codes `ls research/models/` or states the criterion as the model unit's refresh. It now takes the entry page actually run at Step 0 as `PAGE`, reads that page's `topic` and `research:` out of its front matter, and fails loudly unless the stamped artifact sits under `research/<that topic>/` and exists on disk — an exact command, not a description. Step 9's option (2) and its follow-on paragraph, Step 0's question and its default, and open question 3 now cite SPEC:434 as naming the model unit the *expected* target rather than the criterion itself. **N1 was closed by the spec's revision-4 amendment, not by narrowing the escape hatch:** revision 4 rewrote the criterion to "any one refresh unit … an evidence artifact under `research/<topic>/` for that unit's topic", which makes option (2) sound as written; the plan was made to agree with that wording rather than have the `hooks.md` fallback removed. |
| **N2**  | Task 9's "the record moved" half of *"--key stamps the record and moves no page verified and adds no research:"* was a whole-file substring search for `verified: "2026-09-28"`, which any stamped record satisfied. It now splits `data/units.yaml` on its record keys, asserts the stamped date inside `fix.tail.three`'s own block, and asserts `fix.shared.one`, `fix.bridge.two` and `fix.alone.four` all keep `2026-09-16`. The already-exact page half is unchanged; Step 7's mutation 3 (dropping `{ key }` from the `workOrder` call) now turns both halves red, and its expected text says so. |
| **N3**  | `key_scoped` and `refresh-key-scope-widened` appeared nowhere in Task 10. `meta/prompts/refresh.md` now states, in the `--key` section, that the skeleton records the narrowing as `key_scoped: true` with one key in `unit_keys`, that the stamp reads `key_scoped` to skip the page loop, and that a hand-widened artifact is refused with `refresh-key-scope-widened`. A sixth sync test pins both spellings against `ARTIFACT_FIELDS`, and Step 5 gains a third mutation. No enforcement is duplicated — the guard stays in `stampUnit` (Task 6); this is the prompt-to-code vocabulary sync only. |
| **N4**  | Task 4's architecture paragraph said `setPageResearch`'s two paths are "built on the same three-capture pattern as `setPageVerified`". `PAGE_DATE` and `PAGE_RESEARCH` both carry four captures — label, quote, value, trailing whitespace — as the comment above `PAGE_RESEARCH` already says. Prose corrected to four; no code changed. |