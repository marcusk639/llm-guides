---
title: Adversarial review — Corpus Refresh implementation plan (sub-project 2a-ii)
date: 2026-09-28
reviewer: plan-reviewer
subject: docs/superpowers/plans/2026-09-28-corpus-refresh-2a-ii.md
verdict: Needs significant rework
---

# Adversarial review — Corpus Refresh implementation plan (sub-project 2a-ii)

Every claim below was checked against the working tree at `master` (`66e2c68`), not reasoned
about abstractly. Where I am reasoning rather than checking, I say so.

Line references: `PLAN:n` = the plan under review, `SPEC:n` =
`docs/superpowers/specs/2026-09-27-corpus-refresh-loop-design.md`, `CM:n` = `CLAUDE.md`,
`file.mjs:n` = source in the tree.

## Verdict

**Needs significant rework** — but narrowly. The architecture is right, the interfaces it
claims to consume all exist with the shapes it claims, and twelve of the fourteen tasks are
executable as written. Five defects block execution:

- two of them (C1, C2) turn the suite red the first time the plan is run;
- one (C3) is a correctness hole in the exact mechanism the design exists to prevent, ships
  silently, and has no test;
- one (C4) leaves the plan's only deliverable with no path through the outcome the spec
  itself predicts will be common;
- one (C5) hands the executor a mutation the plan already admits is survivable.

No task needs deleting or reordering. The fixes are localized to five places. But C3 needs a
design decision plus code and tests across Tasks 5, 6 and 9, and C4 needs an owner decision
point that does not currently exist — that is more than clarification.

## Strengths

1. **The fail-closed artifact → all-or-nothing stamp → receipt-based revert chain is the
   best thing in the plan, and it is mechanically sound.** I traced it: `stampUnit`
   (PLAN:2026–2114) computes every new file body into a `pending` Map and writes nothing
   until every edit has succeeded (PLAN:2111–2112); the skeleton is born
   `verdict: blocked` with every record `unreachable` (PLAN:1626, 1631); and `--stamp`
   refuses a blocked artifact outright (PLAN:2037–2041). SPEC:342's "a blocked branch must
   be harmless to merge" stops being a procedure and becomes a property of the code.
2. **Every API it says it consumes exists, with the shape it says.** I opened each one:
   `referencedRecordKeys(text, records)` at `verify-pages.mjs:234`, `sectionSixText(text)` at
   `:252`, `checkResearchRequired` at `:54-66` (non-emptiness only, exactly as PLAN:42
   claims), `loadRecords` stamping `file` as the bare basename at `data.mjs:37`,
   `parseFrontmatter` returning `{ data, body, bodyOffset }` at `frontmatter.mjs:5-10`, and
   `cli.mjs:246`'s `const root = rest.find((a) => !a.startsWith("--")) ?? process.cwd()` —
   which is a real reason `--page` must be a flag (PLAN:2525), not a rationalization. Nothing
   is invented.
3. **It steps around the known fixture trap deliberately and correctly.** `cli.test.mjs:51-52`
   spawns `render ROOT` over the whole of `tools/corpus/test/fixtures/corpus/` and is the
   only ROOT assertion with no filename filter; the fixture `data/models.yaml` defines exactly
   one key (`example.model.context_window`). PLAN:99 names this hazard and builds a separate
   `fixtures/refresh/` tree instead. I confirmed no task adds a page under
   `fixtures/corpus/`.

---

## Critical Issues (blockers)

### C1. Task 3 invalidates two assertions Tasks 1 and 2 already committed, and never fixes them

Task 3 Step 1 creates `tools/corpus/test/fixtures/refresh/guides/gamma/nosix.md` referencing
`fix.alone.four`, and says so explicitly: _"This joins `lonely.md`'s unit through
`fix.alone.four`"_ (PLAN:685).

Two already-committed tests assert the opposite:

- PLAN:315–322 — `"a page sharing no record is a unit of one"` asserts
  `resolveUnit(FIX, "guides/gamma/lonely.md")` yields exactly `["guides/gamma/lonely.md"]`.
