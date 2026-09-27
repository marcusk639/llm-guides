---
title: Corpus Refresh Loop — Design
date: 2026-09-27
revision: 3
status: approved
scope: sub-project 2a of 5 (authoring and refresh toolchain — freshness loop only)
---

# Corpus Refresh Loop — Design

## Purpose

Make the corpus's freshness guarantee real before it is made in public.

The foundation delivered a contract, a toolchain and five seed guides, and it deferred one
question it called decisive: "What runs the scheduled audit — a cron'd cloud session, a
local loop, or manual invocation? … it determines whether the freshness machinery is real
or decorative." This document answers it and builds the loop that answers it: a refresh
operation that re-verifies pages against their sources, an adversarial gate that can block
what it produces, and a scheduled audit that drives both into a pull request a human merges.

Nothing here writes new content. Nothing here publishes a site. Both come after, and both
depend on this loop existing first.

## Context and constraints

Decisions settled with the project owner on 2026-09-27:

| Decision                | Choice                                                                                                                                                                                 |
| ----------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Audience                | Public and reputational. Strangers arrive via search and sharing; the site should read as an authority. Being caught stale is the primary risk.                                        |
| Audit runner            | A scheduled cloud routine, autonomous through to a pull request, with the owner reviewing and merging. Roughly 30 minutes of human time per week.                                      |
| Launch bar              | Machinery proven first, then publish thin: the site ships once one refresh cycle has landed a merged PR, with a front page framing the corpus method-first. Breadth accrues in public. |
| Sequencing              | This loop before the site. The site is a separate sub-project downstream of a working loop.                                                                                            |
| Deferred to later specs | `write-guide`, `harvest`, the static site, and all new content.                                                                                                                        |

Two constraints carry over from the foundation and still bind.

**A wrong-but-plausible number is worse than no number.** The whole contract exists for
this hazard, and an autonomous refresh is the single largest new source of it: an agent
that re-reads a vendor page and mis-transcribes a figure would ship a confident error
under a fresh `verified` date. The gate design in this document is the response.

**Maintenance reality: one person, working through Claude Code sessions.** Mechanisms are
judged on whether they survive neglect, not on whether they are thorough. The loop is
built so that neglect produces a visible, alarming backlog rather than a corpus that
silently rots.

## Repository state at the time of writing

Verified against the tree at `f0256b5`:

- Gates clean: `render --check` exits 0, `lint` reports `lint: clean`, tests pass.
- Five guides covering 4 of 11 topics. **All five carry `seed: true`** (`hooks.md:18`,
  `context-management.md:30`, `software-engineering.md:35`, `claude-models.md:19`,
  `comparison.md:32`) and **none carries `research:`**. This single fact invalidated the
  first revision's `research:` amendment; see the redesign below.
- `meta/` holds `ledger.yaml` and `taxonomy.yaml` only. `research/` holds `.gitkeep`.
- 25 data records, no duplicate keys, all `verified` values valid `"2026-09-16"` strings.
- All five pages were verified the same day, so expiries cluster: both model pages on
  2026-10-16, the three medium pages on 2026-12-15.
- No `Evidence:` line in the corpus carries **Verified**; every page instead states in
  prose that nothing on it is Verified. Several `Evidence:` lines legitimately carry two or
  three labels (`software-engineering.md:268`, `:352`).
- `comparison.md` and `claude-models.md` **share records** (`fable-5-1`, `opus-5`,
  `haiku-4-5`) via the `claude-current` and `comparison-hosted` tags.

## Scope

Four components forming one closed loop:

1. **`refresh`** — re-verify a refresh unit against its sources, guided by the refresh
   prompt, which belongs to this component rather than being a separate deliverable.
2. **`corpus verify`** — the deterministic half of the gate: a new, strictly read-only CLI
   command.
3. **The verify agent** — the adversarial half of the gate.
4. **The scheduled audit** — the cloud routine that drives the loop and opens pull requests.

