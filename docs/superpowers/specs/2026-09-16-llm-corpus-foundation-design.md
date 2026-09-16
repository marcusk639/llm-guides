---
title: LLM Corpus — Foundation Design
date: 2026-09-16
revision: 2
status: approved
scope: sub-project 1 of 5 (corpus foundation)
---

# LLM Corpus — Foundation Design

> Revision 2 follows an adversarial review of revision 1. The diagnosis and the
> fact/prose separation survived; the enforcement mechanism did not and has been
> redesigned. See "Revision history" at the end for what changed and why.

## Purpose

Establish the structural contract for a long-lived reference corpus on effective LLM
use: how a document is shaped, how a claim earns its confidence level, where volatile
facts live, and how staleness is detected. Content breadth and the authoring toolchain
are out of scope here — they depend on this contract and get their own specs.

## Context and constraints

The corpus documents fast-moving external systems. Model ids, prices, context limits,
API parameters, CLI flags, and SDK signatures change on a timescale of weeks. A
wrong-but-plausible number is worse than no number. Every decision below follows from
that single hazard.

Maintenance reality: one person, working through Claude Code sessions, with no team. Any
mechanism requiring sustained manual effort will be abandoned within months and leave the
corpus worse than if it never existed. Mechanisms are therefore judged on whether they
survive neglect, not on whether they are thorough.

Decisions already settled with the project owner:

| Decision            | Choice                                                                                                                                                          |
| ------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Coverage model      | Claude-first depth, plus a documented recipe for expanding to other models and domains on demand. Exhaustiveness lives in the recipe, not in pre-written pages. |
| Primary consumer    | Human practitioner first; structured front-matter makes pages agent-consumable as a side effect.                                                                |
| Freshness mechanism | Generated freshness ledger, scheduled audit, and a refresh skill accepting a topic, directory, file, or single data key.                                        |
| Authoring           | A research-then-draft-then-verify pipeline, with harvested session history as a gap-finding input.                                                              |
| Distribution        | Eventually a published static site; sequenced as a separate sub-project downstream of this contract.                                                            |
| Tiering             | Beginner/intermediate/advanced expressed as laddered sections within one document per topic.                                                                    |
| Foundation approach | Seed exemplar documents first, then codify the contract from what worked.                                                                                       |

## Decomposition

1. **Corpus foundation** — this document.
2. **Authoring and refresh toolchain** — harvest, research prompt library, write-guide, verify gate, refresh, scheduled audit.
3. **Claude spine content** — the deep Claude, Claude Code, Cowork, and agentic-engineering core.
4. **Expansion** — cross-model comparison, Codex and other harnesses, domain playbooks.
5. **Static site** — renders front-matter, freshness banners, tier navigation, search.

## Architecture

### Directory layout

- `guides/` — prose, organized by topic.
- `data/` — volatile values as structured YAML records, one per fact.
- `research/` — raw research output per topic, dated. The grounding layer.
- `examples/` — runnable artifacts: teaching examples and proofs, distinguished by a manifest field.
- `meta/` — taxonomy, generated freshness ledger, research prompt library.
- `local/` — gitignored. Harvest output and anything derived from session transcripts.

This supersedes the current convention of root-level topic directories.

**Root-level tooling decision.** The inherited instruction file states there are
deliberately no repo-wide build, lint, or test commands, and requires an explicit ask
before adding root-level tooling. This spec makes that ask and answers it: a corpus-wide
lint, renderer, and ledger generator are required, because the freshness guarantee is a
property of the corpus rather than of any single document. Individual examples keep their
own self-contained manifests and remain independently runnable; the root tool orchestrates
them but does not replace them.

### Topic map

Under `guides/`: foundations, prompting, context, agents, claude-code, cowork, harness,
models, tools, building, domains.

`claude-code` is intentionally the largest. `harness` carries guardrails, long-running
automation, trust, and observability. `domains` ships with one exemplar playbook and the
generation recipe rather than many thin pages.

## The central rule, restated