- PLAN:506–515 — `"a slug joins sorted basenames"` asserts `unitSlug(lonelyUnit) === "lonely"`.
  Once `nosix.md` joins, the slug becomes `lonely-nosix`.

Both go red at Task 3 Step 7's `npm test` gate (PLAN:929). Task 3 gives no instruction to
amend them. This is precisely the "a task adds a fixture and thereby breaks a gate mid-plan"
failure the plan's own Global Constraints (PLAN:21–25) promise against.

**Fix:** Task 3 Step 1 must also rewrite those two assertions — lonely's unit becomes
`["guides/gamma/lonely.md", "guides/gamma/nosix.md"]` and its slug `lonely-nosix` — or
`nosix.md` must reference a sixth, unshared record so it stays a unit of one and the
no-section-6 block is tested from its own entry page. The second option is cleaner: it keeps
Task 1's "unit of one" case alive, which is otherwise lost.

### C2. `withRevertMark`'s object spread makes `reverted.at` the stamp date, failing its own tests in Tasks 5 and 7

PLAN:1766:

```javascript
return dumpArtifact(
  { ...rest, verdict: "blocked", reverted: { at, ...(stamped ?? {}) } },
  body,
);
```

`stamped` is the receipt, and `Receipt` carries its own `at` (PLAN:1334, PLAN:2106 —
`{ at: today, pages, records }`). A later spread wins, so `reverted.at` is the **stamp** date,
not the revert date passed in as `at`.

Two tests assert the revert date and will therefore fail:

- PLAN:1547–1550 — `withRevertMark(stamped, "2026-09-29")` with `RECEIPT.at = "2026-09-28"`,
  asserting `reverted.reverted.at === "2026-09-29"`.
- PLAN:2204–2208 — `revertUnit(..., { today: "2026-09-29" })` after a stamp at
  `today: "2026-09-28"`, asserting `after.reverted.at === "2026-09-29"`.

This is reasoning over the plan's own literal code, not speculation: the receipt provably
contains `at`, and the spread provably overwrites.

**Fix:** `reverted: { ...(stamped ?? {}), at }`, and rename the receipt's own field to
`stamped_at` inside `reverted` if both dates matter — they do: the audit in 2a-iii will want
to know when a block happened, not only when the stamp did.

### C3. `--key` narrows the record set but not the page set that gets stamped — a page-wide freshness sweep on a surgical refresh

SPEC:143: _"A `--key` flag still handles the surgical case: one record repriced, no page-wide
sweep."_

The plan breaks that. `renderArtifactSkeleton` sets

```javascript
unit: order.unit.pages.map((p) => p.path),   // PLAN:1618 — the FULL unit
unit_keys: order.records.map((r) => r.key),  // PLAN:1627 — the NARROWED list
```

`workOrder`'s `--key` filter only narrows `order.records` and `order.pages` (PLAN:822, 830);
`order.unit.pages` is untouched. `stampUnit` then iterates `artifact.unit`, bumping every
non-deprecated page's `verified` to `artifact.fetched` and setting its `research:`
(PLAN:2088–2104).

So `refresh --page=guides/models/claude-models.md --key=anthropic.models.opus-5 --skeleton`
followed by `--stamp` re-dates **both** `claude-models.md` and `comparison.md` as fully
re-verified on the strength of one record having been re-read — with neither page's identifier
re-check list, lint-unguardable values, nor dated studies worked at all.

`validateArtifact`'s coverage rule only walks `unit_keys` (PLAN:1735–1740), so the artifact
validates clean. Nothing catches it. There is no test anywhere in the plan for `--key`
combined with `--skeleton` or `--stamp` — Task 3's `--key` test (PLAN:771–786) stops at
`workOrder`, and Task 9's CLI tests never pass `--key`.

This is a wrong-but-plausible freshness claim written under a fresh date by the tool built to
prevent exactly that (SPEC:39–42, SPEC:184–185).

