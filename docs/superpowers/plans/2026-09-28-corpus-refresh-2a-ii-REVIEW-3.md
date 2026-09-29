---
title: Scoped re-review of the 2a-ii fix wave (N1–N4)
date: 2026-09-28
reviewer: plan-reviewer
subject: docs/superpowers/plans/2026-09-28-corpus-refresh-2a-ii.md at 5fe916f (4,756 lines, 14 tasks), against docs/superpowers/plans/2026-09-28-corpus-refresh-2a-ii-REVIEW-2.md and docs/superpowers/specs/2026-09-27-corpus-refresh-loop-design.md revision 4
verdict: Needs clarification
---

Scope: only the four defects N1–N4 from REVIEW-2, whether the fix wave broke anything,
and whether any mutation it added or edited is survivable. The rest of the plan was not
re-reviewed. Every line reference below was read in ≤80-line `awk` windows and checked for
elision markers; the two executed blocks were extracted byte-for-byte from the plan file
by index rather than retyped.

## Disposition table

| Finding                                                                               | Ruling                                               | Evidence                                                                                                                                                                                                                                                                                                                                    |
| ------------------------------------------------------------------------------------- | ---------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **N1** — Step 12 hard-coded `ls research/models/` and the model unit as the criterion | **Closed in mechanism, one stale claim left behind** | Mechanism: `PLAN:4593–4618` (executed, both cases — see below). Rationale paragraph: `PLAN:4622`. Spec now supports it: `SPEC:434–436`, `SPEC:544–549`. Corrected elsewhere: Step 0 `PLAN:4410`, `4412`; Step 9 option (2) `PLAN:4536`; follow-on `PLAN:4540`; open question 3 `PLAN:4707`. **Not corrected: `PLAN:35`** — see Regressions. |
| **N2** — whole-file `.includes('verified: "2026-09-28"')` was record-blind            | **Closed**                                           | `PLAN:3050–3064`. Split/assert logic executed against the plan's own Task 1 fixture (`PLAN:170–210`) — passes on the right record, fails on the wrong one. Page half untouched: `PLAN:3065–3071`. Mutation 3 claim: `PLAN:3342` — load-bearing, with one imprecision noted below.                                                           |
| **N3** — `key_scoped` / `refresh-key-scope-widened` absent from Task 10               | **Closed**                                           | Test added `PLAN:3428–3437`; prompt paragraph `PLAN:3502–3507`; count corrected to 6 at `PLAN:3614` (6 `test(` blocks counted in `PLAN:3402–3449`); third mutation `PLAN:3622`. Enforcement not duplicated — the only throw is `PLAN:2381–2386` inside `stampUnit`.                                                                         |
| **N4** — "three-capture" → "four-capture"                                             | **Closed**                                           | `PLAN:1043` now reads "four-capture pattern". Regexes carry exactly four groups: `PAGE_DATE` `PLAN:1345`, `PAGE_RESEARCH` `PLAN:1367`, `RECORD_DATE` `PLAN:1303`; comment at `PLAN:1363`; consumer uses `m[1] m[2] … m[4]` at `PLAN:1378`.                                                                                                  |

## Execution evidence

Everything in this section was **run**, not reasoned about. The Step 12 fenced block's
`node -e` invocation (`PLAN:4601–4617`) was extracted by line index into a shell script and
executed verbatim against six synthetic trees. `PAGE` was set to
`guides/models/claude-models.md` in every case; only the page's front matter and the
on-disk `research/` tree varied.

| Case                                         | Front matter                                                                                | Tree                                     | Observed                                                                                                                                                  |
| -------------------------------------------- | ------------------------------------------------------------------------------------------- | ---------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **A — present artifact, unquoted**           | `topic: models`, `research: research/models/2026-09-28-claude-models-comparison-refresh.md` | artifact exists                          | `exit=0`, `criterion: guides/models/claude-models.md (topic models) carries research/models/2026-09-28-claude-models-comparison-refresh.md, which exists` |
| **B — missing artifact**                     | `research: research/models/2026-09-28-nope.md`                                              | `research/models/` exists, file does not | `exit=1`, `Error: missing evidence artifact research/models/2026-09-28-nope.md`                                                                           |
| **C — quoted `research:`**                   | `topic: claude-code`, `research: "research/claude-code/2026-09-28-hooks-refresh.md"`        | artifact exists                          | `exit=0`, `criterion: … (topic claude-code) carries research/claude-code/2026-09-28-hooks-refresh.md, which exists`                                       |
| **D — topic with no artifact directory yet** | `topic: claude-code`, `research: research/claude-code/…`                                    | `research/claude-code/` absent entirely  | `exit=1`, `Error: missing evidence artifact research/claude-code/2026-09-28-hooks-refresh.md`                                                             |
| **E — no `research:` at all**                | `topic: models` only                                                                        | —                                        | `exit=1`, `Error: no research: in guides/models/claude-models.md — the refresh never stamped it`                                                          |
| **F — artifact under the wrong topic**       | `topic: claude-code`, `research: research/models/…` (exists)                                | —                                        | `exit=1`, `Error: artifact research/models/2026-09-28-claude-models-comparison-refresh.md is not under research/claude-code/`                             |
| **G — no `topic:`**                          | `research:` only                                                                            | —                                        | `exit=1`, `Error: no topic: in guides/models/claude-models.md`                                                                                            |