Out of scope, each its own later spec: `write-guide`, `harvest`, the static site, new guide
content, and any breadth work.

### Delivered as three plans, not one

Revision 1 proposed building all four at once and automating a procedure nobody had ever
run by hand. That is the highest-risk ordering available. The work splits into three plans,
each independently valuable and each shippable alone:

| Plan       | Contents                                                                                                                        | Risk                                              |
| ---------- | ------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------- |
| **2a-i**   | `corpus verify` and all twelve rules, plus the `comparison.md` section 6 cleanup below. No network, no agent, no schedule.      | Low. Pure offline tooling with a clean test path. |
| **2a-ii**  | `refresh` and the verify agent, driven **by hand** on one page. Produces the idempotence proof and the first evidence artifact. | Medium. First live source fetches.                |
| **2a-iii** | The scheduled audit, the alarms, and the proof re-run step.                                                                     | Medium. Automation over a proven procedure.       |

2a-i comes first for a reason beyond risk: it makes the seeds' section 6 sections
trustworthy **before** anything executes them, and section 6 is what `refresh` executes.

## The two observations this design rests on

### Section 6 is already an executable work order

The contract requires every page to close with "Where this rots": a table of
`Claim | Record | Volatility | Why it moves` for every record the page uses, the
identifiers tied to `applies_to` that need re-checking with safety-relevant ones first,
the values lint cannot guard, a dated-studies paragraph, and what is deliberately absent.

That is not documentation. It is a per-page refresh checklist the foundation already
required authors to write. So `refresh` does not infer what to re-check: it reads section 6
and works it. A page that cannot be refreshed cleanly is a page whose section 6 was written
badly — which is why 2a-i ships first.

### Verify splits along the line the contract already drew

The contract names what lint deliberately does not check and assigns it to "review and
Verify responsibilities." Some of those are deterministic and merely unimplemented; the rest
need judgment. Verify is therefore two components:

- **`corpus verify`** — deterministic, unit-tested, read-only, a CI gate beside
  `render --check` and `lint`.
- **The verify agent** — adversarial, fresh context, for the open-world problems only
  judgment catches.

The split keeps the cheap checks cheap and reserves model judgment for what needs it. It
also matters for safety: an autonomous pull request is only as trustworthy as the
deterministic half of its gate, because the judgment half can be wrong in ways that look
like agreement.

## Component 1: `refresh`

### The unit is a record-sharing group, not a page

Revision 1 used one page as the unit and one pull request per page. That was wrong, and the
first live run would have demonstrated it: `claude-models.md` and `comparison.md` expire on
the same day and share the Claude model records, so two concurrent branches would both edit
`data/models.yaml`, and neither branch could see the other's record bumps. The "shared-record
cheap path" revision 1 proposed **could never have fired**, because it depended on seeing
work done on a branch it had no access to.

**A refresh unit is a page plus every page that shares one of its records.** The two model
pages are therefore one unit, refreshed on one branch, in one pull request. Each record is
fetched once, the cheap path works within the unit, and the shared-file conflict class
disappears.

A `--key` flag still handles the surgical case: one record repriced, no page-wide sweep.

### Procedure

`refresh <path>` resolves the unit, then for each page in it reads `sources`, `applies_to`
and section 6, and works that checklist:

1. For every record the unit references — each terminated `corpus:data` block's record and
   every record a `corpus:table` selects by tag — fetch the record's `source` once and
   compare the live figure to `value` and `display`. Confirm or correct, and set the
   record's `verified` to the date it was actually read.
2. For every identifier on each re-check list, confirm it still exists at the version
   `applies_to` pins. Safety-relevant identifiers first.
3. For every value lint cannot guard, check by hand, because nothing else will.
4. For dated studies, confirm the citation resolves and note if superseded. Studies do not
   change; they age.
5. Re-render, re-lint, and bump each page's `verified`.
6. **Set `research:`** to the artifact written below, on every page in the unit.