Revision 1 said "volatile facts never live in prose" and defined volatile to include
parameter names. That rule is both unenforceable and wrong: you cannot write a guide
about hooks without naming the hook events. The rule now distinguishes two kinds of
volatile fact.

**Identifiers** — names you must say in order to discuss the subject at all: hook event
names, tool names, parameter names, flag names, skill names, file names.

- Allowed freely in prose. No marker block, no data record.
- Governed by `applies_to` at the document level: the page states which product version
  it describes, and identifier drift is handled by refreshing the page against that
  version, not by tracking each name individually.

**Values** — data a reader would copy into their own configuration, or budget against:
model ids, prices, context and rate limits, parameter defaults, availability dates.

- Must exist as a record in `data/`, carrying its source URL, verification date, and
  `volatility` (low/medium/high). Record-level volatility is the single source of
  truth from which page cadence is derived.
- May appear in prose only inside a marker block.

The test: _would a reader paste this into their own config or spreadsheet?_ If yes, it is
a value. If it is only the name of the thing being discussed, it is an identifier.

> Amended — see Amendments from seeds, F4, F13, F17.

### Making the lint decidable

Revision 1's lint tried to detect volatile numbers semantically, which is not
mechanically possible — no rule separates a context limit from an HTTP status code, an
RFC number, or "three evidence labels."

The lint is therefore **closed-world**: it does not attempt to recognize volatile values
in the abstract. It checks prose against the values the corpus _already knows about_ —
every value string in `data/` — and flags any occurrence outside a marker block. This is
lexical, decidable, and produces no false positives on ordinary numbers.

> Amended — see Amendments from seeds, F7, F11, F15, F17.

Catching values the corpus does _not_ yet know about is a semantic problem, and is
assigned to the Verify stage, where model judgment belongs. Division of labor:

- **Lint** — mechanical, closed-world, zero false positives, runs on every change.
- **Verify** — semantic, open-world, runs when a document is authored or refreshed.

This is the load-bearing correction in revision 2. It makes the invariant enforceable
without the suppression comments that would otherwise kill it.

### Marker blocks and code

Marker comments sit _outside_ fenced code blocks, so a generated region may contain a
complete fence, fences and all. The renderer replaces everything between the markers.

This resolves revision 1's contradiction, in which every page was required to carry a
runnable example while runnable examples necessarily contain values. A snippet containing
a model id is generated into the page from its data record like any other value-bearing
region.

> Amended — see Amendments from seeds, F3 (not implemented; deferred).

A code block outside a marker block must contain no known values, or the lint fails it.

## The document contract

### Front-matter

Required and lint-enforced: `title`, `summary`, `topic`, `verified` (date), `applies_to`
(version applicability), `sources`, `related`.

Optional: `research` (pointer to the grounding artifact) — required once the research
stage exists, omitted on hand-authored seeds; `seed: true` marks a document authored
before the pipeline existed.

**`volatility` is not a front-matter field.** Volatility is a property of a claim, not a
page. Revision 1 declared it per document, which both duplicated and could contradict the
per-record dates the ledger is built from. Page-level volatility is now _derived_ as the
maximum volatility of the records the page references, so there is exactly one source of
truth.

> Amended — see Amendments from seeds, F2 (limitation recorded; deferred), F18.

### Page template

1. **What this covers / who it's for** — two lines.
2. **The 60-second version** — one concrete example that runs. Beginner rung, before theory.
   _Amended — see Amendments from seeds, F1._
3. **How it actually works** — mechanics and the mental model.
4. **Patterns that hold up** — recipes, each carrying an evidence label.
   _Amended — see Amendments from seeds, F10._
5. **Edge cases and failure modes** — advanced rung.
6. **Where this rots** — which claims are volatile, which records back them, what to re-check.
7. **Proofs** — optional; present only where claims are backed by a runnable proof.
8. **Sources**

### Evidence labels

- **Verified** — established by a passing proof that ships with the corpus.
- **Documented** — vendor-stated in canonical documentation, with link and date.
  _Amended — see Amendments from seeds, F12._
- **Plausible** — community-reported, anecdotal, or inferred. Flagged as such; never
  written as confident prose.

