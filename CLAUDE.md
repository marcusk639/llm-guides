> **Provisional.** This file encodes `docs/superpowers/specs/2026-09-16-llm-corpus-foundation-design.md` (revision 2) before the seed guides have tested it. Amendments land in Task 15.

# CLAUDE.md

This file provides guidance to Claude Code when working with code and content in this repository.

## What this repo is

A long-lived reference corpus on effective LLM use: how a document is shaped, how a
claim earns its confidence level, where volatile facts live, and how staleness is
detected. Claude-first depth today, with a documented recipe for expanding to other
models and domains on demand.

## Directory layout

This supersedes the previous convention of root-level topic directories
(`prompting/`, `tools/`, `advanced/`, `api/`, `evals/`).

- `guides/` — prose, organized by topic.
- `data/` — volatile values as structured YAML records, one per fact.
- `research/` — raw research output per topic, dated. The grounding layer.
- `examples/` — runnable artifacts: teaching examples and proofs, distinguished by a
  manifest field.
- `meta/` — taxonomy (`meta/taxonomy.yaml`), the generated freshness ledger, and the
  research prompt library.
- `local/` — **gitignored.** Harvest output and anything derived from session
  transcripts. Nothing here may enter a committed document.

The eleven `guides/` topics, from `meta/taxonomy.yaml`: foundations, prompting,
context, agents, claude-code, cowork, harness, models, tools, building, domains.
`claude-code` is intentionally the largest. `harness` carries guardrails,
long-running automation, trust, and observability. `domains` ships with one exemplar
playbook plus the generation recipe rather than many thin pages.

## Root-level tooling

**This supersedes the prior convention that there are deliberately no repo-wide
build, lint, or test commands and that an explicit ask is required before adding
root-level tooling.** That ask has been made and answered: a corpus-wide lint,
renderer, and ledger generator are required, because the freshness guarantee is a
property of the corpus as a whole, not of any single document.

```bash
npm test      # node --test tools/corpus/test/
npm run lint    # closed-world value check, front-matter validation, expiry check
npm run render  # expand marker blocks
npm run ledger  # regenerate the freshness ledger
```

Individual examples under `examples/` keep their own self-contained manifests and
remain independently runnable; the root tool orchestrates them but does not replace
them.

## The central rule: identifiers vs. values

Every volatile fact is one of two kinds. This split is the corpus's core discipline —
apply it to every page.

**Identifiers** — names you must say to discuss the subject at all: hook event
names, tool names, parameter names, flag names, skill names, file names.

- Allowed freely in prose. No marker block, no data record.
- Governed by `applies_to` at the document level: the page states which product
  version it describes, and identifier drift is handled by refreshing the page
  against that version, not by tracking each name individually.

**Values** — data a reader would copy into their own configuration, or budget
against: model ids, prices, context and rate limits, parameter defaults,
availability dates.

- Must exist as a record in `data/`, carrying its source URL, verification date, and
  `volatility` (low/medium/high).
- May appear in prose only inside a marker block.

**The test: would a reader paste this into their own config or spreadsheet?** If
yes, it is a value. If it is only the name of the thing being discussed, it is an
identifier.

### Lint is closed-world

`npm run lint` does not try to recognize volatile values in the abstract — no rule
mechanically separates a context limit from an HTTP status code. It checks prose
against the values the corpus **already knows about** (every value string in
`data/`) and flags any occurrence outside a marker block. Catching values the corpus
does not yet track is a semantic problem and belongs to the Verify stage of the
authoring pipeline (model judgment), not to lint.

## Marker blocks

Marker comments sit **outside** fenced code blocks, so a generated region may
contain a complete fence, fences and all. `npm run render` replaces everything
between the markers. A code block outside a marker block must contain no known
values, or lint fails it.

```
<!-- corpus:data key=some.key -->
...generated content...
<!-- /corpus:data -->

<!-- corpus:table fields=a,b tag=sometag -->
...generated table...
<!-- /corpus:table -->
```

## The document contract

### Front-matter

Required and lint-enforced: `title`, `summary`, `topic`, `verified` (date),
`applies_to` (version applicability), `sources`, `related`.

Optional: `research` (pointer to the grounding artifact) — required once the
research stage exists, omitted on hand-authored seeds; `seed: true` marks a document
authored before the pipeline existed; `status` (e.g. `deprecated`).

**`volatility` is never a front-matter field.** Volatility is a property of a claim,
carried on the `data/` record that backs it (low/medium/high), not of a page.
Page-level cadence is _derived_ as the maximum volatility of the records the page
references — there is exactly one source of truth.

### Page template (eight parts)

1. **What this covers / who it's for** — two lines.
2. **The 60-second version** — one concrete example that runs. Beginner rung,
   before theory.
3. **How it actually works** — mechanics and the mental model.
4. **Patterns that hold up** — recipes, each carrying an evidence label.
5. **Edge cases and failure modes** — advanced rung.
6. **Where this rots** — which claims are volatile, which `data/` records back
   them, what to re-check.
7. **Proofs** — optional; present only where claims are backed by a runnable proof.
8. **Sources**

### Evidence labels

Exact casing, always one of:

- **Verified** — established by a passing proof that ships with the corpus.
- **Documented** — vendor-stated in canonical documentation, with link and date.
- **Plausible** — community-reported, anecdotal, or inferred. Flagged as such;
  never written as confident prose.

**Public labels require public evidence.** A claim may only carry a label a reader
can check — harvested session history is never itself a citation.

### Source tiers

Tiering governs not what may be read (obscure sources are explicitly in scope) but
what a claim may become.

| Tier | Source                                                      | Ceiling without a proof |
| ---- | ----------------------------------------------------------- | ----------------------- |
| 1    | Vendor canonical documentation                              | Documented              |
| 2    | Papers, changelogs, official cookbooks, engineering blogs   | Documented              |
| 3    | Reputable practitioners, talks, well-documented open source | Plausible               |
| 4    | Gists, forums, threads, one-off repositories                | Plausible               |

Tier 1 reaches Documented, never Verified — vendor documentation lags the product
and is sometimes wrong. No claim earns Verified merely by being written down;
Verified requires a passing proof that ships in the repo.

### Freshness ledger

Generated (via `npm run ledger`), never hand-maintained. Rebuilt from front-matter
`verified` dates and `data/` record dates. Cadence is derived from record
volatility, not declared per page.

## `local/` and privacy

`local/` is gitignored. It holds harvest output and anything derived from session
transcripts — those transcripts span healthcare, firm-confidential, and veterans'
claims work, so nothing derived from them may enter a committed document. Harvest
output points at what to prove; it does not itself license a Verified (or any
public) label. Anything it surfaces that is worth publishing must be re-established
by a proof or a citable public source before it reaches `guides/`.
