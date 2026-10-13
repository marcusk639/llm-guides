# Corpus Scope Expansion Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Land the two contract changes the scope-expansion spec actually authorises — the `security` topic and the provider facts/practice split — each guarded by a test that cannot pass vacuously, and write none of the seven pages the spec names.

**Architecture:** Both changes are edits to `meta/taxonomy.yaml` and `CLAUDE.md`, the two files that together define what the corpus may contain. Neither adds tooling. The risk in a change this small is not that it breaks something — it is that the contract's prose and the taxonomy silently drift apart, since nothing today compares them. So each task ships a guard test alongside its edit, in the pattern `tools/corpus/test/contract.test.mjs` already established for rule names.

**Tech Stack:** Node 22+, ESM `.mjs`, `node:test` + `node:assert/strict`, `js-yaml` with `JSON_SCHEMA`. No new dependencies.

**Spec:** `docs/superpowers/specs/2026-10-12-corpus-scope-expansion-design.md`

---

## Scope boundary: why this plan is two tasks and not nine

The spec names seven new pages. **This plan writes none of them, and that is the spec's own instruction**, stated twice:

> "This is a scope spec. It decides what the corpus should cover and where each subject lives. It does not plan the writing: every page it names is still gated by `research-required`, and the research cycle is a separate piece of work that must land first." (lines 15–18)

> "Any plan written before a research cycle produces either vendor facts from memory — which the contract forbids outright — or 'author sections 1–8' placeholders, which is what Stage 0's Task 3 shipped and a review caught." (lines 44–47)

That second sentence is a warning aimed precisely at this document. A task reading "write `guides/providers/anthropic-practice.md`" could only be executed today by inventing practice advice or by committing a skeleton, and the repo has already been burned by the second. So the implementable residue of this spec is exactly its two contract changes:

| Spec element | In this plan? | Why |
| --- | --- | --- |
| Decision 1 — `security` becomes a topic | **Task 1** | Owner signed off on 2026-10-12; `CLAUDE.md` makes adding a topic a contract change, and that is a pure edit. |
| Decision 2 — practice pages carry no records, sit beside the facts page | **Task 2** | The *pages* are research-gated; the *rule* they must obey is a contract amendment and is implementable now. It is also the only defence available for the spec's top risk before any page exists. |
| Decision 2 — the three practice pages themselves | No | `research-required`. No artifact grounds them. |
| Decision 3 — where skills live | No | Deliberately unresolved: "asserting it would be writing a volatile availability fact from memory, which the contract forbids." Resolving it is a research outcome, not a plan decision. |
| The seven pages | No | Same gate. |

**Follow-on, not in this plan:** the research cycle that grounds the seven pages. It is what unblocks the writing, and it needs its own spec and plan.

**Deliberately not added:** a mechanical lint/verify rule enforcing "practice pages carry no records." It would guard zero existing files, a new rule name is itself a contract change, and the quarantine principle already forbids the thing it would catch. Revisit when the first practice page lands — noted here so a later session knows it was considered, not forgotten.

---

## Global Constraints

- **Never write a volatile value from memory.** No model id, price, limit or availability fact enters any file in this plan.
- **`meta/ledger.yaml` must stay untouched.** It is regenerated only on `master` after a merge, never on a branch. Neither task changes a page's `verified` date or its referenced records, so no regeneration is owed.
- **The four gates must stay network-free and pass:** `node tools/corpus/cli.mjs render --check .` (exit 0, no `would render:` line), `node tools/corpus/cli.mjs lint .` (`lint: clean`), `node tools/corpus/cli.mjs verify .` (`verify: clean`), `npm test` (`# fail 0`).
- **Test-count discipline.** `# fail 0` alone does not prove a suite is intact — a truncated file reports zero failures. Record the total before and after; it must rise by exactly the number of tests added. Baseline at the time of writing: **559**.
- **Editing `CLAUDE.md` requires the Python path.** It is tens of kilobytes; the native edit tool refuses files this size, and that path also bypasses the Prettier hook. Use read → `assert s.count(old) == 1` → replace → write, as every step below does.
- **Stage by filename.** Never `git add -A`, `git add .`, or `git add -f`.
- **No new dependencies.**
- **Budget:** the spec's arithmetic is ~2.1 h/yr of new maintenance against 4 h/yr of headroom, and it holds *only* while every page named is evergreen and record-free.

---

## Review Focus

Five failure modes the spec implies that no obvious test would catch. Each has its test assigned to the task that owns the code.

