# Model matrix expansion — design

Date: 2026-10-02
Status: design, awaiting owner review
Supersedes: nothing. Extends `docs/superpowers/specs/2026-09-16-llm-corpus-foundation-design.md` (revision 2) as amended by `CLAUDE.md`, which wins on any conflict.

## 1. Intent

Cover every actively supported model from each AI provider, each carrying its
strengths, weaknesses, pros, cons and use cases — without weakening the
corpus's one real promise, that no reader ever copies a wrong-but-plausible
number.

The agreed reader model is **two jobs, served in layers on one page**:

- *Choose a model for a task.* "Long agentic coding run", "cheap high-volume
  classification" — which model, and why that one.
- *Look up a model I am pinned to.* "I call Claude Opus 5 in production; is it
  still supported, what replaced it, when does it die."

Success criterion: a reader can answer either question, and every figure they
copy out is one a named vendor published on a stated date.

## 2. Why this needs a design rather than page work

The arithmetic forces it. Anthropic's pricing page alone still rates nineteen
models. Across Anthropic, OpenAI, Google, Meta and Qwen the set is plausibly
60–100 records. Every model record is `high` volatility, and one `high` record
sets its whole page to the 30-day cadence in `CADENCE_DAYS`.

The corpus currently tracks fourteen such records. The first hand-driven refresh
of them, on 2026-10-02, returned `verdict: blocked` — four records could not be
confirmed, and a blocked unit writes nothing at all. Scaling that unit to six
pages and 60–100 records without changing its shape would mean a corpus whose
freshness machinery can never close.

So the central design question is not how to write the pages. It is how to keep
the refresh unit small while the corpus gets large.

## 3. Decisions taken

| # | Decision | Rationale |
| --- | --- | --- |
| D1 | Two reader jobs, served in layers on a single page per provider | Both readers exist; splitting them across pages duplicates the authoring surface and the model names |
| D2 | One page per provider, not one per model and not one combined page | Matches the existing `guides/<topic>/<subject>.md` convention. One page per model would mean 60–100 copies of the eight-part template and contradicts the corpus's own precedent, where `domains` ships one exemplar plus a recipe rather than many thin pages |
| D3 | Each provider page renders its own vendor's value tables | Keeps every figure on the page the reader is already reading; no hop |
| D4 | `comparison.md` becomes prose-only and leaves the unit graph | This is what makes D3 affordable. See section 5 |
| D5 | Inclusion is a per-provider rule, declared on the page and sourced | Providers share no lifecycle vocabulary; a single uniform rule would be a fiction. See section 7 |
| D6 | Qualitative claims ceiling at **Documented** or **Plausible** | They are comparative and unfalsifiable by a shipped proof. No benchmark scores are transcribed |
| D7 | v1 is the five providers whose records already exist, plus a written recipe for adding a sixth | Every new provider is a new unit, new records and new sources; v1 builds only on records already under refresh |

## 4. Topology

```
guides/models/
  claude-models.md   Anthropic    values + entries   30d   unit A
  openai.md          OpenAI       values + entries   30d   unit B   (new)
  google.md          Google       values + entries   30d   unit C   (new)
  open-weights.md    Meta, Qwen   values + entries   30d   unit D   (new)
  comparison.md      methodology  no records        270d   no unit
```

`claude-models.md` already is the Anthropic provider page; it is extended, not
replaced. Three pages are new.

## 5. The unit shape, which is the point of the design

A refresh unit is a page plus every page sharing one of its records, closed
transitively. Today `claude-models.md` and `comparison.md` share the Claude rows,
so they are one unit and one pull request.

If provider pages rendered values *and* `comparison.md` kept its cross-vendor
table, every provider page would share records with `comparison.md` and all six
pages would collapse into a single unit. Because any one `unreachable` record
forces `verdict: blocked`, and a blocked unit writes nothing, one dead vendor URL
would freeze freshness for every provider simultaneously.

Making `comparison.md` prose-only breaks that chain. The result is four
independent units, one per provider:

- a blocked OpenAI source blocks `openai.md` only;
- each unit is one branch and one pull request, scoped to one vendor's docs;
- this is **better than the status quo**, where the two model pages are already
  coupled for no benefit.

