---
title: The Research Cycle — Design
date: 2026-10-13
status: draft
---

# The Research Cycle — Design

The corpus has a refresh pipeline and no research pipeline. Every page the
scope-expansion spec names is gated by `research-required`, and nothing in the
repository can produce what that gate asks for. This spec designs the missing
half: how a page that does not exist yet earns its grounding.

It designs the mechanism. It does not write any page, and it does not decide
which page goes first — that is a scheduling question for whoever runs the first
cycle.

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

## Open questions

These change the work and are the owner's to answer.

1. **Who performs the research?** A subagent with web access, the owner by hand,
   or a subagent that gathers and a human that accepts. This decides whether the
   artifact is machine-written and validated like the refresh artifact, or prose
   written by a person. Everything about the artifact's strictness follows from
   it, which is why it is first.
2. **Does `security` get its page split decided now, or by the research?** The
   scope spec says "~3 pages" without naming them. Deciding now risks three pages
   shaped by a guess; deciding later means the first cycle's scope is open.
3. **Which page goes first?** The cheapest useful test of the mechanism is a page
   whose sources are tier 1 and uncontested. The most valuable is one of the
   practice pages, which is also the hardest to source. These are not the same
   choice.
4. **Does `guides/providers/open-weight.md` get re-grounded in this cycle?** It is
   the one page already failing the spirit of the gate, and fixing it is the
   precondition for ever strengthening the gate to "grounds this page."

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
