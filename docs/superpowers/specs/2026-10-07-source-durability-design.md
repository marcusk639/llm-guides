---
title: Source Durability — Design
date: 2026-10-07
revised: 2026-10-08
status: approved
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

The five decisions below were each taken against stated alternatives in a review
pass on 2026-10-08. Nothing here is an open question; the section that used to
hold three is now "Resolved questions", which records what was decided and why
rather than inviting the decision to be retaken.

## The problem, stated precisely

The corpus already has a facts table and already cites sources. Measured on
2026-10-07 and 2026-10-08:

- Every record in `data/*.yaml` carries a `source` URL and a `verified` date —
  27 of 27.
- There are 28 distinct record field names across `data/*.yaml`, plus `file`,
  which the loader injects. Six are on every record: `key`, `value`,
  `volatility`, `source`, `verified`, `tags`. **Three carry citation URLs**:
  `source` (27 records), `price_source` (12) and `licence_source` (2).
- Every refresh artifact under `research/` carries, per record, the `url` read,
  a `stated` excerpt of what that page said, the date `read`, and the prior date
  `was`.
- No gate touches the network. The only network code in the repository is the
  browser-side index fetch in `tools/corpus/site-search.mjs` and its test.

So the gap is not "facts lack citations". It is narrower and worth naming
exactly:

1. **Nothing notices when a cited URL dies.** `CLAUDE.md` already treats a
   rotted `source` as `changed` rather than `blocked` — a thing to repoint — but
   nothing surfaces that it has happened. It is found by hand, during a refresh,
   or never.
2. **Nothing preserves the page.** The `stated` excerpt proves what the figure
   was. It does not let a later reader see the surrounding context if the page
   is gone and the claim is disputed.
3. **Most citations are not record citations.** `guides/` contains 58 distinct
   URLs; only 11 of them are a record's `source`. The other 47 sit in page
   front-matter `sources:` and in section 8, and they are what back the
   `Evidence: **Documented**` lines. A further 5 citation URLs live in
   `price_source` / `licence_source` and match no record's `source`. Any design
   scoped to record `source` alone leaves roughly three quarters of the corpus's
   citations unwatched.

## Decision 1: a dead source reports, it never blocks

A scheduled job finds dead sources and opens an issue or a draft pull request.
The four gates stay hermetic.

**Why not a gate.** The owner's original framing was "tests should verify that
the sources exist". The reason that is the wrong shape here is not aesthetic:

- All four gates currently touch zero network, and that is load-bearing. They
  run offline, they are deterministic, and they are fast.
- A gate that fetches dozens of URLs fails on a vendor outage, a rate limit, a
  captive network, or a CI egress rule — none of which are facts about this
  corpus.
- A gate that fails for reasons outside the maintainer's control gets ignored,
  then skipped, then deleted. A check that is routinely overridden protects
  nothing, and is worse than no check because it looks like protection.

**What makes this structural rather than conventional.** No finding the audit can
make produces a nonzero exit code. There is therefore no exit code to gate
liveness on, and wiring liveness into CI as a blocking step cannot work by
accident.

**The exit-code rule, stated by whose fact it is.** A dead source, a redirect, or
a capture the archive service refuses is a fact about a third party, and must not
fail the command. A failure to write a file the command tried to write is a fact
about this machine, and must not be swallowed. So:

| Exit | Meaning                              |
| ---- | ------------------------------------ |
| `0`  | the run completed, whatever it found |
| `1`  | a write the command attempted failed |
| `2`  | usage error                          |

The no-gate property survives intact: liveness findings still cannot produce a
nonzero code, so they cannot be gated on even deliberately.

This mirrors the corpus's existing posture that `verify` is strictly read-only
so it can run as a CI gate over the tree it judges, and that `site --write .`
must stay runnable by hand so a broken workflow degrades to a manual publish
rather than to no publish.

## Decision 2: the audit covers every citation URL, classified

The audit's input is every citation URL in the corpus, not every record
`source`. Findings are reported in five classes, because the remedy differs per
class and an undifferentiated list is not actionable:

| Class             | Source of the URL                    | Remedy                                        |
| ----------------- | ------------------------------------ | --------------------------------------------- |
| record source     | `source` on a record                 | repoint in `data/`; refresh verdict `changed` |
| record secondary  | `price_source`, `licence_source`     | same                                          |
| page front-matter | `sources:` in a guide's front-matter | **manual** — no pipeline covers it            |
| page body         | prose and section 8 links            | **manual** — no pipeline covers it            |
| snapshot          | `source_archived` on a record        | re-capture, or accept the loss                |

**Why wider rather than narrower.** Because the audit reports and never blocks,
a wider net costs report noise, not build failures, and the fetch count is
trivial on a schedule. There is no efficiency argument for the narrow scope.
Against that, `CLAUDE.md` requires that a labelled claim be one "a reader can
check", and the claims whose labels depend on page-level citations are exactly
the 47 URLs a record-scoped audit would never see.

**The cost, stated.** The two page classes surface real rot that this repository
has no workflow to route: repointing a page's citation is not re-verifying the
page, so it does not belong to a refresh, and `refresh --stamp` does not touch
front-matter `sources:`. Those findings are therefore manual-fix-only for now.
That is a known gap, not an oversight, and it is listed under "Deliberately
absent".

## Decision 3: preserve an archive URL and the excerpt, not the page

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

**What the field is validated against.** `source_archived` must be an absolute
`http(s)` URL — parseable by `new URL()` with an `http` or `https` protocol.
Deliberately _not_ the archive service's own URL grammar: a vendor-shaped regex
in `verify` would make adopting a second archive service a contract change
rather than a configuration choice.

## Decision 4: capture writes the artifact, the stamp writes the record

`sources --archive` submits captures and records each result in the refresh
artifact's per-record entry, beside `url`, `stated`, `read` and `was`. It writes
no `data/` file. `refresh --stamp` then writes `source_archived` into the record
as part of the transform it already performs all-or-nothing.

**Why not let `--archive` write records directly.** It would be a second
transactional writer over `data/`, needing its own atomicity, its own receipt and
its own revert — and this repository's sharpest documented edge is precisely a
multi-file write that failed between the files and the receipt. Routing the
record write through `--stamp` inherits the all-or-nothing transform, the
`stamped:` receipt, `--revert`, and the drift guards, instead of reimplementing
them.

**What this preserves from the original separation.** The reason capture was kept
out of `--stamp` was that a third-party network submission inside a
deterministic write transaction makes that transaction depend on an external
service mid-flight. That still holds, and is still honoured: the network call
happens in `--archive`, before the stamp. What `--stamp` performs is a purely
local write.

**Each capture attempt's outcome and date live on the artifact entry**, not on
the record. This is what makes an absent `source_archived` explainable rather
than ambiguous: without it, absence conflates "never attempted", "refused via
robots.txt" and "submission failed". A sentinel value in the field itself was
rejected for contaminating a URL-typed field with a non-URL, and a second record
field for adding contract surface that can drift from reality. The artifact is
reachable from the page's `research:` field, which is how every other provenance
claim in this corpus is traced.

The capture date is recorded alongside the outcome, because capture happens in an
`--archive` run run alongside a refresh and need not fall on the same day the
source was `read`. The record keeps a bare URL with no freshness semantics.

**Residual work this decision creates**, named so a plan cannot skip it:
`stampUnit` needs an insert-at-field-indent primitive, since today it only
replaces an existing `verified:` line; `--revert` needs to remove an inserted
line; and `validateArtifact` needs to accept the new per-record fields. The
existing drift guards are unaffected — inserting a field does not disturb the
`verified` comparisons.

## Decision 5: escalation is report-side

A source dead across several consecutive audits does **not** escalate to a
`verify` failure.