1. **A guard test matching a topic name anywhere in `CLAUDE.md` can never fail.** Measured on 2026-10-12: `tools` appears 27 times in `CLAUDE.md`, `context` 17, `models` 15 — none of them in the topic list. A `contract.includes(topic)` assertion would pass for those three for reasons unrelated to the taxonomy, which is a test that looks green forever. The guard must parse the topic-list sentence specifically. → **Task 1, Steps 1 and 4.**
2. **Drift in the reverse direction goes unnoticed.** A topic removed from `meta/taxonomy.yaml` but left in the contract's prose leaves the contract promising a topic that no longer validates. A one-way "every YAML topic appears in prose" check misses it; the comparison must be set equality. → **Task 1, Steps 1 and 4.**
3. **The spelled count silently disagrees with the list.** The sentence opens "The fifteen topics"; adding a topic to both the YAML and the list while leaving the numeral word makes the contract wrong by one, and nothing reads it. → **Task 1, Step 1.**
4. **`topic: security` must actually validate, not merely appear in a file.** Verified by reading the wiring: `tools/corpus/cli.mjs:58` defines its own `loadTopics(root)`, reads `meta/taxonomy.yaml` at runtime, and passes the list into `validateFrontmatter(data, topics)` (`tools/corpus/lint.mjs:16`), which rejects an unlisted topic at line 31 as `frontmatter-topic`. So the YAML edit is sufficient and no code change is owed — but the plan asserts it rather than assuming it. → **Task 1, Step 7.**
5. **An empty topic must not reach the built site.** `navTopics` (`tools/corpus/site-nav.mjs:31–40`) ends in `.filter((t) => t.pages.length > 0)`, so a topic with no pages is omitted. This is the behaviour that makes it safe to add `security` long before any page exists, and it is load-bearing for this plan. → **Task 1, Step 8.**

---

## Task 1: Add the `security` topic, and guard the contract against taxonomy drift

**Files:**
- Modify: `meta/taxonomy.yaml`
- Modify: `CLAUDE.md:58-62` (the topic-list paragraph)
- Create: `tools/corpus/test/taxonomy-contract.test.mjs`

**Interfaces:**
- Consumes: `loadTopics(root)` exported from `tools/corpus/site-nav.mjs:20` — returns `string[]`, the `topics:` list from `meta/taxonomy.yaml`, or `[]` when the file is absent. The test reuses it rather than re-parsing the YAML, so the guard reads the taxonomy exactly as the tooling does.
- Produces: `security` as a valid value for a guide's front-matter `topic`. No new exported symbol.

- [ ] **Step 1: Write the guard test**

Create `tools/corpus/test/taxonomy-contract.test.mjs`:

```javascript
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { loadTopics } from "../site-nav.mjs";

const root = path.dirname(
  path.dirname(path.dirname(fileURLToPath(import.meta.url))),
);
const contract = fs.readFileSync(path.join(root, "CLAUDE.md"), "utf8");

// Matching a topic name anywhere in CLAUDE.md is useless as a guard:
// "tools" appears 27 times in this file, "context" 17, "models" 15, none
// of them in the topic list. So parse the one sentence that IS the list.
// It runs from the colon after the taxonomy filename to the next period,
// and no topic name contains a period.
const LIST = /topics, from `meta\/taxonomy\.yaml`:\s*([^.]+)\./;

const NUMBER_WORDS = {
  13: "thirteen",
  14: "fourteen",
  15: "fifteen",
  16: "sixteen",
  17: "seventeen",
  18: "eighteen",
};

function listedTopics() {
  const m = contract.match(LIST);
  assert.ok(m, "CLAUDE.md no longer contains a parseable topic-list sentence");
  return m[1]
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
}

test("CLAUDE.md's topic list is exactly meta/taxonomy.yaml", () => {
  const declared = loadTopics(root);
  assert.ok(declared.length > 0, "taxonomy.yaml declared no topics");
  // Set equality catches BOTH directions: a topic added to the taxonomy and
  // never documented, and a topic deleted from the taxonomy but left in the
  // prose, which would promise a topic that no longer validates.
  assert.deepEqual([...listedTopics()].sort(), [...declared].sort());
});

test("CLAUDE.md's topic list is in taxonomy order", () => {
  assert.deepEqual(listedTopics(), loadTopics(root));
});

test("CLAUDE.md's spelled topic count matches the list", () => {
  const n = loadTopics(root).length;
  const word = NUMBER_WORDS[n];
  assert.ok(word, `no spelled form on file for ${n} topics; extend NUMBER_WORDS`);
  assert.ok(
    contract.includes(`The ${word} topics`),
    `CLAUDE.md should read "The ${word} topics" for ${n} topics`,
  );
});

test("security is a taxonomy topic", () => {
  assert.ok(loadTopics(root).includes("security"));
});
```

