---
title: The Research Cycle — Design
date: 2026-10-13
status: approved
revised: 2026-10-13
---

# The Research Cycle — Design

The corpus has a refresh pipeline and no research pipeline. Every page the
scope-expansion spec names is gated by `research-required`, and nothing in the
repository can produce what that gate asks for. This spec designs the missing
half: how a page that does not exist yet earns its grounding.

It designs the mechanism and names the page the first cycle runs on. It writes
no page: that is the cycle's output, not this spec's.

## The problem, stated precisely

Measured on 2026-10-13, against `master` at the scope-expansion merge:

- The taxonomy carries 16 topics. **11 have zero pages.**
- Six pages exist. **Five are `seed: true`**, which `checkResearchRequired`
  exempts outright, so the gate governs exactly one page in the corpus.
- `research/` holds two artifacts. Both are refreshes of the same models unit.
- `checkResearchRequired` (`tools/corpus/verify-pages.mjs:54`) returns clean when
  `research` is a non-empty string. It never checks that the file exists, and
  never that the artifact has anything to do with the page naming it.

That last point is not theoretical. The corpus's one non-seed page,
`guides/providers/open-weight.md`, names
`research/models/2026-10-06-claude-models-comparison-refresh.md`. That
artifact's `unit` is `guides/models/claude-models.md` and
`guides/models/comparison.md`; the open-weight page is not a member, its only
occurrence of the string "open-weight" is the tag name `comparison-open-weight`
inside prose, and the entry page the artifact names was deleted by the Stage 0
move. So the only page the gate actually governs satisfies it by pointing at
grounding for a different subject, written for a page that no longer exists.

The gate reads as "this page is grounded". It currently means "this page names a
non-empty string".

## Why the refresh pipeline does not cover this

`refresh --skeleton` builds a work order from a unit: it resolves the pages that
share a record, reads each record's current `verified` date into a `was`
snapshot, and writes one entry per existing record key. Every one of those inputs
presupposes the page and its records already exist.

The artifact schema says the same thing in its vocabulary. A record verdict is
`confirmed`, `corrected` or `unreachable` — all three are judgments about whether
a value *changed*. There is no verdict for "this value is new", because refresh
never meets one. Filling that schema for a page that does not exist would mean
writing `was` dates for records with no prior state, which is not a shortcut but
a false statement in a machine-readable field other tools trust.

So initial research is a sibling of refresh, not a mode of it.

## Decision 1: a `kind: research` artifact, beside `kind: refresh`

Initial grounding produces `research/<topic>/<YYYY-MM-DD>-<subject>-research.md`
with `kind: research`. `refresh.md`'s procedure and vocabulary are left alone.

The two share a purpose — nothing reaches a guide without a dated, cited record
of where it came from — and share nothing else. A refresh artifact answers "did
this change?"; a research artifact answers "what is true, and who says so?" The
fields follow from that: per claim, the claim itself, the source URL, the source
tier, the date read, and the evidence label the claim may carry. No `was`, no
per-record verdict, no `unit_keys`.

`research:` keeps its single meaning — the page's current grounding, whichever
stage produced it. Nothing downstream distinguishes them, and nothing should.

## Decision 2: one artifact per page, which follows from the existing unit rule

A refresh unit is a page plus every page sharing one of its records, closed
transitively, and that is why `comparison.md` and `anthropic.md` share one
artifact today.

The pages this cycle will ground carry **no `data/` records** — that is the
scope-expansion spec's budget constraint and now a contract rule. A page with no
records shares records with nobody, so each is its own unit, and one artifact per
page is the existing rule applied rather than a new one. If a future research
subject does own records, the unit rule already says what to do, and this spec
adds nothing.

## Decision 3: the gate checks that the artifact resolves

`checkResearchRequired` gains a second check: the path names a file that exists.
A typo or a moved artifact currently passes, and a page whose grounding cannot be
opened is not grounded in any sense a reader would accept.

The stronger check — that the artifact actually names this page — is the one
worth wanting and is **not** proposed here, because it fails
`guides/providers/open-weight.md` today, and the honest fix for that page is real
grounding rather than a weakened rule. Strengthening the gate to "resolves" is
safe now and catches the typo class; strengthening it to "grounds this page" is
blocked behind the first research cycle, and should happen immediately after.

Stated plainly so it is not mistaken for completeness: after this change the gate
still cannot tell grounding from a pointer to the wrong file.