**`seed: true` is never removed.** The contract defines it as marking "a document authored
before the pipeline existed" (`CLAUDE.md:379-380`) — a permanent fact about a page's
provenance, not a status it grows out of. Revision 2 proposed stripping it on refresh; that
would make the flag lie about history and destroy the only record of which pages predate the
toolchain. A refreshed seed is a seed with fresh sources.

**`refresh` does not regenerate `meta/ledger.yaml`.** See "Where the ledger is written".

### Three outcomes

**Confirmed** — nothing moved. The only diff is `verified` dates and, on a page's first
refresh, a new `research:` field.
This is still a real change: it asserts a reviewed agent re-read these sources on this date,
which is the product.

**Changed** — records corrected, prose adjusted around them, pages re-rendered.

**Blocked** — a source 404'd, a vendor withdrew a figure, or an identifier vanished from the
pinned version. A refresh that could not reach a source **must not bump `verified`**; it
surfaces the gap. Where a page cannot be refreshed at all, the contract already prescribes
the answer and refresh proposes it: `status: deprecated` with a reason and a replacement link.

The blocked outcome protects the guarantee. A loop that could only succeed would launder
unreachable sources into fresh dates.

### The evidence artifact

Each run writes `research/<topic>/<YYYY-MM-DD>-<unit-slug>-refresh.md` recording every URL
fetched with its fetch date, the figure the source actually stated, and a verdict per
checklist item. Each refreshed page's `research:` points at it.

**`research:` has exactly one meaning: the page's current grounding artifact.** Initial
research and a refresh are two producers of the same kind of thing; the field does not
distinguish them, and nothing downstream should care.

### Idempotence

Refreshing an unchanged unit produces exactly one class of diff — dates, plus the one-time
first-refresh `research:` field — and nothing else. This earns a proof under `examples/`,
mirroring
`examples/marker-render-idempotence/`.

## Where the ledger is written

One file, one writer. Revision 1 had three components regenerating `meta/ledger.yaml` —
refresh, verify, and the authoring loop — which both guaranteed merge conflicts on every
multi-unit run and made `corpus verify` a gate that mutates the tree it is judging.

**The ledger is regenerated only on `master`, after a merge, never on a refresh branch.**
Refresh branches touch guides, data records and research artifacts. `corpus verify` is
strictly read-only and exits non-zero on drift, the same way `render --check` does. The
authoring loop's `ledger --write` stays as-is for hand edits.

This resolves the conflict class entirely and is why `corpus verify` can be a CI gate at all.

## Component 2: `corpus verify`

`node tools/corpus/cli.mjs verify [dir]`, exit 1 on any issue, read-only, joining
`render --check` and `lint` in the authoring loop and in CI.

### The eight rules that are clean against the corpus today

Each was checked against all 25 records and all five guides at `f0256b5`.

| Rule                           | Catches                                                                             |
| ------------------------------ | ----------------------------------------------------------------------------------- |
| `record-duplicate-key`         | Two records sharing a `key` — today the later silently wins in render               |
| `record-source-missing`        | A record with no `source`                                                           |
| `record-verified-missing`      | A record with no `verified`                                                         |
| `record-verified-invalid`      | A record `verified` that is not a real calendar date written `YYYY-MM-DD`           |
| `frontmatter-applies-to-shape` | `applies_to` that is not a non-empty list of strings                                |
| `related-path-unresolved`      | A `related` entry pointing at a path that does not exist. `related: []` stays legal |
| `lint-literals-stale`          | A `lint_literals` entry that is not a substring of any field value on its record    |
| `template-sections`            | The eight `## 1.`–`## 8.` headings missing, misnumbered, or out of order            |

`template-sections` inspects **`##` headings only.** `comparison.md` has an unnumbered `###`
inside section 6, and `software-engineering.md` has `### 4.1`–`4.9` and `### 5.1`–`5.8`;
subheadings are unconstrained.

