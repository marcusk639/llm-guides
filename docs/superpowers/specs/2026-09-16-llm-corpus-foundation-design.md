---
title: LLM Corpus — Foundation Design
date: 2026-09-16
status: approved
scope: sub-project 1 of 5 (corpus foundation)
---

# LLM Corpus — Foundation Design

## Purpose

Establish the structural contract for a long-lived reference corpus on effective LLM
use: how a document is shaped, how a claim earns its confidence level, where volatile
facts live, and how staleness is detected. Content breadth and the authoring toolchain
are deliberately out of scope here — they depend on this contract and get their own
specs.

## Context and constraints

The corpus documents fast-moving external systems. Model ids, prices, context limits,
API parameters, CLI flags, and SDK signatures change on a timescale of weeks. A
wrong-but-plausible number is worse than no number. Every decision below follows from
that single hazard.

Decisions already settled with the project owner:

| Decision | Choice |
| --- | --- |
| Coverage model | Claude-first depth, plus a documented recipe for expanding to other models and domains on demand. Exhaustiveness lives in the recipe, not in pre-written pages. |
| Primary consumer | Human practitioner first; structured front-matter makes pages agent-consumable as a side effect. |
| Freshness mechanism | Generated freshness ledger, scheduled audit, and a refresh skill accepting a topic, directory, file, or single data key. |
| Authoring | A research-then-draft-then-verify pipeline, seeded by harvesting existing session history and memory, with parallel cluster runs for breadth. |
| Distribution | Eventually a published static site; sequenced as a separate sub-project downstream of this contract. |
| Tiering | Beginner/intermediate/advanced expressed as laddered sections within one document per topic. |
| Foundation approach | Seed exemplar documents first, then codify the contract from what worked. Harvested session evidence is an input, not the organizing principle. |

## Decomposition

This corpus is too large for one spec. Five sub-projects:

1. **Corpus foundation** — this document.
2. **Authoring and refresh toolchain** — harvest, research prompt library, write-guide, verify gate, refresh.
3. **Claude spine content** — the deep Claude, Claude Code, Cowork, and agentic-engineering core.
4. **Expansion** — cross-model comparison, Codex and other harnesses, domain playbooks.
5. **Static site** — renders front-matter, freshness banners, tier navigation, search.

## Architecture

### Directory layout

- `guides/` — prose, organized by topic.
- `data/` — volatile facts as structured YAML records, one per claim.
- `research/` — raw research output per topic, dated. The grounding layer.
- `examples/` — runnable artifacts: teaching examples and proofs, distinguished by a manifest field.
- `meta/` — taxonomy, generated freshness ledger, research prompt library.

This supersedes the current convention of root-level topic directories. Data, research,
and meta are peers of the content, not topics within it.

### Topic map

Under `guides/`: foundations, prompting, context, agents, claude-code, cowork, harness,
models, tools, building, domains.

`claude-code` is intentionally the largest (skills, hooks, subagents, slash commands,
MCP, settings, plugins, worktrees, instruction files). `harness` carries guardrails,
long-running automation, trust, and observability. `domains` ships with one exemplar
playbook and the generation recipe rather than many thin pages.

### The central rule: volatile facts never live in prose

A volatile fact is a model id, price, rate or context limit, parameter name or default,
CLI flag, or feature-availability statement.

Each such fact is a record in `data/` carrying its own source URL and verification date.
Prose pulls records in through a regenerable marker block, so a document still reads
correctly as standalone Markdown while remaining mechanically refreshable.

This yields a lintable invariant:

> A bare volatile number in prose is an error unless it sits inside a marker block or
> carries an inline verification date and source link.

The payoff is that refresh operates mostly on small, reviewable data diffs rather than
asking a model to rewrite paragraphs, where a silent regression is easy to miss.

## The document contract

### Front-matter

Required on every guide and enforced by lint: `title`, `summary`, `topic`,
`volatility` (low/medium/high), `verified` (date), `applies_to` (version
applicability), `sources`, `research` (pointer to the grounding artifact), `related`.

### Page template

One document per topic, laddered so a beginner stops early and an expert skims to the
bottom:

1. **What this covers / who it's for** — two lines.
2. **The 60-second version** — one concrete example that runs. Beginner rung, placed
   before any theory.
3. **How it actually works** — mechanics and the mental model.
4. **Patterns that hold up** — recipes, each carrying an evidence label.
5. **Edge cases and failure modes** — advanced rung.
6. **Where this rots** — which claims are volatile, which data records back them, what
   to re-check. Makes the freshness contract legible to the reader and gives refresh a
   precise target.
7. **Proofs** — optional; present only where claims are backed by a runnable proof.
8. **Sources**

### Evidence labels