**Why not.** Such an escalation needs state the audit writes and `verify` reads.
`verify` would stay technically offline, so the hermeticity looks preserved — but
**clearing the gate would require network.** A contributor on a plane, behind a
proxy, or in a CI job with no egress could not turn a red `verify` green, because
going green would require a successful fetch of a vendor page. Decision 1's
property is not merely that the gates do not fetch; it is that the gates are
_satisfiable offline_. State-file escalation breaks that at the repair step,
which is where it matters, and does so in a way that is easy to miss in review
because the check itself still looks hermetic. Secondarily, `verify`'s verdict
would become a function of when the audit last ran, so a stale state file would
fail CI for rot already fixed.

**What replaces it.** Escalation inside the reporting channel, terminating in a
state the contract already defines: a figure the vendor no longer publishes
anywhere is `unreachable`, which forces the unit verdict to `blocked`, and a page
that can no longer be refreshed gets `status: deprecated` with a reason and a
replacement link. Sustained rot does not need a new enforcement mechanism; it
needs a human to run a refresh and reach that verdict, and escalation should
point there.

A consequence worth having: the consecutive-failure counter needs no new state
file in this repository. A long-lived or reopened issue in the tracker is the
count, and the wrapper that owns it belongs to the scheduled-research
sub-project.

## Components

### The `record-archived-invalid` rule

`corpus verify` gains one rule. If `source_archived` is present on a record, it
must be an absolute `http(s)` URL per Decision 3. It is never required, and the
check never touches the network — it is a shape check, in keeping with `verify`
being strictly read-only and offline.

Nothing validates that the snapshot resolves. That is the audit's job, and
making it a gate would reintroduce exactly the network dependency Decision 1
rejects.

### The `sources` subcommand

`node tools/corpus/cli.mjs sources [--json] [dir]` reads every citation URL per
Decision 2, fetches each one, and reports the dead and the redirected in the five
classes. It is **not** one of the four gates and must never be added to them.

Exit codes are Decision 1's: `0` when the run completed, `1` on a failed write it
attempted, `2` on a usage error. A run that finds twenty dead sources and a run
that finds none both exit `0`, which is what makes "reports, never blocks" a
property of the tool rather than a promise about how it is used.

A redirect is reported but is not a failure: vendors reorganise documentation
constantly, and a redirect that still lands on the figure is the normal case.
What the report distinguishes is _resolves_, _redirects_, and _does not
resolve_ — the judgement about whether a redirect still supports the claim
belongs to a human doing a refresh. `--json` carries per-class counts so the
scheduled wrapper can open one issue per class.

### Where the URL list comes from

Three inputs, and only one of them is ambiguous:

| Input                                             | Extraction                            | Ambiguity               |
| ------------------------------------------------- | ------------------------------------- | ----------------------- |
| record `source`, `price_source`, `licence_source` | structured field reads                | none                    |
| page front-matter `sources:`                      | structured YAML via `frontmatter.mjs` | none                    |
| page body prose links                             | URL spans                             | inherits the known gaps |

47 of the URLs are reachable structurally, and front-matter carries no
"where does the URL end" question at all. `lint` does not scan front-matter — it
starts at `bodyOffset` — so that path touches none of the lint's logic.

For the body class, `urlRanges` in `tools/corpus/lint.mjs` is **exported and
shared** rather than reimplemented: it already computes exactly what both callers
need, lint to skip those ranges and the audit to slice and fetch them. One
source of truth makes a disagreement between the two impossible by
construction. The extraction must be behaviour-preserving, and the existing test
suite is the proof.

The audit therefore inherits the two known lint gaps on the body class only. On
Form 2 — a bare URL running into following text through `.` or `;` — the audit
will fetch the over-extended string and report it as _does not resolve_.
`CLAUDE.md` currently calls Form 2 a human check, "not mechanically decidable".
It becomes mechanically _visible_: not fixed, but detectable, at no cost.

### The `sources --archive` subcommand

`sources --archive` submits each record `source` for capture and writes the
result — snapshot URL, outcome and capture date — into the refresh artifact's
per-record entry, per Decision 4. It writes no `data/` file and no `guides/`
file.