**Public labels require public evidence.** A claim may only carry a label a reader can
check. This is why harvested session history cannot itself be a citation (see Harvest,
below).

### Source tiers

Research is breadth-first and latest-biased. Obscure sources are explicitly in scope,
because valuable practice often appears in a gist or forum thread long before any vendor
documents it. Tiering governs not what may be read but what a claim may become.

| Tier | Source                                                      | Ceiling without a proof |
| ---- | ----------------------------------------------------------- | ----------------------- |
| 1    | Vendor canonical documentation                              | Documented              |
| 2    | Papers, changelogs, official cookbooks, engineering blogs   | Documented              |
| 3    | Reputable practitioners, talks, well-documented open source | Plausible               |
| 4    | Gists, forums, threads, one-off repositories                | Plausible               |

Tier 1 reaches Documented, never Verified. Vendor documentation lags the product and is
sometimes wrong. No claim earns Verified merely by being written down.

### Proofs

A proof is the smallest runnable program that could falsify one claim. Its manifest
records the claim, its origin, its source tier, the command, the passing condition, and
the last run's result and date.

1. **Promotion** — a tier-3 or tier-4 claim enters as Plausible and is elevated to
   Verified by a passing proof, which is then cited in place of the original source.
2. **Executable freshness** — re-running a proof is deterministic and free of model
   judgment. Refresh re-runs proofs for a target, re-stamps those that still pass, and
   escalates only failures.

**Known limitation, accepted.** Proofs cover claims about mechanism — a flag exists, a
hook fires, an API rejects an input. They do not cover the corpus's most valuable claims,
which are comparative and qualitative: that a prompting pattern produces better results,
that a context strategy scales, that one model is stronger at a task than another. Those
claims stay at Documented or Plausible indefinitely, and the corpus should say so plainly
rather than manufacture false confidence. The promotion loop is expected to fire on a
minority of claims; it is worth having for that minority because those are exactly the
claims a reader would otherwise have to test themselves.

### Freshness ledger

Generated, never hand-maintained. Rebuilt from front-matter verification dates and data
record dates. Cadence by derived volatility: high 30 days, medium 90 days, low 270 days —
**initial guesses, to be tuned once real refresh cycles produce evidence.**

**Consumers of the ledger**, without which it is a file that rots:

1. The scheduled audit (sub-project 2) reads it to decide what to re-verify.
2. The static site (sub-project 5) renders per-page freshness banners from it.
3. The lint fails the build if any page is more than one full cadence past expiry, which
   forces expired content to be either refreshed or explicitly deprecated.

**Deprecation path.** A document that cannot be refreshed — the product changed beyond
recognition, the practice is obsolete — is marked `status: deprecated` with a one-line
reason and a pointer to its replacement. Deprecated pages stay readable, are excluded
from the ledger, and are never silently deleted.

## Pipeline (specified here, built in sub-project 2)

1. **Harvest** — mines installed skills and agents, session transcripts, and memory
   stores into a per-topic gap list: what the corpus should cover, and which claims are
   worth building a proof for.

   **Harvest is local-only and never a citation.** Its output is written to the
   gitignored `local/` tree and never committed. Session transcripts span healthcare,
   firm-confidential, and veterans'-claims work; running them toward a public site is a
   disclosure risk, and evidence a reader cannot inspect cannot support a public label
   anyway. Harvest therefore _points at what to prove_ — it does not itself license a
   Verified label. Anything it surfaces that is worth publishing must be re-established
   by a proof or a citable source.

2. **Research** — engineered prompts driving the dynamic-workflow deep-research skill,
   one run per topic. Prompts are per-archetype: tool reference, concept or technique,
   model facts, comparison, domain playbook. Each template specifies preferred and
   distrusted sources, citation format, an instruction to surface contradictions between
   sources rather than silently resolving them, and a mandate to flag uncertainty. Each
   run returns two artifacts: a narrative synthesis, and a structured block of values
   already shaped as data records.

3. **Write** — drafts against the page template, routing values into data records and
   leaving marker blocks in prose.

