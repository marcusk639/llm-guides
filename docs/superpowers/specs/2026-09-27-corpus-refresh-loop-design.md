---
title: Corpus Refresh Loop — Design
date: 2026-09-27
revision: 1
status: approved
scope: sub-project 2a of 5 (authoring and refresh toolchain — freshness loop only)
---

# Corpus Refresh Loop — Design

## Purpose

Make the corpus's freshness guarantee real before it is made in public.

The foundation delivered a contract, a toolchain and five seed guides, and it deferred one
question it called decisive: "What runs the scheduled audit — a cron'd cloud session, a
local loop, or manual invocation? … it determines whether the freshness machinery is real
or decorative." This document answers it and builds the loop that answers it: a scheduled
audit that re-verifies expiring pages against their sources, an adversarial gate that can
block what it produces, and a human merge step.

Nothing here writes new content. Nothing here publishes a site. Both come after, and both
depend on this loop existing first.

## Context and constraints

Decisions settled with the project owner on 2026-09-27:

| Decision                | Choice                                                                                                                                                                                            |
| ----------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Audience                | Public and reputational. Strangers arrive via search and sharing; the site should read as an authority. Being caught stale is the primary risk.                                                   |
| Audit runner            | A scheduled cloud routine, autonomous through to a pull request, with the owner reviewing and merging. Roughly 30 minutes of human time per week.                                                 |
| Launch bar              | Machinery proven first, then publish thin: the site ships once one autonomous refresh cycle has landed a merged PR, with a front page framing the corpus method-first. Breadth accrues in public. |
| Sequencing              | This loop before the site. The site is a separate sub-project downstream of a working loop.                                                                                                       |
| Deferred to later specs | `write-guide`, `harvest`, the static site, and all new content.                                                                                                                                   |

Two constraints carry over from the foundation and still bind.

**A wrong-but-plausible number is worse than no number.** The whole contract exists for
this hazard, and an autonomous refresh is the single largest new source of it: an agent
that re-reads a vendor page and mis-transcribes a figure would ship a confident error
under a fresh `verified` date. The gate design in this document is the response.

**Maintenance reality: one person, working through Claude Code sessions.** Mechanisms are
judged on whether they survive neglect, not on whether they are thorough. The loop is
built so that neglect produces a visible backlog of open pull requests rather than a
corpus that silently rots.

## Repository state at the time of writing

- Gates clean: `render --check` exits 0, `lint` reports `lint: clean`, the test suite
  passes with 0 failures.
- Five seed guides covering 4 of 11 topics (`claude-code`, `context`, `domains`, `models`).
- `meta/` holds `ledger.yaml` and `taxonomy.yaml` only. The research prompt library does
  not exist; `research/` holds `.gitkeep`.
- All five pages carry `verified: 2026-09-16`, so expiries arrive in clusters: both model
  pages on 2026-10-16, the three medium pages on 2026-12-15.

## Scope

In scope, four components forming one closed loop:

1. **`refresh`** — re-verify one page (or one record) against its sources, guided by the
   refresh prompt, which is part of this component rather than a separate deliverable.
2. **`corpus verify`** — the deterministic half of the gate: a new CLI command.
3. **The verify agent** — the adversarial half of the gate.
4. **The scheduled audit** — the cloud routine that drives the loop and opens pull requests.

The gate is deliberately two components rather than one; the reasoning is below.

Out of scope, each its own later spec: `write-guide`, `harvest`, the static site, new
guide content, and any breadth work.

## The two observations this design rests on

### Section 6 is already an executable work order

The contract requires every page to close with "Where this rots": a table of
`Claim | Record | Volatility | Why it moves` for every record the page uses, the
identifiers tied to `applies_to` that need re-checking with safety-relevant ones first,
the values lint cannot guard, a dated-studies paragraph, and what is deliberately absent.

That is not documentation. It is a per-page refresh checklist that the foundation already
required authors to write. So `refresh` does not infer what to re-check: it reads section 6
and works it. A page that cannot be refreshed cleanly is a page whose section 6 was written
badly, which is itself worth discovering.

### Verify splits along the line the contract already drew

The contract names what lint deliberately does not check — duplicate record keys,
`source`/`verified`/`volatility` presence, `applies_to` shape, whether `related` paths
resolve, whether `lint_literals` still agrees with the fields it shadows, the two known
lint gaps, and formatting variants of recorded values — and assigns them to "review and
Verify responsibilities."