**Fix:** decide and encode one of two behaviours, then test it end to end.
(a) `--key` narrows `unit` to `order.pages` as well, so only pages actually referencing the
key are stamped — and even then, those pages' identifier lists were not worked, so their page
`verified` arguably must not move either. (b) `--key` stamps **records only** and never
touches a page `verified` or `research:`. (b) is the honest reading of "no page-wide sweep"
and is the smaller change: skip the page loop entirely when the artifact carries a
`key_scoped: true` marker, and add a `refresh-key-scoped-page-bump` guard.

### C4. Task 14 — the plan's only deliverable — has no path through the outcome the spec predicts will be common

Checked against the tree: the live unit `guides/models/claude-models.md` +
`guides/models/comparison.md` references **14 records with 14 distinct source URLs across four
hosts** — `platform.claude.com`, `developers.openai.com`, `ai.google.dev` and
`huggingface.co`. All-or-nothing means any single one that bot-walls, rate-limits or 404s
forces `verdict: blocked`, `stampUnit` throws `refresh-blocked`, and nothing is written
(PLAN:2037–2041, PLAN:3041–3044).

SPEC:496 says plainly: _"Expect blocked refreshes to be the common early failure and some
`source` fields to need repointing by hand."_ Two of those four hosts (`huggingface.co`,
`ai.google.dev`) are the kind that serve a challenge page to a scripted fetch rather than a
404 — and a challenge page is worse than a 404, because it returns 200 with prose that reads
like content.

Task 14 Step 3's entire failure path is: _"Stop and report rather than guessing if any source
is unreachable … hand the artifact back"_ (PLAN:3790). There is no step for repointing a rotted
`source`, no owner decision point, no criterion for when to switch entry pages, and no
alternative unit. The acceptance criterion (SPEC:434) is a **merged** pull request; as written
the plan can consume the whole 2a-ii effort and terminate with a blocked draft and no next
action. That is the "deferred risk pushed to a phase that never comes" anti-pattern, applied
to the deliverable itself.

**Fix:** add to Task 14 an explicit Step 3a — "if a source is unreachable, determine whether
the URL rotted or the figure was withdrawn; a rotted URL is repointed in `data/` and the
record re-fetched (this is a `changed` outcome, not `blocked`); a withdrawn figure is
`unreachable` and the run blocks" — plus a named owner decision at Step 9 with a bounded
retry. Consider also naming the `hooks.md` unit (7 records, one vendor host) as the fallback
first live run: it closes the same loop at a quarter of the exposure, and SPEC:434's criterion
names `claude-models.md` only because it expires first.

### C5. Task 3's deprecation mutation is survivable, by the plan's own admission, because Task 1 under-specifies the fixture

PLAN:922 instructs: mutate the carve-out `p.status !== "deprecated"` to `true`, and _"Expected:
… goes red **only if `gone.md` has no `## 6.` section** — so give `gone.md` no `## 6.` section
when writing it in Task 1, and confirm here. If `gone.md` does have one, the mutation survives;
fix the fixture, not the test."_

Task 1 (PLAN:250–254) specifies `gone.md` as _"same structure"_ as `one.md` — and `one.md`
(PLAN:175–230) carries `## 1.` through `## 8.`, section 6 included. So as literally written,
Task 1 produces a fixture under which Task 3's mutation survives.

The plan's own standard is CM-adjacent and explicit: _"For each guard, the plan names the
mutation that must turn the suite red"_ (PLAN:27). Naming a mutation and then conceding it may
not bite fails that standard, and pushes the ambiguity onto the executor at the exact point
where a passing mutation step would be taken as evidence of coverage.

**Fix:** Task 1 must state `gone.md` has `## 1.`–`## 5.`, `## 7.`, `## 8.` and **no `## 6.`**,
and Task 3 Step 6 must drop the conditional and assert the mutation unconditionally.

---

## Task-by-task judgement