## Decision 4: no quota on evidence labels

The scope-expansion spec predicts most per-provider practice material is tier 3
and caps at **Plausible**, and warns that "a page that is mostly Plausible is
worth less than its page count suggests."

That is a reason to say so, not a reason to require a ratio. A minimum share of
**Documented** claims would be satisfied by relabelling, which converts a visible
weakness into an invisible one — the opposite of what the labels are for. Instead
the artifact records a tier per claim, and a page whose claims are mostly tier 3
says so in section 6, where a reader deciding how much weight to place on it will
look.

## Decision 5: a subagent gathers, the owner accepts

Research is performed by a subagent with web access, which produces the
claim-to-source table. It does not ground a page on its own: the owner accepts
the artifact first, and acceptance is what lets a page name it in `research:`.

This follows from what the corpus is for. The stated hazard is a
wrong-but-plausible value, and a model that has just read ten pages about a
subject is exactly the thing most likely to produce one with a confident
citation attached. Machine-checkable structure catches a malformed artifact; it
cannot catch a real URL cited for a claim it does not make. Only a reader can,
and the cost is one review per page rather than one per claim.

Two consequences. The artifact is validated like the refresh artifact rather
than written as prose, because a machine wrote it and the checks are cheap. And
acceptance is recorded in the artifact — an `accepted` field carrying the date —
so "has a human looked at this" is answerable without reading a pull request
thread.

## Resolved questions

All four were open in the first draft and were decided by the owner on
2026-10-13. Recorded so the reasoning survives.

1. **Who performs the research?** A subagent gathers, the owner accepts. See
   Decision 5. The fully-automated option was declined because nothing in it
   catches a confidently-cited bad source, which is the corpus's whole hazard;
   research by hand was declined as the option most likely to stall seven pages.
2. **Does `security` get its page split decided now?** No — the first cycle's
   output for `security` is the split itself. The scope spec says "~3 pages"
   without naming them, and naming them here would assert a structure nobody has
   researched. The accepted cost is that the first cycle has open scope.
3. **Which page goes first?** A `security` concept page. Prompt injection and
   tool-use blast radius are documented at tier 1 and tier 2, so the mechanism is
   tested against sources that mostly exist. A practice page is the more
   valuable material and the harder sourcing problem at once, and starting there
   would make a failure impossible to attribute to either the cycle or the
   subject.
4. **Is the gate strengthened?** Yes, to "resolves on disk" only. See Decision 3,
   including why the check worth wanting is not this one.

`guides/providers/open-weight.md` is therefore **not** re-grounded in the first
cycle, and the gate stays unable to tell grounding from a pointer to the wrong
file until it is. That is the first thing the second cycle should fix.

## Deliberately absent

- **Automated source discovery.** The corpus's hazard is wrong-but-plausible
  values; a crawler that proposes sources optimises for coverage, which is the
  wrong objective.
- **A research verdict vocabulary.** Refresh needs one because it compares
  against a prior state. Initial research has nothing to compare against, and
  inventing verdicts would be schema cargo-culting.
- **Backfilling the five seed pages.** `seed: true` is permanent provenance and
  the pages are already written; re-grounding them is a separate decision with
  its own budget.
- **Any change to `refresh.md` or the refresh artifact schema.** This spec adds a
  sibling and touches neither.

## Risks

- **The artifact becomes a transcript.** The refresh pipeline already learned
  this: narrative belongs in the pull request, not the artifact, or
  `research-required` becomes satisfiable by a log. The research artifact is a
  claim-to-source table, not an account of the search.
- **One cycle's cost is unknown.** The budget arithmetic the scope spec rests on
  prices *maintenance* at ~0.3 h/yr per evergreen page and says nothing about the
  one-off cost of grounding one. The first cycle should be measured, because
  seven of them at an unknown unit cost is not a plan.
- **Research proves the page should not exist.** A cycle that finds nothing
  citable has succeeded, and the answer is to drop the page rather than write it
  from inference. Nothing currently makes that outcome easy to record.
- **Decision 3 looks like it fixes the gate.** It does not, and the sentence
  saying so is load-bearing.
- **Acceptance becomes a rubber stamp.** Decision 5 puts a human between the
  research and the page, and the failure mode of such a step is that it degrades
  into approving whatever arrives. The artifact's claim-to-source table is what
  makes acceptance checkable in minutes rather than hours; if it stops being
  skimmable, acceptance stops being real.