4. **Verify** — an adversarial gate that can block a draft. Confirms: every value carries
   source and date; every evidence label is justified by actual provenance; **no value
   the corpus does not yet track has been written bare into prose** (the open-world half
   of the lint); tier-3 and tier-4 claims have not been laundered into confident prose;
   contradictions are surfaced rather than hidden; no Verified label lacks a passing
   proof; **no content derived from private transcripts has entered a publishable
   document**; every snippet either runs or is promoted to a runnable artifact.

5. **Refresh** — accepts a topic, directory, file, or single data key. Re-runs proofs
   first, then re-verifies remaining expiring claims against recorded sources, producing
   a reviewable diff. Regenerates the ledger afterward.

## Deliverables for this sub-project

**Phase 1a — Provisional contract.** Rewrite the corpus instruction file _first_, marked
provisional, so that every session working in phases 1b onward is bound by this spec
rather than by the superseded conventions. Create the directory skeleton.

_Done when:_ the instruction file describes the layout, the identifier/value split, the
template, and the labels; and a session started cold follows it without being handed this
spec.

**Phase 1b — Seeds.** Five exemplar guides, one per research archetype, chosen to span
volatility profiles: an evergreen concept guide, a high-volatility model-facts page, a
Claude Code tool reference, a domain playbook, and a cross-model comparison. The
comparison seed is included specifically because it is the hardest and most volatile
archetype, and revision 1 would have left it unvalidated until sub-project 4. Plus one
proof carried end to end, demonstrating the promotion loop.

_Done when:_ five documents exist under the provisional contract, each with a populated
"Where this rots" section; every value in them has a data record; and the one proof runs
and passes from a clean checkout.

**Phase 1c — Codify.** Amend the contract with whatever the seeds proved wrong. Lock the
front-matter schema, page template, label and tier policy, data-record schema,
marker-block convention, proof manifest, and ledger rule.

_Done when:_ every amendment is recorded with the seed that motivated it.

**Phase 1d — Enforce.** One small CLI with three commands — `render` (expand marker
blocks), `lint` (closed-world value check, front-matter validation, expiry check), and
`ledger` (regenerate) — each with tests. The renderer is listed first because revision 1
omitted it entirely while making it load-bearing.

_Done when:_ all three commands run clean on the five seeds, and the test suite covers at
least one deliberate violation of each lint rule.

**Phase 1e — Reconcile.** Fix the seeds against the now-enforced contract. This phase
exists because the lint is guaranteed to find violations in documents written before it,
and revision 1 left that work unlisted.

_Done when:_ the full tool runs clean, and the instruction file loses its provisional
marker.

## Non-goals

No static site. No pipeline skills. No breadth beyond the five seeds. The toolchain is
built in sub-project 2 against a contract that five real documents have stress-tested.

## Risks

- **The contract is wrong in ways five seeds do not reveal.** Mitigated by treating 1c as
  a genuine amendment step and keeping lint rules few enough to change cheaply.
- **The promotion loop rarely fires**, because most valuable claims are not mechanically
  provable. Accepted and documented above rather than mitigated.
- **Proof maintenance becomes its own burden.** Mitigated by keeping each proof minimal
  and single-claim; a failing proof is itself the signal worth having.
- **The closed-world lint misses values the corpus has never seen.** This is by design;
  the open-world half is Verify's job, and it is model judgment rather than a guarantee.

## Open questions

- What runs the scheduled audit — a cron'd cloud session, a local loop, or manual
  invocation? Decided in sub-project 2; it determines whether the freshness machinery is
  real or decorative.
- Does the identifier/value split hold for pricing tables and model-capability matrices,
  where nearly every cell is a value and the prose is scaffolding? The comparison seed in
  1b exists to answer this. _Answered — see Amendments from seeds, Open questions answered._

## Revision history

**Revision 2** — after adversarial review. Changes, each tied to a defect in revision 1:

| Change                                                                  | Defect it fixes                                                                                                |
| ----------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------- |
| Identifier/value split replaces "volatile facts never live in prose"    | Old rule forbade naming hook events; unenforceable and wrong                                                   |
| Closed-world lint against known data values                             | Old lint required semantic detection of volatility, not mechanically decidable                                 |
| Marker comments sit outside fenced code                                 | Old spec required a runnable example on every page while forbidding the values one contains                    |
| Renderer added as a first-class deliverable                             | Old spec made marker blocks load-bearing and shipped no generator                                              |
| Harvest demoted to gap-finder; local-only, gitignored; never a citation | Old spec ran private healthcare/CPA/veterans transcripts toward a public site with no redaction stage          |
| Public labels require public evidence                                   | A Verified label citing a private transcript is uncitable in public                                            |
| `volatility` derived, not declared                                      | Page-level field duplicated and could contradict per-record dates                                              |
| Instruction-file rewrite moved to phase 1a                              | It is the only artifact binding future sessions; writing it last left sessions bound by superseded conventions |
| Root-level tooling decision made explicitly                             | Inherited instruction file requires an explicit ask before adding it                                           |
| Fifth seed: cross-model comparison                                      | Hardest, most volatile archetype was otherwise unvalidated until sub-project 4                                 |
| Phase 1e (reconcile) added; acceptance criteria per phase               | Lint written after seeds will fail them; that work was unlisted, and "done" was undefined                      |
| Ledger consumers and deprecation path defined                           | A generated ledger with no consumer rots; un-refreshable docs had no end state                                 |
| Proof coverage limitation stated plainly                                | Promotion loop was presented as general when it applies to a minority of claims                                |
| Cadence numbers marked provisional                                      | A spec whose thesis is "never write a number from memory" asserted three unsourced ones                        |

## Amendments from seeds

Phase 1c. Five seed guides were written under the provisional contract — Task 11
`guides/context/context-management.md` (evergreen concept), Task 12
`guides/models/claude-models.md` (model facts), Task 13 `guides/claude-code/hooks.md`
(tool reference), Task 14a `guides/domains/software-engineering.md` (domain playbook),
Task 14b `guides/models/comparison.md` (cross-model comparison). They surfaced eighteen
findings. The Task 15 triage split them three ways: **(a)** implemented in the tool (Task
15a lint: commits `d73756a`, `aa22f57`; Task 15b render: commits `96d214b`, `bd7d3c6`),
**(b)** resolved by contract text in `CLAUDE.md` (Task 15c), **(c)** deferred to
sub-project 2. `CLAUDE.md` is the binding text; this section records why.