`lint-literals-stale` is substring-based, not equality-based, because the contract documents
`lint_literals` as context-bound _phrases_ that may be fragments of a field
(`data/claude-code.yaml:6-8`, and `session_end_budget`'s `"1.5-second budget"` against a
longer `display`). Its limit should be stated plainly rather than oversold: it catches a
literal left behind after a field changed, and never the more dangerous direction, a field
value now covered by no literal at all. That direction belongs to the verify agent.

### The four rules revision 1 got wrong

**`rots-table-incomplete` — specify the loose reading.** Every record the unit references
must have its key appear _somewhere_ in section 6. The strict reading — one table row per
record — fails `comparison.md` today, because it deliberately collapses three Claude records
into one row, documenting the very shared-record relationship this design depends on. That is
good authoring, and a rule that punishes it is a bad rule. The loose reading passes all 29
current references. The contract entry must say which reading is meant, or a future
implementer will pick the strict one.

This remains the highest-value rule: `refresh` executes section 6, so an incomplete section 6
makes refresh silently under-check a unit and still report success under a fresh date. That
failure is invisible by construction and mechanically detectable.

**`evidence-label-invalid` — scope it to `Evidence:` lines and drop the proof check.** As
written in revision 1 it would have fired on all five pages, because every one explains the
label system with a bolded `**Verified**` in prose (`hooks.md:130`,
`context-management.md:108`, `software-engineering.md:121`, `claude-models.md:77`,
`comparison.md:128`, plus `hooks.md:315`). The rule inspects only lines beginning `Evidence:`,
and **must tolerate several labels on one line**, which the contract explicitly blesses and
two current lines use.

The "**Verified** requires a shipping proof" half is **cut**: `proof.yaml` carries a free-text
`claim` and there is no machine link from a guide to a proof directory, so the check is
undecidable without adding a contract element the foundation ruled out. It moves to the verify
agent's rubric and to "deliberately absent".

**`known-lint-gap-form` — Form 1 only.** The angle-bracket destination containing a space is
decidable and ships. Form 2 — a bare URL running into text through `.` or `;` — is not: `.`
appears in every hostname, `;` is legal in query strings, and the only precise formulation
flags the per-model vendor URLs the contract explicitly permits in a record's `source`. Form 2
stays a human-and-agent concern, and the contract text that tells reviewers to check both by
eye must be updated to say which one is now automated.

**`research-required` — redesigned, and it lives in one place only.** Revision 1 specified
this twice, in two tools, at two different scopes, and one of them was impossible:
`REQUIRED_FIELDS` (`tools/corpus/lint.mjs:6-14`) is a flat array consumed unconditionally
(`lint.mjs:23-30`) with no `seed` carve-out, so adding `research` would emit five
`frontmatter-required` errors and destroy `lint: clean` on contact.

**`REQUIRED_FIELDS` is not touched.** The rule lives in `corpus verify` alone: _a page with
no `seed: true` and no `research:` is an error._

Today that matches zero pages, and it will keep matching zero until the first non-seed page
exists — which is correct rather than a defect. Since `seed: true` is permanent, the rule's
real subject is **pages authored by the pipeline**, every one of which will have a research
artifact by construction. The five seeds are exempt forever, and that costs nothing: refresh
sets `research:` on them anyway, so all five acquire one within a cadence regardless of
whether a rule compels it. What the rule actually prevents is a future `write-guide` shipping
an ungrounded page — which is the case worth guarding.

This is the honest version of the trade-off the review identified. A rule with zero current
coverage is acceptable when the thing it guards does not exist yet; a rule that forces a
false claim about provenance to gain coverage is not.

## Component 3: the verify agent

An adversarial reviewer given the diff and the cited sources, and **not** the refresh run's
reasoning. Independence is the point: a reviewer shown the reasoning it is meant to audit
tends to ratify it.