| Task                           | Verdict          | Basis                                                                                                                                                                         |
| ------------------------------ | ---------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1 — unit resolution            | **Fix required** | Closure algorithm is correct (PLAN:417–429); mutation at PLAN:458 genuinely bites. But `gone.md` is under-specified (C5) and its "unit of one" assertion dies in Task 3 (C1). |
| 2 — slug, topic, artifact path | **Fix required** | `unitTopic`-from-entry is a good call and PLAN:623's mutation is well chosen. `unitSlug(lonely)` assertion dies in Task 3 (C1).                                               |
| 3 — work order from section 6  | **Blocker**      | C1 and C5 both land here. The "deliberate non-parsing" reasoning (PLAN:675) is correct and matches SPEC:258–260.                                                              |
| 4 — surgical editors           | Minor fix        | Prefix anchoring and quote preservation are right (PLAN:1162–1189). `setPageResearch`'s replace path is not byte-exact — see M2.                                              |
| 5 — artifact schema            | **Blocker**      | C2 lands here. Everything else — fail-closed skeleton, two vocabularies, coverage rule — is sound and well-mutated.                                                           |
| 6 — `stampUnit`                | **OK**           | Strongest task in the plan. All-or-nothing is real, the four refusals are each mutation-covered, dates come from the artifact not the clock (PLAN:1817).                      |
| 7 — `revertUnit`               | **Fix required** | Inherits C2. Mutation 1 (PLAN:2327) is a syntax error as written — it redeclares `out` with `let` in the same block. Drift guard itself is well designed.                     |
| 8 — review packet              | **OK**           | `research/` exclusion matches SPEC:305–307; the pathspec mutation (PLAN:2494) bites on two tests.                                                                             |
| 9 — CLI wiring                 | **Blocker**      | C3 lands here. The `--page`-as-flag reasoning is verified correct against `cli.mjs:246`. Usage errors carry no reason — see M6.                                               |
| 10 — refresh prompt            | **OK**           | I checked each sync assertion against the prompt text as written: all five verdicts, all five backticked fields, all five mode flags, and the three rule probes match.        |
| 11 — verify agent rubric       | **OK**           | Covers all six SPEC:316–327 rubric items; `VALID_LABELS` probe matches the rubric's `**Verified**`/`**Documented**`/`**Plausible**` at PLAN:3206–3208.                        |
| 12 — idempotence proof         | **OK**, one note | Genuinely time-independent; `tier: 4` / `origin: <spec>` matches `examples/marker-render-idempotence/proof.yaml` exactly. `changedLines` is hand-rolled — see M4.             |
| 13 — contract amendments       | **OK**           | Correctly declines all 2a-iii content (PLAN:3613). The `data/claude-code.yaml` sentence at PLAN:3644 is true, even though PLAN:59's explanation of it is not (M1).            |
| 14 — hand-driven run           | **Blocker**      | C4 lands here.                                                                                                                                                                |

### Spec invariants — checked one by one

| Invariant (SPEC)                                       | Held?  | Evidence                                                                                                                           |
| ------------------------------------------------------ | ------ | ---------------------------------------------------------------------------------------------------------------------------------- |
| `refresh` never regenerates `meta/ledger.yaml` (168)   | Yes    | No refresh path calls `ledgerCorpus`; PLAN:2649–2659 tests it, PLAN:2872 mutates it. Ledger regen is Task 14 step 11, on `master`. |
| `seed: true` never removed (162–166)                   | Yes    | `setPageResearch` only splices a line (PLAN:1263–1268); asserted in Task 6 and in proof assertion 3.                               |
| Unreachable source must not bump `verified` (180)      | Yes    | `refresh-verdict-incoherent` (PLAN:1726–1734) plus `refresh-blocked` (PLAN:2037).                                                  |
| All-or-nothing; a blocked run writes nothing (33)      | Yes    | Verified in `stampUnit`'s ordering (PLAN:2057–2112).                                                                               |
| A block reverts dates **and** the added `research:`    | Yes    | PLAN:2294–2306.                                                                                                                    |
| Artifact kept, stamped `verdict: blocked` (337)        | Partly | Kept and re-marked, but `reverted.at` is wrong (C2).                                                                               |
| Values lint cannot guard are hand-checked per page     | Yes    | Section 6 passed verbatim (PLAN:1642–1655); prompt step 4 (PLAN:3030).                                                             |
| Artifact is grounding research, not a refresh log (M6) | Yes    | Stated and enforced by schema (PLAN:1340, PLAN:3668–3670).                                                                         |
| `--key` is surgical, no page-wide sweep (143)          | **No** | C3.                                                                                                                                |
| Nothing drifts into 2a-iii                             | Yes    | Task 13 declines it by name; `--requeue` deferred with a reason (PLAN:2527).                                                       |