- [ ] **Step 2: Run it and read the result carefully**

Run: `node --test tools/corpus/test/taxonomy-contract.test.mjs 2>&1 | grep -E "^# (tests|pass|fail)|not ok"`

Expected: **3 pass, 1 fail** — the first three agree on the current tree (15 topics, "fifteen", matching order), and only `security is a taxonomy topic` fails. That single failure is this task's red test.

A guard test that passes on the tree it was written against is the normal case and is not evidence it works. Steps 3 and 4 are what establish that.

- [ ] **Step 3: Mutation-check the drift direction**

Prove the guard fails when the taxonomy gains a topic the contract does not list:

```bash
cd ~/dev/llm-guides
cp meta/taxonomy.yaml /tmp/tax-backup.yaml
printf '  - decoy\n' >> meta/taxonomy.yaml
node --test tools/corpus/test/taxonomy-contract.test.mjs 2>&1 | grep -E "^# (pass|fail)"
cp /tmp/tax-backup.yaml meta/taxonomy.yaml && rm /tmp/tax-backup.yaml
git diff --stat meta/taxonomy.yaml
```

Expected: `# fail` is at least 2 while the decoy is present (set equality and order both break), and `git diff --stat` prints nothing after restoring.

- [ ] **Step 4: Mutation-check the vacuous-match trap**

This is Review Focus 1 and 2, and it is the step that proves the guard is anchored rather than substring-matching. Remove `context` from the list sentence only — it still appears 17 times elsewhere in `CLAUDE.md`, so a naive guard would stay green:

```bash
cd ~/dev/llm-guides
cp CLAUDE.md /tmp/claude-backup.md
TOKEN_OPTIMIZER_MODE=off python3 - <<'PY'
p = "CLAUDE.md"
s = open(p).read()
old = "foundations, prompting, context, agents,"
assert s.count(old) == 1, s.count(old)
s = s.replace(old, "foundations, prompting, agents,", 1)
open(p, "w").write(s)
PY
grep -c "context" CLAUDE.md
node --test tools/corpus/test/taxonomy-contract.test.mjs 2>&1 | grep -E "^# (pass|fail)"
cp /tmp/claude-backup.md CLAUDE.md && rm /tmp/claude-backup.md
git diff --stat CLAUDE.md
```

Expected: the `grep -c` still prints a number well above zero (proving "context" is abundant in the file), `# fail` is at least 2, and `git diff --stat` prints nothing after restoring. If the test passes while `context` is missing from the list, the regex is matching the wrong span — fix it before continuing.

- [ ] **Step 5: Add the topic to the taxonomy**

```bash
cd ~/dev/llm-guides
TOKEN_OPTIMIZER_MODE=off python3 - <<'PY'
p = "meta/taxonomy.yaml"
s = open(p).read()
old = "  - orchestration\n"
assert s.count(old) == 1, s.count(old)
s = s.replace(old, "  - orchestration\n  - security\n", 1)
open(p, "w").write(s)
PY
tail -3 meta/taxonomy.yaml
```

Expected output ends with `  - security`.

- [ ] **Step 6: Update the contract's topic paragraph**

The replacement states the `security`/`harness` boundary, because the spec names that boundary as a standing risk: "Sandboxing and permissions can be read as either. Whichever topic a page lands in, the other should link rather than restate."

```bash
cd ~/dev/llm-guides
TOKEN_OPTIMIZER_MODE=off python3 - <<'PY'
p = "CLAUDE.md"
s = open(p).read()
old = """The fifteen topics, from `meta/taxonomy.yaml`: foundations, prompting, context, agents,
claude-code, cowork, harness, models, tools, building, domains, providers, evals, multimodal, orchestration. `claude-code` is
intentionally the largest. `harness` carries guardrails, long-running automation, trust,
and observability. `domains` ships with one exemplar playbook plus the generation recipe
(see "Domain playbook shape") rather than many thin pages."""
new = """The sixteen topics, from `meta/taxonomy.yaml`: foundations, prompting, context, agents,
claude-code, cowork, harness, models, tools, building, domains, providers, evals, multimodal, orchestration, security. `claude-code` is
intentionally the largest. `harness` carries guardrails, long-running automation, trust,
and observability; `security` carries the adversarial half — prompt injection, tool-use
blast radius, sandboxing — because operating an agent you already trust over time and
defending one against hostile input are different problems with different readers. Where a
subject could sit in either, one topic owns it and the other links rather than restates.
`domains` ships with one exemplar playbook plus the generation recipe
(see "Domain playbook shape") rather than many thin pages."""
assert s.count(old) == 1, s.count(old)
s = s.replace(old, new, 1)
open(p, "w").write(s)
PY
node --test tools/corpus/test/taxonomy-contract.test.mjs 2>&1 | grep -E "^# (tests|pass|fail)"
```

