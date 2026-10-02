# Model matrix expansion — design

Date: 2026-10-02 (revision 3, after a second plan review)
Status: design, awaiting owner review
Extends `docs/superpowers/specs/2026-09-16-llm-corpus-foundation-design.md` (revision 2) as amended by `CLAUDE.md`, which wins on any conflict.

Revision 2 responds to a plan review of revision 1. It adds the tag design that
revision 1 omitted (section 6), phases the delivery (section 12), lets the entry
shape degrade when a vendor publishes no positioning (section 7), defines done per
page (section 11), and resolves the three decisions revision 1 left open
(section 16).

## 1. Intent

Cover every actively supported model from each AI provider, each carrying its
strengths, weaknesses, pros, cons and use cases — without weakening the corpus's
one real promise, that no reader ever copies a wrong-but-plausible number.

Two reader jobs, served in layers on one page per provider:

- *Choose a model for a task.* "Long agentic coding run", "cheap high-volume
  classification" — which model, and why that one.
- *Look up a model I am pinned to.* "I call Claude Opus 5 in production; is it
  still supported, what replaced it, when does it die."

Success criterion: a reader can answer either question, and every figure they copy
out is one a named vendor published on a stated date.

## 2. Why this needs a design rather than page work

Anthropic's pricing page alone still rates nineteen models. Across Anthropic,
OpenAI, Google, Meta and Qwen the set is plausibly 60–100 records. Every model
record is `high` volatility, and one `high` record sets its whole page to the
30-day cadence in `CADENCE_DAYS`.

The corpus tracks fourteen such records today. The first hand-driven refresh of
them, on 2026-10-02, returned `verdict: blocked`: four records could not be
confirmed, and a blocked unit writes nothing at all. Scaling that unit to six pages
and 60–100 records without changing its shape gives a corpus whose freshness
machinery can never close.

The design question is therefore not how to write the pages. It is how to keep the
refresh unit small while the corpus gets large.

## 3. Decisions taken

| # | Decision | Rationale |
| --- | --- | --- |
| D1 | Two reader jobs, served in layers on a single page per provider | Both readers exist; splitting them across pages duplicates the authoring surface and the model names |
| D2 | One page per provider, not one per model and not one combined page | Matches `guides/<topic>/<subject>.md`. One page per model means 60–100 copies of the eight-part template, and contradicts the corpus's own precedent where `domains` ships one exemplar plus a recipe |
| D3 | Each provider page renders its own vendor's value tables | Every figure sits on the page the reader is already reading; no hop |
| D4 | `comparison.md` becomes prose-only and leaves the unit graph | This is what makes D3 affordable. Section 5 |
| D5 | Inclusion is a per-provider rule, declared on the page, sourced, and falsifiable | Providers share no lifecycle vocabulary; one uniform rule would be a fiction. Section 8 |
| D6 | Qualitative claims ceiling at **Documented** or **Plausible** | Comparative and unfalsifiable by a shipped proof. No benchmark scores transcribed |
| D7 | v1 is the five providers whose records already exist, plus a written recipe for a sixth | Every new provider is a new unit, new records and new sources; v1 builds only on records already under refresh |
| D8 | **Each provider gets its own tag; the two cross-vendor tags are retired** | Without this, D3 silently recreates the single mega-unit D4 exists to prevent. Section 6 |
| D9 | **Delivery is phased, Anthropic first as the exemplar** | The entry shape and the evidence discipline are both unproven. They survive one provider and one adversarial review before being copied four times. Section 12 |

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
pages would collapse into one unit. Because any single `unreachable` record forces
`verdict: blocked`, and a blocked unit writes nothing, one dead vendor URL would
freeze freshness for every provider at once.

Making `comparison.md` prose-only breaks that chain, giving four independent units:
a blocked OpenAI source blocks `openai.md` only, and each unit is one branch and
one pull request scoped to one vendor's documentation.

What `comparison.md` keeps: the cross-vendor methodology, which does not rot on a
vendor's release schedule — the field-alignment convention ("Context is not one
column across vendors"), the runtime-lookup scripts in its section 2, and
tier mapping across vendors.