---

## Missing Considerations

### M1. PLAN:59 is factually wrong about the tree, in both halves

PLAN:59: _"Units 1 and 2 both edit `data/claude-code.yaml` — unit 1 the `claude_code.hooks.*`
and `claude_code.sandbox.*` records, unit 2 only
`claude_code.claude_md.adherence_line_threshold`."_

Checked by loading the records and walking every guide's marker blocks:

- `claude_code.sandbox.auto_allow_bash_default` is referenced **only** by
  `guides/domains/software-engineering.md` — that is **unit 2**, not unit 1 — and lives at
  `data/claude-code.yaml:84`.
- `claude_code.claude_md.adherence_line_threshold` lives in **`data/context.yaml:15`**, not
  `claude-code.yaml`. It is the record that joins `context-management.md` to
  `software-engineering.md`; it is not what makes two units share a file.

The **conclusion** survives — two disjoint units do both write `data/claude-code.yaml`, via the
sandbox record on one side and the seven `claude_code.hooks.*` records on the other — and
PLAN:3644–3645's contract text is correct as written. But the decision section's worked example
is inverted, and a future reader re-deriving it will find the tree disagrees.

Worth recording while I was there: the disjointness claim holds comfortably. The last
`hooks.*` record's `verified:` is `data/claude-code.yaml:78` and the sandbox record's is
`:90` — twelve lines apart, well outside git's three-line hunk context, so the two units' edits
do auto-merge.

The transitivity claim (PLAN:69) is also correct on the live tree: closure and one-hop give the
same three units, because `comparison.md`'s eleven non-Claude records and
`software-engineering.md`'s sandbox record are each referenced by one page only.

### M2. The byte-exact revert claim is false on the `research:` replace path

PLAN:7 and PLAN:2150 claim `--stamp` then `--revert` is a byte-exact restore. It is, on the
path the tests exercise. It is not on the other one.

`setPageResearch`'s replace branch rewrites the line as `` `research: ${researchPath}` ``
(PLAN:1260), discarding both the quote character its own `PAGE_RESEARCH` regex captured
(PLAN:1249, group 1) and any trailing whitespace. `revertUnit`'s
`else if (p.previous_research != null)` branch (PLAN:2303–2304) therefore restores the _value_
but not the _bytes_ whenever the page already carried a quoted or trailing-space `research:`.

Task 7's round-trip test only ever exercises `research_added === true`, because every page in
the fixture starts without the field — so the test structurally cannot see this. Low impact
today (all five live pages are in that state) but the claim is stated without qualification and
becomes wrong on the second refresh of any page.

**Fix:** mirror `setPageVerified` — capture and re-emit the quote character and trailing
whitespace — and add a fixture page that starts with `research: "research/alpha/prior.md"`.

### M3. Prettier is not the threat the plan implies, and the plan should say where it actually is

PLAN:28 warns that "a Prettier hook reformats `.md` after every write". Checked: that hook is
`PostToolUse` on Claude's `Edit`/`Write` tools. Every write in this plan's runtime path is
`fs.writeFileSync` from inside `cli.mjs`, so **no refresh mode ever triggers Prettier**. The
byte-exactness claim is safe from it.

The one place it does fire is Task 14 Step 3, where the executing agent hand-fills the artifact
with `Edit`/`Write`. Prettier formats YAML front matter, so it may re-quote or re-indent the
artifact's `records:` list. That is functionally harmless — everything downstream re-parses the
YAML, and `withReceipt` re-dumps the whole block anyway — but an executor reading PLAN:28 has
every reason to fear it breaks `parseArtifact`'s round trip and to start fighting the formatter,
which PLAN:28 also forbids. One sentence in Task 14 resolves it.