Revision 1 contradicted itself here — it made the refresh report the pull request body and
then claimed the agent could not see that reasoning. **The agent runs before the pull request
is composed**, on the branch diff plus the sources. The refresh report becomes the PR body
afterwards, with the agent's verdict appended.

Rubric, the open-world set:

- A figure in prose that reads like a value but has no record. Lint is closed-world by design
  and cannot catch a value the corpus does not yet track.
- A field value on a record that no `lint_literals` entry covers — the direction
  `lint-literals-stale` structurally cannot see.
- Formatting variants of a tracked value: `200,000` or `200K` against a record of `200000`, a
  markdown-escaped id, a multi-word `display` Prettier wrapped across two lines.
- Label discipline against source tier: tier 1–2 ceilings at **Documented**, tier 3–4 at
  **Plausible**, **Verified** only where a proof ships — the judgment call `corpus verify`
  cannot make.
- Whether each example still "runs" by the contract's definition, and whether dated studies
  carry their scope where cited.
- Privacy: nothing traceable to `local/` or a personal Claude configuration reached the page.

### Blocking semantics, and what a block must undo

`corpus verify` exiting non-zero blocks the merge like any CI gate. The agent returns pass or
block-with-findings.

**On a block, refresh's freshness assertions are reverted on the branch before the pull
request is opened.** Page and record `verified` dates go back to their prior values and the
any `research:` field refresh added is removed. The evidence artifact is kept on disk,
stamped `verdict: blocked`, because
what was checked and what was found is exactly what the next attempt needs.

Revision 1 left the bumped dates in place on a blocked draft branch — a fully-formed,
unaudited freshness claim one careless merge away, sitting in the precise spot this design
exists to protect. A blocked branch must be harmless to merge.

The pull request then opens as a **draft**, labeled, findings in the body — never silently
skipped, never auto-merged.

## Component 4: the scheduled audit

A weekly cloud routine. Cadences are 30, 90 and 270 days, so weekly polling is ample.

Each run reads `meta/ledger.yaml`, selects every page where
`expires - today <= AUDIT_LEAD_DAYS[volatility ?? "low"]`, groups the selected pages into
refresh units, and for each unit branches, refreshes, runs both halves of verify, and opens
one pull request.

### Lead time

`AUDIT_LEAD_DAYS = { high: 7, medium: 14, low: 14 }`, beside `CADENCE_DAYS` in
`tools/corpus/ledger.mjs`.

The lead is per-volatility because a refresh resets `verified` to today, so the effective
interval between refreshes is `cadence - lead`, not `cadence`. A flat 14-day lead would
refresh a high-volatility page every 16 days against a declared 30-day cadence — nearly
double the intended frequency and cost, and a silent contradiction of the number the contract
publishes. The per-volatility lead gives effective intervals of 23, 76 and 256 days.

**The `?? "low"` fallback is load-bearing.** The contract documents `volatility: null` for a
page referencing no records. Without the fallback, `AUDIT_LEAD_DAYS[null]` is `undefined`,
every comparison against it is false, and such a page is **never selected and silently never
refreshed** — a freshness hole introduced by the per-volatility map itself. Mirror
`expiryFor`'s existing `?? "low"`.

The relationship `effective interval = cadence - lead` belongs in the contract text, because
anyone later tuning one constant will otherwise change the corpus's real cadence without
noticing.

### Guards and alarms

**Cluster cap — at most 3 units per run**, so a cluster of expiries cannot open an unreviewable
pile of pull requests.

**No duplicate pull requests** for a unit that already has one open.

**`stale-past-expiry` alarm, a first-class deliverable.** The cap and the duplicate-skip can
combine to defer a unit indefinitely: a blocked draft nobody resolves suppresses every later
attempt, the page sails past `expires`, and at `expires + cadence` the existing `expired` lint
rule turns **master's gates red** — discovered by a failing build rather than by the mechanism
that was supposed to prevent it. So the audit raises an explicit alarm the moment a page passes
`expires` without a landed refresh, and a blocked draft older than one week is closed and
reattempted rather than skipped forever. Revision 1 claimed neglect would produce "a visible
backlog"; without this, neglect produces a red build and a stale public page.

