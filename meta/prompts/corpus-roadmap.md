# Prompt: build the corpus roadmap

Feed this to a planning model with repository access. It produces a staged
roadmap for growing `llm-guides` from five pages to a comprehensive corpus,
under the contract the repository already enforces.

---

You are planning the growth of a reference corpus on effective LLM use. The
owner wants it to cover the pragmatic best practices of the field end to end:
from a basic Q&A chatbot through to long-running agentic systems, including
every concept needed to actually build products, research and applications with
agentic AI.

Your deliverable is a **roadmap**, not content. Do not write guide pages.

<read_first>
Read these before planning anything, in this order. They are binding, and where
they disagree the earlier one wins:

1. `CLAUDE.md` — the corpus contract. Non-negotiable.
2. `docs/superpowers/specs/2026-09-16-llm-corpus-foundation-design.md` — why the
   corpus is shaped as it is.
3. `docs/superpowers/specs/2026-10-03-static-site-design.md` — the published
   site, including its "Deliberately absent" section.
4. `meta/taxonomy.yaml` — the eleven topics. This file is contract-governed.
5. `meta/ledger.yaml` — what exists today and when each page expires.
6. One seed guide of each archetype, listed in `CLAUDE.md`'s seed table.

Plan from what you read, never from recollection of how such repositories
usually work. This corpus has unusual rules and they are the point.
</read_first>

<ground_truth>
Measured in the repository, not estimated. If your own reading disagrees with
any line here, say so explicitly and trust the repository.

- 11 topics in `meta/taxonomy.yaml`; **4 are populated**, 7 are empty.
- **5 guide pages** exist: claude-code 1, context 1, domains 1, models 2.
- **27 data records**: 16 `high` volatility, 11 `medium`, 0 `low`.
- `CADENCE_DAYS = { high: 30, medium: 90, low: 270 }` (`tools/corpus/ledger.mjs`).
- Page cadence is the **maximum** volatility of any record it references, so one
  incidental high-volatility value puts a whole page on a 30-day clock.
- Today 2 pages are on the 30-day cadence and 3 on the 90-day cadence.
- Every page that is not `seed: true` must name a `research:` artifact, enforced
  by `corpus verify` as `research-required`.
- A refresh unit is a page **plus every page sharing one of its records**, closed
  transitively: one unit, one branch, one pull request.
  </ground_truth>

<the_hard_problem>
Two constraints decide this roadmap. Address both explicitly and early; a plan
that lists desirable pages without resolving them is a wish list, not a plan.

**1. The topic list does not fit the taxonomy.** The owner named, among others:
prompt engineering, context engineering, skills, hooks, guardrails, evals,
long-running agentic loops, session management, tools, APIs, MCP servers, file
handling, images, video, multi-agent orchestration, workflow engines, Temporal,
n8n, Hermes, and harnesses. The taxonomy has eleven slugs. For every named
concept, decide one of:

- it is a page inside an existing topic (name the topic and the file path);
- it is a section inside a page that already exists or that you are proposing;
- it requires a **new topic**, which is a contract change under `CLAUDE.md` and
  must be raised for the owner's decision, never assumed.

Produce this as a complete mapping table. Every concept the owner named appears
in it exactly once, including ones you recommend against covering.

**2. Freshness cost is the real budget.** This corpus's distinguishing promise
is that every page states when it was last checked and every figure carries the
date it was read. That promise is paid for on a schedule, by one person. A page
on the 30-day cadence must be re-verified against live vendor sources twelve
times a year, and refresh units group pages that share records, so related pages
refresh together whether or not you wanted them to.

For each stage of your roadmap, state the **annual refresh load it adds**: pages
added, their expected volatility, and the resulting re-verification events per
year. If a stage pushes the total beyond what one maintainer can sustain, say
so and cut it. A page that silently goes stale is worse than a page that was
never written — that premise is the reason this repository exists.

State your assumed per-refresh effort and label it an assumption; you have no
measurement for it.
</the_hard_problem>

<requirements>
The roadmap must contain, in this order:

1. **The mapping table** from `the_hard_problem` item 1.
2. **Contract changes requested** — every new topic, every change to a
   contract-governed file, each with the argument for it and what it costs if
   refused. Empty is a valid and welcome answer.