### M4. Two fragilities in the proof that are fine today and will not stay fine

1. `renderArtifactSkeleton` wraps each page's section 6 in a bare ` ``` ` fence
   (PLAN:1647–1649). I checked all five live guides: **zero** section 6 sections contain a
   fence, so this works today. The first section 6 that carries a code fence silently corrupts
   the artifact's markdown. Use a four-backtick fence, or state the constraint in CM's section
   6 rules.
2. `changedLines` (PLAN:2436–2459) is a hand-rolled diff with a one-line insertion lookahead.
   It is adequate for the proof's own two-page fixture, where the only insertion is a single
   `research:` line. It would mis-align on a two-line insertion or a deletion, and the proof
   would then report a false pass rather than a false fail — the wrong direction for a proof.
   A line-set comparison (`before` lines minus `after` lines, symmetric) is both simpler and
   cannot desynchronise.

### M5. `refreshCorpus` discards the reason for every usage error

Every usage path returns `{ code: 2, out, err }` with `err` empty (PLAN:2771–2780), and
`main()` answers a `code === 2` by printing the generic three-line usage block (PLAN:2856). A
user who typed `--stamp` without `--artifact=`, or `--stamp --revert` together, gets no
indication which rule they broke. The plan's own issue-rules table (PLAN:3702–3725) names
twenty-three refresh rules; none of them can ever be emitted for a usage error. Push a reason
line into `err` before returning 2, and have `main()` print it above the usage block.

### M6. Nothing re-runs the new proof

Task 12 ships `examples/refresh-idempotence/` but `npm test` globs
`tools/corpus/test/**/*.test.mjs` only, so the proof runs exactly once — by hand, in Step 5 —
and `result: pass` / `last_run:` then sit in the manifest unchallenged. The plan defers
`restamp` to 2a-iii (PLAN:3285), which matches SPEC:397, so this is not a spec violation. But
it is the same hazard the prior review raised as M6 against the spec, reappearing one layer
down: a proof that never re-runs can outlive the behaviour it proves. A one-line
`node --test` wrapper under `tools/corpus/test/` that spawns `run.mjs` would close it now for
almost nothing.

---

## Questions / assumptions to verify

1. **What should `--key` stamp?** (C3.) This is a decision, not a bug fix. My reading of
   SPEC:143 is that a key-scoped refresh must not move any page's `verified`, because a page's
   `verified` asserts its whole section 6 was worked. Confirm before Task 9 is written.
2. **Is `claude-models.md` the right first live unit?** (C4.) SPEC:434 names it, but the unit
   rule makes that a 14-URL, four-host run. Is the owner willing to accept `hooks.md` as the
   proving run if the model unit blocks twice?
3. **Does a repointed `source` URL count as `changed` or `blocked`?** The spec's three outcomes
   (SPEC:172–185) do not cover "the value is fine, the URL moved". The plan inherits the
   silence. This will come up on the first run.
4. **`--requeue`.** The plan defers it to 2a-iii (PLAN:2527) on the grounds that it only means
   something against expiry-ordered selection. SPEC:409–410 files it under "Rollback and
   re-queue", not under the audit — but its stated justification ("Selection is otherwise
   expiry-only") is about the audit, so the deferral reads defensible. Confirm the owner agrees
   rather than letting it lapse silently.
5. **Where does a cross-topic unit's artifact belong?** The plan files it under the entry page's
   topic (PLAN:591–606) and admits the same unit entered from the other end files elsewhere.
   That is a real ambiguity the spec does not resolve; on the live corpus it means the
   `context-management.md` + `software-engineering.md` unit's artifact lands in
   `research/context/` or `research/domains/` depending on which page the audit picked. 2a-iii's
   selection is expiry-ordered, so that choice is not stable across runs. Worth pinning now.
