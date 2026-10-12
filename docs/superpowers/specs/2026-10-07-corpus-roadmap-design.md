---
title: Corpus Roadmap — Design
date: 2026-10-07
status: draft
---

# Corpus Roadmap — Design

How `llm-guides` grows from five pages to comprehensive coverage of practical LLM
and agentic engineering, weighted toward the three major providers, without
breaking the freshness promise that is the corpus's entire reason to exist.

This is sub-projects 3 and 4 of the foundation spec
(`2026-09-16-llm-corpus-foundation-design.md:50-51`), re-scoped against what the
owner actually wants the corpus to be. It is a design, not an implementation
plan; the plan follows separately.

## The decision that drives everything

The owner's scope decision, taken in brainstorming on 2026-10-07:

> Focus on major AI providers — OpenAI, Anthropic, Google. The bulk of the
> content covers those, with dedicated pages for smaller providers and local
> LLMs.

This supersedes `CLAUDE.md`'s "Claude-first depth today, with a documented recipe
for expanding to other models and domains on demand." That line is a contract
statement and amending it is a contract change (see "Contract changes").

The corpus becomes **provider-weighted, not Claude-first and not fully
vendor-neutral**: concepts are written so they hold across providers, mechanisms
are documented where they are actually documented, and the three majors get
depth that smaller providers and local inference do not.

## The constraint that shapes everything

The corpus's distinguishing promise is that every page states when it was last
checked and every figure carries the date it was read. One person pays that bill
on a schedule, forever. The owner's stated budget is **~4 hours per month**,
about 48 hours a year.

### Cost model

**Assumptions, explicitly labelled.** No refresh has been timed. These numbers
are estimates and the design should be re-examined once three or four real
refresh cycles have been measured:

- A hosted-provider facts refresh (re-reading every row against vendor pages,
  then working section 6 on each page in the unit): **~2.5 h**.
- An open-weight facts refresh (model cards, no prices): **~1 h**.
- An evergreen concept page refresh (re-check the `applies_to` identifiers still
  exist; no records to verify): **~0.25 h**.

Cadence is fixed by `CADENCE_DAYS` in `tools/corpus/ledger.mjs`: high 30 days,
medium 90, low 270. A page referencing no records derives `volatility: null` and
falls to the low cadence.

| Layer                         | Volatility | Refreshes/yr | Cost/yr   |
| ----------------------------- | ---------- | ------------ | --------- |
| Hosted majors unit            | high       | 12           | ~30 h     |
| Open-weight unit              | medium     | 4            | ~4 h      |
| Evergreen concept pages (~28) | low        | 1.35 each    | ~10 h      |
| **Total**                     |            |              | **~44 h** |

That fits 48 h with roughly four hours of margin. The margin is the point: it is what absorbs a
provider restructuring its documentation, or a page needing an unscheduled
correction.

### Why page count is not the cost driver

A refresh unit is a page **plus every page sharing one of its records**, closed
transitively (`CLAUDE.md`, "Refresh units and the one-writer ledger"). The
existing `comparison.md` and `claude-models.md` already share Anthropic rows and
are therefore already one unit.

The consequence is the central economic fact of this roadmap: **a page that
renders records an existing unit already carries is nearly free.** It adds
section-6 work to a refresh that was happening anyway. A page that introduces a
new record set creates a new twelve-times-a-year obligation.

So per-provider depth is cheap, and breadth of _values_ is expensive.

## The quarantine principle

**High-volatility values live only on the pages that own them under `providers`
and `models`.** Every concept
page is written free of data records and links to the provider page that owns the
figure.

This promotes `CLAUDE.md`'s F2 workaround ("Keep high-volatility values off
concept pages; link the page that owns them") from a footnote to the corpus's
organizing rule. It is what makes ~28 evergreen pages cost ~10 h/year instead of
~500 h/year: a single model price on a prompting page would put that page on a
30-day clock permanently.

Enforcement already exists and needs no new tooling: the closed-world lint flags
any known value appearing outside a marker block (`bare-value`), so a concept
page that acquires a figure fails the gate.

## Structure

### Topics

The taxonomy grows from eleven to fifteen. Each addition is a contract change
(see below).

| Topic                                                                                                               | Role                                                                                                          |
| ------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------- |
| `providers`                                                                                                         | **new.** Per-provider facts: lineups, ids, limits, prices, licences. The only topic carrying volatile values. |
| `evals`                                                                                                             | **new.** LLM-as-judge, regression testing, benchmark literacy, eval harnesses.                                |
| `multimodal`                                                                                                        | **new.** Images, video, audio, document and file handling.                                                    |
| `orchestration`                                                                                                     | **new.** Workflow and durable-execution engines; scheduling, queues, retries.                                 |
| `models`                                                                                                            | Cross-provider model concepts, including the hosted comparison.                                               |
| `prompting`, `context`, `agents`, `tools`, `harness`, `building`, `foundations`, `claude-code`, `cowork`, `domains` | Unchanged.                                                                                                    |

