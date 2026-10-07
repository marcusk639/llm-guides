---
title: Source Durability — Design
date: 2026-10-07
status: draft
---

# Source Durability — Design

Every factual claim in this corpus cites a URL and a date. URLs rot. This
sub-project makes a cited fact stay checkable after the page behind it changes
or disappears, and makes a dead citation visible without making it a build
failure.

It is the first of two sub-projects split out of the owner's request for
verified, cited, persisted facts. The second — scheduled research — depends on
this one, because a job that re-verifies sources needs to know what a source is
and what "still good" means. It is specified separately.

## The problem, stated precisely

The corpus already has a facts table and already cites sources. Measured on
2026-10-07:

- Every record in `data/*.yaml` carries a `source` URL and a `verified` date —
  27 of 27.
- Record fields are `key`, `value`, `unit`, `display`, `lint_literals`,
  `volatility`, `source`, `verified`, `tags`.
- Every refresh artifact under `research/` carries, per record, the `url` read,
  a `stated` excerpt of what that page said, the date `read`, and the prior date
  `was`.
- No gate touches the network. The only network code in the repository is the
  browser-side index fetch in `tools/corpus/site-search.mjs`.

So the gap is not "facts lack citations". It is narrower and worth naming
exactly:

1. **Nothing notices when a cited URL dies.** `CLAUDE.md` already treats a
   rotted `source` as `changed` rather than `blocked` — a thing to repoint — but
   nothing surfaces that it has happened. It is found by hand, during a refresh,
   or never.
2. **Nothing preserves the page.** The `stated` excerpt proves what the figure
   was. It does not let a later reader see the surrounding context if the page
   is gone and the claim is disputed.

## Decision 1: a dead source reports, it never blocks

A scheduled job finds dead sources and opens an issue or a draft pull request.
The four gates stay hermetic.

**Why not a gate.** The owner's original framing was "tests should verify that
the sources exist". The reason that is the wrong shape here is not aesthetic:

- All four gates currently touch zero network, and that is load-bearing. They
  run offline, they are deterministic, and they are fast.
- A gate that fetches 27 URLs fails on a vendor outage, a rate limit, a captive
  network, or a CI egress rule — none of which are facts about this corpus.
- A gate that fails for reasons outside the maintainer's control gets ignored,
  then skipped, then deleted. A check that is routinely overridden protects
  nothing, and is worse than no check because it looks like protection.

**What makes this structural rather than conventional.** The audit command exits
`0` whenever the audit itself ran, however many dead sources it found. It exits
`2` only on a usage error. There is therefore no exit code to gate on, and
wiring it into CI as a blocking step cannot work by accident. Findings are
emitted as machine-readable output for the scheduled wrapper to consume.

This mirrors the corpus's existing posture that `verify` is strictly read-only
so it can run as a CI gate over the tree it judges, and that `site --write .`
must stay runnable by hand so a broken workflow degrades to a manual publish
rather than to no publish.

## Decision 2: preserve an archive URL and the excerpt, not the page

A new **optional** record field, `source_archived`, holds a web-archive snapshot
URL captured at verification time. The `stated` excerpt already in each refresh
artifact remains the local proof of what the page said on the date it was read.

| Layer                        | Where it lives       | What it proves                              |
| ---------------------------- | -------------------- | ------------------------------------------- |
| `source`                     | the record           | where the fact came from, canonically       |
| `source_archived` (optional) | the record           | the page as it stood, if a capture exists   |
| `stated`                     | the refresh artifact | what the page said about _this_ fact, dated |

**Optional is load-bearing.** Some vendor documentation opts out of archiving
via robots.txt. A required field would make those records unrepresentable, and
the predictable workaround — inventing a placeholder URL — is worse than an
absent field, because it looks like evidence.

**Why not download the pages.** This was rejected outright rather than weighed:
`CLAUDE.md` forbids reproducing copyrighted material, and vendor documentation
is copyrighted. It is a contract violation, not a tradeoff. Two further costs
would apply even if it were permitted: unbounded repository growth, and refresh
diffs large enough that no reviewer reads them, which converts a review gate
into a rubber stamp.

## Components

### The `record-archived-invalid` rule