Expected: `# pass 4`, `# fail 0`.

- [ ] **Step 7: Prove `topic: security` actually validates**

Review Focus 4. The wiring says it should; assert it rather than assume it. Build a throwaway page in a temp corpus that carries the real taxonomy, and confirm `frontmatter-topic` does not fire:

```bash
cd ~/dev/llm-guides
node -e '
import("./tools/corpus/lint.mjs").then(async (lint) => {
  const { loadTopics } = await import("./tools/corpus/site-nav.mjs");
  const topics = loadTopics(".");
  const ok = lint.validateFrontmatter({ topic: "security" }, topics);
  const bad = lint.validateFrontmatter({ topic: "sekurity" }, topics);
  const fired = (is) => is.some((i) => i.rule === "frontmatter-topic");
  console.log("security rejected:", fired(ok), "| typo rejected:", fired(bad));
})'
```

Expected: `security rejected: false | typo rejected: true`. The second half matters as much as the first — it proves the check is live rather than returning clean for everything.

- [ ] **Step 8: Prove the empty topic stays out of the built site**

Review Focus 5:

```bash
cd ~/dev/llm-guides
node -e '
Promise.all([import("./tools/corpus/site-nav.mjs")]).then(([m]) => {
  const topics = m.loadTopics(".");
  console.log("security in taxonomy:", topics.includes("security"));
  const models = [{ topic: "models", path: "guides/models/comparison.md" }];
  const nav = m.navTopics(models, topics);
  const slugs = nav.map((t) => t.slug);
  console.log("nav slugs:", JSON.stringify(slugs));
  console.log("populated topic present:", slugs.includes("models"));
  console.log("security in nav:", slugs.includes("security"));
})'
```

`navTopics(models, topics)` returns `{ slug, label, pages }` per topic and ends in
`.filter((t) => t.pages.length > 0)`. An empty `models` array would filter out
*every* topic, so `security` being absent would prove nothing — hence the models
array above, which populates a different topic.

Expected: `security in taxonomy: true`, `nav slugs: ["models"]`, `populated topic
present: true`, `security in nav: false`. The third line is what stops this being
a check that passes merely because the nav came back empty.

- [ ] **Step 9: Run the four gates**

```bash
cd ~/dev/llm-guides
npm test 2>&1 | grep -E "^# (tests|pass|fail)"
node tools/corpus/cli.mjs render --check . ; echo "render exit=$?"
node tools/corpus/cli.mjs lint .
node tools/corpus/cli.mjs verify .
git status --porcelain meta/ledger.yaml
```

Expected: `# fail 0` with the total at **563** (559 + 4), `render exit=0` with no `would render:` line, `lint: clean`, `verify: clean`, and no output from the `git status` line — the ledger must be untouched.

- [ ] **Step 10: Commit**

```bash
cd ~/dev/llm-guides
git add meta/taxonomy.yaml CLAUDE.md tools/corpus/test/taxonomy-contract.test.mjs
git commit -m "feat: add the security topic, and guard the contract against taxonomy drift"
```

---

## Task 2: Record the provider facts/practice split in the contract

**Files:**
- Modify: `CLAUDE.md` (the "quarantine principle" section)
- Modify: `tools/corpus/test/taxonomy-contract.test.mjs` (append one test)

**Interfaces:**
- Consumes: nothing from Task 1 at the code level. The appended test reuses the `contract` constant already defined at the top of the file in Task 1, Step 1.
- Produces: no exported symbol. The deliverable is a contract rule a future author is bound by.

- [ ] **Step 1: Write the failing test**

Append to `tools/corpus/test/taxonomy-contract.test.mjs`:

