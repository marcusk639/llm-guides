---
title: Adversarial review — Corpus Refresh Loop design (revision 1)
date: 2026-09-27
reviewer: plan-reviewer
subject: docs/superpowers/specs/2026-09-27-corpus-refresh-loop-design.md
verdict: Needs significant rework
---

# Adversarial review — Corpus Refresh Loop design (revision 1)

Every claim below was checked against the working tree at `master` (`f0256b5`), not reasoned
about abstractly. Line references: `SPEC:n` = the design spec, `CM:n` = `CLAUDE.md`.

## Verdict

**Needs significant rework** — not because the shape is wrong (it is the right shape), but
because three of the twelve proposed rules cannot be implemented as written without
breaking the currently-clean gates, one contract amendment is mechanically incoherent
against the code it names, and the per-page-branch design collides with shared records and
the ledger in a way that guarantees merge conflicts from the second audit run onward.

None of this requires abandoning the design. It requires splitting it and fixing ~6 things.

## Strengths

1. **"Section 6 is already an executable work order" (SPEC:76–86) is correct and load-bearing.**
   I verified it: all five guides list **100% of their referenced records** in section 6
   (`hooks.md` 7/7, `context-management.md` 3/3, `software-engineering.md` 2/2,
   `claude-models.md` 4/4, `comparison.md` 13/13). The insight is real, not aspirational.
2. **The two-part gate split (SPEC:96–107) is the right cut** and the reasoning for why the
   deterministic half carries the safety weight is sound.
3. **The per-volatility `AUDIT_LEAD_DAYS` derivation (SPEC:258–269) is correct and
   non-obvious.** `expiryFor` is `addDays(verified, CADENCE_DAYS[volatility ?? "low"])`
   (`tools/corpus/ledger.mjs:61-63`), so `effective = cadence - lead` follows directly.
   Catching this before implementation is exactly what a design doc is for.
4. **The Blocked outcome (SPEC:141–148) is the single best idea in the spec.** "A loop that
   could only succeed would launder unreachable sources into fresh dates" is the right
   framing.
5. **`--dry-run`, mutation proofs, and a merged-PR acceptance bar** are all the right
   instincts for this repo's established practice.

---

## Critical Issues (blockers)

### C1. The `research:` amendment is mechanically impossible as written

SPEC:320–322 says: _"`research:` promoted from optional to required for non-seed pages, in
the prose and in `REQUIRED_FIELDS` (`tools/corpus/lint.mjs`)."_

`REQUIRED_FIELDS` is a **flat array consumed with no conditionality**:

```
tools/corpus/lint.mjs:6-14   export const REQUIRED_FIELDS = [ "title", ..., "related" ];
tools/corpus/lint.mjs:23-30  for (const field of REQUIRED_FIELDS) {
                               if (!(field in data)) issues.push({ rule: "frontmatter-required", ... });
                             }
```

There is no `seed` carve-out anywhere in `validateFrontmatter` (lint.mjs:16–50). I confirmed
all five guides carry `seed: true` and **none carries `research:`**. So adding `research` to
`REQUIRED_FIELDS` emits five `frontmatter-required` errors immediately and destroys
`lint: clean` — which SPEC:51 asserts as the starting state and SPEC:328–333 promises not to
disturb.