`corpus verify` gains one rule. If `source_archived` is present on a record, it
must be a URL-shaped string. It is never required, and the check never touches
the network — it is a shape check, in keeping with `verify` being strictly
read-only and offline.

Nothing validates that the snapshot resolves. That is the audit's job, and
making it a gate would reintroduce exactly the network dependency Decision 1
rejects.

### The `sources` subcommand

`node tools/corpus/cli.mjs sources [--json] [dir]` reads every record, fetches
each `source`, and reports the ones that are dead or redirected. It is **not**
one of the four gates and must never be added to them.

Exit codes: `0` when the audit ran, `2` on a usage error. No other value. A
run that finds twenty dead sources and a run that finds none both exit `0`,
which is what makes "reports, never blocks" a property of the tool rather than a
promise about how it is used.

A redirect is reported but is not a failure: vendors reorganise documentation
constantly, and a redirect that still lands on the figure is the normal case.
What the report distinguishes is _resolves_, _redirects_, and _does not
resolve_ — the judgement about whether a redirect still supports the claim
belongs to a human doing a refresh.

### The `sources --archive` subcommand

`sources --archive` submits each `source` for capture and writes the resulting
snapshot URL into the record's `source_archived`.

**It is deliberately separate from `refresh --stamp`.** `--stamp` is
all-or-nothing at the transform layer: every file body is computed in memory and
nothing is written until all of them succeed. Introducing a third-party network
submission inside that transaction would make a deterministic write step depend
on an external service mid-flight, and the existing half-stamp hazard — pages
stamped, no receipt — is already the sharpest edge in the refresh pipeline. It
is run alongside a refresh, not within one.

### Tests

Hermetic, like every other test in this repository:

- `record-archived-invalid` is driven by fixture records, present and absent,
  valid and malformed.
- The audit's **response classification** — resolves, redirects, does not
  resolve — is tested against fixture responses, not the live web.
- The live-network path is exercised by running the command by hand. The spec is
  explicit that this is the untested seam, because a test that hits the web is
  the thing Decision 1 rejects.

## Deliberately absent

- **A gate that blocks on liveness.** Decision 1.
- **Full-page archival into the repository.** Decision 2; a contract violation.
- **Scheduling.** The `sources` command ships here; the cron wrapper that runs it
  and opens an issue belongs to the scheduled-research sub-project. This follows
  the corpus's own pattern of shipping a hand-runnable command before the
  automation that calls it.
- **Validating that a `source_archived` snapshot resolves.** That is the audit's
  concern, not a gate's.
- **Backfilling snapshots for every existing record.** The field is optional and
  accrues as records are refreshed. A bulk backfill would submit 27 captures in
  one burst against a third-party service for records that are not otherwise
  being touched.

## Risks

- **A silently failed capture is invisible.** If a submission fails, the record
  simply has no `source_archived`, which is indistinguishable from a record whose
  source opts out of archiving. Nothing surfaces the difference except the audit.
  This is the sharpest edge in the design and the first thing to revisit if the
  field turns out to be sparsely populated in practice.
- **Third-party dependency.** The archive service can be slow, rate-limited, or
  unavailable. Because capture is a separate command and the field is optional,
  this degrades to "no snapshot" rather than to a failed refresh.
- **The audit is only as good as its schedule**, which this sub-project does not
  deliver. Until the scheduled-research sub-project lands, dead sources are found
  only when someone runs `sources` by hand.
- **`source_archived` rots differently from every other value.** A snapshot URL
  is permanent once it exists, so it has no `verified` date and no volatility.
  It is the one field in the corpus to which the freshness model does not apply.

## Open questions

1. Should `sources` check `source_archived` liveness too, or only `source`? The
   argument for only `source` is that a snapshot URL is permanent by
   construction; the argument against is that "by construction" is an assumption
   about a third party.
2. Should a record whose `source` has been dead across several consecutive audits
   escalate — for example by failing `verify` after a stated number of
   consecutive failures? That would reintroduce blocking, but on evidence of
   sustained rot rather than on one network call.
3. Does `source_archived` belong on the record, or on the refresh artifact
   alongside `stated` and `read`? On the record it is reusable by any page; on
   the artifact it is tied to the reading that produced it. This design puts it
   on the record, because the record is what pages cite.