**The blank-cell rule moves with the tables.** The rule that a blank cell is a claim
the vendor states nothing, and may never be filled by arithmetic, exists to prevent
exactly the fabricated `max_input: 922,000 tokens` corrected on 2026-10-02. A rule
guarding a table belongs on the page holding the table, so each provider page states
it beside its own, and `comparison.md` keeps only the cross-vendor reasoning for why
the columns differ at all.

What it loses: the rendered cross-vendor table, and with it the corpus's worked
example of `sort=` over records shared across files. This **changes a declared
archetype**; see section 10 for every `CLAUDE.md` edit it forces. That is the
largest cost in this design and it is deliberate.

## 6. Tag design, and the test that proves the units separated

Revision 1 omitted this section, and the omission was the review's top finding: an
implementer told "each provider page renders its own vendor's value tables" would
reach for the existing `comparison-hosted` tag, which spans three vendors, and
would silently rebuild the mega-unit. All four gates would pass.

### Current state, measured

```
comparison-hosted       9 records   Anthropic + OpenAI + Google
comparison-open-weight  4 records   Meta + Qwen
claude-current          4 records   Anthropic
claude-legacy           2 records   Anthropic
```

There is no OpenAI-only or Google-only tag in existence.

### Target state

| Tag | Selects | Rendered by |
| --- | --- | --- |
| `claude-current` | Anthropic models the vendor lists as current | `claude-models.md` |
| `claude-legacy` | Anthropic models in scope but not current | `claude-models.md` |
| `openai-current` / `openai-legacy` | OpenAI, same split | `openai.md` |
| `google-current` / `google-legacy` | Google, same split | `google.md` |
| `open-weight-current` / `open-weight-legacy` | Meta and Qwen, same split | `open-weights.md` |
| ~~`comparison-hosted`~~ | retired | nothing |
| ~~`comparison-open-weight`~~ | retired | nothing |

The current/legacy split per provider is the same mechanism `claude-models.md`
already uses, so no new rendering behaviour is introduced.

### Migration

Thirteen records change tags. Tags are not lint configuration and not values, and
`CLAUDE.md` explicitly permits adding fields or tags to a shared row record, so
these are ordinary single-line surgical edits — never a YAML round trip, which
would strip the contract-required file header comments.

Order matters: **add the new tags and the new pages' tables before removing the old
tags.** Removing `comparison-hosted` while `comparison.md` still renders it yields
`render-empty-table`, a render issue that makes the block keep stale content rather
than failing loudly.

### The test that makes this real

A unit test in `tools/corpus/test/` asserting, for each provider page, that
`resolveUnit` returns keys from exactly one vendor namespace:

Revision 2 proposed a unit test calling `resolveUnit` on named provider pages. That
was wrong in three ways, and the correction matters more than the original idea:

- the real signature is `resolveUnit(root, entry, records)`, three arguments;
- all four existing test files drive it from a **fixture** root, deliberately, so a
  test asserting on live corpus paths would fail for legitimate reasons — adding a
  sixth provider, renaming a page — and would couple unit tests to corpus content;
- the property is corpus-wide, and corpus-wide invariants over the real tree are
  what `corpus verify` is for. It runs as a gate; a unit test does not.

**So the guard is a new `verify` rule, `page-vendor-mixed`.**

It fires when the records a page references span more than one vendor namespace,
where the namespace is the first dotted segment of a key matching
`<namespace>.models.<id>`. Records that are not model rows are ignored, so pages like
`guides/claude-code/hooks.md` are unaffected.

The rule is **default-deny with a visible opt-out**: a page may declare
`cross_vendor: true` in its front-matter and is then exempt. This keeps the
cross-vendor table available as a mechanism — it is still a legitimate thing to
build — while making any future use of it a declared, reviewable choice rather than
an accident. The opt-out is a new optional front-matter field, which is a third
`CLAUDE.md` edit (section 10).

Coverage, per the corpus's mutation discipline: a fixture-based test asserting the
rule fires on a mixed-vendor page, a second asserting `cross_vendor: true` suppresses
it, and a named mutation of the rule that turns a named test red. A surviving
mutation is a real defect.