It is **deliberately not** gated behind `--write`. This repository has two
conventions, not one: `render` / `ledger` / `site` gate mutation behind
`--write`, while `refresh`'s `--skeleton` / `--stamp` / `--revert` mutate by verb
name. `--archive` is a verb by name, like the stamp it cooperates with.

### Unknown-flag rejection

`main()` currently reads flags with `rest.includes(...)`, so an unknown flag is
silently ignored. A mistyped `sources --achive` would run the pure audit and exit
`0`, indistinguishable from a successful capture run. `main()` must reject
unknown flags with usage and exit `2`, for every subcommand.

This is a deliberate scope addition beyond source durability, taken because it is
a precondition for trusting anything `--archive` reports, and because a
per-command allowlist would leave the trap armed for the next command that adds
a flag. It is cheaply provable: if the existing suite still passes, no current
invocation relied on a stray flag.

### Contract amendments

`CLAUDE.md` is the binding contract and wins over this spec where they disagree,
so an unamended contract means `source_archived` is an unrecognised field. The
amendments are deliverables, not cleanup:

1. **Record field table** — add `source_archived`: optional, snapshot URL,
   exempt from the freshness model (no `verified`, no volatility).
2. **Issue rules table** — add `record-archived-invalid` (verify).
3. **Root-level tooling table** — add a `sources` row with Decision 1's exits.
4. **The CLI usage line in prose** — currently
   `<render|lint|verify|ledger|refresh>`; needs `site` **and** `sources`.
5. **Refresh artifact front-matter spec** — the per-record entry list (`key`,
   `file`, `verdict`, `url`, `stated`, `read`, `was`) must carry the snapshot
   URL, the capture outcome and the capture date.
6. **Refresh rules table and the all-or-nothing description** — `--stamp` now
   inserts a field as well as bumping dates, and `--revert` removes it.

Outside `CLAUDE.md`: the usage string in `tools/corpus/cli.mjs` must list both
`site` and `sources`. `site` is already a real command and is already absent from
the contract's command table; that pre-existing drift is fixed in the same pass,
since the table is being edited anyway.

Amendments 5 and 6 exist because Decision 4 moved work into the refresh
pipeline, which is the most heavily documented part of the contract. Leaving its
description stale is how the next session learns the wrong mechanism.

### Tests

Hermetic, like every other test in this repository:

- `record-archived-invalid` is driven by fixture records: present and absent,
  valid, malformed, and relative-URL forms the predicate must reject.
- The audit's **response classification** — resolves, redirects, does not
  resolve — is tested against fixture responses, not the live web.
- **URL collection** is tested per class against fixture pages and records,
  including a front-matter `sources:` list, a body link, and the `price_source`
  field.
- The shared `urlRanges` extraction is proved behaviour-preserving by the
  existing lint tests.
- The **insert-at-field-indent** primitive and its `--revert` removal are tested
  against fixture record files, including a nested `verified:`-looking line that
  must not be matched.
- **Unknown-flag rejection** is tested per subcommand, asserting on the reason
  line's unique prefix rather than on text that also appears in the static usage
  block.
- The live-network path is exercised by running the command by hand. The spec is
  explicit that this is the untested seam, because a test that hits the web is
  the thing Decision 1 rejects.

## Acceptance criteria

1. `corpus sources .` reports every citation URL in the corpus in the five
   classes of Decision 2, and exits `0` regardless of findings, `1` only on a
   failed write it attempted, `2` on a usage error.
2. `corpus verify .` gains `record-archived-invalid`, stays strictly read-only
   and offline, and still prints `verify: clean` on the current tree.
3. All four gates still make zero network calls, and the full test suite passes.
4. `sources --archive` writes the refresh artifact only — never `data/`, never
   `guides/`.
5. `refresh --stamp` inserts `source_archived` into records as part of its
   existing all-or-nothing transform; `--revert` removes it; the existing drift
   guards still refuse a half-stamp retry.
6. An unknown flag on any subcommand exits `2` with usage.
7. `CLAUDE.md` carries all six amendments, and `cli.mjs`'s usage string lists
   both `site` and `sources`.