| #   | Finding                                                                                                                                                                                                                                                 | Seed(s)           | Disposition                                                                                                                                                                                                                                                                                                                                                                                                                                                                 |
| --- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| F1  | "One concrete example that runs" is ambiguous for an API-key-gated `curl` example and for a prompt sequence run against "your repository".                                                                                                              | 11; recurred 14a  | **(b)** `CLAUDE.md` "What 'runs' means": executable verbatim with only named substitutions; key-gated examples are syntax-checked, fail loudly and fetch volatile values at runtime; prompt sequences give exact prompts, a safe start state, a synthetic task, a human check and a discard path; running an example never makes a claim Verified.                                                                                                                          |
| F2  | Page volatility as the maximum of referenced records lets one incidental beta default force the shortest cadence on an evergreen page; the author deleted a useful value to avoid it.                                                                   | 11                | **(c)** Open: an aggregation or per-reference override. Interim, stated in `CLAUDE.md`: keep high-volatility values off concept pages and link the page that owns them.                                                                                                                                                                                                                                                                                                     |
| F3  | Spec claim not implemented: render cannot generate a code block that interpolates a value, so values inside code examples cannot be data-backed.                                                                                                        | 11; applied in 12 | **(c)** Open: templated snippets (placeholders inside fences that render substitutes and lint treats as covered). Interim: fetch values at runtime (the Models API in `claude-models.md` §2) or take them as input; fences must hold no known value.                                                                                                                                                                                                                        |
| F4  | The identifier/value boundary is unclear for version-like identifiers (`anthropic-version` header value, beta headers, dated tool type names) and for version gates; "would a reader paste this" is ambiguous for matcher values and decision keywords. | 11; 13            | **(b)** `CLAUDE.md` "Borderline kinds, decided": protocol version constants and dated names are identifiers; product versions go in `applies_to` and per-feature version gates are not enumerated; the tie-break test "is it a name or a magnitude?" is added.                                                                                                                                                                                                              |
| F5  | A `corpus:data` block cannot select one field of a row record, so an inline figure from a table row needs a second single-value record — a drift risk.                                                                                                  | 12                | **(c)** Open: a field-selecting `corpus:data` attribute. Interim: point prose at the table column or describe the relation without the figure; if essential, add a single-value record and list both under "Where this rots".                                                                                                                                                                                                                                               |
| F6  | Row records repeated every volatile string in `lint_literals`; nothing checked they agreed, so a refreshed field could silently drop out of lint.                                                                                                       | 12                | **(a)** Task 15a `lint_fields` (`d73756a`): the literal index includes the named fields' values; row records in `data/models.yaml` and `data/models-other.yaml` migrated with a proven-identical index. `aa22f57` adds `lint-fields-unknown` and `lint-fields-unindexable` so a misnamed or non-scalar field cannot silently lose coverage. `lint_literals` remains for fragments and identifier-embedded values.                                                           |
| F7  | The closed-world lint is corpus-global: generic display strings (`1M tokens`) recorded for one vendor false-positive on any page stating the same figure for another, attributed to the wrong record.                                                   | 12; recurred 14a  | **(a)** Task 15a `lint_scope` (`d73756a`): a scoped record is linted only on pages whose `topic` it lists; unscoped records stay global. `aa22f57` adds `lint-scope-unknown`. Existing seed records were not rescoped. `CLAUDE.md` states when to scope and the cost (an uncaught bare value on unlisted topics).                                                                                                                                                           |
| F8  | `corpus:table` rendered raw field names (`api_id`, `input_price`) as column headers.                                                                                                                                                                    | 12                | **(a)** Task 15b `headers=` (`96d214b`) with `render-headers-mismatch` when label and field counts differ. Both table seeds now use it.                                                                                                                                                                                                                                                                                                                                     |
| F9  | Render and the Prettier post-write hook disagreed about table padding and blank lines, so `render --write` followed by Prettier was not a fixed point.                                                                                                  | 12                | **(a)** Task 15b formatter-stable change detection (`96d214b`): `renderCorpus` compares normalised forms of terminated `corpus:table` content only. `bd7d3c6` pins that scope with a test and makes divider detection strict so an all-dash data row is not equated.                                                                                                                                                                                                        |
| F10 | "Each recipe carries an evidence label" gave no form for a recipe combining a documented fact with the author's inference; authors split labels ad hoc, and one inference sat under Documented.                                                         | 12; recurred 14a  | **(b)** `CLAUDE.md` "Evidence labels": one `Evidence:` line per recipe that labels each part separately; an inference never sits under Documented because the fact it follows from is documented.                                                                                                                                                                                                                                                                           |
| F11 | Under global lint, generic figures ("30 seconds", "600") could only be recorded as long context-bound phrases, so the bare form on the same page is not caught: coverage or precision, not both.                                                        | 13                | **(a)** Same tool change as F7 (`lint_scope`, `d73756a`, `aa22f57`), which removes the forced trade-off for new records. **(b)** `CLAUDE.md` documents when to choose context-bound `lint_literals` versus scoping. The hooks records keep their phrases.                                                                                                                                                                                                                   |
| F12 | `CLAUDE.md` defined Documented as vendor canonical documentation only, while the tier table lets tier 2 reach Documented; a guide redefined the label locally.                                                                                          | 14a               | **(b)** `CLAUDE.md` "Evidence labels": Documented = stated by a tier 1 or tier 2 source, linked and dated, with a tier 2 study's scope stated where cited; guides never redefine a label. The software-engineering page's local redefinition was already replaced in its fix round.                                                                                                                                                                                         |
| F13 | Dated empirical results (a measured slowdown percentage) are neither identifiers nor values; the contract had no category.                                                                                                                              | 14a               | **(b)** `CLAUDE.md` "Borderline kinds, decided": inline citation with scope and date, no data record, and a dated-studies paragraph in "Where this rots".                                                                                                                                                                                                                                                                                                                   |
| F14 | Safety-relevant identifiers (which commands a mode auto-approves) cannot be flagged for priority re-checking; they share the page-level refresh of cosmetic identifiers.                                                                                | 14a               | **(c)** Open: a priority marker the refresh stage reads. Interim: list them first in "Where this rots" with why they matter.                                                                                                                                                                                                                                                                                                                                                |
| F15 | Model ids are values, so prose links to per-model vendor pages (URLs contain the id) and record keys embedding an id tripped bare-value lint.                                                                                                           | 14b               | **(a)** Task 15a URL exclusion (`d73756a`; narrowed in `aa22f57` to real link destinations, autolinks and bare URLs, keeping link text, titles and code calls scanned). **(b)** Key spelling rule in `CLAUDE.md`: record keys must not embed a value verbatim.                                                                                                                                                                                                              |
| F16 | Table rows followed data-file load order with no ordering control, so Anthropic rows rendered last in the cross-vendor table.                                                                                                                           | 14b               | **(a)** Task 15b `sort=field` / `sort=-field` (`96d214b`); `bd7d3c6` adds `render-sort-unknown` for a malformed sort or one naming a field no selected row has.                                                                                                                                                                                                                                                                                                             |
| F17 | Some values are unlintable: under `MIN_LITERAL_LENGTH` (a two-character context length), or embedded in an identifier (a parameter count inside a model name).                                                                                          | 14b               | **(b)** `CLAUDE.md` "Values lint cannot guard": still values (record plus marker); values below `MIN_LITERAL_LENGTH` are dropped from the literal index automatically (no configuration); an identifier-embedded value in a row record is omitted from that row's `lint_literals`; `lint: false` is reserved for single-value records whose only literal is a generic token that would collide with ordinary prose; each is named in "Where this rots" for manual re-check. |
| F18 | Shared row records cannot hold page-specific annotations (reused Claude rows have empty notes); and lint does not scan front-matter, so value-bearing URLs in `sources` pass by accident of implementation.                                             | 14b               | **(b)** `CLAUDE.md` makes the front-matter exemption a rule (URLs in `sources` may contain ids; front-matter must not carry values otherwise) and states that page-specific annotations go in prose beside the table, with reused rows gaining fields or tags only.                                                                                                                                                                                                         |