- **Verified** — reproduced in a real session or established by a passing proof, with
  the evidence cited.
- **Documented** — vendor-stated in canonical documentation, with link and date.
- **Plausible** — community-reported, anecdotal, or inferred. Flagged as such; never
  written as confident prose.

### Source tiers

Research is breadth-first and latest-biased. Obscure sources are explicitly in scope,
because valuable practice often appears in a gist or forum thread long before any vendor
documents it. Tiering governs not what may be read but what a claim may become.

| Tier | Source | Ceiling without a proof |
| --- | --- | --- |
| 1 | Vendor canonical documentation | Documented |
| 2 | Papers, changelogs, official cookbooks, engineering blogs | Documented |
| 3 | Reputable practitioners, talks, well-documented open source | Plausible |
| 4 | Gists, forums, threads, one-off repositories | Plausible |

Tier 1 reaches Documented, never Verified. Vendor documentation lags the product and is
sometimes wrong. No claim earns Verified merely by being written down.

### Proofs

A proof is the smallest runnable program that could falsify one claim. Its manifest
records the claim, its origin, its source tier, the command, the passing condition, and
the last run's result and date.

Proofs serve two purposes:

1. **Promotion** — a tier-3 or tier-4 claim enters as Plausible and can be elevated to
   Verified by a passing proof, which is then cited in place of the original source.
2. **Executable freshness** — re-running a proof is deterministic and free of model
   judgment. It answers "does this still hold?" more reliably than re-reading
   documentation. Refresh therefore re-runs proofs for a target, re-stamps the ones that
   still pass, and escalates only failures for human attention.

Examples and proofs share one tree and are distinguished by a manifest field: examples
teach a reader how to do something; proofs establish whether a claim is true.

### Freshness ledger

Generated, never hand-maintained. Rebuilt from front-matter verification dates and
volatility plus data-record dates, so there is no second source of truth to drift.
Cadence by volatility: high 30 days, medium 90 days, low 270 days.

## Pipeline (specified here, built in sub-project 2)

1. **Harvest** — mine installed skills and agents, session transcripts, memory stores,
   and prior wiki state into a per-topic evidence inventory plus a gap list. The only
   stage that can license a Verified label from observation.
2. **Research** — engineered prompts driving the dynamic-workflow deep-research skill,
   one run per topic. Prompts are per-archetype, not per-topic: tool reference, concept
   or technique, model facts, comparison, domain playbook. Each template specifies
   preferred and distrusted sources, citation format, an instruction to surface
   contradictions between sources rather than silently resolving them, and a mandate to
   flag uncertainty. Each run returns two artifacts: a narrative synthesis and a
   separate structured block of volatile facts already shaped as data records.
3. **Write** — drafts against the page template using the harvest inventory and research
   artifact, routing volatile facts into data records and leaving marker blocks in prose.
4. **Verify** — an adversarial gate that can block a draft. Confirms every volatile
   claim carries source and date; every evidence label is justified by actual
   provenance; no bare volatile numbers sit outside marker blocks; tier-3 and tier-4
   claims have not been laundered into confident prose; contradictions are surfaced
   rather than hidden; no Verified label lacks harvested evidence or a passing proof;
   every snippet either runs or is promoted to a runnable artifact.
5. **Refresh** — accepts a topic, directory, file, or single data key. Re-runs proofs
   first, then re-verifies remaining expiring claims against recorded sources, producing
   a reviewable diff. Regenerates the ledger afterward.

## Deliverables for this sub-project

**Phase 1a — Seeds.** Four exemplar guides spanning volatility profiles: one evergreen
concept guide, one high-volatility model-facts page, one Claude Code tool reference, one
domain playbook. Plus one proof carried end to end, demonstrating the promotion loop
rather than assuming it.

**Phase 1b — Codify.** Lock the front-matter schema, page template, evidence-label and
source-tier policy, data-record schema, marker-block convention, proof manifest, and
ledger rule — amended by whatever the seeds proved wrong.

**Phase 1c — Enforce.** Two small scripts with tests: the lint and the ledger generator.
Then rewrite the corpus instruction file so every convention above binds future sessions.

## Non-goals

No static site. No pipeline skills. No breadth. The toolchain is built in sub-project 2
against a contract that four real documents have already stress-tested.

## Risks

- **The contract is wrong in ways four seeds do not reveal.** Mitigated by treating
  phase 1b as an amendment step rather than a formality, and by keeping the lint rules
  few enough to change cheaply.
- **Proof maintenance becomes its own burden.** Mitigated by keeping each proof minimal
  and single-claim, and by the fact that a failing proof is itself the signal worth
  having.
- **Marker blocks degrade readability on plain Markdown hosts.** Mitigated by generating
  real tables into the document body so the file reads correctly with no tooling.