Worse, the spec specifies this requirement **twice in two different tools with two different
scopes**: `research-required` in the `corpus verify` table (SPEC:197, scoped to "a non-seed
page") and `REQUIRED_FIELDS` in lint (unscoped). Pick one. My recommendation: keep it in
`corpus verify` only, where a conditional is natural, and amend CM:374–378 to say so —
noting that CM already pre-committed to the `REQUIRED_FIELDS` route, so that sentence needs
rewriting, not just the field's status.

**Third-order problem the spec does not notice:** `seed: true` is defined at CM:379–380 as
"marks a document authored before the pipeline existed" — a permanent historical marker.
With a `seed` exemption, `research-required` has **zero coverage over the entire current
corpus** and cannot be exercised against real data in this sub-project. It is a rule that
catches nothing until sub-project 3 writes a new page. Decide explicitly: does `refresh`
strip `seed: true` once a page has been through the loop? If yes, the exemption evaporates
after the first merge and the other four pages start failing. If no, the rule is inert.

### C2. `evidence-label-invalid` false-positives on all five pages today

SPEC:195 — _"A label outside the three exact spellings; `Verified` with no shipping proof."_

Every one of the five guides contains `**Verified**` in prose, in the section-4 preamble that
_explains the label system_:

```
guides/claude-code/hooks.md:130           "…the corpus contract's [evidence labels](…)…"   (contains **Verified**)
guides/context/context-management.md:108  same shape
guides/domains/software-engineering.md:121 same shape
guides/models/claude-models.md:77         same shape
guides/models/comparison.md:128           same shape
guides/claude-code/hooks.md:315           section 7: "None yet. A useful proof would…"
```

No `Evidence:` line in the corpus uses `**Verified**` (I checked all 46 of them). The only
shipping proof is `examples/marker-render-idempotence/proof.yaml`, whose `claim` is about the
_renderer_, not about any guide claim. So:

- The rule must be scoped to `^Evidence:` lines, or it fires six times on a clean corpus.
- The "Verified with no shipping proof" half has **zero current coverage**, and…
- …it is **not mechanically decidable**. `proof.yaml` has a free-text `claim` field
  (`examples/marker-render-idempotence/proof.yaml:2`) and there is no machine-readable link
  from a guide's `Evidence:` line to a proof directory. Implementing this rule requires a new
  contract element (e.g. `Evidence: **Verified** — proof: examples/<name>`), which SPEC:328–333
  explicitly rules out as a contract change.

**Second false positive in the same rule.** CM:438–441 explicitly blesses an `Evidence:` line
that mixes labels mid-sentence. Two real instances:

```
guides/domains/software-engineering.md:268  Evidence: hallucination rates **Documented** within the study's scope…
guides/domains/software-engineering.md:352  Evidence: "Show evidence rather than asserting success" is **Documented** — …
```

Any rule asserting `Evidence: **Label**` at line start flags both.

### C3. `known-lint-gap-form` is not decidable for one of its two forms

SPEC:196, SPEC:207–212 target the two forms at CM:546–549.

- **Form 1** (angle-bracket destination containing a space) is cleanly detectable. Implement it.
- **Form 2** (a bare URL running into following text through `.` or `;` with no space) is not.
  `.` is in every hostname and `;` is legal in query and matrix parameters. The only precise
  test is "a known record literal falls inside a URL span" — and that test flags the pattern
  CM:319 and CM:248 _explicitly bless_: "Link a vendor's per-model page freely; the id inside
  the URL is not a bare value", "Per-model URLs that contain a model id belong here". So the
  precise implementation breaks the blessed case and the imprecise one is a `.`-in-hostname
  false positive generator.

Ship Form 1. Leave Form 2 in "reviewers check by eye" and say so in the contract, or restrict
Form 2 to "a URL span whose _swallowed tail after the last `;`_ matches a known literal" —
narrow, testable, and no legitimate current usage.

### C4. Per-page branches + shared records + a regenerated ledger ⇒ guaranteed conflicts

This is the interaction the "three operational guards" (SPEC:275–289) do not anticipate, and
it is the biggest practical blocker.

SPEC:271–273 mandates **one PR per page, never batched**, with a **cluster cap of 3**
(SPEC:277). SPEC:241–242 says **verify regenerates the ledger as its last act**.

`meta/ledger.yaml` (verified: 22 lines, one entry per page plus a `generated:` date) is
rewritten wholesale by `ledger --write`. Three concurrent PRs each rewrite it → the second and
third conflict on merge, every run, forever.

It is worse for the model pages, which is the _acceptance-criterion_ run. Both
`guides/models/claude-models.md` and `guides/models/comparison.md` expire 2026-10-16
(`meta/ledger.yaml:14-21`) and **share records via tags**: `anthropic.models.fable-5-1`,
`anthropic.models.opus-5`, `anthropic.models.haiku-4-5` are selected by `claude-current` on
one page and `comparison-hosted` on the other (I confirmed the tag→record resolution). Two
branches both edit `data/models.yaml`. After PR A merges, PR B's rendered tables are stale
against master and `render --check` on the merge commit can fail even though it passed on
each branch independently.

**And the shared-record cheap path cannot fire at all as designed.** SPEC:163–170 says the
audit should recognize a page whose referenced records carry a `verified` newer than the
page's own. On 2026-10-09 both pages and all records read `2026-09-16`, and each page is
refreshed **on its own branch**, so branch B never sees branch A's record bumps. The cheap
path only ever works _across_ runs — which means the first real run (the acceptance criterion)
does the double vendor fetch the cap was supposed to prevent. Note also that the cap of 3
does not prevent 2.

Minimum fixes, pick one:

- **(a)** Group pages that share any record into one PR, breaking "never batched" for that case.
- **(b)** Serialize: refresh page A, merge, then select page B on the following run — i.e. cap
  of 1 per run while the corpus is this small, with the cap justified by record-sharing, not
  by count.
- **(c)** Exclude `meta/ledger.yaml` from refresh branches entirely and regenerate it on master
  post-merge in a separate job. This also resolves C5.

### C5. `corpus verify` cannot both be a read-only CI gate and write the ledger

SPEC:99–100 places `corpus verify` "beside `render --check` and `lint`" — read-only gates that
report and exit. SPEC:241–242 then has verify **write `meta/ledger.yaml`**. A CI gate that
mutates the tree leaves the CI run dirty and cannot be run in the authoring loop without side
effects; it also duplicates `ledger --write`, which the authoring loop already calls
(CM: authoring loop step 4) and which `refresh` step 5 also calls (SPEC:131). Three different
components regenerate the same file.

Also ambiguous: "verify" is two components (SPEC:61–68). Which one writes it — the CLI or the
agent? An agent that writes the ledger is not an independent reviewer.

Decide: `corpus verify` is read-only and **checks** the ledger is current (`ledger` without
`--write` already prints `ledger: N entries`; add a `--check` mode mirroring `render --check`).
`refresh` writes it. Delete SPEC:241–242.

### C6. A verify-agent block leaves a bumped `verified` on the branch

SPEC:141–145 correctly forbids bumping `verified` when a **source is unreachable**. It says
nothing about the case where the refresh succeeded but **the verify agent blocked**.

Order of operations per SPEC:117–131 and SPEC:249–252: refresh bumps `verified` (step 5), then
both halves of verify run, then a PR opens. On a block the PR stays a draft (SPEC:238–240) —
carrying a bumped page `verified`, bumped record `verified` dates, and a committed research
artifact asserting the page was re-verified on that date. Anyone who later merges that draft
(or resolves its conflicts per C4) lands an unaudited freshness claim.

This sits in exactly the place SPEC:39–42 identifies as the design's whole reason for existing.
Require that a verify-blocked branch **revert the `verified` bumps** (page and records) while
keeping the research artifact and the findings, so a merged draft is honest about what it is.

---

## Rule-by-rule judgement of the `corpus verify` table

Checked against the 25 records in `data/` and all five guides.

| Rule                           | Would fire correctly?              | Breaks clean state?                                                                                                  | Notes                                                                              |
| ------------------------------ | ---------------------------------- | -------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------- |
| `rots-table-incomplete`        | Depends on the reading — see below | **Yes, under the strict reading**                                                                                    | Highest value, but ambiguous as specified                                          |
| `record-duplicate-key`         | Yes                                | No — 0 duplicates in 25 records                                                                                      | Also makes CM:201 ("Duplicates are not detected") stale; not in the amendment list |
| `record-source-missing`        | Yes                                | No — all 25 have `source`                                                                                            | Fine                                                                               |
| `record-verified-missing`      | Yes                                | No — all 25 have `verified`                                                                                          | Fine                                                                               |
| `record-verified-invalid`      | Yes                                | No — all 25 are `"2026-09-16"` strings                                                                               | Reuse `isValidIsoDate` (`ledger.mjs:6`)                                            |
| `frontmatter-applies-to-shape` | Yes                                | No — all five are lists of 2–3 strings                                                                               | Fine                                                                               |
| `related-path-unresolved`      | Yes                                | No — all 6 entries resolve; `context-management.md` has `related: []`, which must stay legal (CM says "may be `[]`") | Fine                                                                               |
| `lint-literals-stale`          | Partially — see below              | No — all 13 literal-bearing records pass                                                                             | Description overpromises                                                           |
| `template-sections`            | Only if restricted to `##`         | **Yes, if it looks at `###`**                                                                                        | See below                                                                          |
| `evidence-label-invalid`       | No                                 | **Yes**                                                                                                              | C2                                                                                 |
| `known-lint-gap-form`          | Form 1 only                        | No (vacuous today)                                                                                                   | C3                                                                                 |
| `research-required`            | Vacuously                          | No                                                                                                                   | C1                                                                                 |

### `rots-table-incomplete` — resolve the ambiguity before implementing

SPEC:185 says "a record the page references that section 6's table does not list". Two readings:

- **Loose** (every referenced key appears somewhere in section 6's text): **passes on all five
  pages today.** I verified 29/29 record references across the corpus.
- **Strict** (one table row per referenced record): **fails immediately** on
  `guides/models/comparison.md`, whose section-6 table collapses three records into one row:
  `| Claude rows | \`anthropic.models.fable-5-1\`, \`anthropic.models.opus-5\`, \`anthropic.models.haiku-4-5\` | high | Owned by [Claude models](claude-models.md); refreshed there |`

That collapsed row is _good authoring_ — it documents the shared-record relationship the spec
itself relies on (SPEC:163–170). Specify the loose reading, and say so in the rule's contract
entry, or the rule punishes the pattern the design depends on.

### `lint-literals-stale` — the description promises a drift signal it only half delivers

SPEC:193 calls it "the drift signal". I checked all 13 records carrying `lint_literals`: every
entry is a substring of some field on its own record, so the rule is clean today.

But it only catches drift in **one direction** — a literal left behind after a field changed.
It cannot catch the more dangerous direction: a field value that changed and is now covered by
_no_ literal. Example: `openai.models.gpt6-astra` lists 7 literals covering `api_id`,
three limits and two prices. If a refresh adds an `output_price_cached` field, or repoints
`input_price`, and updates the matching literal, nothing notices that some other field's value
is unguarded — which is precisely the `bare-value` coverage hole the corpus exists to close.

Also flag a false-positive risk the seeds happen to dodge. CM:266–271 blesses
`lint_literals` as "a context-bound phrase" for generic figures. The seeds put that phrase in
`display` as well:

```
data/claude-code.yaml   display: 600 seconds for command, http, and mcp_tool handlers
                        lint_literals: [600 seconds for command, http, and mcp_tool handlers]
```

Nothing in the contract requires that. A future record whose context-bound phrase appears only
in the _guide's prose_ is contract-legal and would trip this rule. Either amend the contract to
require it (cheap, and worth doing) or the rule needs an opt-out.

### `template-sections` — must look at `##` only

All five guides have `## 1.`–`## 8.` present, numbered and in order. But they carry legitimate
unnumbered and numbered sub-headings a naive implementation would trip on:

- `guides/domains/software-engineering.md` — `### 4.1`…`### 4.9` and `### 5.1`…`### 5.8`
- `guides/models/comparison.md:~150` — `### Did the contract hold for a multi-vendor, mostly-table page?`, an **unnumbered `###` inside section 6**

Restrict the rule to `^## ` headings and assert exactly the eight `N.` prefixes in order.

---

## Missing Considerations

### M1. `AUDIT_LEAD_DAYS` has no entry for the documented `volatility: null` case

CM:490–492: _"A page referencing no records is written to the ledger with `volatility: null`
and expires on the low cadence."_ `expiryFor` already handles it (`volatility ?? "low"`,
`ledger.mjs:62`).

`AUDIT_LEAD_DAYS = { high: 7, medium: 14, low: 14 }` (SPEC:258) has no `null` key, so
`expires - today <= AUDIT_LEAD_DAYS[null]` is `<= undefined` → always `false` → **a
record-free page is never selected and silently never refreshed.** That is the decorative-
freshness outcome, arriving through a documented case. Mirror `?? "low"`.

### M2. The audit cannot compute the cheap path from `meta/ledger.yaml`

SPEC:249 says each run "reads `meta/ledger.yaml`". The ledger is page-level only — `path`,
`verified`, `volatility`, `expires` (confirmed: `meta/ledger.yaml`, and `buildLedger` in
`ledger.mjs:66-78`). The cheap path (SPEC:163–170) needs **record-level `verified`**, which
the ledger does not carry. Either the audit loads `data/` itself, or the ledger gains a
per-page `records_verified` max. Say which.

### M3. No rollback path for a merged bad refresh

The spec has none. If a refresh mis-transcribes a figure and the owner merges it, the page
carries a confident error under a fresh `verified` for the next 30–270 days and there is no
mechanism to pull it back: the audit selects **only** by expiry, so a suspect page cannot be
re-queued. `git revert` restores the old `verified` and does re-arm expiry-based selection —
but that is inference, not a documented procedure, and it silently discards the research
artifact too.

Add, minimally: (a) a documented revert procedure, (b) `refresh --force <path>` for
out-of-cycle re-verification, and (c) a way to mark a page suspect that the audit honours
(a front-matter flag, or simply setting `verified` back).

### M4. The `no-duplicate-PR` guard turns a blocked page into permanent silent rot

Guard 2 (SPEC:281–284): _"If an open pull request already exists for a page, skip it."_ A page
whose verify blocked has a draft PR open indefinitely (SPEC:238–240, "never closed"). So:

1. The page is skipped every subsequent week — the loop stops watching it.
2. It passes `expires`, then passes `expires + cadence`, at which point `checkExpiry`
   (`lint.mjs:196-210`) emits `expired` → **`lint` on master goes red**, blocking every other
   commit in the repo until someone deals with the draft.

For the high-volatility pages that is `2026-09-16 + 30 + 30 = 2026-11-15`. SPEC:44–47 claims
neglect produces "a visible backlog of open pull requests rather than a corpus that silently
rots" — the actual failure mode is a red master. That is arguably the _right_ outcome, but it
is unstated, and guard 3's "loud failure" covers audit _infrastructure_ failure only, not a
stalled draft. Add an age check on open draft PRs, and state the red-master consequence.

### M5. `comparison.md`'s section 6 is not a clean work order, and it is the first page the loop will hit

The design's central claim is that section 6 is an executable checklist. On
`guides/models/comparison.md` — one of the two pages selected in the acceptance-criterion run
— section 6 also contains a ~1,500-word foundation-era retrospective
(`### Did the contract hold for a multi-vendor, mostly-table page?`) with eight numbered
"where it fought" items, **several of which are already stale** ("Row order used to follow
data-file load order … the seed hit this; the table marker's `sort=` attribute now orders
rows…").

Handing that to a refresh agent as a work order is a real quality risk on the corpus's most
volatile page, and `rots-table-incomplete` cannot detect it. Either relocate the retrospective
(it belongs in `docs/`, not in a page's refresh checklist) or have the refresh prompt scope
itself to the rots table + the "Re-check on refresh" list explicitly. This is worth doing
_before_ 2026-10-09.

### M6. `research:` is being given two different meanings

CM:374 defines `research` as "path to the page's **grounding artifact**". SPEC:152–159 points
it at a **refresh audit log**. These are different documents with different purposes, and
conflating them means `research-required` (C1) is satisfiable by a refresh log rather than by
actual grounding research — quietly weakening the field the contract reserved. Use a separate
front-matter key (`last_refresh:`) or amend CM:374 to redefine the field. Do not leave it
implicit.

### M7. No check that shipping proofs still pass

`tools/corpus/proofs.mjs` exports `discoverProofs`, `runProof`, `restamp`, and
`examples/marker-render-idempotence/proof.yaml` carries `last_run: 2026-09-16 / result: pass`.
Nothing in the refresh loop re-runs proofs or re-stamps them, even though `restamp` exists for
exactly that and even though **Verified** labels depend on proofs passing. A proof whose
`last_run` is a year old backs a **Verified** claim with stale evidence. Cheap to add; it is
the same freshness argument the whole spec makes.

---

## Questions / assumptions to verify

1. **Does `refresh` strip `seed: true`?** Determines whether `research-required` ever fires (C1).
2. **Where does the audit live?** SPEC:362–363 defers it, but SPEC:299–301 requires a
   `--dry-run` on it — which implies in-repo CLI code, contradicting "cloud configuration".
   `AUDIT_LEAD_DAYS` in `ledger.mjs` (SPEC:253) only helps if the routine runs repo code. This
   open question is load-bearing for the testing strategy and should close before the plan, not
   during implementation.
3. **Who owns a shared record's `verified`?** CM:319–322: "do not change values, keys or lint
   configuration without refreshing the owning page." Refresh step 1 (SPEC:120–123) bumps the
   `verified` of every referenced record, including ones another page owns. Is a `verified` bump
   exempt from that rule? Say so in the contract or the cheap path is built on a contract
   violation.
4. **Does the refresh agent get web access to vendor docs in the cloud routine?** The whole loop
   is source re-fetching; nothing in the spec names the fetch mechanism or what happens when a
   vendor page is JS-rendered or rate-limits. SPEC:348–350 anticipates _404s_, not _bot walls_ —
   which are the likelier failure for `platform.claude.com`, `developers.openai.com` and
   Hugging Face.
5. **Is a "Confirmed" refresh (dates only) worth a human review cycle?** SPEC:134–137 argues yes.
   Probably right, but at ~30 min/week against five pages it is most of the budget; consider
   auto-merge for a diff that is provably dates-only (the `refresh-idempotence` proof is exactly
   the evidence that would justify it).

---

## Suggestions by impact

**High**

1. Split this into three plans (see below).
2. Fix C1, C2, C3, C4, C5, C6 and M1 in the spec before writing an implementation plan. C1, C4
   and C5 change the architecture; the rest change rule definitions.
3. Ship `corpus verify` with the **seven rules that are clean and decidable**
   (`rots-table-incomplete` loose, `record-duplicate-key`, `record-source-missing`,
   `record-verified-missing`, `record-verified-invalid`, `frontmatter-applies-to-shape`,
   `related-path-unresolved`) plus `template-sections` restricted to `##`. Defer
   `evidence-label-invalid`, `known-lint-gap-form` Form 2, `research-required` and the
   coverage half of `lint-literals-stale` to a follow-up with their own contract amendments.
4. Decouple `meta/ledger.yaml` from refresh branches (C4 option (c)). It fixes the conflict
   class and C5 at once.

**Medium**

5. Add the two contract amendments the spec's list omits: CM:201 ("Duplicates are not
   detected") becomes wrong once `record-duplicate-key` exists; CM:546–549's "reviewers check
   by eye" needs updating for whichever half of `known-lint-gap-form` ships.
6. Make the cluster cap 1 while the corpus is five pages. The cap's stated justification
   (SPEC:277–280) is about avoiding double vendor fetches, and at this size 1 achieves that
   where 3 does not.
7. Relocate `comparison.md`'s section-6 retrospective (M5) before the first real run.
8. Add proof re-stamping to the loop (M7).

**Low**

9. Consider `refresh --check` (report what would change without writing) as a cheaper way to
   test the loop than `--dry-run` on the audit alone.
10. `refresh --key` (SPEC:112–113) is specified in one clause and never mentioned again — no
    outcome semantics, no `verified` rules, no artifact. Either spell it out or cut it from
    this spec.

---

## Is this one implementation plan's worth of work? No — three.

Counting deliverables: 12 verify rules × (implementation + unit test + mutation proof) — which
alone is comparable to the entire lint surface the foundation shipped — plus a `refresh` CLI
command, a refresh prompt, an evidence-artifact writer, a shared-record cheap path, a verify
agent with a five-item rubric, a cloud routine with three guards and a notifier, a `--dry-run`
mode, a new proof under `examples/`, and five contract amendments.

Proposed decomposition:

- **2a-i — `corpus verify` (deterministic gate).** The eight clean rules, unit tests, mutation
  proofs, contract amendments for those rules. Independently valuable, independently
  verifiable, and it makes the seeds' section 6s trustworthy _before_ anything executes them.
  Ships with zero risk to the corpus.
- **2a-ii — `refresh` + the verify agent.** Driven by hand, on one page, with the owner
  watching. This is where the real learning is: whether section 6 is actually executable,
  whether vendor pages are fetchable, whether the agent ratifies. Produces the
  `refresh-idempotence` proof and the first research artifact.
- **2a-iii — the scheduled audit.** Only after a hand-driven refresh has closed the loop once.
  Automation of a procedure nobody has performed manually is the highest-risk ordering
  available.

## Is the acceptance criterion achievable and well-formed?

**Well-formed: yes, and it is the best thing in the spec.** "Not when the code is written. The
deliverable is a loop that has closed once in reality" (SPEC:310–311) is exactly the right bar.

**Achievable by 2026-10-09: no.** That is **12 days** from today for: spec rework (6 blockers),
an implementation plan, 12 rules with mutation proofs, a refresh command, a prompt, an
adversarial agent, a cloud routine with notifications, a new proof, five contract amendments,
and a human review cycle — under this repo's TDD-plus-review workflow, at one person's
capacity.

Two structural notes on the criterion itself:

- **It is not actually date-pinned.** Selection is `expires - today ≤ lead`, and once
  `expires` has passed the difference goes negative, so `claude-models.md` stays selected on
  every subsequent run. Slipping past 2026-10-09 delays the criterion; it does not void it.
  Say so, so the date does not become a false deadline that pressures the gate work.
- **The criterion names one page but the run selects two.** `comparison.md` shares its expiry
  and its records (C4). Either the criterion should name the pair, or the audit should be
  capped at 1. As written, the acceptance run is the exact scenario the conflict problem
  breaks.

Recommend restating as: _"complete when a refresh of `guides/models/claude-models.md` — the
first one, whether hand-driven or audit-driven — has passed both halves of verify, been
reviewed and merged by the owner, and left an evidence artifact committed under
`research/models/`."_ That keeps the real bar (a closed loop, human-merged) and drops the
coupling to a calendar date and to the automation being finished first.

## Research findings

- `tools/corpus/` is 5 modules + a CLI, ~900 lines total, with 141 tests across 8 test files.
  Adding a `verify` command follows the existing `lintCorpus` / `renderCorpus` shape cleanly —
  no architectural obstacle.
- `loadRecords` takes the **data directory**, not the repo root (`cli.mjs:47` passes
  `path.join(root, "data")`). 25 records across 4 files; all 25 carry `source`, `verified`
  (string) and `volatility`; no duplicate keys.
- `js-yaml` is loaded with `schema: yaml.JSON_SCHEMA`, so `verified` stays a string. A
  `record-verified-invalid` rule can reuse `isValidIsoDate` directly.
- `findBareValues` deliberately scans inside code fences and deliberately skips front-matter
  and URL spans. Any new rule scanning the same body text must respect `coveredRanges` the
  same way or it will duplicate `bare-value` reports inside marker blocks.
- The corpus is genuinely clean right now: `render --check` exits 0, `lint` reports
  `lint: clean`. Every rule judgement above is relative to that baseline, which is what makes
  the false-positive findings blockers rather than nits.