What `comparison.md` keeps: the cross-vendor methodology that is its durable
content and does not rot on a vendor's release schedule — the field-alignment
convention ("Context is not one column across vendors"), the runtime-lookup
scripts in section 2, tier mapping across vendors, and the blank-cell rule that
a blank cell is a claim the vendor states nothing and may never be filled by
arithmetic.

What it loses: the rendered cross-vendor table, and with it the corpus's worked
example of `sort=` over records shared across files. `CLAUDE.md` lists
`guides/models/comparison.md` as the seed for the "cross-model comparison"
archetype, so **this decision changes a declared archetype** and the seed table
in `CLAUDE.md` must be updated in the same change. That is the single largest
cost in this design and it is deliberate.

## 6. The per-model entry shape

Fixed, so the pages stay comparable and a refresh knows what to re-read. One
subsection per model, under the page's section 4.

```
### <Model name>                     name only; the API id is a value, never written here
**What it's for** — the vendor's own positioning, quoted, linked, with the date read
**Strengths** — 2–4 bullets, each carrying its own Evidence label
**Limits** — 2–4 bullets, each carrying its own Evidence label
**Reach for it when / avoid it when** — the use-case pair, one line each
**Lifecycle** — the vendor's stated state and retirement date, where it publishes one
```

Figures are not repeated in the entry. They are in the page's own rendered table,
a few screens up.

### The constraint that makes this safe

Model **names** are identifiers and may be written freely in prose. Model **ids**,
prices, limits and parameter counts are **values**: they may appear in a guide body
only inside a marker block, backed by a `data/` record.

So an entry never writes `claude-opus-5-5`. It writes "Claude Opus 5.5" and relies
on the page's table for the id.

For tracked models the lint enforces this for free — a tracked id written bare in
prose is a `bare-value` failure. For a model with no record the lint is blind,
because it is closed-world by design. Every provider page therefore lists "ids of
models this page describes but does not tabulate" under section 6 as a value the
lint cannot guard, exactly as the contract requires.

## 7. Inclusion rule, per provider

Each page states its own test, in its own section 6, with the page it is read from:

| Provider | A model is in scope when | Read from | Pinned? |
| --- | --- | --- | --- |
| Anthropic | Its lifecycle state is not `Retired` | `https://platform.claude.com/docs/en/about-claude/model-deprecations` | yes, read 2026-10-02 |
| OpenAI | It is listed on the current models index | `https://developers.openai.com/api/docs/models` | yes, read 2026-10-02 |
| Google | It is listed as an available Gemini API model | the Gemini API models list | **no** — not read for this design; pin the URL during implementation |
| Meta, Qwen | The owning organisation still publishes the weights repository | the owning org's Hugging Face listing | **no** — not read for this design; pin both URLs during implementation |

The two unpinned rows are deliberately marked rather than guessed. Writing a URL
into a spec without having opened it is the failure this corpus exists to prevent,
and the implementation plan's first task is to pin them.

Two consequences the spec accepts openly. The rules are not equivalent — an
Anthropic `Legacy` model is in scope while a quietly unlisted OpenAI model is
not — and each rule is itself a volatile fact, so each is a named re-check item
in its page's section 6.

## 8. Evidence discipline

Strengths, weaknesses and use cases are comparative and qualitative. Nothing in
them can reach **Verified**, because the contract reserves that for a claim
established by a proof that ships under `examples/`, and no runnable program
falsifies "good at long-horizon work". The spec states this once so no page has
to re-argue it.

- **Documented** — the vendor's own description of its own model, linked, with
  the date read. This is the ceiling for a vendor positioning claim.
- **Plausible** — practitioner inference, community report, or the corpus
  author's own judgement, flagged as such.

A bullet mixing the two labels each part separately on one `Evidence:` line, as
the contract requires. An inference does not inherit a **Documented** label from
the fact it follows from.

**Benchmark scores are linked, never transcribed.** This is already contract. It
matters more here than anywhere else in the corpus, because a strengths list is
exactly where a leaderboard number is most tempting and where it would rot
fastest and least visibly.

## 9. What changes in files that already exist