Some of those are deterministic and merely unimplemented. The rest need judgment. Verify
is therefore two components, not one:

- **`corpus verify`** — deterministic, unit-tested, a CI gate beside `render --check` and
  `lint`. Cheap, free, and fast enough to run on every commit.
- **The verify agent** — adversarial, fresh context, for the open-world problems only
  judgment catches.

The split keeps the cheap checks cheap and reserves model judgment for what needs it. It
also matters for safety: an autonomous pull request is only as trustworthy as the
deterministic half of its gate, because the judgment half can be wrong in ways that look
like agreement.

## Component 1: the refresh unit of work

**Unit: one page.** `verified` is per-page and the ledger is per-page, so that is the
natural grain. A `--key` flag handles the surgical case — one record repriced, no page-wide
sweep warranted.

### Procedure

`refresh <path>` reads the page's `sources`, `applies_to` and section 6, then works that
checklist:

1. For every record the page references — each terminated `corpus:data` block's record, and
   every record a `corpus:table` selects by tag — fetch the record's `source` and compare
   the live figure to `value` and `display`. Confirm or correct, and set the record's own
   `verified` to the date it was actually read.
2. For every identifier on the re-check list, confirm it still exists at the version
   `applies_to` pins. Safety-relevant identifiers first, in the order the contract requires
   them to be listed.
3. For every value lint cannot guard — short values, identifier-embedded values, generic
   tokens — check by hand, because nothing else will.
4. For dated studies, confirm the citation still resolves and note if it has been
   superseded. Studies do not change; they age.
5. Re-render, re-lint, regenerate the ledger, and bump the page's `verified`.

### Three outcomes

**Confirmed** — nothing moved. The only diff is `verified` dates. This is still a real
change: it asserts that a reviewed agent re-read these sources on this date, which is the
product.

**Changed** — records corrected, prose adjusted around them, page re-rendered.

**Blocked** — a source returned 404, a vendor withdrew a figure, or an identifier vanished
from the pinned version. A refresh that could not reach a source **must not bump
`verified`**; it surfaces the gap instead. Where a page cannot be refreshed at all, the
contract already prescribes the answer and refresh proposes it: `status: deprecated` with a
one-line reason and a link to a replacement.

The blocked outcome is the one that protects the guarantee. A loop that could only succeed
would launder unreachable sources into fresh dates.

### The evidence artifact

Each run writes `research/<topic>/<YYYY-MM-DD>-<page-slug>-refresh.md` recording every URL
fetched with the date it was fetched, the figure the source actually stated, and a verdict
per checklist item. The page's `research:` front-matter points at the newest artifact;
older runs stay in the tree, and git history carries the trail.

This populates the `research:` field the contract reserved and pre-committed to promoting.
For a reputational site it is the difference between claiming freshness and showing it: a
reader can open the artifact and see what was checked.

### Shared records and the cheap path

Records are shared across pages — the Claude model rows render on both
`guides/models/claude-models.md` and `guides/models/comparison.md` via the `claude-current`
and `comparison-hosted` tags. Refreshing one page therefore freshens records the other page
depends on, without bumping that page's `verified`.

The audit must recognize a page whose referenced records all carry a `verified` newer than
the page's own: that page needs only the identifier-and-prose pass, not a second source
sweep. Without this, the two model pages re-fetch the same vendor pages every cycle.

### Idempotence

Refreshing an unchanged page produces exactly one class of diff — dates — and nothing else.
This is the testable property, and it earns a proof under `examples/`, mirroring the
existing `examples/marker-render-idempotence/`.

## Component 2: `corpus verify`

A new CLI command: `node tools/corpus/cli.mjs verify [dir]`, exit 1 on any issue, joining
`render --check` and `lint` as a gate in the authoring loop and in CI. Every rule below is
something the contract explicitly states no tool currently checks.