### Other contract text changed in Task 15c

Not findings, but corrections made while codifying against the code:

- The provisional `npm test` line (`node --test tools/corpus/test/`) did not match
  `package.json`; the real script is `node --test "tools/corpus/test/**/*.test.mjs"`.
- `render` without `--write` exits 0 while pages are pending; the output, not the exit
  code, shows pending renders. Now stated.
- Every lint and render rule name, the record field set, the table attributes, the proof
  manifest fields and the domain-playbook inner shape (from Task 14a) are now written
  into `CLAUDE.md`.
- Record `volatility` is not validated; a misspelling can crash `lint` and `ledger`.
  Documented as a limitation; not changed (Task 15c changes no tool code).

### Open questions answered

- **Does the identifier/value split hold?** Yes. The hooks seed (Task 13), the densest
  identifier page, raised no lint issue on any hook event, field or identifier; the
  borderline calls it needed are now the "Borderline kinds" table.
- **Does it survive a mostly-table page?** Mostly yes (Task 14b, analysed in
  `comparison.md` §6). Row records carried a five-vendor table with shared Claude rows
  and no tooling change; model names stayed identifiers and ids, limits, prices,
  parameter counts and licences stayed values. It fought in eight places, each now
  dispositioned: field semantics across record files (contract text: aligned fields,
  separate columns, blanks), values in conceptual prose (F5, deferred), short and
  identifier-embedded values (F17), licence names straddling identifier/value (treated
  as values; scope if they collide, F7), row order (F16), unit conventions and blank
  cells (record-file comment convention), keys and URLs carrying values (F15), and
  front-matter not scanned (F18).