The block therefore does what `PLAN:4620` claims: one `criterion:` line or a loud non-zero
exit naming the reason. Two further properties I checked by reading rather than running:
`research:` with an empty or `""` value falls through the `(.+)$` requirement / the
quote-strip and lands on the same "no research:" throw; and `\x27` inside the
single-quoted shell heredoc is a JS escape, so the node script carries no literal
apostrophe and the shell quoting is sound (it executed, which settles it).

**N2, executed.** The plan's Task 1 fixture (`PLAN:171–210`) was written to disk, one
record surgically stamped, and the assertion logic from `PLAN:3050–3064` run against it:

```
blocks: 7
tail matches stamped: true
fix.shared.one keeps 2026-09-16: true
fix.bridge.two keeps 2026-09-16: true
fix.alone.four keeps 2026-09-16: true
blockFor(bogus) empty: true
```

The fixture's real shape matches what the split assumes — ` - key:` at two spaces,
fields at four, `verified: "…"` double-quoted — so `split(/^ {2}- key: /m)` and
`/^ {4}verified: "…"$/m` both bind. `blockFor` on an unknown key returns `""`, which fails
`assert.match` rather than passing vacuously. And the same harness with the **wrong**
record stamped (`fix.shared.one` instead of `fix.tail.three`) shows the defect is really
gone:

```
whole-file .includes (the OLD assertion) passes: true
NEW: tail carries stamped date: false
NEW: shared.one keeps 2026-09-16: false
```

That is the direct proof REVIEW-2 asked for: the old whole-file substring survived a
wrong-record stamp; the record-scoped form kills it on both halves.

Indentation survives the stamp because record edits are single-line surgical replacements,
never a YAML round trip (`PLAN:70`, `PLAN:1041`), and `setRecordVerified` preserves the
quote character it found (`PLAN:1131–1142`). Had the fix wave chosen a serializer, the
four-space assertion would have been brittle; it did not.

## Regressions or new defects

**D1 (must fix, one line; not rework) — `PLAN:35` still quotes revision 3's criterion and
labels it "(spec, verbatim)".** It reads:

> **Acceptance criterion (spec, verbatim):** "Complete when a refresh of
> `guides/models/claude-models.md` — hand-driven or audit-driven — has passed both halves of
> verify, been reviewed and merged by the owner, and left an evidence artifact under
> `research/models/`."

That sentence is the exact text revision 4 **deleted** — confirmed against
`git diff HEAD~1 HEAD -- docs/superpowers/specs/`, whose only changes are `revision: 3` →
`revision: 4`, the criterion rewrite, and the revision-4 history entry. The governing text
is now `SPEC:434–436`: "any one refresh unit … an evidence artifact under
`research/<topic>/` for that unit's topic."