| Rule                           | Catches                                                                       |
| ------------------------------ | ----------------------------------------------------------------------------- |
| `rots-table-incomplete`        | A record the page references that section 6's table does not list             |
| `record-duplicate-key`         | Two records sharing a `key` — today the later silently wins in render         |
| `record-source-missing`        | A record with no `source`                                                     |
| `record-verified-missing`      | A record with no `verified`                                                   |
| `record-verified-invalid`      | A record `verified` that is not a real calendar date written `YYYY-MM-DD`     |
| `frontmatter-applies-to-shape` | `applies_to` that is not a non-empty list of strings                          |
| `related-path-unresolved`      | A `related` entry pointing at a repo path that does not exist                 |
| `lint-literals-stale`          | A `lint_literals` entry matching nothing on its own record — the drift signal |
| `template-sections`            | The eight `## 1.`–`## 8.` headings missing, misnumbered, or out of order      |
| `evidence-label-invalid`       | A label outside the three exact spellings; `Verified` with no shipping proof  |
| `known-lint-gap-form`          | The two forbidden forms the contract says reviewers must catch by eye         |
| `research-required`            | A non-seed page with no `research:` artifact                                  |

### Why `rots-table-incomplete` is the highest-value rule

Refresh executes section 6. An incomplete section 6 therefore makes refresh silently
under-check a page — and refresh would still report success, under a fresh `verified` date.
That failure is invisible by construction and mechanically detectable, which makes it the
most valuable rule in the set. It also closes the loop: the gate and the refresher check
each other, rather than both trusting the same hand-written list.

### `known-lint-gap-form`

The contract documents two forms that hide a known value from the bare-value scan — a
URL-like angle-bracket link destination containing spaces, and a bare URL running into
following text through `.` or `;` — and instructs reviewers to check for them by eye. This
rule makes that a test instead of a habit.

## Component 3: the verify agent

An adversarial reviewer that sees the diff and the cited sources, and deliberately **not**
the refresh run's reasoning. Independence is the point: a reviewer shown the reasoning it is
meant to audit tends to ratify it, and the value of a same-tier reviewer is a fresh frame
rather than more capability.

Rubric, the open-world set:

- A figure in prose that reads like a value but has no record. Lint is closed-world by
  design and cannot catch a value the corpus does not yet track.
- Formatting variants of a tracked value: `200,000` or `200K` against a record of `200000`,
  a markdown-escaped id, a multi-word `display` that Prettier wrapped across two lines.
- Label discipline against source tier: tier 1–2 ceilings at **Documented**, tier 3–4 at
  **Plausible**, **Verified** only where a proof ships in the repo. An inference hiding
  under a Documented label because the fact it followed from was documented.
- Whether each example still "runs" by the contract's definition, and whether dated studies
  carry their scope where they are cited.
- Privacy: nothing traceable to `local/` or to a personal Claude configuration reached the
  page.

### Blocking semantics

`corpus verify` exiting non-zero blocks the merge like any CI gate. The agent returns pass,
or block-with-findings. On block the pull request stays a **draft**, labeled, with the
findings in its body — never silently skipped, never auto-merged, never closed.

Verify regenerates the ledger as its last act, so `meta/ledger.yaml` is always the product
of a gate that passed rather than of a refresh that merely finished.

## Component 4: the scheduled audit

A **weekly** cloud routine. Cadences are 30, 90 and 270 days, so weekly polling is ample and
keeps each run small.

Each run reads `meta/ledger.yaml`, selects every page where
`expires - today ≤ AUDIT_LEAD_DAYS`, and for each selected page: branches, refreshes, runs
both halves of verify, and opens a pull request carrying the refresh report as its body.

`AUDIT_LEAD_DAYS` lives beside `CADENCE_DAYS` in `tools/corpus/ledger.mjs`, so the numbers
keep one home. Refresh fires before expiry, not after: refreshing after expiry would mean
the site serves a page the ledger already calls overdue, and a blocked page needs review
time before it goes stale.

**The lead is per-volatility, not flat:** `{ high: 7, medium: 14, low: 14 }`.

A flat lead looks simpler and is wrong, because a refresh resets `verified` to today. The
effective interval between refreshes is therefore `cadence - lead`, not `cadence`. A flat
14-day lead would refresh a high-volatility page every 16 days against a declared 30-day
cadence — nearly double the intended frequency and cost, and a silent contradiction of the
number the contract publishes. The per-volatility lead gives effective intervals of 23, 76
and 256 days, which stay close to the declared 30/90/270 while still landing every refresh
before its deadline.

This relationship belongs in the contract text, because anyone later tuning one constant
will otherwise change the corpus's real cadence without noticing.

**One pull request per page, never batched.** A blocked page must not hold a clean one
hostage, and per-page review is what makes owner-merges-it meaningful.

### Three operational guards