**Loud failure.** If the audit itself fails, it notifies rather than no-ops. A cron that
silently stops is the decorative-freshness outcome the foundation warned about, and it is
indistinguishable from success unless failure is noisy.

**Proof re-runs.** The audit re-runs the shipped proofs via `tools/corpus/proofs.mjs#restamp`.
**Verified** labels depend on proofs that pass, and nothing currently re-runs them, so a
Verified claim could outlive the proof backing it indefinitely.

## Rollback and re-queue

Revision 1 had no recovery story for the hazard it was built around.

A bad merged refresh is undone by reverting the refresh commit on `master` and regenerating the
ledger. Because refresh branches never touch the ledger, the revert is a clean single-commit
operation.

`refresh --requeue <path>` re-checks a unit outside expiry order, for a page you have come to
suspect. Selection is otherwise expiry-only, which gives no way to act on a suspicion.

## Prerequisite: `comparison.md` section 6

Section 6 of `guides/models/comparison.md` carries a long foundation-era retrospective whose
content is partly stale. It is one of the two pages the first refresh unit hits, section 6 is
what refresh executes, and `rots-table-incomplete` cannot see the problem — the records are all
listed. Relocate the retrospective out of section 6 as part of 2a-i, before anything executes it.

## Testing strategy

- **Unit tests per rule**, in the existing `node --test "tools/corpus/test/**/*.test.mjs"`
  suite, following the established fixture patterns.
- **Mutation proofs for each new guard** — remove the guard, confirm the tests go red, restore
  it. This repo's established practice, and the only evidence a test tests anything.
- **Every rule dry-run against all five current pages before it enters CI**, with the expected
  result per page recorded in the plan. Two of revision 1's twelve rules would have broken the
  build on first commit; both were caught by checking files rather than reasoning.
- **`--dry-run` on the audit**, so selection, unit grouping, the cap, the duplicate skip and the
  alarms are testable without network calls or pull requests.
- **`examples/refresh-idempotence/`**, asserting an unchanged unit diffs only in dates.

### Acceptance criterion

**Complete when a refresh of `guides/models/claude-models.md` — hand-driven or audit-driven —
has passed both halves of verify, been reviewed and merged by the owner, and left an evidence
artifact under `research/models/`.**

Not when the code is written. The deliverable is a loop that has closed once in reality.

Deliberately **no date**. Revision 1 named 2026-10-09, which read as a deadline and was not
one: once `expires` passes, `expires - today` goes negative and the page stays selected on
every subsequent run. Slipping delays the criterion; it cannot void it. The date's only effect
was to pressure the gate work that most needs care.

Allowing the refresh to be hand-driven is what lets 2a-ii close this criterion without 2a-iii
existing yet — and hand-driving it once is the point of that plan.

## Contract amendments

`CLAUDE.md` is binding and wins over this spec where they disagree, so these land in it:

- `corpus verify` in the root-level tooling table and the authoring loop's gates, marked
  read-only.
- Every new rule in the issue-rules table, with `rots-table-incomplete` stating the **loose**
  reading and `evidence-label-invalid` stating the `Evidence:`-line scope and multi-label
  tolerance.
- The audit: weekly cadence, per-volatility `AUDIT_LEAD_DAYS` with its `?? "low"` fallback, the
  `effective interval = cadence - lead` relationship, refresh units, cluster cap, draft-on-block
  with reverted dates, and the `stale-past-expiry` alarm.
- Refresh units and the one-writer ledger rule, so a future reader does not "fix" either.
- `seed: true` is permanent provenance and is never removed; `research:` has one meaning.
- **"Duplicates are not detected (the later one wins in render)"** becomes false once
  `record-duplicate-key` ships. Correct it.