Only populated topics appear in navigation (static-site spec), so topics added
ahead of their content stay invisible until a page lands. Adding a topic is
therefore safe to do once, up front.

### Concept mapping

Every concept the owner named, mapped. No concept appears twice.

| Concept                    | Home                  | Notes                                                                      |
| -------------------------- | --------------------- | -------------------------------------------------------------------------- |
| Prompt engineering         | `prompting`           | Several pages; the largest evergreen area.                                 |
| Context engineering        | `context`             | Existing page is the seed.                                                 |
| Session management         | `context`             | Conversation state, compaction, memory across turns.                       |
| Skills                     | `agents`              | Capability packaging as a concept; Claude specifics stay in `claude-code`. |
| Hooks                      | `claude-code`         | A Claude Code mechanism; not a cross-provider concept.                     |
| Guardrails                 | `harness`             | `CLAUDE.md` already assigns guardrails to `harness`.                       |
| Evals                      | `evals`               | New topic.                                                                 |
| Long-running agentic loops | `harness`             | `harness` already owns long-running automation.                            |
| Harnesses                  | `harness`             | Comparative survey plus the concept page.                                  |
| Tools / tool use           | `tools`               | Existing topic.                                                            |
| APIs                       | `tools` + `providers` | Patterns in `tools`; per-provider API facts in `providers`.                |
| MCP servers                | `tools`               | Protocol names are identifiers, not values.                                |
| File usage                 | `multimodal`          | New topic.                                                                 |
| Images                     | `multimodal`          | New topic.                                                                 |
| Video                      | `multimodal`          | New topic.                                                                 |
| Multi-agent orchestration  | `agents`              | Agent-to-agent patterns, delegation, review loops.                         |
| Workflows                  | `orchestration`       | New topic.                                                                 |
| Temporal                   | `orchestration`       | Durable execution.                                                         |
| n8n                        | `orchestration`       | Low-code workflow automation.                                              |
| Hermes agent               | `agents`              | Nous Research; see "Evidence reality".                                     |
| Local LLMs                 | `providers`           | Running weights locally: Ollama, llama.cpp, vLLM.                          |
| Smaller providers          | `providers`           | Open-weight and second-tier hosted providers.                              |

### The open-weight split

`comparison.md` currently renders both `comparison-hosted` and
`comparison-open-weight` rows. Because a unit takes the maximum volatility of
anything it touches, the open-weight rows inherit the hosted 30-day clock.

**Split them.** The open-weight table moves to its own page under `providers`,
sharing no records with the hosted set. A released checkpoint is immutable and
open weights carry no prices, so those records are **medium**, not high: four
refreshes a year instead of twelve.

Cost: the single side-by-side view of hosted and open-weight models becomes two
tables on two pages. Accepted — the alternative is paying a 30-day clock for
facts that move on a 90-day timescale.

### The one page move

`guides/models/claude-models.md` → `guides/providers/anthropic.md`.

`comparison.md` stays in `models`: it is inherently multi-provider and belongs
with concepts rather than under any single provider.

This breaks the live URL `/guides/models/claude-models.html`. **Done now the cost
is near zero** — the site went live on 2026-10-07 and has no inbound links. Done
later, or never, the page stays permanently misfiled or needs meta-refresh
redirect machinery the static-site spec never asked for.

Touches: the page's own `research:` artifact reference, any `related:` entries
pointing at it (`verify` enforces `related-path-unresolved`), and
`meta/ledger.yaml`, which is regenerated on `master` after merge and never on a
feature branch.

## Contract changes requested

These require the owner's explicit approval; all were approved in brainstorming
on 2026-10-07 and are recorded here for the record.

1. **`CLAUDE.md`: "Claude-first depth today"** becomes provider-weighted
   coverage, with the three majors carrying the bulk and smaller providers and
   local inference getting dedicated pages. Cost if refused: orchestration,
   multimodal and non-Anthropic provider depth are all out of scope, and the
   corpus does not meet the owner's stated goal.
2. **`meta/taxonomy.yaml`: add `providers`, `evals`, `multimodal`,
   `orchestration`.** Cost if refused: four substantial subjects get buried in
   topics that do not describe them, which both hurts navigation and makes the
   corpus look like it lacks coverage it has.
3. **`CLAUDE.md`'s F2 note** is promoted from a known limitation's workaround to
   a stated organizing rule ("the quarantine principle"). No mechanism changes;
   the lint already enforces it.

No change is requested to the eight-part template, the marker-block mechanism,
the refresh pipeline, `CADENCE_DAYS`, or the gates.

## Staging

Each stage is independently shippable and leaves the corpus honest. Stages are
ordered by dependency and by evidence availability, not by subject size.