8. `meta/ledger.yaml` is untouched. `sources` is not a ledger writer: one file,
   one writer.
9. The live-network path is hand-run only, and the spec says so as a known
   untested seam.

## Deliberately absent

- **A gate that blocks on liveness.** Decision 1.
- **Escalation to a `verify` failure.** Decision 5; it would make a gate
  unsatisfiable offline.
- **Full-page archival into the repository.** Decision 3; a contract violation.
- **A repair workflow for page-level citations.** Decision 2 audits them, and
  fixing one is manual: repointing a citation is not re-verifying a page, so it
  belongs to no refresh unit, and `refresh --stamp` does not touch front-matter
  `sources:`. Routing those findings is left to the scheduled-research
  sub-project or to a later design.
- **Scheduling.** The `sources` command ships here; the cron wrapper that runs it
  and opens an issue belongs to the scheduled-research sub-project. This follows
  the corpus's own pattern of shipping a hand-runnable command before the
  automation that calls it.
- **Validating that a `source_archived` snapshot resolves in a gate.** The audit
  checks snapshot liveness; no gate does.
- **Backfilling snapshots for every existing record.** The field is optional and
  accrues as records are refreshed. A bulk backfill would submit 27 captures in
  one burst against a third-party service for records that are not otherwise
  being touched.
- **A vendor-shaped validator for snapshot URLs.** Decision 3.

## Risks

- **Third-party dependency.** The archive service can be slow, rate-limited, or
  unavailable. Because capture is a separate command and the field is optional,
  this degrades to "no snapshot" rather than to a failed refresh.
- **The audit is only as good as its schedule**, which this sub-project does not
  deliver. Until the scheduled-research sub-project lands, dead citations are
  found only when someone runs `sources` by hand.
- **The two page classes report faster than they can be fixed.** They have no
  pipeline, so a burst of page-citation rot becomes a backlog of manual work with
  nothing tracking it. The mitigation is per-class issues, so page findings do
  not drown the record findings that _can_ be routed.
- **`source_archived` rots differently from every other value.** A snapshot URL
  is permanent once it exists, so it has no `verified` date and no volatility.
  It is the one field in the corpus to which the freshness model does not apply —
  which is why Decision 2 has the audit check snapshot liveness rather than
  trusting that permanence.
- **A capture that fails silently is now bounded, not invisible.** Decision 4
  puts each attempt's outcome on the artifact entry, so absence of
  `source_archived` is explainable wherever an attempt was made. The residual
  gap: the 27 existing records have no attempt recorded anywhere, so for them
  absence still means "never attempted" until each is refreshed. That is the
  accrual model, chosen when backfill was ruled out.
- **The shared `urlRanges` extraction touches the lint.** It is the most
  load-bearing gate in the repository, and the change is a pure extraction whose
  only proof is the existing suite. A behaviour change there would be a
  corpus-wide false negative, which is the worst failure class available.

## Resolved questions

These were open in the first draft and were decided on 2026-10-08, against the
alternatives stated in each decision above. They are recorded here so the
reasoning survives, not so the decisions can be retaken.

1. **Does the audit check `source_archived` liveness, or only `source`?** It
   checks it, as its own class (Decision 2). "A snapshot URL is permanent by
   construction" is exactly a third-party assumption, and testing third-party
   assumptions is the command's whole job. The case it catches is the worst one
   in the design: `source` dead _and_ snapshot dead means the record has no
   checkable evidence at all, and under `CLAUDE.md` no claim it backs can carry
   the label it carries.
2. **Should sustained rot escalate to a `verify` failure?** No — Decision 5.
   Escalation is report-side, because a gate whose repair requires network is not
   satisfiable offline.
3. **Does `source_archived` belong on the record or on the refresh artifact?**
   Both, at different stages — Decision 4. The artifact carries the capture
   attempt, its outcome and its date; the record carries the resulting URL,
   because the record is what pages cite. The record precedent is already there:
   `price_source` shows a record carrying more than one citation URL.
