---
title: Scoped re-review — Corpus Refresh implementation plan, revision 2 (sub-project 2a-ii)
date: 2026-09-28
reviewer: plan-reviewer
subject: docs/superpowers/plans/2026-09-28-corpus-refresh-2a-ii.md
verdict: Needs clarification
---

# Scoped re-review — Corpus Refresh implementation plan, revision 2

This pass disposes the eleven findings in
`docs/superpowers/plans/2026-09-28-corpus-refresh-2a-ii-REVIEW.md` against revision 2 of the
plan (4,689 lines, 14 tasks). Nothing in the revision history was taken on trust: every
closure below was read in the plan body at the line range cited, and every tree fact was
re-derived from `master` (`66e2c68`).

Line references: `PLAN:n` = the revised plan, `REVIEW:n` = the first review, `SPEC:n` =
`docs/superpowers/specs/2026-09-27-corpus-refresh-loop-design.md`, `CM:n` = `CLAUDE.md`,
`file.mjs:n` = source in the tree.

**Where I checked versus reasoned.** Tree facts (M1's record locations, every consumed
symbol, the fixture tree, `guidePaths`' scope, `cli.mjs`'s line citations, SPEC:143/434/496)
were checked by opening the file or running a read-only script — those runs are named inline.
Mutation viability and gate sequencing are reasoning over the plan's own literal code, which
I say so each time. Baseline gate state (`render --check` exit 0, `lint: clean`,
`verify: clean`, 238/238 tests) was established earlier in this session and not re-run here;
no finding below depends on it.

## Disposition table

| ID     | Ruling             | Evidence                                                                                                                |
| ------ | ------------------ | ----------------------------------------------------------------------------------------------------------------------- |
| **C1** | closed             | PLAN:203–211 (`fix.solo.seven` declared in Task 1), PLAN:734–740, PLAN:783–806, PLAN:1016                               |
| **C2** | closed             | PLAN:1936–1951 (`stamped_at` re-key), PLAN:1700–1712 (both dates asserted), PLAN:1977 (mutation 5)                      |
| **C3** | closed differently | PLAN:80–89 (decision), 958–960, 1461, 1519–1536, 2015, 2375–2386, 2431–2432, 2994–3060, 3330                            |
| **C4** | closed             | PLAN:4366, 4370–4378 (Step 0), 4405–4421 (Step 3a), 4478–4504 (Step 9); also 3413–3418, 3497–3508, 3721–3722, 4264–4274 |
| **C5** | closed             | PLAN:300–302 (`gone.md` pinned, reason stated), PLAN:1000 (mutation 2 unconditional)                                    |
| **M1** | closed             | PLAN:48–54 and PLAN:4678 corrected; re-derived against `data/claude-code.yaml`, `data/context.yaml`                     |
| **M2** | closed             | PLAN:1363–1387 (four captures), PLAN:1227–1243 (test), PLAN:1410 (mutation 3), PLAN:2669 (Task 7 mutation 2)            |
| **M3** | closed             | PLAN:28 (Global Constraints), PLAN:4401 (Task 14 Step 3)                                                                |
| **M4** | closed             | PLAN:1820–1822 (four-backtick fence), PLAN:3947–3990 (`linesNotIn`), PLAN:4045 (two-line-insertion mutation)            |
| **M5** | closed             | PLAN:3202–3232 (`usageError`, four paths), PLAN:3306–3316 (`main()`), PLAN:3331 (mutation 4)                            |
| **M6** | closed             | PLAN:4103–4142 (`tools/corpus/test/refresh-proof.test.mjs` + its mutation)                                              |

**Counts: 10 closed, 1 closed differently, 0 still open.**

---

## Findings still open

**None.** Each of C1–C5 and M1–M6 is closed at the line ranges above. The detail behind the
two rulings that are not a plain "closed", and the residual notes on two others, follow.

### C3 — closed differently, and the divergence is sound

