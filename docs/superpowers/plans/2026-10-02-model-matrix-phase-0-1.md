# Model Matrix Expansion — Phases 0 and 1 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Pin the two unverified inclusion rules, then give `guides/models/claude-models.md` a per-model qualitative entry for each of the six Anthropic models it already tracks — proving the entry shape before any of it is copied to another provider.

**Architecture:** Phase 0 is research only; it edits the spec and nothing under `guides/` or `data/`. Phase 1 adds prose to one existing page under a new numbered subsection `### 4.7`, with one `####` entry per model. No record is created, changed or re-tagged, so the refresh unit is untouched and no page date moves.

**Tech Stack:** Node 22+, the corpus CLI at `tools/corpus/cli.mjs`, `node:test`. No new dependencies. Markdown and YAML only.

**Spec:** `docs/superpowers/specs/2026-10-02-model-matrix-expansion-design.md` (revision 3). Read sections 7, 8, 9, 11 and 12 before starting.

**Scope note:** This plan deliberately stops at the end of phase 1. The spec names phase 1 as the kill point — if the entry shape cannot carry six models honestly, the design is wrong and phases 2–5 do not start. Planning them now would plan work that may never happen.

## Prerequisites and branching

The spec this plan implements is on branch `spec-model-matrix` and is **not yet
merged**. Nothing in this plan starts until it is, because the plan argues from the
spec and an executor reads both.

Per the spec's section 12, each phase is its own branch, review and pull request:

| Phase | Branch | Base | Tasks |
| --- | --- | --- | --- |
| 0 | `model-matrix-phase-0` | `master` | 1, 2 |
| 1 | `model-matrix-phase-1` | `master` | 3, 4, 5, 6 |

Phase 1 does not depend on phase 0's output: the two pinned rules govern Google and
the open-weight providers, and phase 1 touches only Anthropic. They may run in
either order or in parallel.

**`guides/models/claude-models.md` carries `seed: true`**, so `corpus verify` does
not require a `research:` artifact for it (`research-required` exempts seeds). Spec
criterion 5 is therefore already satisfied for this page; it binds the three new
pages in phase 3, not this one. Do not add a `research:` field, and do not remove
`seed: true` — it is permanent provenance.

Spec criterion 3, the `page-vendor-mixed` verify rule, lands in phase 4. It is not
part of this plan.

## Global Constraints

Every task's requirements implicitly include all of these. Values are copied verbatim from `CLAUDE.md` and the spec.