```javascript
// Decision 2 of the scope-expansion spec. The rule has no mechanical
// enforcement and no page obeys it yet, so the contract's wording is the
// only thing carrying it; this pins that the wording still exists.
test("CLAUDE.md states the provider facts/practice split", () => {
  assert.ok(
    contract.includes("Provider facts and provider practice are different pages"),
    "the facts/practice rule is missing from CLAUDE.md",
  );
  assert.ok(
    /practice page[^.]*no `data\/` records/.test(contract),
    "the contract must say a practice page carries no data/ records",
  );
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `node --test tools/corpus/test/taxonomy-contract.test.mjs 2>&1 | grep -E "^# (pass|fail)|not ok"`

Expected: FAIL — `the facts/practice rule is missing from CLAUDE.md`.

- [ ] **Step 3: Amend the contract**

The new paragraph goes directly after the quarantine principle, because it is the same principle applied to cadence instead of to values.

```bash
cd ~/dev/llm-guides
TOKEN_OPTIMIZER_MODE=off python3 - <<'PY'
p = "CLAUDE.md"
s = open(p).read()
anchor = """F2's workaround promoted to a rule, and it exists for cadence: page cadence is
the maximum volatility of any record the page references, so one model price on
a concept page puts that page on a 30-day clock permanently.
"""
addition = """
**Provider facts and provider practice are different pages.** A vendor's facts
page under `guides/providers/` references high-volatility model rows, so it sits
on the 30-day clock permanently. How a reader should work differently against
that vendor is a separate page beside it, which carries **no `data/` records** and
states no figures: it links the facts page, and the facts page links back. This
is the quarantine principle applied to cadence rather than to values — a practice
section inside the facts page would inherit that cadence and be re-verified twelve
times a year to confirm that advice which has not changed still has not changed.
The two look like one subject and have opposite maintenance profiles. One model id
on a practice page moves it onto the 30-day clock and costs roughly twelve times
its projected maintenance.
"""
assert s.count(anchor) == 1, s.count(anchor)
s = s.replace(anchor, anchor + addition, 1)
open(p, "w").write(s)
PY
node --test tools/corpus/test/taxonomy-contract.test.mjs 2>&1 | grep -E "^# (tests|pass|fail)"
```

Expected: `# pass 5`, `# fail 0`.

- [ ] **Step 4: Confirm the inline-code spans are balanced**

The paragraph carries several backtick spans, and an unterminated one silently
reflows every heading after it. Neither lint nor verify reads `CLAUDE.md`, so
nothing else would catch it:

```bash
cd ~/dev/llm-guides
TOKEN_OPTIMIZER_MODE=off python3 -c "
s = open('CLAUDE.md').read()
i = s.index('Provider facts and provider practice')
para = s[i:i+900]
print('backticks in paragraph:', para.count('\`'), '(must be even)')
"
```

Expected: an even count. An odd count means a span is still open — fix it before committing.

- [ ] **Step 5: Run the four gates**

```bash
cd ~/dev/llm-guides
npm test 2>&1 | grep -E "^# (tests|pass|fail)"
node tools/corpus/cli.mjs render --check . ; echo "render exit=$?"
node tools/corpus/cli.mjs lint .
node tools/corpus/cli.mjs verify .
git status --porcelain meta/ledger.yaml
```

Expected: `# fail 0` with the total at **564** (563 + 1), `render exit=0`, `lint: clean`, `verify: clean`, and no ledger change.

- [ ] **Step 6: Commit**

```bash
cd ~/dev/llm-guides
git add CLAUDE.md tools/corpus/test/taxonomy-contract.test.mjs
git commit -m "docs: record the provider facts/practice split as a contract rule"
```

---

## What this plan deliberately leaves undone

Stated so the next session does not read the gap as an oversight:

- **The seven pages.** `research-required` gates every one. The research cycle is the next piece of work and needs its own spec.
- **Decision 3, where skills live.** The spec leaves it open on purpose; the research cycle answers it.
- **A mechanical "practice pages carry no records" rule.** Considered and declined above.
- **The `loadTopics` duplication.** `tools/corpus/cli.mjs:58` and `tools/corpus/site-nav.mjs:20` each define one, the same shape of duplication that `guidePaths` had before it moved to `paths.mjs`. Out of scope here — noted for whoever next touches either file.
- **Any change to `docs/superpowers/specs/2026-10-07-corpus-roadmap-design.md`.** Its budget table now understates the committed total by ~2.1 h/yr, but the scope spec records that arithmetic itself, and amending a second approved spec is a separate decision.