REVIEW:145–151 offered two behaviours and recommended (b). The plan takes (b) verbatim and
states the reason in its own terms — PLAN:74 ("a key-scoped refresh stamps records only")
and PLAN:76 (a page's `verified` asserts its whole section 6 was worked). Two divergences
from the suggested implementation:

1. **The suggested `refresh-key-scoped-page-bump` rule was not added.** PLAN:4673 gives the
   reason: as a rule it would either duplicate the page-loop skip — and so be
   mutation-survivable, which is precisely the C5 defect — or be unreachable, because
   `validateArtifact` runs before `refresh-already-stamped` and never sees a stamped
   artifact. I checked the second half against the plan's own control flow: `validateArtifact`
   is called on entry to `stampUnit` and `withReceipt` is the last write (PLAN:2407–2412), so a
   rule placed in `validateArtifact` genuinely could not observe a page bump. The argument
   holds.
2. **What replaces it is two mechanisms, not one.** The skip itself
   (PLAN:2381–2386) is mutation-covered twice — Task 6 Step 5 mutation 5 (PLAN:2431) flips
   `if (artifact.key_scoped === true)` to `if (false)` and the else branch then bumps
   `one.md`, and Task 9 Step 7 mutation 3 (PLAN:3330) drops `{ key }` from the `workOrder`
   call so `key_scoped` comes back `false` and all four pages move. Both genuinely turn the
   suite red; I traced each against the assertion it names. Alongside it,
   `refresh-key-scope-widened` (PLAN:2382–2386) refuses a key-scoped artifact carrying more
   than one key, which is a state a hand edit between `--skeleton` and `--stamp` really can
   produce and which the skip does not cover.

The end-to-end test REVIEW:376 asked for exists and is exact on the half that matters:
PLAN:2996–3060 stamps with `--key` and asserts each of the four unit pages is byte-identical
to its pre-run state (PLAN:3054–3059). The decision is also lifted into the Global
Constraints (PLAN:34) and Review Focus 3(b) (PLAN:44), so it is owned at plan level rather
than buried in one task.

Spec check: SPEC:143 reads verbatim "A `--key` flag still handles the surgical case: one
record repriced, no page-wide sweep." (checked in the spec, not quoted from the plan). (b)
is the reading that satisfies it.

### C5 — closed, with one residual sentence worth knowing about

PLAN:300 pins `gone.md` as `## 1.`–`## 5.`, `## 7.`, `## 8.` with no `## 6.`, and PLAN:302
states why the shape is load-bearing rather than incidental. PLAN:1000 (Task 3 Step 6
mutation 2) now says the mutation goes red "unconditionally".

The conditional clause is not entirely gone: PLAN:1000 still ends "If it does not go red, the
fixture was written with a `## 6.` section: fix the fixture, not the test, and re-run."
REVIEW:200–201 asked for the conditional to be dropped. I rule this closed anyway, because
the defect was that the old text let a surviving mutation read as acceptable; the new text
asserts red unconditionally and treats survival as a fixture bug to fix. That is a diagnostic,
not permission. Noted rather than reopened.

### C1 and C2 — what specifically fixes them

**C1.** `fix.solo.seven` is declared in **Task 1**'s `data/units.yaml` (PLAN:207–211) with a
comment saying why it is reserved for a Task 3 page, and `nosix.md` references it and nothing
else (PLAN:737). PLAN:740 spells out the failure that was avoided. I confirmed the two
assertions the first review said would die are untouched and still assert the original
values: PLAN:369–375 (`resolveUnit(FIX, "guides/gamma/lonely.md")` → exactly
`["guides/gamma/lonely.md"]`) and PLAN:562 (`unitSlug(unit) === "lonely"`). Task 3's
no-section-6 test (PLAN:785–796) and `renderWorkOrder` test (PLAN:860–867) now enter from
`nosix.md`, Task 9's two blocking tests do the same (PLAN:2911, PLAN:2937), and a new test
pins the neighbour clean (PLAN:799–805). Task 3's `git add` adds only the new file
(PLAN:1016) — it amends no committed test, which is what C1 required.

I also checked for the adjacent hazard: no Task 1 or Task 2 test asserts a total page count
or a full `guidePages` listing (`grep` over the plan returns `guidePages` only at PLAN:156,
435, 451), so adding a sixth fixture page cannot break an unrelated assertion.

**C2.** PLAN:1942–1951 destructures the receipt's own date out before the spread —
`const { at: stampedAt, ...receiptRest } = stamped ?? {};` then
`reverted: { stamped_at: stampedAt ?? null, at, ...receiptRest }`. The spread can no longer
reach `at`. Both tests assert both dates (PLAN:1706–1707), the type is named
(`RevertMark`, PLAN:1455), and Task 5 Step 5 mutation 5 (PLAN:1977) restores the old
`{ at, ...(stamped ?? {}) }` and names the exact wrong value that comes back. This is a real
mutation: with it applied, `reverted.reverted.at` is `"2026-09-28"` and `stamped_at` is
absent, so two assertions fail.

### M1 — re-verified against the tree, not against the revision history

Both corrected halves are true on `master`:

- `claude_code.sandbox.auto_allow_bash_default` — `- key:` line at `data/claude-code.yaml:84`,
  `verified:` at `:90`. Checked with `grep -n`.
- `claude_code.claude_md.adherence_line_threshold` — `data/context.yaml:15`. Checked.
- Last `claude_code.hooks.*` record's `verified:` at `data/claude-code.yaml:78`. Checked;
  twelve lines from `:90`, so the auto-merge claim at PLAN:54 holds.

The unit composition table at PLAN:4680 is also correct. I re-derived it by running
`loadRecords("data")` and `referencedRecordKeys` over all five guides:

| Unit                                                | Records | Matches PLAN |
| --------------------------------------------------- | ------- | ------------ |
| `hooks.md`                                          | 7       | yes          |
| `context-management.md` + `software-engineering.md` | 4       | yes          |
| `claude-models.md` + `comparison.md`                | 14      | yes          |

The 14 is the union of `claude-models.md`'s 4 Anthropic rows and `comparison.md`'s 13, which
overlap on 3. The four-host count at PLAN:4366 follows from the ten non-Anthropic rows living
in `data/models-other.yaml`.

### Consumed-symbol re-check

Every symbol an `**Interfaces:**` block names from the tree exists with the shape claimed —
`checkResearchRequired` at `verify-pages.mjs:54` (non-emptiness only, exactly as PLAN:43
claims), `referencedRecordKeys` at `:234`, `sectionSixText` at `:252`, `VALID_LABELS` at
`:157`, `isValidIsoDate` at `ledger.mjs:9`, `parseFrontmatter` returning
`{ data, body, bodyOffset }` at `frontmatter.mjs:5-10`, `loadRecords` stamping `file` as the
bare basename at `data.mjs:37`. Two new line citations the revision introduces are also
correct: `guidePaths(root)` really is `cli.mjs:41-54` (PLAN:133) and the usage helper really
is `cli.mjs:247-251` (PLAN:3288).

---

## New issues introduced by the revision

### N1 (medium). Task 14's escape hatch and its acceptance check contradict each other

C4's fix added Step 9 option (2): refresh `guides/claude-code/hooks.md` instead, "closing
2a-ii's acceptance criterion on a unit of one over a single vendor host" (PLAN:4500), and
"restart at Step 0 with `--page=guides/claude-code/hooks.md`; every command in this task is
identical apart from the entry page, the slug (`hooks`) and the artifact's topic directory
(`research/claude-code/`)" (PLAN:4504).

Step 12 was not updated. It still runs `ls research/models/` (PLAN:4559) and still states the
criterion as "the refresh of `guides/models/claude-models.md` … left an evidence artifact
under `research/models/`" (PLAN:4564) — which is SPEC:434 verbatim, and which option (2) by
construction does not satisfy. The Global Constraints quote the same sentence (PLAN:35).

So the plan's terminal step asserts a criterion its own named escape hatch cannot meet, and
says nothing about what Step 12 checks on that path. This is narrower than C4 — the owner is
already in the loop by the time it bites, and Step 9 does require the deviation to be stated
in the pull request body — but it is the one place an executor following the plan literally
reaches a contradiction. **Fix:** one sentence in Step 12, e.g. "If option (2) was taken,
substitute the chosen unit's entry page and `research/<topic>/`; the criterion is then met by
owner-recorded amendment, and the model unit's refresh is carried as the named follow-on."
Whether an owner may amend SPEC:434 at all is the clarification this verdict rests on.

### N2 (low). Task 9's "the record moved" half of the `--key` test is not record-specific

PLAN:3047–3052 asserts that `data/units.yaml` _contains_ `verified: "2026-09-28"` somewhere.
Every fixture record starts at `"2026-09-16"`, so this does detect that something moved — but
it cannot distinguish `fix.tail.three` from any other record in the file, and so would pass a
defect that stamped the whole file. The decisive half of the test (no page moved,
PLAN:3054–3059) is byte-exact and does its job, and `refresh-record-out-of-unit` covers the
widening case elsewhere, so this is a sharpening rather than a hole. Assert the specific
record's block, or assert the other records still read `"2026-09-16"`.

### N3 (low). `--key` exists in the code vocabulary but not in the prompt vocabulary

`key_scoped` and `refresh-key-scope-widened` appear in Tasks 3, 5, 6, 9 and 13 but nowhere
between PLAN:3353 and PLAN:3608 — that is, nowhere in `meta/prompts/refresh.md` or in
`refresh-prompts.test.mjs`, the test that exists precisely to keep the prompt and the schema
in step. An agent working a key-scoped run from the prompt is never told that the page's date
must not move. The guard is in code and cannot be bypassed by the prompt, so this is a
documentation gap, not a correctness hole — but the sync test's whole premise is that such
gaps are worth mechanising, and this is the first new vocabulary since it was written.

### N4 (cosmetic). Two prose statements now disagree about `PAGE_RESEARCH`'s shape

PLAN:1043 (rewritten for M2) says both paths are "built on the same three-capture pattern as
`setPageVerified`". `PAGE_DATE` (PLAN:1345) and `PAGE_RESEARCH` (PLAN:1367) each have **four**
capture groups, and PLAN:1363's comment says so correctly. The code is right; one sentence of
prose is stale. (The nearby "Three capture groups" at PLAN:1264 is correct — it describes
`FRONTMATTER`, which has three.)

### Checks that found nothing

- **Fixture trap.** No task creates a file under `tools/corpus/test/fixtures/corpus/`; `grep`
  returns that path once, at PLAN:131, where it is named as the hazard to avoid. Every new
  fixture is under `fixtures/refresh/`. The live fixture tree is unchanged, so
  `cli.test.mjs`'s unfiltered ROOT assertion is untouched.
- **Mid-plan gate breaks.** Each of Tasks 1–13 ends with the four-gate block and a commit
  (PLAN:1004–1017, 1419–1426, 1986–1993, 2441–2448, 2674–2686, 3335–3347, and the rest). The
  new artefacts cannot reach the gates: `guidePaths` walks `<root>/guides` only
  (`cli.mjs:41-54`, checked), so the fixture tree under `tools/`, `meta/prompts/`,
  `examples/refresh-idempotence/` and `research/` are all invisible to `lint` and `verify` —
  PLAN:133 and PLAN:4158 both state this and both are correct. `fix.solo.seven` is declared in
  a fixture data file, not `data/`, so it cannot raise `record-volatility-invalid` on the live
  corpus. Task 13 touches `CLAUDE.md` only, which no gate reads.
- **Newly added or edited mutations.** I traced each of the nine the revision adds or edits —
  Task 4 mutation 3 (PLAN:1410), Task 5 mutations 4 and 5 (PLAN:1976–1977), Task 6 mutations 5
  and 6 (PLAN:2431–2432), Task 7 mutations 1 and 2 (PLAN:2668–2669), Task 9 mutations 3 and 4
  (PLAN:3330–3331), Task 12 Step 2 mutation 2 (PLAN:4045) and Task 12 Step 6's wrapper
  mutation (PLAN:4142) — against the assertion each names. Every one turns the named test red
  by the plan's own literal code. Task 7 mutation 1 also fixes the first review's suggestion 7:
  it now says "delete the line", and PLAN:2668 adds a parenthetical forbidding the `let`
  redeclaration that would not compile.
- **Cross-reference integrity after renumbering.** All 14 `**Interfaces:**` Consumes lines
  point forward-consistently (PLAN:153, 541, 708, 1031, 1441, 2008, 2462, 2701, 2864, 3362,
  3617, 3793, 4179, 4361); every task number cited is earlier than the citing task. Review
  Focus's five lines (PLAN:30–34) each name a task that now contains the test: RF1→Task 4
  mutations 1–2, RF2→Task 6 mutation 2, RF3(a)→Tasks 5/6, RF3(b)→PLAN:1529 / 2431 / 2996,
  RF4→PLAN:363 and Task 6 mutation 4, RF5→Task 2 cross-topic and Task 3's `nosix.md`. Every
  `git add` line stages files the same task created or modified.
- **Type and name consistency.** `order.key` is produced in Task 3 (PLAN:958–960) and consumed
  in Task 5 (PLAN:1788); `key_scoped` is defined in Task 5's `ARTIFACT_FIELDS` and consumed in
  Task 6 (PLAN:2381) and Task 9; `RevertMark` is defined at PLAN:1455 and referenced at
  PLAN:1935/2462/2651; `refresh-key-scope-widened` is thrown at PLAN:2384, declared in Task 6's
  Interfaces (PLAN:2015), surfaced in Task 14 Step 5 (PLAN:4439) and tabled in Task 13
  (PLAN:4218). All four are defined before use and spelled identically at every occurrence
  (`grep` over the whole plan returns no variant spellings; `refresh-key-scoped-page-bump`
  appears only in the two places that explain why it was declined).

### Spec invariants — re-checked after the rework

| Invariant (SPEC)                                     | Held? | Evidence in revision 2                                                                                                                                               |
| ---------------------------------------------------- | ----- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `refresh` never regenerates `meta/ledger.yaml` (168) | Yes   | PLAN:32; test PLAN:3063–3073; mutation PLAN:3329. Ledger regen is Task 14 Step 11, on `master`.                                                                      |
| `seed: true` never stripped (162–166)                | Yes   | PLAN:1369–1370; insert path splices a line only (PLAN:1385); proof assertion 3 (PLAN:4044).                                                                          |
| An unreachable source never bumps `verified` (180)   | Yes   | `refresh-verdict-incoherent` (Task 5) plus `refresh-blocked` (PLAN:4439).                                                                                            |
| A block reverts dates **and** the added `research:`  | Yes   | PLAN:2642–2646, both branches now mutation-covered (PLAN:2668–2669).                                                                                                 |
| All-or-nothing; a blocked run writes nothing (33)    | Yes   | PLAN:31; every write deferred to PLAN:2412–2413; refusals all throw before it.                                                                                       |
| Artifact kept, stamped `verdict: blocked` (337)      | Yes   | Was "Partly" on C2; PLAN:1942–1951 now carries both dates. PLAN:4494 states it for the operator.                                                                     |
| Values lint cannot guard are hand-checked per page   | Yes   | Section 6 passed verbatim into the artifact (PLAN:864, four-backtick fence PLAN:1820–1822).                                                                          |
| Artifact is grounding research, not a refresh log    | Yes   | PLAN:1463; asserted in the skeleton body test (PLAN:1524).                                                                                                           |
| `--key` is surgical, no page-wide sweep (143)        | Yes   | Was "No" (C3). PLAN:80–89 and PLAN:2381–2386.                                                                                                                        |
| No drift into 2a-iii                                 | Yes   | PLAN:4688 names the whole excluded set; `--requeue` deferred with a reason (PLAN:2869); the proof wrapper is scoped away from `proofs.mjs#restamp` (PLAN:4113–4115). |
| 2a-i not re-planned                                  | Yes   | PLAN:11 and PLAN:4182 both state it as shipped.                                                                                                                      |

---

## Verdict

**Needs clarification.**

All eleven findings are addressed — ten closed as suggested, one (C3) closed by a different
mechanism whose divergence the plan argues for and whose argument survives checking. The
revision did not introduce a survivable mutation, did not break a mid-plan gate, did not
touch the shared fixture corpus, and did not drift into 2a-iii or re-plan 2a-i. The three
tree claims the first review found false are now true, re-derived here rather than accepted.
Tasks 1–13 are executable as written.

What stands between this and _Ready to implement_ is one question, not a rework: **N1** —
Step 9 offers `hooks.md` as the run that closes 2a-ii, and Step 12 still checks an acceptance
criterion only the model unit can satisfy. That needs an owner ruling on whether SPEC:434 may
be met by amendment, and one sentence in Step 12 recording it. N2, N3 and N4 are one-line
improvements that do not gate execution.