**Stage 0 — Structural.** Taxonomy additions, the `CLAUDE.md` amendment, the
open-weight split, the `claude-models.md` move. No new content. Ships the
structure every later stage depends on, and does the URL break while it is free.
Adds 0 h/yr.

**Stage 1 — The provider facts layer.** `providers/anthropic.md` (moved),
`providers/openai.md`, `providers/google.md` rendering existing
`comparison-hosted` rows; `providers/open-weight.md` from the split.
Establishes the quarantine target so every later page has somewhere to link.
Adds ~0 h/yr beyond today's unit cost, because these pages render records the
unit already carries; the open-weight page moves ~4 h/yr off the high clock.

**Stage 2 — The evergreen spine.** `prompting`, `context`, `agents`, `tools`.
The highest-value, lowest-volatility, best-sourced material, and the pages every
later topic references. ~12 pages, ~4 h/yr.

**Stage 3 — Engineering discipline.** `evals`, `harness` (guardrails,
long-running loops, harness survey). Depends on Stage 2's agent and tool
vocabulary. ~8 pages, ~3 h/yr.

**Stage 4 — Modality and orchestration.** `multimodal`, `orchestration`. Last
because evidence quality is most variable here and several subjects are
third-party products whose documentation the corpus does not control. ~8 pages, ~3 h/yr.

**Running total after Stage 4: ~44 h/yr against a 48 h budget** — 28 evergreen pages at ~0.3 h each (4 + 3 + 3 by stage), plus ~30 h for the hosted unit and ~4 h for the open-weight unit.

## Evidence reality

`CLAUDE.md`'s source tiers cap what each page may claim. Tier 1 and 2 reach
**Documented**; tier 3 and 4 reach **Plausible**; only a proof shipping in
`examples/` reaches **Verified**.

- **Strong (Documented throughout):** provider facts, tool use and MCP,
  multimodal input handling, Claude Code mechanisms. All have first-party vendor
  documentation.
- **Mixed:** prompting and context engineering. Vendor guidance exists and is
  tier 1, but much practitioner knowledge is tier 3 and must be labelled
  Plausible rather than written as confident prose.
- **Weak (largely Plausible):** multi-agent orchestration patterns, long-running
  loop design, harness comparison. These are mostly practitioner experience with
  little first-party documentation. The owner should know before writing them
  that these pages will rest substantially on inference.
- **Unverified, parked:** the **Hermes agent** (Nous Research,
  https://hermes-agent.nousresearch.com/). The owner supplied this URL; the page
  must be read and its tier assessed during research before any page is planned
  around it. It is not scheduled into a stage.

## Proof candidates

Mechanism claims that a small runnable program under `examples/` could falsify,
and should therefore be considered for Verified:

- Context-window and token-counting behaviour: a script that counts tokens and
  demonstrates truncation boundaries.
- Tool-use and MCP round trips: a minimal server plus a client call.
- Structured-output conformance: schema-constrained generation validated against
  the schema.
- Prompt-caching behaviour: cache hit and miss observable in response metadata.

Claims that cannot be proved this way, and must stay Documented or Plausible:
every comparative claim ("provider A is better at X"), harness ergonomics,
multi-agent design guidance, and anything about cost-effectiveness.

## Deliberately not doing

- **A page per provider for every provider.** Smaller providers share one page.
  Each additional provider with its own record set is a new recurring obligation.
- **Benchmark scores and leaderboards.** `CLAUDE.md` already forbids
  transcribing them; they are linked, never copied.
- **"Coming soon" pages or empty topics in navigation.** Settled in the
  static-site spec's "Deliberately absent"; only populated topics appear.
- **Difficulty-filtered browsing.** Settled; the ladder lives inside each page.
- **Raising `CADENCE_DAYS` for evergreen pages.** Considered and rejected for
  now: it would change a contract constant on an estimate. Revisit only if
  measurement shows the evergreen tail is the binding cost.
- **Framework tutorials** (LangChain, LlamaIndex and similar). High churn, well
  covered elsewhere, and a poor fit for a corpus promising dated accuracy.

## Risks

- **The cost model is estimated, not measured.** If a hosted refresh takes 5 h
  rather than 2.5 h, the budget is blown by Stage 2 and the roadmap must shrink.
  Mitigation: time the first three refreshes and revise before Stage 3.
- **Provider documentation restructuring.** A vendor reorganising its docs
  invalidates many `source` URLs at once. The refresh loop handles this as
  `changed` rather than `blocked`, but it is the most likely source of an
  expensive month.
- **Breadth pressure.** The temptation to add a provider or a framework "while
  we're here" is what converts a sustainable corpus into a stale one. Every
  addition must state its annual cost before it is accepted.

## Open questions

1. Should `providers` pages carry runtime-lookup recipes (an API call returning
   the current lineup) as their section 2, as `claude-models.md` does? It is the
   strongest hedge against staleness but costs a working example per provider.
2. Does `cowork` remain in the taxonomy? It has no pages and no stage here.