- **Never write a volatile value from memory.** Every figure must come from a page fetched in this run. Quotes recorded in this plan are **cross-checks, not sources**.
- **Do not name the expected figure in a fetch prompt.** Ask for the field, not for confirmation of a value. Where a figure decides an outcome, fetch the raw payload and search it; treat tooltips and footnotes as content, because an HTML-to-text pass drops both (`meta/prompts/refresh.md`).
- **Model names are identifiers** and may be written freely in prose. **Model ids, prices, context and output limits, parameter counts and parameter defaults are values** and may appear in a guide body only inside a marker block backed by a `data/` record.
- **Evidence labels are exactly** `**Verified**`, `**Documented**` or `**Plausible**`. Nothing in this plan can reach `**Verified**`: that requires a passing proof shipping under `examples/`. Qualitative claims ceiling at `**Documented**` (vendor's own description, linked, dated) or `**Plausible**`.
- **A bullet mixing a documented fact with an inference labels each part separately on the same `Evidence:` line.** An inference never inherits `**Documented**`.
- **Benchmark scores and leaderboards are linked, never transcribed.**
- **Four gates must be clean before every commit:** `node tools/corpus/cli.mjs render --check .` (exit 0, no `would render:` line), `node tools/corpus/cli.mjs lint .` (`lint: clean`), `node tools/corpus/cli.mjs verify .` (`verify: clean`), `npm test` (372/372 at time of writing).
- **The page's `verified` date must not move.** Spec criterion 7: a page date asserts the whole of its section 6 was worked, and this plan does not re-work the untracked claims. `verified: 2026-09-16` stays.
- **Never run `git checkout --`, `git restore`, `git reset` or `git clean`.** An earlier implementer did and destroyed an unrelated uncommitted fix.
- **Edit by exact bytes.** Read the target line with `python3 -c "print(repr(open(f).read().splitlines()[n-1]))"` before building an edit anchor; never build one from `grep` output, which a local hook abridges. Edit with a Python `read → assert s.count(old) == 1 → replace → write` script run through Bash.
- **Stage by filename.** Never `git add -A` or `git add .`.
- **A Prettier hook reformats Markdown after every write.** That is expected; run `render --check` after it fires, not before.
- **Do not regenerate `meta/ledger.yaml`.** It is rebuilt on `master` after merge, one file one writer.

## Review Focus

Five failure modes the spec implies that no task's happy path exercises. Each has a test pinned to the task that owns it.

1. **Vendor positioning has changed since this plan was written.** The quotes below were read 2026-10-02. If a live quote differs, the vendor moved and the entry must use the live wording — Task 3 Step 2 stops the task when they differ, rather than copying the plan's text.
2. **A legacy entry's strengths get inferred and labelled `**Documented**`.** The spec forbids this explicitly. Task 5 Step 5 greps every new `**Documented**` bullet and requires a vendor-page link on the same line.
3. **A bare API id reaches prose.** Lint catches ids that have records; it is blind to any that do not. Task 6 Step 2 greps all six ids across the body outside marker blocks.
4. **The page date moves on a partial pass.** Task 6 Step 4 asserts `verified: 2026-09-16` is unchanged in the diff.
5. **A newly cited untracked claim never reaches section 6.** Entries will cite thinking mode and effort behaviour, which no record carries. Task 6 Step 3 adds each to section 6's untracked list.

---

## Task 1: Pin the Google inclusion rule

Phase 0. Research only.

**Files:**
- Modify: `docs/superpowers/specs/2026-10-02-model-matrix-expansion-design.md` (section 8 table, the Google row)

**Interfaces:**
- Consumes: nothing.
- Produces: a pinned URL and a verbatim statement that later phases rely on to decide which Google models are in scope. Not consumed by phase 1.

- [ ] **Step 1: Find the candidate page and fetch it**

The spec's unpinned claim is "It is listed as a current model on the Gemini API models page, excluding entries that page marks preview or legacy". Fetch the Gemini API models list. Start from the documentation root rather than guessing a path:

```
Fetch https://ai.google.dev/gemini-api/docs/models
```

Ask for the field, not for a value: request a verbatim list of every model name the page presents, together with any label the page attaches to each (for example `Preview`, `Legacy`, `Deprecated`, `Stable`).

- [ ] **Step 2: Decide whether the rule is falsifiable, and record the evidence**

The rule is falsifiable only if the page both (a) enumerates models and (b) marks at least one of them in a way that excludes it. Write down, verbatim, one model the rule admits and one it excludes.

If the page does **not** distinguish current from preview or legacy, the rule as written is not falsifiable. Do not invent a distinction. Record that finding and leave the row unpinned with the reason — that is a legitimate outcome of this task and an input to the owner's decision, not a failure.

- [ ] **Step 3: Update the spec's section 8 row**

Read the exact bytes first:

```bash
cd /Users/marcusklein/dev/llm-guides
python3 -c "
d=open('docs/superpowers/specs/2026-10-02-model-matrix-expansion-design.md',encoding='utf-8').read().splitlines()
print([ (n,l) for n,l in enumerate(d,1) if 'Gemini API models list' in l ])
"
```

Then replace that row, filling the URL and date you actually used:

```python
p = "docs/superpowers/specs/2026-10-02-model-matrix-expansion-design.md"
s = open(p, encoding="utf-8").read()
old = "| Google | It is listed as a current model on the Gemini API models page, excluding entries that page marks preview or legacy | the Gemini API models list | **no** — pin the URL and confirm the page distinguishes current from preview/legacy |"
new = "| Google | It is listed as a current model on the Gemini API models page, excluding entries that page marks preview or legacy | `<URL YOU FETCHED>` | yes, read <DATE> |"
assert s.count(old) == 1
open(p, "w", encoding="utf-8").write(s.replace(old, new))
```

Then append the verbatim evidence directly beneath the table, as a short paragraph naming the admitted and excluded model, so a later reader can check the rule without re-fetching.

- [ ] **Step 4: Verify nothing outside the spec changed**

```bash
cd /Users/marcusklein/dev/llm-guides && git status --porcelain
```

Expected: exactly one modified file, `docs/superpowers/specs/...`. No file under `guides/` or `data/`. If anything else appears, stop and investigate — this task touches no corpus content.

- [ ] **Step 5: Commit**

```bash
cd /Users/marcusklein/dev/llm-guides
git add docs/superpowers/specs/2026-10-02-model-matrix-expansion-design.md
git commit -m "docs: pin the Google inclusion rule for the model matrix"
```

---

## Task 2: Pin the open-weights inclusion rule

Phase 0. Research only.

**Files:**
- Modify: `docs/superpowers/specs/2026-10-02-model-matrix-expansion-design.md` (section 8 table, the Meta/Qwen row)

**Interfaces:**
- Consumes: nothing.
- Produces: two pinned collection URLs. Not consumed by phase 1.

- [ ] **Step 1: Fetch each organisation's model listing**

The rule is "It is a member of the owning organisation's current model collection". Two organisations, two URLs. Fetch both:

```
Fetch https://huggingface.co/meta-llama
Fetch https://huggingface.co/Qwen
```

Request a verbatim list of any **collections** the organisation publishes, with each collection's title and item count. A Hugging Face collection is a curated, named set with stable membership; the organisation's full model list is not a collection and does not satisfy this rule.

- [ ] **Step 2: Test the rule against a model that should fail it**

This is the step that matters. Revision 2's rule ("the org still publishes the weights repository") was rejected precisely because nothing fails it. For each organisation, name one model whose repository still exists but which is **not** a member of the current collection. If you cannot find one for an organisation, the rule does not discriminate for that organisation and must be recorded as unpinned with that reason.

- [ ] **Step 3: Update the spec's section 8 row**

Read the exact bytes, then replace:

```python
p = "docs/superpowers/specs/2026-10-02-model-matrix-expansion-design.md"
s = open(p, encoding="utf-8").read()
old = "| Meta, Qwen | It is a member of the owning organisation's current model collection | the org's published collection | **no** — pin both URLs and confirm the collection has stable membership |"
new = "| Meta, Qwen | It is a member of the owning organisation's current model collection | `<META COLLECTION URL>`, `<QWEN COLLECTION URL>` | yes, read <DATE> |"
assert s.count(old) == 1
open(p, "w", encoding="utf-8").write(s.replace(old, new))
```

Append the verbatim evidence beneath the table, naming for each organisation one admitted model and one excluded model.

- [ ] **Step 4: Confirm both rows are now resolved, or explicitly not**

```bash
cd /Users/marcusklein/dev/llm-guides && grep -n '\*\*no\*\*' docs/superpowers/specs/2026-10-02-model-matrix-expansion-design.md
```

Expected: no output, meaning every inclusion rule is pinned. If a row is still `**no**`, Step 2 found the rule undiscriminating; that must be reported to the owner before phase 3 and does not block phase 1.

- [ ] **Step 5: Commit**

```bash
cd /Users/marcusklein/dev/llm-guides
git add docs/superpowers/specs/2026-10-02-model-matrix-expansion-design.md
git commit -m "docs: pin the open-weights inclusion rule for the model matrix"
```

---

## Task 3: Add the `### 4.7` subsection and the Claude Opus 5.5 entry

Phase 1 begins. This is the exemplar: the entry shape is proven here before it is repeated.

**Files:**
- Modify: `guides/models/claude-models.md` (insert a new `### 4.7` after the end of `### 4.6`, before `## 5.`)

**Interfaces:**
- Consumes: nothing from earlier tasks.
- Produces: the heading `### 4.7 Model by model: what each one is for` and the `####` entry-heading convention. Tasks 4 and 5 insert sibling `####` entries under this same heading and must match its shape exactly.

- [ ] **Step 1: Re-read the vendor pages**

Fetch both, asking for fields rather than confirmations:

```
Fetch https://platform.claude.com/docs/en/models/overview
  Ask: quote verbatim each current model's one-line description as the page presents it,
       and quote the paragraph advising which model to start with.
Fetch https://platform.claude.com/docs/en/about-claude/pricing
  Ask: quote verbatim the cache-read multiplier row and any per-model exceptions to it.
```

- [ ] **Step 2: Compare against what this plan recorded, and stop if they differ**

Read 2026-10-02, these were the verbatim strings:

- Opus 5.5 description: `For long-running agentic coding and knowledge work`
- Start-here advice: `If you're unsure which model to use, start with Claude Opus 5.5 for most workloads. Use Claude Fable 5.1 for demanding reasoning and long-horizon agentic work, or when your evals on Claude Opus 5.5 at higher effort still fall short.`
- Cache-read exception: `Cache read (hit) | 0.1x base input price (0.025x on Claude Fable 5.1 and Claude Mythos 5.1; 0.05x on Claude Opus 5.5)`

If what you fetched differs from any of these, **the vendor has changed and this plan is stale**. Use the live wording, and note the difference in the commit message. Do not copy the strings above into the page without having seen them live.

- [ ] **Step 3: Insert the subsection and the entry**

`### 4.6` ends immediately before `## 5. Edge cases and failure modes`. Read the exact bytes of that boundary first:

```bash
cd /Users/marcusklein/dev/llm-guides
python3 -c "
d=open('guides/models/claude-models.md',encoding='utf-8').read().splitlines()
for n in range(126,132): print(n, repr(d[n-1]))
"
```

Insert before the `## 5.` heading:

```python
p = "guides/models/claude-models.md"
s = open(p, encoding="utf-8").read()
anchor = "## 5. Edge cases and failure modes\n"
entry = """### 4.7 Model by model: what each one is for

The table in section 2 gives the figures. This section gives the judgement: what the
vendor says each model is for, where it stops being the right answer, and what to
reach for instead. Figures are deliberately not repeated here — they live in the
table, which is the only place a value may appear on this page.

#### Claude Opus 5.5

**What it's for** — in the vendor's words, "for long-running agentic coding and knowledge work" ([models overview](https://platform.claude.com/docs/en/models/overview), read 2026-10-02).

**Strengths**

- It is the vendor's own default: the overview tells a reader who is unsure which model to use to start here for most workloads. Evidence: **Documented** — [models overview](https://platform.claude.com/docs/en/models/overview), read 2026-10-02.
- Thinking is adaptive and always on, and its default effort is lower than Claude Fable 5.1's, so it reaches an answer with less reasoning spend before any tuning. Evidence: **Documented** for both settings — [models overview](https://platform.claude.com/docs/en/models/overview), read 2026-10-02. That the lower default translates into lower cost in practice is **Plausible** — it follows from per-token billing of reasoning output, which the vendor does not state as a comparison.

**Limits**

- It is not the vendor's recommendation for the hardest reasoning. The overview routes demanding reasoning and long-horizon agentic work to Claude Fable 5.1, and says to move up when evals here at higher effort still fall short. Evidence: **Documented** — [models overview](https://platform.claude.com/docs/en/models/overview), read 2026-10-02.
- Prompt-cache reads cost a larger fraction of its base input price than they do on Claude Fable 5.1, so heavy cache reuse narrows the gap between the two by less than the base prices suggest. Evidence: **Documented** — [pricing page](https://platform.claude.com/docs/en/about-claude/pricing), read 2026-10-02.

**Reach for it when** the work is long-running agentic coding or knowledge work and you have no evidence you need more than this.

**Avoid it when** your own evals at higher effort still fall short — that is the vendor's stated signal to move to Claude Fable 5.1.

**Lifecycle** — Active. The vendor publishes a retirement commitment for every model; this page deliberately does not track retirement dates for the current four, only for the legacy rows (section 6). Evidence: **Documented** — [model deprecations](https://platform.claude.com/docs/en/about-claude/model-deprecations), read 2026-10-02.

"""
assert s.count(anchor) == 1
open(p, "w", encoding="utf-8").write(s.replace(anchor, entry + anchor))
```

- [ ] **Step 4: Confirm no value leaked into the new prose**

The entry must contain no API id, price, context window, output limit or effort value. Check:

```bash
cd /Users/marcusklein/dev/llm-guides
sed -n '/^### 4.7/,/^## 5\./p' guides/models/claude-models.md | grep -nE 'claude-[a-z0-9-]+|\$[0-9]|[0-9]+K tokens|1M tokens|\b(medium|high)\b' || echo "clean: no value or default in the new prose"
```

Expected: `clean: ...`. A hit on a whole word `medium` or `high` means a parameter default was written as a value — rephrase to a relation ("lower than Fable 5.1's") instead. The word boundaries matter: without them this check matches "higher", which appears legitimately in the relational phrasing the constraint asks for.

- [ ] **Step 5: Run the four gates**

```bash
cd /Users/marcusklein/dev/llm-guides
node tools/corpus/cli.mjs render --check . ; echo "RENDER=$?"
node tools/corpus/cli.mjs lint . ; echo "LINT=$?"
node tools/corpus/cli.mjs verify . ; echo "VERIFY=$?"
npm test 2>&1 | grep -E '^# (tests|pass|fail)'
```

Expected: `RENDER=0` with no `would render:` line, `lint: clean`, `verify: clean`, `# fail 0`.

- [ ] **Step 6: Commit**

```bash
cd /Users/marcusklein/dev/llm-guides
git add guides/models/claude-models.md
git commit -m "docs: add the per-model entry shape and the Claude Opus 5.5 entry"
```

---

## Task 4: Add the three remaining current-model entries

**Files:**
- Modify: `guides/models/claude-models.md` (append three `####` entries inside `### 4.7`)

**Interfaces:**
- Consumes: the `### 4.7` heading and the `####` entry shape from Task 3. Match it exactly: the same six bold lead-ins, in the same order, with an `Evidence:` line on every bullet.
- Produces: entries for Claude Fable 5.1, Claude Sonnet 5.5 and Claude Haiku 4.5.

- [ ] **Step 1: Re-read the overview and compare**

Fetch `https://platform.claude.com/docs/en/models/overview`, asking for each current model's verbatim one-line description and the verbatim `Thinking` and `Default effort` rows. Read 2026-10-02, the descriptions were:

- Fable 5.1: `For demanding reasoning and long-horizon agentic work`
- Sonnet 5.5: `The best combination of speed and intelligence`
- Haiku 4.5: `The fastest model with near-frontier intelligence`

and the `Thinking` row read `Adaptive (always on) | Adaptive (always on) | Adaptive | Extended` with `Default effort` reading `high | medium | high | Not supported` across Fable 5.1, Opus 5.5, Sonnet 5.5, Haiku 4.5 in that column order. If any differ, use the live wording.

- [ ] **Step 2: Insert the three entries**

The section 2 table orders rows Fable 5.1, Opus 5.5, Sonnet 5.5, Haiku 4.5, and the
entries must match so a reader can scan both the same way. Task 3 placed Opus 5.5
first, so insert Fable 5.1 **before** it and the other two before `## 5.`. Two
inserts, no reordering.

```python
p = "guides/models/claude-models.md"
s = open(p, encoding="utf-8").read()
anchor = "## 5. Edge cases and failure modes\n"
entries = """#### Claude Fable 5.1

**What it's for** — in the vendor's words, "for demanding reasoning and long-horizon agentic work" ([models overview](https://platform.claude.com/docs/en/models/overview), read 2026-10-02).

**Strengths**

- It is where the vendor sends work that Claude Opus 5.5 cannot finish: the overview names it for demanding reasoning and long-horizon agentic work, and as the escalation when evals on Opus 5.5 at higher effort fall short. Evidence: **Documented** — [models overview](https://platform.claude.com/docs/en/models/overview), read 2026-10-02.
- Prompt-cache reads cost a smaller fraction of its base input price than on any other current model, so a large reused context is cheaper here relative to its own input price than the headline figures suggest. Evidence: **Documented** — [pricing page](https://platform.claude.com/docs/en/about-claude/pricing), read 2026-10-02.

**Limits**

- It is the most expensive current model in both directions, so using it where Opus 5.5 would do is the easiest way to overspend on this lineup. Evidence: **Documented** for the price ordering — the table in section 2, from the [pricing page](https://platform.claude.com/docs/en/about-claude/pricing), read 2026-10-02. That this is the commonest overspend is **Plausible** — practitioner inference, not a vendor claim.
- Its default effort is the higher of the two adaptive-thinking settings in the lineup, so an unconfigured call spends more reasoning than the same call on Opus 5.5. Evidence: **Documented** — [models overview](https://platform.claude.com/docs/en/models/overview), read 2026-10-02.

**Reach for it when** a task has already failed on Claude Opus 5.5 at higher effort, or when the run is long-horizon enough that a mid-run failure costs more than the price difference.

**Avoid it when** you have not tried Opus 5.5 on the same task. The vendor's own advice is to start lower.

**Lifecycle** — Active. Retirement dates for the current four are deliberately untracked on this page (section 6). Evidence: **Documented** — [model deprecations](https://platform.claude.com/docs/en/about-claude/model-deprecations), read 2026-10-02.

#### Claude Sonnet 5.5

**What it's for** — in the vendor's words, "the best combination of speed and intelligence" ([models overview](https://platform.claude.com/docs/en/models/overview), read 2026-10-02).

**Strengths**

- It carries the same context window and output ceiling as the two models above it in the lineup, so moving down to it from Opus 5.5 does not cost you window. Evidence: **Documented** — the table in section 2, from the [models overview](https://platform.claude.com/docs/en/models/overview), read 2026-10-02.
- Thinking is adaptive, so it reasons without the configuration an extended-thinking model needs. Evidence: **Documented** — [models overview](https://platform.claude.com/docs/en/models/overview), read 2026-10-02.

**Limits**

- Its default effort is the higher setting, so its speed advantage over Opus 5.5 is smaller out of the box than the tier names imply. Evidence: **Documented** for the setting — [models overview](https://platform.claude.com/docs/en/models/overview), read 2026-10-02. That this narrows the practical speed gap is **Plausible** — it follows from reasoning output being generated before the answer.
- The vendor does not name it for the hardest reasoning or the longest-horizon agentic work; those route upward. Evidence: **Documented** — [models overview](https://platform.claude.com/docs/en/models/overview), read 2026-10-02.

**Reach for it when** throughput and cost matter and the task is not one the vendor routes upward — the broad middle of production work.

**Avoid it when** the task is long-horizon agentic work, where the lineup's own routing sends you up.

**Lifecycle** — Active. Retirement dates for the current four are deliberately untracked on this page (section 6). Evidence: **Documented** — [model deprecations](https://platform.claude.com/docs/en/about-claude/model-deprecations), read 2026-10-02.

#### Claude Haiku 4.5

**What it's for** — in the vendor's words, "the fastest model with near-frontier intelligence" ([models overview](https://platform.claude.com/docs/en/models/overview), read 2026-10-02).

**Strengths**

- It is the cheapest model in the lineup in both directions, which is what makes high-volume work affordable at all. Evidence: **Documented** — the table in section 2, from the [pricing page](https://platform.claude.com/docs/en/about-claude/pricing), read 2026-10-02.
- It is the only current model whose thinking is Extended rather than Adaptive, so reasoning is something you turn on deliberately instead of something that happens by default. Evidence: **Documented** — [models overview](https://platform.claude.com/docs/en/models/overview), read 2026-10-02.

**Limits**

- Its context window and output ceiling are both the smallest in the lineup, so a prompt that fits the other three may not fit here. This is the trap when swapping it in to save money. Evidence: **Documented** — the table in section 2, from the [models overview](https://platform.claude.com/docs/en/models/overview), read 2026-10-02.
- It does not support a default effort setting at all, so effort-based tuning that works on the rest of the lineup does not transfer. Evidence: **Documented** — [models overview](https://platform.claude.com/docs/en/models/overview), read 2026-10-02.
- It is the oldest model in the current lineup and carries the nearest retirement commitment, so code pinned to it needs a migration plan sooner than code pinned to the others. Evidence: **Documented** — [model deprecations](https://platform.claude.com/docs/en/about-claude/model-deprecations), read 2026-10-02.

**Reach for it when** volume is high, each call is small, and the work is classification, extraction or routing rather than open-ended reasoning.

**Avoid it when** the prompt is large, since its window is the lineup's smallest, or when you were relying on effort tuning.

**Lifecycle** — Active, and the nearest retirement of the current four. Retirement dates for the current four are deliberately untracked on this page (section 6). Evidence: **Documented** — [model deprecations](https://platform.claude.com/docs/en/about-claude/model-deprecations), read 2026-10-02.

"""
assert s.count(anchor) == 1
open(p, "w", encoding="utf-8").write(s.replace(anchor, entries + anchor))
```

Split the block above: everything up to and including the Fable 5.1 entry is inserted
before `"#### Claude Opus 5.5\n"`; the Sonnet 5.5 and Haiku 4.5 entries are inserted
before `anchor`. Both inserts use the same `assert s.count(...) == 1` guard.

- [ ] **Step 3: Confirm the entry order matches the table**

```bash
cd /Users/marcusklein/dev/llm-guides
grep -n '^#### Claude' guides/models/claude-models.md
```

Expected order: `Claude Fable 5.1`, `Claude Opus 5.5`, `Claude Sonnet 5.5`, `Claude Haiku 4.5`.

- [ ] **Step 4: Confirm no value leaked**

```bash
cd /Users/marcusklein/dev/llm-guides
sed -n '/^### 4.7/,/^## 5\./p' guides/models/claude-models.md | grep -nE 'claude-[a-z0-9-]+|\$[0-9]|[0-9]+K tokens|1M tokens|200K|64K|128K' || echo "clean: no value in the new prose"
```

Expected: `clean: ...`.

- [ ] **Step 5: Run the four gates**

```bash
cd /Users/marcusklein/dev/llm-guides
node tools/corpus/cli.mjs render --check . ; echo "RENDER=$?"
node tools/corpus/cli.mjs lint . ; echo "LINT=$?"
node tools/corpus/cli.mjs verify . ; echo "VERIFY=$?"
npm test 2>&1 | grep -E '^# (tests|pass|fail)'
```

Expected: `RENDER=0`, `lint: clean`, `verify: clean`, `# fail 0`.

- [ ] **Step 6: Commit**

```bash
cd /Users/marcusklein/dev/llm-guides
git add guides/models/claude-models.md
git commit -m "docs: add entries for the three remaining current Claude models"
```

---

## Task 5: Add the two legacy entries, using the no-positioning fallback

This is the task the spec was revised for. The vendor publishes no positioning sentence for these two, so the fallback in spec section 7 applies.

**Files:**
- Modify: `guides/models/claude-models.md` (append two `####` entries inside `### 4.7`)

**Interfaces:**
- Consumes: the `####` entry shape from Task 3.
- Produces: entries for Claude Opus 5 and Claude Sonnet 5, demonstrating a short, honest legacy entry.

- [ ] **Step 1: Re-read both legacy model pages**

```
Fetch https://platform.claude.com/docs/en/models/opus-5/overview
Fetch https://platform.claude.com/docs/en/models/sonnet-5/overview
  Ask for each: quote verbatim the Status line, the Released and Retirement lines,
  and any one-line description of what the model is for. State explicitly whether
  the page contains a positioning sentence of the kind the current models carry.
```

Read 2026-10-02, both pages carried `Status Active (legacy)` and a retirement line, and **no positioning sentence**. Each page's metadata described it as superseded: `Claude Opus 5 is a legacy model; Claude Opus 5.5 is the current Opus model.`

- [ ] **Step 2: Apply the fallback, and do not invent strengths**

Spec section 7 permits exactly three forms. For these two, form 2 applies: one line of "superseded by X; retained because Y", drawn only from facts the vendor publishes. Any claim about what a legacy model is *good at* is either `**Plausible**` and flagged, or omitted. **It is correct for these entries to be short.**

- [ ] **Step 3: Insert the two entries**

```python
p = "guides/models/claude-models.md"
s = open(p, encoding="utf-8").read()
anchor = "## 5. Edge cases and failure modes\n"
entries = """#### Claude Opus 5 (legacy)

**What it's for** — the vendor publishes no positioning statement for this model. Its own page describes it as superseded: Claude Opus 5.5 is the current Opus model. It is documented here because it is still served and readers may be pinned to it. Evidence: **Documented** — [Claude Opus 5](https://platform.claude.com/docs/en/models/opus-5/overview), read 2026-10-02.

**Strengths** — none are claimed. The vendor has stopped describing what this model is better at, and inferring a strengths list for it would be invention. Its figures are in the legacy table in section 2; they are the whole of what is known.

**Limits**

- It is Active but legacy, which the vendor defines as no longer receiving updates and possibly being deprecated in future. Evidence: **Documented** — [model deprecations](https://platform.claude.com/docs/en/about-claude/model-deprecations), read 2026-10-02.
- It costs more per token in both directions than the model that replaced it, so staying on it is not a saving. Evidence: **Documented** — compare the two rows in section 2, from the [pricing page](https://platform.claude.com/docs/en/about-claude/pricing), read 2026-10-02.

**Reach for it when** you are already pinned to it and have not yet validated Claude Opus 5.5 — that is the only reason this row exists.

**Avoid it when** starting anything new. Use Claude Opus 5.5.

**Lifecycle** — Active (legacy), with a retirement commitment shown in the legacy table in section 2. Evidence: **Documented** — [Claude Opus 5](https://platform.claude.com/docs/en/models/opus-5/overview) and [model deprecations](https://platform.claude.com/docs/en/about-claude/model-deprecations), read 2026-10-02.

#### Claude Sonnet 5 (legacy)

**What it's for** — the vendor publishes no positioning statement for this model. Its own page describes it as superseded: Claude Sonnet 5.5 is the current Sonnet model. It is documented here because it is still served and readers may be pinned to it. Evidence: **Documented** — [Claude Sonnet 5](https://platform.claude.com/docs/en/models/sonnet-5/overview), read 2026-10-02.

**Strengths** — none are claimed, for the same reason as Claude Opus 5 above: the vendor no longer describes what it is better at.

**Limits**

- It is Active but legacy, so it receives no further updates and may be deprecated in future. Evidence: **Documented** — [model deprecations](https://platform.claude.com/docs/en/about-claude/model-deprecations), read 2026-10-02.
- Its retirement commitment is the nearest of the two legacy rows, so it is the more urgent migration of the two. Evidence: **Documented** — compare the retirement column in the legacy table in section 2, read 2026-10-02.

**Reach for it when** you are already pinned to it and have not yet validated Claude Sonnet 5.5.

**Avoid it when** starting anything new. Use Claude Sonnet 5.5.

**Lifecycle** — Active (legacy), with a retirement commitment shown in the legacy table in section 2. Evidence: **Documented** — [Claude Sonnet 5](https://platform.claude.com/docs/en/models/sonnet-5/overview) and [model deprecations](https://platform.claude.com/docs/en/about-claude/model-deprecations), read 2026-10-02.

"""
assert s.count(anchor) == 1
open(p, "w", encoding="utf-8").write(s.replace(anchor, entries + anchor))
```

- [ ] **Step 4: Confirm the entry count and order**

```bash
cd /Users/marcusklein/dev/llm-guides && grep -c '^#### Claude' guides/models/claude-models.md
```

Expected: `6`.

- [ ] **Step 5: Verify every `**Documented**` bullet cites a page (Review Focus 2)**

Every `Evidence:` line in the new section labelled `**Documented**` must carry a link on the same line, or cite the section 2 table, which is itself record-backed:

```bash
cd /Users/marcusklein/dev/llm-guides
sed -n '/^### 4.7/,/^## 5\./p' guides/models/claude-models.md \
  | grep 'Evidence:' | grep '\*\*Documented\*\*' | grep -v 'https://\|section 2' \
  || echo "clean: every Documented claim cites a page or the record-backed table"
```

Expected: `clean: ...`. Any line printed is an inference wearing a `**Documented**` label — relabel it `**Plausible**` or delete it.

- [ ] **Step 6: Run the four gates**

```bash
cd /Users/marcusklein/dev/llm-guides
node tools/corpus/cli.mjs render --check . ; echo "RENDER=$?"
node tools/corpus/cli.mjs lint . ; echo "LINT=$?"
node tools/corpus/cli.mjs verify . ; echo "VERIFY=$?"
npm test 2>&1 | grep -E '^# (tests|pass|fail)'
```

Expected: `RENDER=0`, `lint: clean`, `verify: clean`, `# fail 0`.

- [ ] **Step 7: Commit**

```bash
cd /Users/marcusklein/dev/llm-guides
git add guides/models/claude-models.md
git commit -m "docs: add legacy entries for Claude Opus 5 and Sonnet 5"
```

---

## Task 6: Update section 6, verify the whole page, review, and open the PR

**Files:**
- Modify: `guides/models/claude-models.md` (section 6 only)

**Interfaces:**
- Consumes: all six entries from Tasks 3–5.
- Produces: the finished phase-1 deliverable.

- [ ] **Step 1: Add the new untracked claims to section 6 (Review Focus 5)**

The entries cite thinking mode, default-effort behaviour and the cache-read fractions. No record carries any of them, so section 6's untracked list must name them or the next refresh will not re-read them. Read the exact bytes of the untracked bullet first:

```bash
cd /Users/marcusklein/dev/llm-guides
python3 -c "
d=open('guides/models/claude-models.md',encoding='utf-8').read().splitlines()
print([(n,l) for n,l in enumerate(d,1) if 'untracked claims in sections' in l])
"
```

Extend that bullet to name: each model's thinking mode, each model's default effort setting including that Haiku 4.5 supports none, the per-model cache-read fractions, and the vendor's per-model positioning sentences. Add one further bullet stating that the two legacy entries deliberately claim no strengths, so a future refresher does not "fill them in".

Also add, beside the section 2 tables, the convention that a blank cell means the vendor states nothing there and may never be filled by arithmetic — the rule that prevents the `max_input` class of fabrication. It has nothing to guard on this page today, but phase 2 adds legacy models whose pages omit fields.

- [ ] **Step 2: Confirm no bare id anywhere in the body (Review Focus 3)**

Lint catches ids that have records; it is blind to ids that do not. Check all six by hand:

```bash
cd /Users/marcusklein/dev/llm-guides
for id in claude-fable-5-1 claude-opus-5-5 claude-sonnet-5-5 claude-haiku-4-5 claude-opus-5 claude-sonnet-5; do
  n=$(grep -c "$id" guides/models/claude-models.md)
  echo "$id: $n occurrence(s)"
done
```

Every occurrence must be inside a rendered `corpus:table` block or inside a URL. Confirm by eye against the table line numbers; `lint: clean` already proves no tracked id is bare, so any surprise here is in a URL.

- [ ] **Step 3: Run the four gates plus the proof**

```bash
cd /Users/marcusklein/dev/llm-guides
node tools/corpus/cli.mjs render --check . ; echo "RENDER=$?"
node tools/corpus/cli.mjs lint . ; echo "LINT=$?"
node tools/corpus/cli.mjs verify . ; echo "VERIFY=$?"
npm test 2>&1 | grep -E '^# (tests|pass|fail)'
(cd examples/refresh-idempotence && node run.mjs >/dev/null 2>&1; echo "PROOF=$?")
```

Expected: `RENDER=0`, `lint: clean`, `verify: clean`, `# fail 0`, `PROOF=0`.

- [ ] **Step 4: Assert the page date did not move (Review Focus 4)**

```bash
cd /Users/marcusklein/dev/llm-guides
git diff master -- guides/models/claude-models.md | grep -E '^[+-]verified:' || echo "clean: page verified date unchanged"
```

Expected: `clean: ...`. If the date moved, revert that one line: this pass did not re-work the untracked claims, so moving it would assert work that did not happen.

- [ ] **Step 5: Confirm the unit and the records are untouched**

```bash
cd /Users/marcusklein/dev/llm-guides
git diff master --stat -- data/
```

Expected: no output. Phase 1 adds prose only; any change under `data/` means a record was touched and the refresh unit may have moved.

- [ ] **Step 6: Commit**

```bash
cd /Users/marcusklein/dev/llm-guides
git add guides/models/claude-models.md
git commit -m "docs: record the new untracked claims in section 6"
```

- [ ] **Step 7: Run the adversarial review BEFORE composing the PR body**

Spec criterion 6, and the step most often skipped. Dispatch a fresh reviewer with `meta/prompts/verify-agent.md` as its rubric and the packet built by:

```bash
git -C /Users/marcusklein/dev/llm-guides diff master -- guides data
```

Forbid it from reading `research/` or `.superpowers/`. Point it at: every `**Documented**` label without a vendor quote behind it, every claim about thinking or effort that no record carries, the two legacy entries' refusal to claim strengths, and whether any figure reached the prose. Fix every blocking finding before Step 8.

- [ ] **Step 8: Open the pull request**

Body must state: what was added, that no record or page date changed, the review verdict and every finding with its fix, and the phase-1 kill-point judgement — whether the entry shape carried all six models honestly, and specifically whether the two legacy entries read as useful or as padding. That judgement is the deliverable phases 2–5 depend on.

```bash
cd /Users/marcusklein/dev/llm-guides
git push -u origin model-matrix-phase-1
gh pr create --base master --title "Model matrix phase 1: per-model entries for the six Anthropic models" --body-file -
```