**Cluster cap — at most 3 pages per run.** All five pages were verified on the same day, so
expiries arrive in clumps: both model pages on 2026-10-16, all three medium pages on
2026-12-15. Uncapped, the December run opens three pull requests at once and the model
sweep fetches the same vendor pages twice. With the cap and the shared-record cheap path,
refresh dates spread apart naturally over the first few cycles.

**No duplicate pull requests.** If an open pull request already exists for a page, skip it.
Otherwise a page not yet reviewed accumulates a new pull request every week, and the
backlog becomes noise instead of signal.

**Loud failure.** If the audit itself fails — network, API, an authentication lapse — it
notifies rather than no-ops. A cron that silently stops is precisely the
decorative-freshness outcome the foundation warned about, and it is indistinguishable from
success unless failure is noisy.

## Testing strategy

- **Unit tests per `corpus verify` rule**, in the existing
  `node --test "tools/corpus/test/**/*.test.mjs"` suite, following the established fixture
  patterns.
- **Mutation proofs for each new guard** — remove the guard, confirm the tests go red,
  restore it. This repo's established practice, and the only evidence that a test actually
  tests something.
- **`--dry-run` on the audit**, so selection logic, the cluster cap, the duplicate-PR skip
  and the cheap path are testable without opening pull requests or making network calls.
- **A new proof, `examples/refresh-idempotence/`**, asserting that refreshing an unchanged
  page diffs only in dates.

### Acceptance criterion

`guides/models/claude-models.md` expires 2026-10-16, so at its 7-day lead the first real run
fires around **2026-10-09**.

**This spec is complete when that run has opened a pull request, the owner has reviewed and
merged it, and the evidence artifact is committed under `research/models/`.** Not when the
code is written. The deliverable is a loop that has closed once in reality.

## Contract amendments

`CLAUDE.md` is the binding text and wins over this spec where they disagree, so these land
in it explicitly:

- `corpus verify` added to the root-level tooling table and to the authoring loop's gates.
- Every new rule added to the issue-rules table with its meaning and its fix.
- `research:` promoted from optional to required for non-seed pages, in the prose and in
  `REQUIRED_FIELDS` (`tools/corpus/lint.mjs`). The contract already pre-committed to exactly
  this change on exactly this trigger.
- The audit documented: weekly cadence, the per-volatility `AUDIT_LEAD_DAYS`, the
  `effective interval = cadence - lead` relationship, one pull request per page, cluster cap,
  draft-on-block. The freshness guarantee should be written down, not resident in a cron job.
- The shared-record cheap path documented, so a future reader does not "fix" it as a bug.

## Non-goals

No new guide content. No `write-guide`. No `harvest`. No static site. No breadth beyond the
five seeds. No changes to the identifier/value split, the page template, the evidence
labels, the source tiers, or the cadence numbers — this loop serves the existing contract
rather than renegotiating it.

## Risks

**The verify agent ratifies rather than audits.** The main safety mechanism is a model
reviewing another model's work. Mitigations: it is denied the refresh run's reasoning; the
deterministic half of the gate does not depend on judgment at all; and a human merges every
change. Residual risk is real and accepted — it is why the launch bar is a merged pull
request rather than a green pipeline.

**Section 6 quality becomes load-bearing.** Refresh is only as complete as the checklist it
executes. `rots-table-incomplete` covers records; it cannot prove the identifier list or the
lint-unguardable list is complete. The first few review cycles are also an audit of the
seeds' section 6s.

**Source URLs rot faster than values.** Vendors reorganize documentation. Expect blocked
refreshes to be the common failure early, and expect some `source` fields to need
repointing by hand.

**Cost.** Weekly cloud runs with web fetches and two gate passes are recurring spend against
a corpus of five pages. It is small now and grows with breadth; revisit at the point where
the site launches.

## Open questions

- Does the refresh prompt need per-archetype variants, or does one prompt parameterized by
  the page's own section 6 suffice? Starting with one, on the theory that section 6 already
  carries the per-page specificity. Revisit if the model-facts pages need different handling
  from the concept pages.
- Where does the audit routine's definition live so that it is version-controlled with the
  corpus rather than only in cloud configuration? Resolve during implementation.

## Revision history

**Revision 1 (2026-09-27)** — Initial design. Scopes sub-project 2 down to the freshness
loop after the owner chose a public reputational audience, an autonomous cloud audit with
human merge, and a machinery-first launch bar. Answers the foundation's open question on
what runs the scheduled audit.