| File | Change |
| --- | --- |
| `guides/models/claude-models.md` | Gains per-model entries for every in-scope Anthropic model; keeps both existing tables |
| `guides/models/comparison.md` | Loses its two rendered tables and the records they select; section 6 rewritten to claim no records; keeps methodology, scripts and the blank-cell rule |
| `CLAUDE.md` | Seed archetype table updated: `comparison.md` is no longer the "cross-model comparison" seed carrying shared row records. The directory-layout section gains the three new pages |
| `data/models-other.yaml` | Split per provider, so each unit's data footprint is one file |
| `meta/taxonomy.yaml` | No change. `models` already exists |
| `meta/ledger.yaml` | Regenerated on `master` after merge only, per the one-writer rule |

### Data file split

Records move, keys do not change. `data/models-other.yaml` becomes
`data/models-openai.yaml`, `data/models-google.yaml` and
`data/models-open-weights.yaml`; `data/models.yaml` stays as Anthropic's.

Two units may legitimately share a data file, so this split is not required for
correctness. It is proposed because it makes each unit's footprint obvious and
removes the only remaining reason for two provider refreshes to touch one file.
The per-file convention comments at the top of `data/models-other.yaml` must be
carried into each new file, not dropped — a YAML round trip would strip them.

### Research artifacts

`openai.md`, `google.md` and `open-weights.md` are new and not seeds, so
`corpus verify` requires a `research:` artifact for each
(`research-required`). These are initial research runs under `research/models/`,
not refresh artifacts; `research:` has one meaning, the page's current grounding,
whichever stage produced it.

## 10. Freshness consequences

- Four independent units, each one vendor, each on the 30-day cadence.
- Qualitative prose sits on the same page as that provider's values, so it is
  re-read on the 30-day cycle mechanically. No procedural coupling is needed, and
  the "cadence understates qualitative rot" problem this design started with does
  not arise.
- `comparison.md` references no records, so it derives `volatility: null` and
  expires on the low cadence. That is correct: its content is methodology.
- Routine repricing does not need a full-unit run. `--key=<record.key>` narrows a
  run to one record and stamps records only, leaving page dates alone.

## 11. Risks, and what this design weakens

1. **The page date still asserts a lot.** A provider page's `verified` claims the
   whole of its section 6 was worked — every record, every identifier, every
   entry's strengths. On a nineteen-model Anthropic page that is a large claim to
   make honestly in one pass. Mitigation: the per-model entry shape is fixed, so
   section 6 can enumerate what must be re-read; a partial pass must leave the
   page date alone, as the 2026-10-02 lineup correction did.
2. **Untracked ids are invisible to the lint.** Section 6 names them. Author
   discipline and the verify agent are the only guards.
3. **Page size.** Nineteen entries plus two tables is a long page. If it becomes
   unreadable the fallback is to split by lifecycle — current models on the
   provider page, retired-but-served models on a second page — which would create
   a second unit per provider and should not be done pre-emptively.
4. **A declared archetype changes.** Covered in section 5. The corpus loses its
   worked example of records shared across files; the mechanism still exists and
   is still documented in `CLAUDE.md`, it just has no live seed.
5. **60–100 records is a lot of hand maintenance.** This design makes the burden
   divisible, not smaller. The real relief is sub-project 2's scheduled audit and
   making the adversarial review a gate rather than a documented step. Three
   adversarial reviews on 2026-10-02 each found a real defect that all four
   deterministic gates passed clean, which is the strongest available argument for
   fixing that before breadth grows.

## 12. Out of scope

- Mistral, DeepSeek, xAI, Amazon and any other provider without existing records.
  Section 6 of each page carries the recipe for adding one.
- Benchmark scores and leaderboard positions. Linked only.
- One page per model.
- Automation of the refresh cycle. Sub-project 2.
- Re-keying or repricing any record. This design adds pages and moves records
  between files; it changes no value.

## 13. Decisions the owner still needs to make

1. **Does `comparison.md` keep `seed: true`?** It is permanent provenance and a
   refresh never removes it, so it should stay — but the page is being
   substantially rewritten, and the owner may prefer it be re-grounded with a
   `research:` artifact instead.
2. **Is the data file split worth the churn?** It is optional for correctness.
3. **Does the Anthropic page carry all nineteen models in v1,** or only those not
   `Retired` *and* still priced, which is a smaller set?