**Timing.** The rule cannot be added before phase 4, because the tree violates it
until then — verified: `resolveUnit` on `guides/models/claude-models.md` today returns
records from all five vendor namespaces, since `comparison.md` renders them and shares
the unit. The rule lands in the same change that makes the tree conform.

## 7. The per-model entry shape

One subsection per model, under the page's section 4.

```
### <Model name>                     name only; the API id is a value, never written here
**What it's for** — the vendor's own positioning, quoted, linked, with the date read.
                    OPTIONAL: see "when the vendor publishes no positioning" below.
**Strengths** — 2–4 bullets, each carrying its own Evidence label
**Limits** — 2–4 bullets, each carrying its own Evidence label
**Reach for it when / avoid it when** — the use-case pair, one line each
**Lifecycle** — the vendor's stated state and retirement date, where it publishes one
```

Figures are not repeated in the entry; they are in the page's own rendered table.

### When the vendor publishes no positioning

Revision 1 assumed every in-scope model has a vendor positioning sentence. It does
not. The four current Anthropic models carry one ("For long-running agentic coding
and knowledge work"); the legacy model pages read on 2026-10-02 carry a lifecycle
status, limits and a "How it compares to the current lineup" table, but **no
positioning sentence**. On the inclusion rule in section 8 that affects roughly
fifteen of nineteen Anthropic entries.

So the field degrades, explicitly:

1. If the vendor publishes positioning, quote it, link it, date it — **Documented**.
2. If not, write one line of the form "superseded by X; retained because Y", drawn
   only from facts the vendor does publish (lifecycle state, retirement date, the
   vendor's own current-lineup comparison) — **Documented**, because every input is.
3. Never infer a positioning sentence and label it **Documented**. An inference
   about what a model is good at is **Plausible**, flagged, or it is omitted.

A legacy entry is therefore allowed to be short. That is the honest shape: the
corpus should not manufacture a strengths list for a model the vendor has stopped
describing.

### The constraint that makes this safe

Model **names** are identifiers, free in prose. Model **ids**, prices, limits and
parameter counts are **values**: they may appear in a guide body only inside a
marker block backed by a record. An entry never writes `claude-opus-5-5`; it writes
"Claude Opus 5.5" and relies on the page's table.

For tracked models the lint enforces this — a tracked id written bare is
`bare-value`. For a model with no record the lint is blind, because it is
closed-world by design. Every provider page lists "ids of models this page
describes but does not tabulate" in section 6 as a value the lint cannot guard.

## 8. Inclusion rule, per provider

Each page states its own test, in its own section 6, with the page it is read from.
A rule must be **falsifiable**: it must be possible to point at a source and say a
named model fails it.

| Provider | A model is in scope when | Read from | Pinned? |
| --- | --- | --- | --- |
| Anthropic | Its lifecycle state is not `Retired` | `https://platform.claude.com/docs/en/about-claude/model-deprecations` | yes, read 2026-10-02 |
| OpenAI | It is listed on the current models index | `https://developers.openai.com/api/docs/models` | yes, read 2026-10-02 |
| Google | It is listed as a current model on the Gemini API models page, excluding entries that page marks preview or legacy | the Gemini API models list | **no** — pin the URL and confirm the page distinguishes current from preview/legacy |
| Meta, Qwen | It is a member of the owning organisation's current model collection | the org's published collection | **no** — pin both URLs and confirm the collection has stable membership |

Revision 1's open-weights rule was "the owning organisation still publishes the
weights repository". The review was right that this over-generates to the point of
uselessness: a Hugging Face repository essentially never disappears, so that test
admits every model Meta and Qwen have ever shipped. Collection membership is
falsifiable — a collection either lists a model or it does not — and the owning org
curates it. If pinning shows a provider publishes no such collection, that
provider's rule becomes an open question for the owner, not a guess.

Two consequences the design accepts openly. The rules are not equivalent — an
Anthropic `Legacy` model is in scope while a quietly unlisted OpenAI model is not —
and each rule is itself a volatile fact, so each is a named re-check item in its
page's section 6.

## 9. Evidence discipline

Nothing in a strengths or weaknesses list can reach **Verified**: the contract
reserves that for a claim established by a proof shipping under `examples/`, and no
runnable program falsifies "good at long-horizon work". Stated once here so no page
re-argues it.

- **Documented** — the vendor's own description of its own model, linked, dated.
- **Plausible** — practitioner inference, community report, or the corpus author's
  judgement, flagged as such.

A bullet mixing both labels each part separately on one `Evidence:` line. An
inference does not inherit **Documented** from the fact it follows from.

**Benchmark scores are linked, never transcribed.** Already contract, and it matters
most here: a strengths list is exactly where a leaderboard number is most tempting,
and where it would rot fastest and least visibly.

## 10. What changes in files that already exist

| File | Change |
| --- | --- |
| `guides/models/claude-models.md` | Gains per-model entries for every in-scope Anthropic model; keeps both tables |
| `guides/models/comparison.md` | Loses both rendered tables and the records they select; section 6 rewritten to claim no records; keeps methodology, scripts, blank-cell rule |
| `CLAUDE.md:61` | Seed archetype table: `comparison.md` is no longer the "cross-model comparison" seed carrying shared row records |
| `CLAUDE.md:392` | The `rots-table-incomplete` rule uses "comparison.md's Claude row collapses three" as its worked example. That becomes false; replace the example or drop it |
| `CLAUDE.md` front-matter section | Gains the optional `cross_vendor` field, and the issue-rules table gains `page-vendor-mixed` (section 6) |
| `CLAUDE.md` directory layout | Gains the three new pages |
| `data/models-other.yaml` | Split per provider (section 16, decision 2) |
| `data/*.yaml` model records | Thirteen records change tags (section 6) |
| `meta/taxonomy.yaml` | No change; `models` exists |
| `meta/ledger.yaml` | Regenerated on `master` after merge only, per the one-writer rule |

`CLAUDE.md:392` was missed in revision 1 and is the kind of dependency that makes
contract documentation quietly wrong.

### Data file split

Records move, keys do not change. `data/models-other.yaml` becomes
`data/models-openai.yaml`, `data/models-google.yaml` and
`data/models-open-weights.yaml`; `data/models.yaml` stays Anthropic's. The per-file
convention comments must be carried into each new file, not dropped.

### Research artifacts

`openai.md`, `google.md` and `open-weights.md` are new and not seeds, so
`corpus verify` requires a `research:` artifact for each (`research-required`).
These are initial research runs under `research/models/`, not refresh artifacts. Each
is written in phase 3, in the same branch as the page it grounds — a page cannot pass
`corpus verify` without it, so it is not separable work.

## 11. Definition of done, per provider page

A page is done when all of the following hold. This is the acceptance criteria
revision 1 lacked.

1. Its inclusion rule is pinned to a URL that has been opened, and section 6 names
   that rule as a re-check item.
2. Every model the rule admits has an entry; every entry has a `Strengths` and a
   `Limits` list with Evidence labels, or a stated reason it is short per section 7.
3. The page renders its own vendor's records and no others, proved by the
   `resolveUnit` test in section 6 of this design.
4. Four gates clean: `render --check` exit 0 with no `would render:`, `lint: clean`,
   `verify: clean`, `npm test` green.
5. A `research:` artifact exists and resolves.
6. One adversarial review per `meta/prompts/verify-agent.md` has run **before** the
   pull request body is composed, and every blocking finding is fixed or explicitly
   accepted by the owner.
7. No page `verified` date is moved unless the whole of that page's section 6 was
   worked in the same pass.

Criterion 6 is not optional politeness. Three adversarial reviews on 2026-10-02
each found a real defect that all four deterministic gates passed clean, including
a fabricated vendor figure the lint was actively protecting.

## 12. Phasing

Revision 1 was a big bang: three new pages, a seed rewrite, a data split and two
contract edits, with no validation step. Phased instead, each phase its own branch,
review and pull request.

| Phase | Scope | Proves |
| --- | --- | --- |
| 0 | Pin the two unpinned inclusion rules (section 8). Research only; no file in `guides/` or `data/` changes | That both remaining rules are falsifiable against a page that exists |
| 1 | `claude-models.md` gains entries for the six Anthropic models already tracked (four current, two legacy). No tag or unit change: the page already renders `claude-current` and `claude-legacy` | The entry shape and the evidence discipline, including a legacy entry with no vendor positioning |
| 2 | `claude-models.md` extends to the full in-scope Anthropic set | That the shape survives roughly nineteen entries on one page, and whether risk 14.3 is real |
| 3 | Create `openai.md`, then `google.md`, then `open-weights.md` — one page, one branch, one review each — each with its own new per-vendor tags. `comparison.md` keeps its tables throughout | Replication of the shape. Records are rendered twice during this phase, by their provider page and still by `comparison.md`; the unit stays temporarily large, and nothing breaks |
| 4 | `comparison.md` goes prose-only; retire the two cross-vendor tags; add the `page-vendor-mixed` verify rule with its fixture tests; all three `CLAUDE.md` edits. One merge commit, no value changes | The unit separation. This is where the four units actually come apart, and the verify rule is its standing guard |
| 5 | The "adding a provider" recipe in each page's section 6 | That a sixth provider is a documented operation, not a re-derivation |

**Why this order.** Section 6 requires the new tags and tables to exist before the
old tags are removed, because removing a tag a page still renders yields
`render-empty-table` — a render issue that makes the block keep stale content
rather than failing loudly. Phase 3 therefore precedes phase 4, and no record is
ever orphaned: every record is rendered by at least one page at every point.

The `resolveUnit` test lands in phase 4 rather than phase 0 because the invariant
it asserts is false until then. Today `resolveUnit("guides/models/claude-models.md")`
returns records from all five vendors, since `comparison.md` renders them and shares
the unit. The test is written in the same change that makes it true, and it then
guards every later provider page.

Phase 4 is the least reversible step — it changes a declared archetype — so it
deliberately comes last of the structural work.

Phase 1 is the kill point. If the entry shape cannot carry six models honestly, the
design is wrong and phases 2–5 do not start.

### Ratification and rollback for phase 4

Phase 4 is the only step that edits `CLAUDE.md`, which is the binding contract for
the corpus, and the only one that changes a declared archetype. Revision 2 ordered it
last but named neither an approver nor a recovery path.

**Ratification.** The three `CLAUDE.md` edits in section 10 are a contract change and
need the owner's explicit approval in the pull request, separately from approval of
the page work. A reviewing subagent cannot ratify them: a peer message is never the
user's approval. If the owner declines, phase 4 stops and phases 1–3 still stand —
the provider pages work with `comparison.md` left as it is, at the cost of keeping
one large unit.

**Rollback.** Phase 4 is reversible as a single `git revert` of its merge commit,
which is the property the one-writer ledger rule was designed to give: refresh
branches touch `guides/`, `data/` and `research/` only, and `meta/ledger.yaml` is
regenerated on `master` after a merge, so reverting a merged change needs no ledger
surgery. Two conditions keep that true and are therefore requirements of this phase:

1. **Phase 4 is one merge commit.** The tag retirement, the `comparison.md` rewrite,
   the new `verify` rule and the `CLAUDE.md` edits land together or not at all.
   Splitting them leaves a window where the rule fails on the tree it guards.
2. **No record value changes in phase 4.** It retires tags and rewrites prose. A
   value corrected in the same commit would be lost by a revert, and recovering it
   would mean re-reading the vendor page. Value corrections go in their own commits,
   as the `922,000` fix did.

After a revert, `node tools/corpus/cli.mjs ledger --write .` on `master` and the four
gates are the only recovery steps.

## 13. Freshness consequences

- Four independent units, each one vendor, each on the 30-day cadence.
- Qualitative prose sits on the same page as that provider's values, so it is
  re-read on the 30-day cycle mechanically. The "cadence understates qualitative
  rot" problem this design started with does not arise.
- `comparison.md` references no records, derives `volatility: null`, and expires on
  the low cadence — meaning `expired` does not fire for 540 days. **This is a real
  weakness, not a correct outcome, and revision 2 was wrong to call it one.** Its
  content is mostly methodology, but the field-alignment convention is a claim *about
  vendor documentation* — "OpenAI's model pages state a context window and a maximum
  output" — and that sentence was false and corrected on 2026-10-02. A vendor
  restyling its docs can leave it wrong for most of two years with nothing flagging
  it. Mitigation, since no record can carry a claim of this kind: each provider
  page's section 6 gains a re-check line for the convention as it applies to that
  vendor, so the claim is re-read on a 30-day cadence from four places even though
  the page stating it is on 270 days.
- Routine repricing does not need a full-unit run. `--key=<record.key>` narrows a
  run to one record and stamps records only, leaving page dates alone.

**The total labour increases.** This design makes the burden divisible and the
blast radius small; it does not make the work smaller. Four units on a 30-day
cadence is roughly four refresh cycles a month, each needing a work order, live
fetches, verdicts, a stamp, an adversarial review and a pull request — against one
unit today. Revision 1 implied the burden improved, which was an over-claim. The
honest statement is that failures stop spreading and each cycle gets smaller, while
the number of cycles goes up fourfold.

## 14. Risks, and what this design weakens

1. **The page date still asserts a lot.** A provider page's `verified` claims the
   whole of its section 6 was worked. On a nineteen-model page that is a large
   claim. Mitigation: the entry shape is fixed, so the page's section 6 can enumerate what
   must be re-read, and criterion 7 forbids moving the date on a partial pass.
2. **Untracked ids are invisible to the lint.** Section 6 of each page names them.
   Author discipline and the adversarial review are the only guards.
3. **Page size.** Nineteen entries plus two tables is long. Phase 2 is where this
   gets tested, against a stated threshold rather than a feeling: if the Anthropic
   page exceeds roughly 1,200 lines, or its section 6 re-check list exceeds 40 items,
   it is too large. The fallback — current models on the provider page, legacy on a
   second page — contradicts D2 and creates a second unit per provider, so it is a
   **design amendment requiring owner sign-off**, not an implementation choice. It
   must not be done pre-emptively.
4. **A declared archetype changes.** Section 5 and all three `CLAUDE.md` edits. The
   mechanism survives and stays documented; it loses its live seed.
5. **60–100 records is a lot of hand maintenance.** Divisible, not smaller. The real
   relief is sub-project 2's scheduled audit and making the adversarial review a
   gate rather than a documented step — `reviewPacket` has no production caller
   today, verified. Phases 3–5 block on that work if the Anthropic cycle fails a
   stated test: **two consecutive 30-day cycles where the unit's refresh either does
   not complete within the cadence or returns `verdict: blocked` for a reason other
   than genuine vendor silence.** The first run on 2026-10-02 blocked for a real
   reason — two superseded models and three derived figures — so it does not count
   against this test; a second and third blocking on tooling friction would.

## 15. Out of scope

- Mistral, DeepSeek, xAI, Amazon, or any provider without existing records. The
  recipe covers adding one.
- Benchmark scores and leaderboard positions. Linked only.
- One page per model.
- Automating the refresh cycle. Sub-project 2.
- Re-keying or repricing any record. This design adds pages, moves records between
  files and changes tags; it changes no value.

## 16. Decisions resolved

Revision 1 left these open, which made it unimplementable. Resolved with reasoning;
the owner may override any of them in review.

1. **`comparison.md` keeps `seed: true`.** It is permanent provenance recording how
   the page originated, not whether it is current, and the contract says a refresh
   never removes it. The page is being rewritten, not re-grounded, so it stays a
   seed and needs no `research:` artifact.
2. **Yes, split the data files.** It is optional for correctness — two units may
   share a file — but the records are already being edited in phase 3 to carry
   their new per-vendor tags, so the split is paid in the same pass rather than as
   separate churn, and it leaves no reason for two provider refreshes to touch one
   file.
3. **The Anthropic page carries the full in-scope set, reached in two phases.** The
   inclusion rule is a single vendor-stated test (lifecycle not `Retired`), which is
   preferable to "not Retired and still priced" because it reads one page rather than
   reconciling two. Phase 1 proves the shape on the six models already tracked;
   phase 2 extends to the full set. This resolves the scope question by sequencing
   rather than by cutting it.