6. **Two receipt dates.** Should `reverted` carry both the stamp date and the revert date?
   (C2's fix depends on the answer.)

---

## Suggestions by impact

**High**

1. Fix C1 by giving `nosix.md` its own unshared record, preserving Task 1's "unit of one" case.
2. Fix C2 with `reverted: { ...(stamped ?? {}), at }` and decide whether both dates are kept.
3. Resolve C3 with an explicit decision, then add a Task 9 test that stamps with `--key` and
   asserts **no page `verified` moved** — the assertion that is missing today.
4. Add C4's Step 3a (rotted URL vs withdrawn figure) and a bounded retry with a named owner
   decision.
5. Fix C5 by pinning `gone.md`'s shape in Task 1 and dropping Task 3's conditional.

**Medium**

6. Fix M2's quote/whitespace loss in `setPageResearch`'s replace branch and add the fixture
   that exercises it.
7. Fix Task 7 Step 5 mutation 1 (PLAN:2327) — as written it is a `let` redeclaration, not a
   compiling mutation. State it as "delete the `if (p.research_added)` line".
8. Correct PLAN:59's worked example (M1). The contract text it feeds is already right; the
   explanation is not.
9. Add M5's reason lines to usage errors.
10. Replace `changedLines` with a symmetric line-set diff (M4.2).

**Low**

11. Widen the artifact's section-6 fence to four backticks (M4.1).
12. Add one sentence to Task 14 explaining where Prettier does and does not fire (M3).
13. Add the `node --test` wrapper that re-runs the new proof (M6).
14. `refreshCorpus`'s catch block interpolates `page`, which may be the boolean `true` when the
    flag was passed bare (PLAN:2828). Cosmetic, but it appears in every `RefreshError` message.

---

## Anti-pattern audit

| Anti-pattern                                     | Present?                                                                                                                    |
| ------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------- |
| Big-bang deployment                              | No. Fourteen tasks, each independently committed and gated.                                                                 |
| Untested assumptions ("this should work")        | Yes, twice: C3 (no test for `--key` end to end) and M2 (the byte-exact claim's untested branch).                            |
| No rollback                                      | No — `revertUnit` is a genuine rollback, and Task 14 step 11 covers the post-merge case. Modulo C2.                         |
| Missing owner                                    | Yes, at C4: no named decision point when the first live run blocks.                                                         |
| Vague acceptance criteria                        | No. SPEC:434 is quoted verbatim (PLAN:34) and Task 14 step 12 checks it.                                                    |
| Deferred risk pushed to a phase that never comes | Yes, at C4 (the blocked-run path is deferred to "hand back") and mildly at M6 (proof re-runs deferred to 2a-iii, per spec). |
| Scope creep into 2a-iii                          | No. Task 13 declines it explicitly by name (PLAN:3613); `--requeue` is deferred with a stated reason.                       |
| Re-planning 2a-i                                 | No. PLAN:11 and the self-review row for Component 2 both state it as shipped.                                               |

## Placeholder scan

Clean, with one qualification. No `TBD`, no "add error handling", no "similar to Task N", no
code step without code. The only angle-bracket placeholders are `<fetched>` in Task 14, which
PLAN:3765 defines and PLAN:3784 tells the executor to capture. Every function and type named in
an `**Interfaces:**` block is either defined by an earlier task or exists in the tree — I
checked each of the five consumed tree symbols by opening the file.

The chain does hold end to end: `RefreshError` (T1) → `Unit` (T1) → `Order` (T3) →
`renderArtifactSkeleton`/`validateArtifact` (T5) → `stampUnit` (T6) → `revertUnit` (T7) →
`refreshCorpus` (T9), with `records[].file` spelled `data/<basename>` consistently from
`workOrder` (PLAN:855) through `validateArtifact`'s `startsWith("data/")` check (PLAN:1720) to
`stampUnit`'s `readFileSync` (PLAN:2074). The self-review's type-consistency section
(PLAN:3952–3965) is accurate as far as it goes — it simply did not look at `withRevertMark`.