Why this matters rather than being cosmetic: `PLAN:35` sits in the plan's binding
constraints, three lines below "`--key` stamps records only", i.e. in the block an
implementer reads first and treats as non-negotiable. It now contradicts Step 9's option
(2) (`PLAN:4536`), the follow-on paragraph (`PLAN:4540`), and Step 12's own rationale
(`PLAN:4622`) — which is precisely the contradiction N1 was raised about, displaced from
Step 12 to the preamble. An implementer who takes the "verbatim" label at face value and
blocks twice on a vendor host would conclude the `hooks.md` close does not satisfy the
criterion, and would keep grinding at the model unit — the failure mode the amendment
exists to prevent. The revision-3 table at `PLAN:4754` enumerates what was corrected
("Step 9's option (2) and its follow-on paragraph, Step 0's question and its default, and
open question 3") and `PLAN:35` is not on that list, so this looks like a missed site, not
a deliberate retention. Remedy: replace the quoted sentence with `SPEC:434–436`'s wording
and keep the "Not when the code is written" clause.

**Not defects, recorded so the next reader does not re-raise them.** `PLAN:29` (the
`.claude/` hook warning) and `PLAN:129` (the files table) both name `research/models/`
concretely, and `PLAN:4389`, `4428`, `4525`, `4570`, `4596` name the model unit's paths
inside Task 14. All are downstream of `PLAN:4414`'s standing instruction to substitute the
chosen unit's entry page throughout the task, and all describe the _expected_ target rather
than the criterion. They are consistent with revision 4 and need no change.

**Nit (no action required) — `PLAN:3342`'s stated failure point is one assertion early.**
Mutation 3 drops `{ key }` from `workOrder(root, unit, records, { key })`. The mutation is
genuinely load-bearing, but the test dies earlier than described: `PLAN:3021` asserts
`data.key_scoped === true` on the freshly written skeleton, which becomes `false` the
moment `order.key` is undefined, so `assert.equal` at `PLAN:3021` throws before either
half of the record/page comparison is reached. The plan's claim that "both halves go red"
is the right conclusion about coverage and the wrong sentence about mechanics. Nothing
survives; only the narration is imprecise.

**Mutation audit — no new survivable mutation.** The wave added exactly one mutation
(`PLAN:3622`, Task 10 Step 5 mutation 3) and edited none. Traced: `key_scoped` appears in
the prompt body only at `PLAN:3502–3504` and `refresh-key-scope-widened` only at
`PLAN:3506`, all inside the paragraph the mutation deletes, so both probes in
`PLAN:3431` and `PLAN:3432–3436` go red. It cannot be absorbed by the neighbouring
field-sync test, because `PLAN:3408–3415` iterates a hard-coded
`["verdict","url","stated","read","fetched"]` against the prompt and checks
`unit_keys`/`slug`/`path` only against `ARTIFACT_FIELDS` in code — `key_scoped` is not in
either list. The `assert.equal(ARTIFACT_FIELDS.includes("key_scoped"), true)` line at
`PLAN:3430` is code-side and correctly unaffected by a prompt-only mutation. N2's edit
strengthened an existing assertion rather than adding a mutation, and the wrong-record run
above shows the strengthened form is not survivable.

**C1–C5 / M1–M6 not reopened.** Spot-checked each region the wave touched. C3's mechanism
is intact and un-duplicated: the page-loop skip is still the guard (`PLAN:2381`), the
independent `refresh-key-scope-widened` throw is still its only other enforcement point
(`PLAN:2382–2386`), both are still mutation-covered (`PLAN:2431`, `PLAN:2432`), and the
end-to-end byte-exact page assertion is still there (`PLAN:3065–3071`). M1's corrected tree
facts at `PLAN:4744` are untouched. The spec diff changed nothing but the criterion, so no
invariant another finding rested on moved.

**Gates still hold per task.** The wave's four edits land in `tools/corpus/test/` (N2),
`meta/prompts/refresh.md` plus its test (N3), plan prose (N4), and a Task 14 shell block
(N1). `guidePaths` walks `<root>/guides` only (`cli.mjs:41-54`), so none of these is
visible to `lint` or `verify`; no page was added to the shared corpus tree; the four-gate
lines at `PLAN:3347–3350`, `PLAN:3626–3630` and `PLAN:4370` are unchanged and still
satisfiable given only what their own task changes.

**Declared test counts still agree with the transcribed tests.** Counted `test(` blocks
against every `Expected: PASS, N tests` line: Task 9 → 12 (`PLAN:3334`), Task 10 → 6
(`PLAN:3614`), Task 4 → 13 (`PLAN:1402`), Task 6 → 10 new for 23 cumulative
(`PLAN:2421`), Task 7 → 5 more for 28 (`PLAN:2662`). No count drifted.

**Name and type consistency holds.** `key_scoped` (39 sites), `refresh-key-scope-widened`
(21), `RevertMark` (13) and the `{ key }` / `order.key` spelling (14) are uniform across
all 14 tasks and into Task 13's `CLAUDE.md` amendments (`PLAN:4253–4254`, `4283`, `4355`). The
wave introduced no new cross-task name — `unitBlocks` and `blockFor` are locals in one
test, `PAGE` is a shell variable in one step.

**Revision history is honest.** `PLAN:4750–4757` carries a `**Revision 3 (2026-09-28)**`
entry with a row per finding, and N1's row states plainly that it "was closed by the spec's
revision-4 amendment, not by narrowing the escape hatch," naming the amendment as what
makes option (2) sound. That is the disclosure REVIEW-2's regression list asked for.

## Verdict

**Needs clarification.** N1's mechanism, N2, N3 and N4 are all genuinely closed, and I
executed the two things the fixer claimed rather than taking them on trust — Step 12's
block behaves correctly across all seven cases I could construct, and N2's record-scoped
assertion demonstrably kills a wrong-record stamp that the old one waved through. Nothing
the earlier passes certified was disturbed, no mutation this wave touched is survivable,
and every task still ends with its four gates satisfiable.

The one thing standing between this and `Ready to implement` is **D1**: `PLAN:35` still
presents revision 3's deleted sentence as the spec verbatim, in the binding-constraints
block, and so contradicts Step 9 and Step 12 on the exact point N1 was about. It needs no
decision and no rework — one sentence replaced with `SPEC:434–436`'s wording — but it does
need doing before an implementer reads the preamble as authoritative. Tasks 1–13 are
executable as written today; Task 14 is executable as written once `PLAN:35` agrees with
the rest of the plan.