3. **Stages.** Each stage is independently shippable and leaves the corpus
   honest. For each: the pages it adds (exact paths), what each page is for in
   one line, the archetype from `CLAUDE.md`'s seed table it follows, its
   expected volatility, its refresh-unit membership, and the annual refresh load
   the stage adds.
4. **Sequencing rationale** — why this order. Prefer ordering by dependency
   (a concept other pages must reference comes first) and by evidence
   availability, not by the owner's enthusiasm or by topic size.
5. **Evidence reality per concept.** Using `CLAUDE.md`'s source tiers, state for
   each proposed page what the best available sources are and therefore the
   **ceiling on its claims**. Vendor documentation reaches Documented; a
   practitioner blog reaches Plausible; only a proof shipping in `examples/`
   reaches Verified. Name the pages that will be mostly Plausible — that is a
   legitimate outcome, but the owner must know which parts of the corpus rest on
   inference before committing to write them.
6. **Proof candidates.** Which mechanism claims could be falsified by a small
   runnable program under `examples/`, and which could not. Comparative and
   qualitative claims cannot; do not pretend otherwise.
7. **Deliberately not doing** — with reasons. Include anything the specs already
   rejected, so a future reader does not re-propose it.
8. **The first pull request**, concretely: which page, which records, which
research artifact, which gates must pass.
9. **Hermes AI Agent** - refers to https://hermes-agent.nousresearch.com/
</requirements>

<constraints>
- Do not propose anything in a spec's "Deliberately absent" list. Read those
  sections; re-proposing a settled rejection wastes the owner's time.
- Do not propose a "coming soon" page, a stub, or an empty topic in navigation.
  Only populated topics appear; advertising absent coverage is the overclaiming
  failure this project is built to avoid.
- Do not propose restructuring `guides/`, the eight-part page template, the
  marker-block mechanism, or the refresh pipeline. They are settled. If one
  genuinely blocks the roadmap, raise it as a single flagged question.
- Do not put volatile values in your plan. Name the record keys a page will need
  instead. You are planning, and a figure written here rots unverified.
- Keep high-volatility values off evergreen concept pages. Link the page that
  owns them. A single model price on a prompting-concepts page puts that page on
  a 30-day clock forever.
- Assume one maintainer with finite attention and no deadline pressure. Breadth
  that cannot be kept fresh is a liability, not an asset.
</constraints>

<uncertainty_handling>
This matters more than usual here.

- Several named items are products whose current state you may not reliably
  know, Do not guess. For any product
  you cannot pin to a citable current source, say "unverified: needs a source"
  and place it in a parking list rather than a stage. Ask for clarification if necessary.
- Never state a version, price, limit or capability from memory. If a plan item
  depends on such a fact, write the record key that will hold it and mark the
  fact as "to be read from source during research".
- Where you are inferring rather than reading, say which. "I did not find X in
  the repository" is a useful sentence; a confident wrong mapping is not.
- If the repository contradicts anything in `<ground_truth>`, report the
  contradiction rather than silently reconciling it.
  </uncertainty_handling>

<output_format>
Markdown. Lead with a **Decisions needed from the owner** section of at most
five bullets — the contract changes and any genuine fork in the road — because
that is the only part requiring a human before work can start. Then the eight
numbered sections from `<requirements>` in order.

Tables for the mapping and the stages. Prose for the rationale. No preamble, no
restatement of this prompt, no closing summary.

Target 1,500–2,500 words. If the mapping table alone exceeds that, keep the
table complete and compress the prose — completeness of the mapping matters
more than length.
</output_format>

<self_check>
Before returning, verify each of these and fix what fails:

- Every concept the owner named appears exactly once in the mapping table.
- Every proposed page has a path, an archetype, an expected volatility and a
  refresh-unit assignment.
- Every stage states its added annual refresh load, and the running total is
  stated somewhere.
- No volatile value appears anywhere in the plan.
- Nothing proposed appears in a spec's "Deliberately absent" list.
- Every new topic is flagged as a contract change in the decisions section.
- Every product you could not verify is in the parking list, not a stage.
- You have named at least one thing you recommend **not** doing, and why.

A plan that cannot be executed without further decisions is fine, provided those
decisions are listed at the top. A plan that hides its decisions is not.
</self_check>