- **"Do not write either form. Reviewers check for them by eye"** must say that Form 1 is now
  automated and Form 2 remains a human check.

## Non-goals

No new guide content. No `write-guide`. No `harvest`. No static site. No breadth beyond the five
seeds. No changes to the identifier/value split, the page template, the evidence labels, the
source tiers, or the cadence numbers.

## Deliberately absent

- **A machine link from a guide to the proof backing a `Verified` label.** It would make the
  label check decidable, and the foundation ruled out adding it. The verify agent carries the
  judgment instead.
- **Form 2 of the known lint gaps.** Undecidable; stays with human review.
- **Record-level freshness in the ledger.** The cheap path needs it, but refresh units make it
  unnecessary within a run, and adding it would change a generated file's schema for one
  consumer.

## Risks

**The verify agent ratifies rather than audits.** The main safety mechanism is a model reviewing
a model. Mitigations: it is denied the refresh reasoning, runs before the PR body exists, the
deterministic half needs no judgment, a block reverts every freshness assertion, and a human
merges. Residual risk is accepted — it is why the bar is a merged pull request, not a green
pipeline.

**Section 6 quality is load-bearing.** Refresh is only as complete as the checklist it executes.
`rots-table-incomplete` covers records; nothing proves the identifier list or the
lint-unguardable list is complete. 2a-i and the first review cycles are also an audit of the
seeds' section 6s.

**Source URLs rot faster than values.** Expect blocked refreshes to be the common early failure
and some `source` fields to need repointing by hand.

**Cost.** Weekly cloud runs with fetches and two gate passes are recurring spend against five
pages. Small now, grows with breadth; revisit when the site launches.

## Open questions

- Does the refresh prompt need per-archetype variants, or does one prompt parameterized by the
  unit's own section 6 suffice? Starting with one. Revisit if model-facts pages need different
  handling from concept pages.
- Where does the audit routine's definition live so it is version-controlled with the corpus
  rather than only in cloud configuration? Resolve in 2a-iii.

## Revision history

**Revision 1 (2026-09-27)** — Initial design. Scoped sub-project 2 to the freshness loop and
answered the foundation's open question on what runs the scheduled audit.

**Revision 2 (2026-09-27)** — Substantial rework after adversarial review against the tree at
`f0256b5`. Six blockers fixed: the impossible `research:`/`REQUIRED_FIELDS` amendment (redesigned
as a single `corpus verify` rule); `evidence-label-invalid` false-positiving
on all five pages (scoped to `Evidence:` lines, multi-label tolerant, proof check cut as
undecidable); `known-lint-gap-form` Form 2 (cut as undecidable); guaranteed `meta/ledger.yaml`
conflicts and an unfireable shared-record cheap path (refresh units replace per-page PRs; the
ledger has one writer, on `master`); `corpus verify` being both a read-only gate and a writer
(now read-only); and a verify-agent block leaving bumped `verified` dates on the branch (a block
now reverts them). Added the `?? "low"` lead fallback that the revision-1 per-volatility map
silently broke, `rots-table-incomplete`'s loose reading, `template-sections` restricted to `##`,
the `stale-past-expiry` alarm, proof re-runs, a rollback and re-queue path, and the
`comparison.md` section 6 prerequisite. Decomposed into three plans so the gate ships before
anything executes section 6, and restated the acceptance criterion without its false deadline.

**Revision 3 (2026-09-27)** — Corrects revision 2's seed handling. `seed: true` is permanent
provenance per `CLAUDE.md:379-380`, not a status a refresh clears; stripping it would have made
the flag lie about which pages predate the toolchain. `research-required` therefore keeps its
seed exemption permanently, and its subject is pipeline-authored pages rather than refreshed
seeds. A verify-agent block now reverts the added `research:` field rather than an imaginary
graduation.
