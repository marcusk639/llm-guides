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

That last point is not theoretical, though the honest version of the example is
narrower than it first appears. The corpus's one non-seed page,
`guides/providers/open-weight.md`, names
`research/models/2026-10-06-claude-models-comparison-refresh.md`, whose `unit`
is `guides/models/claude-models.md` and `guides/models/comparison.md`. The
open-weight page is not a member of that unit, and the entry page the artifact
names resolves nowhere today — the Stage 0 move renamed it to
`guides/providers/anthropic.md` (`git log --follow` shows `R099`).

But the artifact is **not** grounding for a different subject. All four records
the page renders through its `comparison-open-weight` table —
`meta.models.llama-4-maverick`, `meta.models.llama-4-scout`,
`qwen.models.qwen3-8-2-4t-a95b`, `qwen.models.qwen3-8-27b` — appear in that
artifact's `unit_keys` and `records`, each `verdict: confirmed`, each read on
`2026-10-06`, which is the date the page itself claims. The page's values were
genuinely re-verified there.

So the defect is mis-filing, not absence: nothing in the artifact's metadata
ties it to the page that depends on it, and the page it does name has moved.
That distinction matters, because the fix is re-filing rather than
re-researching — see Decision 3.

### The gate is already forgeable, in one command

Worse than weak: the existing pipeline can produce a passing artifact that
grounds nothing. Reproduced on 2026-10-15 against a copy of `master`, with a
record-less `guides/security/prompt-injection.md` — exactly the page class this
cycle will produce:

```
refresh --page=… --skeleton   → exit 0, artifact with unit_keys: [], records: []
(flip verdict: blocked → confirmed)
refresh --page=… --stamp      → exit 0, research: written, verified bumped
verify .                      → verify: clean
lint .                        → lint: clean
```

A page with no grounding, pointing at a machine-generated artifact containing no
claims, no sources and no verdicts, passes every gate in the corpus — and would
still pass the strengthened gate of Decision 3, because the artifact resolves.

The gate reads as "this page is grounded". It currently means "this page names a
non-empty string", and the corpus ships a command that will manufacture one.

## Why the refresh pipeline does not cover this

`refresh --skeleton` builds a work order from a unit: it resolves the pages that
share a record, reads each record's current `verified` date into a `was`
snapshot, and writes one entry per existing record key. Every one of those inputs
presupposes the page and its records already exist.

The artifact schema says the same thing in its vocabulary. A record verdict is
`confirmed`, `corrected` or `unreachable` — all three are judgments about whether
a value *changed*. There is no verdict for "this value is new", because refresh
never meets one.

One argument that belongs here and does not survive checking: that filling the
schema would mean writing `was` dates for records with no prior state. For the
record-less pages this cycle produces there are no record entries at all, so the
schema accommodates them cleanly — which is precisely why the forgery above
works. The surviving argument is narrower and sufficient: refresh starts from a
page that already exists and re-reads values that already exist, and it has no
field anywhere for a claim, a source tier, or an evidence label. It can date a
page it cannot ground.

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
records shares records with nobody, so the unit rule puts each in a unit of one.

That derivation is real but thin, and it should not be oversold: a grouping rule
whose input is the empty set does not so much decide this case as decline it.
The unit rule exists to stop two branches editing one record and neither seeing
the other's bump, and with no records there is no such conflict to avoid. So
treat "one artifact per page" as a choice this spec makes, not an inheritance.

It is also the wrong default for the first cycle. Resolved Question 2 says the
`security` split is the cycle's own output — one research effort over one body of
sources yielding roughly three pages. Forcing three artifacts from it means
either splitting one evidence table three ways or triplicating it. Nothing
technical forbids several pages naming one `research:` path; `comparison.md` and
`anthropic.md` already share one today.

**So: one artifact grounds one *subject*, and names every page it grounds.** A
subject that yields one page gives one artifact with one page in it. The
`security` cycle gives one artifact naming its three. This is what makes the
stronger gate of Decision 3 expressible at all — "the artifact names this page"
needs an artifact that names pages.

## Decision 3: the gate checks that the artifact resolves

`checkResearchRequired` gains a second check: the path names a file that exists.
A typo or a moved artifact currently passes, and a page whose grounding cannot be
opened is not grounded in any sense a reader would accept.

Place the check **before** the `seed === true` early return, not after it. Two
seed pages — `guides/models/comparison.md` and `guides/providers/anthropic.md` —
carry `research:` pointers today, so a check added after the early return would
examine one pointer of the three and miss the typo class on the other two.
Seeds are exempt from *needing* a pointer; a pointer they do carry should still
resolve.

The stronger check — that the artifact names this page — was originally deferred
here on the grounds that `open-weight.md` is ungrounded and needs a research
cycle first. That was wrong: as the problem section now records, its four records
were genuinely re-verified in the artifact it names, and the defect is that the
artifact's metadata does not name the page back. The fix is re-filing, not
re-researching, and it is available now.

So the sequencing is shorter than first stated. Add "resolves" with this spec;
add "names this page" as soon as artifacts carry a page list — which Decision 2
now requires of research artifacts, and which re-filing the 2026-10-06 refresh
artifact would supply for the one legacy pointer. That is a change to one
artifact's front matter, not a research cycle.

Stated plainly so it is not mistaken for completeness: until the stronger check
lands, the gate cannot tell grounding from a pointer to the wrong file — and, as
the problem section shows, cannot tell it from a pointer to an empty one either.
Closing the forgery needs the artifact to carry claims, which is a check on
`kind: research` content, not on the pointer.

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

Two consequences, and one of them is work rather than a property that comes
free. The artifact is **to be** validated the way the refresh artifact is —
machine-written, so the checks are cheap — but nothing validates it today:
`validateArtifact` runs only when an artifact is passed to `refresh --stamp`,
`--revert` or `sources --archive`, and all three reject a `kind` other than
`refresh`. No subcommand walks `research/`. A plan from this spec must therefore
build the validator and the command that invokes it; until it exists, "validated"
describes an intention.

Acceptance is recorded in the artifact — an `accepted` field carrying the date —
so "has a human looked at this" is answerable without reading a pull request
thread. The same caveat applies: nothing enforces that an unaccepted artifact
cannot be named in `research:`, and the plan must say what does.

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

`guides/providers/open-weight.md` is therefore **not** re-researched in the first
cycle — it does not need to be. It needs its artifact re-filed so the metadata
names the page whose records it re-verified, which is a front-matter change and
should happen alongside the first cycle rather than after it.

Until the stronger check lands the gate stays unable to tell grounding from a pointer to the wrong
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
- **The first refresh of a record-less page launders its grounding away.**
  A page with no records derives `volatility: null` and sits on the low cadence,
  so every page this cycle produces is eventually refreshed. That refresh
  re-reads nothing, and `--stamp` overwrites `research:` in place — replacing an
  accepted claim-to-source table with a refresh artifact that documents nothing,
  on a page whose entire content is the claims that table grounds. `research:`
  having one meaning is right for pages with records, where a refresh means
  something; for this class it is a silent downgrade. A plan from this spec has
  to decide what refresh does to a record-less page, rather than inherit this.
- **Acceptance becomes a rubber stamp.** Decision 5 puts a human between the
  research and the page, and the failure mode of such a step is that it degrades
  into approving whatever arrives. The artifact's claim-to-source table is what
  makes acceptance checkable in minutes rather than hours; if it stops being
  skimmable, acceptance stops being real.
