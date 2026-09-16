# CLAUDE.md

This file provides guidance to Claude Code when working with code and content in this repository.

It is the binding contract for the corpus. It encodes
`docs/superpowers/specs/2026-09-16-llm-corpus-foundation-design.md` (revision 2) as
amended by the five seed guides; the section "Amendments from seeds" in that spec
records why each rule below changed. Where this file and the spec disagree, this file
wins.

## What this repo is

A long-lived reference corpus on effective LLM use: how a document is shaped, how a
claim earns its confidence level, where volatile facts live, and how staleness is
detected. Claude-first depth today, with a documented recipe for expanding to other
models and domains on demand.

The hazard every rule below exists for: the corpus documents systems whose model ids,
prices, limits and defaults change on a timescale of weeks, and a wrong-but-plausible
number is worse than no number. Never write a value from memory.

## Directory layout

This supersedes the previous convention of root-level topic directories
(`prompting/`, `tools/`, `advanced/`, `api/`, `evals/`).

- `guides/` — prose, one Markdown page per subject, under a topic directory
  (`guides/<topic>/<subject>.md`). Name files by subject.
- `data/` — volatile values as structured YAML records. Every `data/*.yaml` file is
  loaded; each holds a top-level `records:` list. A `data/*.yml` file, or a `.yaml` file
  without a top-level `records:` list, is not loaded and lint reports it
  (`data-file-ignored`).
- `research/` — raw research output per topic, dated. The grounding layer.
- `examples/` — runnable artifacts. A directory whose `proof.yaml` has `kind: proof` is
  a proof; anything else is a teaching example.
- `meta/` — `meta/taxonomy.yaml` (the topic list), the generated `meta/ledger.yaml`, and
  the research prompt library.
- `tools/corpus/` — the corpus CLI and its tests.
- `local/` — **gitignored.** Harvest output and anything derived from session
  transcripts. Nothing here may enter a committed document.

The eleven topics, from `meta/taxonomy.yaml`: foundations, prompting, context, agents,
claude-code, cowork, harness, models, tools, building, domains. `claude-code` is
intentionally the largest. `harness` carries guardrails, long-running automation, trust,
and observability. `domains` ships with one exemplar playbook plus the generation recipe
(see "Domain playbook shape") rather than many thin pages.

Seed guides to copy from, one per archetype:

| Archetype                   | Page                                     | Shows                                                       |
| --------------------------- | ---------------------------------------- | ----------------------------------------------------------- |
| Evergreen concept           | `guides/context/context-management.md`   | inline `corpus:data` blocks; values kept off a concept page |
| High-volatility model facts | `guides/models/claude-models.md`         | row records and a `corpus:table` with `headers=`            |
| Tool reference              | `guides/claude-code/hooks.md`            | context-bound `lint_literals` for generic figures           |
| Domain playbook             | `guides/domains/software-engineering.md` | task map, per-part labels, dated studies, `lint: false`     |
| Cross-model comparison      | `guides/models/comparison.md`            | shared row records across files, `sort=`, `lint_fields`     |

## Root-level tooling

**This supersedes the prior convention that there are deliberately no repo-wide
build, lint, or test commands and that an explicit ask is required before adding
root-level tooling.** That ask has been made and answered: a corpus-wide lint,
renderer, and ledger generator are required, because the freshness guarantee is a
property of the corpus as a whole, not of any single document.

Node 22 or later. The CLI is `tools/corpus/cli.mjs`:
`node tools/corpus/cli.mjs <render|lint|ledger> [--write] [dir]` or
`node tools/corpus/cli.mjs render --check [dir]` (`dir` defaults to the current
directory; any other command, `--check` on a command other than `render`, or `--check`
together with `--write` prints usage and exits 2).

| Command                                      | npm form                    | Does                                                                             | Exit                                                                                  |
| -------------------------------------------- | --------------------------- | -------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------- |
| `node tools/corpus/cli.mjs render .`         | `npm run render`            | Reports each guide whose marker blocks are out of date as `would render: <path>` | 1 if any render issue; otherwise 0, **even when pages are pending** — read the output |
| `node tools/corpus/cli.mjs render --check .` | `npm run render:check`      | **The render gate.** Writes nothing; prints `would render: <path>` for each page that would change | 1 if any render issue **or any page would change**, else 0                     |
| `node tools/corpus/cli.mjs render --write .` | `npm run render -- --write` | Rewrites marker-block content in place; prints `rendered: <path>`                | 1 if any render issue, else 0                                                         |
| `node tools/corpus/cli.mjs lint .`           | `npm run lint`              | Record lint config, front-matter, bare values, unterminated markers, expiry      | 1 if any issue (`<path>:<line> [<rule>] <message>`), 0 with `lint: clean`             |
| `node tools/corpus/cli.mjs ledger --write .` | `npm run ledger -- --write` | Rebuilds `meta/ledger.yaml`; without `--write` only prints `ledger: N entries`   | 0                                                                                     |
| `npm test`                                   | —                           | `node --test "tools/corpus/test/**/*.test.mjs"`                                  | non-zero on any failing test                                                          |

There is no proof command. Run a proof by executing its manifest's `command` from its
own directory, e.g. `node examples/marker-render-idempotence/run.mjs`.
`tools/corpus/proofs.mjs` (`discoverProofs`, `runProof`, `restamp`) is the library the
refresh tooling will call; the tests exercise it.

Individual examples under `examples/` keep their own self-contained manifests and
remain independently runnable; the root tool orchestrates them but does not replace
them.

### Authoring loop

1. Write or edit the guide and its `data/` records.
2. `node tools/corpus/cli.mjs render --write . && node tools/corpus/cli.mjs lint .`
3. A Prettier hook reformats Markdown after every write. That is expected; render
   compares formatter-stable forms, so Prettier's table padding and blank lines are not
   a pending change. Then run the two gates, which are also the CI gates:
   `node tools/corpus/cli.mjs render --check .` (expect exit 0 and no `would render:`
   line) and `node tools/corpus/cli.mjs lint .` (expect `lint: clean`, exit 0). Lint
   treats marker-block content as covered, so only `render --check` catches a block
   whose record was refreshed but whose page was never re-rendered.
4. If a page was added, removed or deprecated, or its `verified` date or referenced
   records changed, run `node tools/corpus/cli.mjs ledger --write .` and commit
   `meta/ledger.yaml`.
5. If tool code changed, `npm test`.

Creating a new directory (for example a new `guides/<topic>/` or `examples/<name>/`) can
make a local hook drop a `.claude/` folder inside it. Delete it before staging, and stage
by filename.

## The central rule: identifiers vs. values

Every volatile fact is one of two kinds. This split is the corpus's core discipline —
apply it to every page. (The seeds confirmed it holds, including on a page that is mostly
tables.)

**Identifiers** — names you must say to discuss the subject at all: hook event names,
tool names, parameter names, flag names, setting names, skill names, file names, model
names ("Claude Opus 5" as a name, not its API id).

- Allowed freely in prose. No marker block, no data record.
- Governed by `applies_to` at the document level: the page states which product
  version it describes, and identifier drift is handled by refreshing the page against
  that version, not by tracking each name individually.

**Values** — data a reader would copy into their own configuration, or budget against:
model ids, prices, context and output limits, rate limits, parameter defaults, parameter
counts, licence names, availability dates.

- Must exist as a record in `data/` (see "Data records").
- May appear in a guide body only inside a marker block.

**The test: would a reader paste this into their own config or spreadsheet?** If yes, it
is a value. When that test is ambiguous — you do paste matcher values and decision
keywords into config — use the sharper test: **is it a name or a magnitude?** Names are
identifiers; magnitudes, prices, ids and defaults are values.

### Borderline kinds, decided

| Kind                                                                                                                                                                            | Treat as                  | How                                                                                                                                                                                                                                   |
| ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Protocol version constants and dated names (`anthropic-version: 2023-06-01`, beta header strings, dated tool type names like `clear_tool_uses_20250919`)                        | Identifier                | Write in prose. They are pinned protocol names you cannot write a working request without; drift is covered by `applies_to` and the "Where this rots" re-check list.                                                                  |
| Exit codes, matcher values, decision keywords, env var names                                                                                                                    | Identifier                | Write in prose.                                                                                                                                                                                                                       |
| Product version numbers (`Claude Code CLI 2.1.267`)                                                                                                                             | Applicability metadata    | Put in `applies_to`. Do not enumerate per-feature version gates ("requires v2.1.x"); the page describes the pinned version. Name a gate only where a reader on an older version would be misled, and list it under "Where this rots". |
| A parameter's **default**, a limit, a price, a model id                                                                                                                         | Value                     | Record plus marker block.                                                                                                                                                                                                             |
| Dated empirical results (a study's measured slowdown, a hallucination rate)                                                                                                     | Neither — dated citation  | Inline citation with the study's scope (models, tasks, dates) stated where it is cited; **no data record**. Add a "dated studies" paragraph to "Where this rots": studies do not change, they age.                                    |
| Short values (under `MIN_LITERAL_LENGTH` characters, e.g. a two-character context length) and values embedded in an identifier (a parameter count that is part of a model name) | Value, not lint-guardable | Record plus marker block as usual, but the lint cannot guard it — see "Values lint cannot guard".                                                                                                                                     |
| Volatile qualitative availability facts ("no ID on platform X", "effort not supported")                                                                                         | Prose                     | No record type exists. State the claim with its source and date, and list it under "Where this rots".                                                                                                                                 |

## Marker blocks

Marker comments sit **outside** fenced code blocks, so a generated region may contain a
complete fence, fences and all. `render --write` replaces everything between the
markers. The placeholders `some.key`, `sometag` below stand for a real record key and
tag.

**Fences do not protect marker syntax.** The parser does not know about code fences: a
marker comment written inside a fenced block in a guide is a real marker, and
`render --write` will rewrite it. To show marker syntax in a guide, break the comment
opener with a backslash — `<\!-- corpus:data key=some.key -->` and
`<\!-- /corpus:data -->` — which the parser does not match (checked against
`findBlocks`); tell the reader to remove the backslash. The example below is safe only
because this file is not under `guides/`.

```
<!-- corpus:data key=some.key -->...generated...<!-- /corpus:data -->

<!-- corpus:table fields=name,api_id,input_price headers="Model,API ID,Input price" tag=sometag sort=name -->
...generated table...
<!-- /corpus:table -->
```

- **`corpus:data`** — attribute `key`. Renders the record's `display` if set, else its
  `value`, as plain text (it can sit mid-sentence). It cannot select one field of a row
  record (deferred, F5).
- **`corpus:table`** — attributes:
  - `fields` — comma list of record fields, one column each. Default `key,value`.
  - `tag` — only records whose `tags` include it. **Omitting `tag` renders every record
    in the corpus** and makes the page as volatile as the most volatile record anywhere.
  - `headers` — comma list of column labels, one per field, same order. Default: the
    raw field names. Labels cannot contain commas.
  - `sort` — `sort=field` ascending, `sort=-field` descending, compared as strings
    (`localeCompare`, so `10` sorts before `9`). Rows missing the field sort last; ties
    keep load order. Without `sort`, rows follow load order: `data/*.yaml` files
    alphabetically, then record order within a file.
  - Quote any attribute value containing spaces (`headers="Model,API ID"`).
  - Cells escape `|` and turn newlines into `<br>`; a missing field is an empty cell.
- A block is **unterminated** if its closer does not appear before the next opening
  marker of either kind. Render leaves it untouched, lint reports it, and its content is
  scanned as ordinary prose.
- When a render issue occurs (see "Issue rules"), the block keeps its previous content.

## Data records

One record per fact, or one record per table row. Parsed as YAML with the JSON schema:
unquoted `true`/`false` are booleans and bare numbers are numbers, so quote dates
(`verified: "2026-09-16"`) and any string value that looks like a boolean
(`value: "true"`).

| Field           | Required    | Meaning                                                                                                                                                                                                                                                                                                             |
| --------------- | ----------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `key`           | yes         | Unique dotted id, e.g. `anthropic.prompt_caching.default_ttl`. Duplicates are not detected (the later one wins in render). **Must not embed a value verbatim** — keys are cited in "Where this rots" and are linted there like any prose; the comparison seed respelled `openai.models.gpt6-astra` for this reason. |
| `value`         | yes         | The value. For a row record, the row's primary id (API model id, repository id).                                                                                                                                                                                                                                    |
| `display`       | no          | What `corpus:data` renders instead of `value` (unit-qualified or phrased form).                                                                                                                                                                                                                                     |
| `volatility`    | yes         | Exactly `low`, `medium` or `high`. Drives page cadence. A missing or misspelled value is caught by lint (`record-volatility-invalid`, below) and is otherwise treated as unreferenced for cadence purposes — it never crashes `lint` or `ledger`.                                                                  |
| `source`        | yes         | Canonical URL the value was read from. Per-model URLs that contain a model id belong here, not in prose.                                                                                                                                                                                                            |
| `verified`      | yes         | Date read from `source`, `"YYYY-MM-DD"`.                                                                                                                                                                                                                                                                            |
| `tags`          | for tables  | List of tags; `corpus:table tag=` selects on it.                                                                                                                                                                                                                                                                    |
| `lint`          | no          | `lint: false` removes every literal of this record from the lint.                                                                                                                                                                                                                                                   |
| `lint_literals` | no          | Explicit list of literal strings to lint for. **Overrides entirely**: `value`, `display` and `lint_fields` are then ignored.                                                                                                                                                                                        |
| `lint_fields`   | no          | List of field names on this record whose values are also linted (strings or numbers only).                                                                                                                                                                                                                          |
| `lint_scope`    | no          | Topic or list of topics. The record is linted only on pages whose front-matter `topic` is listed. Absent: linted on every page.                                                                                                                                                                                     |
| other fields    | row records | Named attributes rendered by `corpus:table fields=` (`name`, `api_id`, `context_window`, `input_price`, `vendor`, `notes`, `price_source` …). Nothing validates them.                                                                                                                                               |

`source`, `verified` and `volatility` are required by this contract but not checked by
any tool; the Verify stage checks them. `file` is set by the loader; do not use it as a
field name.

### Choosing `volatility`

Record volatility sets the cadence of every page that references the record (numbers in
`CADENCE_DAYS`, `tools/corpus/ledger.mjs`: currently high 30 days, medium 90, low 270 —
the constant wins if these differ).

| Volatility | Use when                                                                                                   | Seed example                                                                                                                       |
| ---------- | ---------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------- |
| `high`     | The value changes with releases or repricing on a timescale of weeks: model ids, prices, limits, lineups.  | Every model row, e.g. `anthropic.models.opus-5`, `openai.models.gpt6-astra`                                                        |
| `medium`   | A product default or documented threshold that is tuned between releases but not with every model launch.  | `anthropic.prompt_caching.default_ttl`, `claude_code.hooks.timeout_default.command`, `claude_code.sandbox.auto_allow_bash_default` |
| `low`      | A value fixed by a published standard or stable API contract that has not changed across several releases. | None yet: no seed record is `low`. Do not use it for a vendor default just because it has not changed recently.                    |

When unsure, choose the higher volatility; a too-short cadence costs a re-check, a
too-long one lets a wrong value stand.

### What the lint indexes for a record

- `lint: false` → nothing.
- `lint_literals` present → exactly those strings.
- Otherwise → `value`, `display`, and the value of each field named in `lint_fields`.
- Literals shorter than `MIN_LITERAL_LENGTH` (`tools/corpus/data.mjs`) are dropped.

A match counts only when the characters either side are not letters or digits, and a
match lying inside a longer matched literal is suppressed. Note `-` and `.` are not word
characters, so `27B` would match inside `Qwen3.8-27B`.

### Choosing `lint_fields`, `lint_literals`, `lint: false`, `lint_scope`

- **`lint_fields`** — the default for row records, when every volatile string in the row
  is a whole field value. It cannot drift from the fields it names. Example: every row
  in `data/models.yaml`.
- **`lint_literals`** — when a volatile string is only a _fragment_ of a field (a
  threshold inside `notes`), when a field value must not be indexed on its own (it is
  embedded in an identifier), or when the bare value is a generic figure (`600`,
  `30 seconds`) that would collide with ordinary prose, so you index a context-bound
  phrase instead (`data/claude-code.yaml` hook timeouts). Nothing checks that
  `lint_literals` still agree with the record's fields: update both on every refresh.
- **`lint: false`** — when the only literal form is a generic token with no distinctive
  phrase (the sandbox default `"true"` in `data/claude-code.yaml`). Leave a YAML comment
  saying why, and list the value under "Where this rots".
- **`lint_scope`** — when a record's literal is a figure other topics will legitimately
  state for something else (a context size or price another vendor shares). List the
  topic of every page that renders the record. Scope only when a collision is real: a
  scoped record's value written bare on a page of an unlisted topic is not caught.
  Scope affects lint only; any page can still render the record.

### Row records for tables

One record per row, attributes as named fields, `value` set to the row's primary id,
`lint_fields` naming every volatile field, and a tag per table the row belongs to.
Keep field semantics aligned across record files: if vendors define limits differently,
use separate fields (`context_window`, `max_input`, `max_output`) and leave cells blank
rather than force one vendor's definition into another's column, and state the
convention in a comment at the top of the data file (see `data/models-other.yaml`).

Records may be **shared** across pages (the Claude rows render on both model pages via
the `claude-current` and `comparison-hosted` tags). When reusing a row owned by another
page, add fields or tags only; do not change values, keys or lint configuration without
refreshing the owning page. Page-specific annotations go in the page's prose next to the
table, not into a shared record. Re-run render and lint for the whole corpus.

## Values lint cannot guard

Lint is closed-world (next section). Three kinds of value escape it by construction:

1. **Short values** — below `MIN_LITERAL_LENGTH` characters. Dropped from the literal
   index automatically; no configuration is needed or possible.
2. **Identifier-embedded values** — a value that is a substring of a name. In a row
   record, list the row's other literals in `lint_literals` and omit this one (do not
   use `lint: false`, which would unguard the whole row). Example: the Qwen3.8-27B row in
   `data/models-other.yaml`.
3. **Generic tokens** — a single-value record whose only literal is a token that would
   collide with ordinary prose (`"true"`) uses `lint: false`.

These are still values: they need a record and a marker block or table. Name each one
in the page's "Where this rots" section as not lint-guarded, so the refresh re-checks it
by hand.

## The lint

`lint` does not try to recognize volatile values in the abstract — no rule mechanically
separates a context limit from an HTTP status code. It checks each guide body against
the values the corpus **already knows about** and flags any occurrence outside a marker
block. Catching values the corpus does not yet track is a semantic problem and belongs
to the Verify stage (model judgment), not to lint.

Scope of the bare-value scan:

- **Scanned:** the whole guide body after the front-matter — prose, inline code,
  **fenced code blocks**, tables you wrote by hand, link text, link titles.
- **Not scanned:** content inside terminated marker blocks; **front-matter** (so
  per-model URLs containing ids may sit in `sources`; do not use front-matter to carry
  values anywhere else); **URLs** — inline link destinations `](url)`, `](<url>)` and
  `](url "title")` (the title is still scanned) whose destination is URL-like: it
  contains `://`, or starts with `/`, `./`, `../` or `mailto:` (the same test applies
  inside angle brackets); angle-bracket autolinks `<https://…>`; and bare `http(s)://`
  URLs up to whitespace, an em dash, or one of `) > ] " ' , | < *` and backtick. Any
  other `](...)` is scanned: a code call such as `handlers[i](some-id)`, a bare-token
  destination such as `](page.md)`, and an `#anchor` target. Link a vendor's per-model
  page freely; the id inside the URL is not a bare value.
- A record contributes to a page only if it is unscoped or its `lint_scope` lists that
  page's `topic`.

Code examples therefore must not contain a known value outside a marker block. Obtain
model ids and limits at runtime (the Models API in `guides/models/claude-models.md` §2),
or write the example so it takes the value as input. A value-bearing fence can only be
data-backed as the `display` of a record wrapped in a `corpus:data` block, which is
unreadable; templated snippets are deferred (F3).

What lint does **not** check: evidence labels, the page template, `applies_to` shape,
`related` paths, `research`, record `source`/`verified`/`volatility` presence, duplicate
keys, or agreement between `lint_literals` and fields. Those are review and Verify
responsibilities.

## Issue rules

Every rule name the tools emit, and what to do.

| Rule                             | From   | Means                                                                                          | Fix                                                                                                                                                                                 |
| -------------------------------- | ------ | ---------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `bare-value`                     | lint   | A known value appears in the body outside a marker block; the message names the record key(s). | Wrap it in a marker block, move it into a table, rephrase around it, or — if it is a different fact sharing the string — scope the record or give it context-bound `lint_literals`. |
| `frontmatter-missing`            | lint   | The page has no `---` front-matter.                                                            | Add front-matter.                                                                                                                                                                   |
| `frontmatter-required`           | lint   | A required front-matter field is absent.                                                       | Add the named field.                                                                                                                                                                |
| `frontmatter-topic`              | lint   | `topic` is not in `meta/taxonomy.yaml`.                                                        | Use a taxonomy topic; adding a topic is a contract change.                                                                                                                          |
| `frontmatter-date`               | lint   | `verified` is not a real calendar date written `YYYY-MM-DD` (so `2026-02-30` fails too). The page is also skipped by expiry and the ledger. | Fix the date.                                                                                                                                                                       |
| `frontmatter-derived-volatility` | lint   | Front-matter declares `volatility`.                                                            | Remove it; volatility is derived from records.                                                                                                                                      |
| `marker-unterminated`            | lint   | A marker block has no closer before the next opening marker or end of file.                    | Add `<!-- /corpus:data -->` or `<!-- /corpus:table -->`.                                                                                                                            |
| `expired`                        | lint   | The page is more than one full cadence past its expiry date.                                   | Refresh it (re-verify, bump `verified`) or mark `status: deprecated`.                                                                                                               |
| `lint-fields-unknown`            | lint   | `lint_fields` names a field not on the record, so that field silently lost coverage.           | Fix the field name.                                                                                                                                                                 |
| `lint-fields-unindexable`        | lint   | `lint_fields` names a field whose value is not a string or number.                             | Point at scalar fields, or use `lint_literals`.                                                                                                                                     |
| `record-volatility-invalid`      | lint   | A record's `volatility` is missing or not one of `low`, `medium`, `high`. Reported once per record, whether or not any page references it. | Fix the value to `low`, `medium` or `high`.                                                                                                                                         |
| `lint-scope-unknown`             | lint   | `lint_scope` names a topic not in `meta/taxonomy.yaml`.                                        | Fix the topic name.                                                                                                                                                                 |
| `lint-literals-invalid`          | lint   | `lint_literals` is not a list, is an empty list (which would silently unguard the record), or holds an entry that is not a string or number. A non-list is ignored and the record's default literals are indexed. | Make it a non-empty list of strings; to opt a record out deliberately, use `lint: false`.                                                                                        |
| `data-file-ignored`              | lint   | A `data/*.yml` file, or a `data/*.yaml` file with no top-level `records:` list; the loader skips it, so none of its records exist. | Rename it to `.yaml`, or put its records under a top-level `records:` list.                                                                                                      |
| `render-unknown-key`             | render | A `corpus:data` block names a key no record has.                                               | Fix the key or add the record.                                                                                                                                                      |
| `render-empty-table`             | render | A `corpus:table` selects no records (tag matches nothing).                                     | Fix the tag or tag the records.                                                                                                                                                     |
| `render-headers-mismatch`        | render | `headers` has a different number of labels from `fields`.                                      | Make the lists parallel.                                                                                                                                                            |
| `render-sort-unknown`            | render | `sort` is malformed (empty, bare `-`) or names a field no selected row has.                    | Fix the field name. A field present on only some rows is fine.                                                                                                                      |
| `render-missing-value`           | render | A `corpus:data` block's record has neither `display` nor `value`; the block keeps its content. | Add `value` (and `display` if needed) to the record.                                                                                                                                |

Lint issues from records carry the `data/<file>.yaml` path; lint never runs render, so
run both.

## The document contract

### Front-matter

Required and lint-enforced: `title`, `summary`, `topic` (a taxonomy topic), `verified`
(`YYYY-MM-DD`, the date the page was last checked against its sources), `applies_to`,
`sources`, `related`.

- `applies_to` — a list of strings, each naming the product or scope and version, and
  the date the documentation was read (e.g.
  `"Claude Code CLI 2.1.267, checked against the public hooks reference … on 2026-09-16"`).
- `sources` — list of URLs. `related` — list of repo paths to other guides (may be `[]`).

Optional: `research` (path to the page's grounding artifact under `research/`). It is
optional now and omitted on the seeds, because no research artefacts exist yet. It
becomes required when sub-project 2 (authoring and refresh toolchain) delivers the
research stage; that change will be made in this file and in `REQUIRED_FIELDS`
(`tools/corpus/lint.mjs`). Until this file says otherwise, do not treat it as required.
Also optional: `seed: true` marks a document authored
before the pipeline existed; `status` (`deprecated`).

**`volatility` is never a front-matter field.** Volatility is a property of a claim,
carried on the `data/` record that backs it, not of a page.

### Page template (eight parts)

Number the headings `## 1.` … `## 8.` as the seeds do.

1. **What this covers / who it's for** — two lines.
2. **The 60-second version** — one concrete example that runs. Beginner rung, before
   theory. For a facts page the rendered reference table plus a runtime lookup is the
   60-second version.
3. **How it actually works** — mechanics and the mental model.
4. **Patterns that hold up** — recipes, each carrying evidence labels.
5. **Edge cases and failure modes** — advanced rung.
6. **Where this rots** — a table of `Claim | Record | Volatility | Why it moves` for
   every record the page uses; the identifiers tied to `applies_to` to re-check on
   refresh (put safety-relevant ones first and say why they matter); values lint cannot
   guard; a dated-studies paragraph if the page cites studies; and what is deliberately
   absent.
7. **Proofs** — optional content; present only where claims are backed by a runnable
   proof. Otherwise state that none ships and, if useful, what proof would close the gap.
8. **Sources**

### What "runs" means

An example "runs" when a reader can execute it verbatim, substituting only inputs the
page names explicitly (an API key in an environment variable, their own repository's
test command).

- **API-key-gated examples** (a `curl` or SDK call): must be syntactically checked
  (`bash -n`, a parser, `jq` against the documented response shape), fail loudly
  (`curl -sSf`, not silent `null`s), avoid argument-size traps on large inputs, and fetch
  volatile values at runtime rather than embedding them. The author's report states
  whether it was executed live.
- **Prompt sequences** (workflows run in an agent against "your repository"): give the
  exact prompts and commands, a safe start state (a throwaway branch, committed work), a
  concrete synthetic task, a human check that decides success, and a discard path. Name
  every substitution.
- Running an example yourself never makes a claim **Verified**; only a proof that ships
  in the repo does.

### Evidence labels

Exact casing, always one of:

- **Verified** — established by a passing proof that ships in this repo under
  `examples/`.
- **Documented** — stated by a tier 1 or tier 2 source (see "Source tiers"), linked,
  with the date it was read. For a tier 2 study, state its scope (models, tasks, dates)
  where it is cited; the label holds only within that scope.
- **Plausible** — tier 3 or 4 sources, community reports, anecdote, or the author's
  inference. Flagged as such; never written as confident prose.

Placement: an `Evidence:` line after each recipe, e.g.
`Evidence: **Documented** — [prompt caching](https://…), read 2026-09-16.`

**A recipe that mixes a documented fact with inference labels each part separately in
the same Evidence line** — for example
`Evidence: **Documented** — [source] for the setup. The failure shapes are **Plausible** — practitioner generalization.`
Never put an inference ("breaks silently", "so prefer X") under a Documented label
because the fact it follows from is documented. A guide never redefines a label; it
applies these definitions.

**Public labels require public evidence.** A claim may only carry a label a reader can
check — harvested session history is never itself a citation.

### Source tiers

Tiering governs not what may be read (obscure sources are explicitly in scope) but
what a claim may become.

| Tier | Source                                                      | Ceiling without a proof |
| ---- | ----------------------------------------------------------- | ----------------------- |
| 1    | Vendor canonical documentation                              | Documented              |
| 2    | Papers, changelogs, official cookbooks, engineering blogs   | Documented              |
| 3    | Reputable practitioners, talks, well-documented open source | Plausible               |
| 4    | Gists, forums, threads, one-off repositories                | Plausible               |

No tier reaches Verified without a proof — vendor documentation lags the product and is
sometimes wrong. When a live page and a cached skill or memory disagree, the live page
wins; record what you read and when. Benchmark scores and leaderboards are linked, not
transcribed.

### Proofs

A proof is the smallest runnable program that could falsify one claim, in
`examples/<name>/` with a `proof.yaml`:

| Field             | Meaning                                                       |
| ----------------- | ------------------------------------------------------------- |
| `kind`            | `proof` (anything else is not run as a proof)                 |
| `claim`           | The single claim it falsifies                                 |
| `origin`          | Where the claim came from                                     |
| `tier`            | Source tier of the claim's origin                             |
| `command`         | Shell command, run from the proof's directory                 |
| `passes_when`     | The passing condition (exit code 0)                           |
| `last_run`        | Date of the last run                                          |
| `result`          | `pass` or `fail`                                              |
| `timeout_seconds` | Optional; a default applies (`DEFAULT_PROOF_TIMEOUT_SECONDS`) |

A malformed manifest counts as a failing proof, not a missing one. A tier 3 or 4 claim
enters as Plausible and becomes Verified only when its proof passes; cite the proof in
place of the original source. Proofs cover mechanism claims; comparative and qualitative
claims stay Documented or Plausible.

### Freshness: cadence, ledger, expiry, deprecation

- **Page volatility is derived**: the highest `volatility` among the records the page
  references — each terminated `corpus:data` block's record, and every record a
  `corpus:table` selects by tag. A page referencing no records is written to the
  ledger with `volatility: null` and expires on the low cadence.
- **Cadence** per volatility is `CADENCE_DAYS` in `tools/corpus/ledger.mjs` (the single
  source for the numbers). `expires = verified + cadence`.
- **One high-volatility value sets the whole page's cadence.** Keep high-volatility
  values off evergreen concept pages: link the page that owns them (usually under
  `guides/models/`) instead of inlining the figure (deferred aggregation override, F2).
- **Ledger** — `meta/ledger.yaml` is generated, never hand-edited: `generated` date and
  one entry per guide with a valid `verified` date and no `status: deprecated`, carrying
  `path`, `verified`, derived `volatility`, `expires`. Its consumers are the scheduled
  audit (sub-project 2) and the static site's freshness banners (sub-project 5). **Lint
  does not read `meta/ledger.yaml`**: it derives each page's volatility and expiry
  itself with the same functions (`derivePageVolatility`, `expiryFor`), so a stale or
  missing ledger file never changes lint results.
- **`expired`** fails lint only when today is past `expires` by more than one further
  cadence, forcing a refresh or deprecation.
- **Deprecation** — a page that cannot be refreshed gets `status: deprecated` in
  front-matter plus a one-line reason and a link to its replacement at the top of the
  body. Deprecated pages stay readable, are excluded from the ledger and expiry, are still
  linted for front-matter and bare values, and are never silently deleted.

## Domain playbook shape

Domain playbooks (`guides/domains/`) use the eight-part template with a fixed inner
shape, taken from `guides/domains/software-engineering.md`:

| Section              | Shape                                                                                                                                                                                                                                                                                                                             |
| -------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1. Covers / for      | Task-oriented framing; name the worked-example tool and say mechanisms are tool-specific.                                                                                                                                                                                                                                         |
| 2. 60-second version | One principle in bold, then a scripted prompt sequence for the domain's most common small task: safe start → orient → establish the check → constrained action → human verification → discard path. Then one paragraph on what each step defends against.                                                                         |
| 3. How it works      | (a) the loop and its stop signal; (b) what the model brings and lacks in this domain; (c) the three levers — check, context, permissions; (d) advisory vs enforced controls; (e) the best empirical evidence, with scope — or say none exists. (a)–(d) transfer almost verbatim.                                                  |
| 4. Patterns          | A task map table (task → the check that makes it safe), then one subsection per lifecycle task with the lead-ins **Where it helps / Set it up / How it fails / How to verify**, and an Evidence line labeling each part. End with "operate safely" and "durable instructions" tasks.                                              |
| 5. Failure modes     | Numbered failures, each **Symptom / Why / Mitigation / Evidence**; measured rates only when a cited study gives them, with scope. Map software failures to domain analogues (tests gamed → reconciliation forced to tie; hallucinated packages → invented citations or regulations; destructive commands → irreversible filings). |
| 6. Where this rots   | "Playbook stable; mechanisms move", the value table, the identifier re-check list (safety-relevant first), a dated-studies paragraph, deliberately absent.                                                                                                                                                                        |
| 7. Proofs            | Candidate proofs per mechanism claim; often none.                                                                                                                                                                                                                                                                                 |
| 8. Sources           | Tier 1 and tier 2 lists, plus related corpus pages.                                                                                                                                                                                                                                                                               |

## Privacy: `local/` and transcripts

`local/` is gitignored. It holds harvest output and anything derived from session
transcripts — those transcripts include confidential client and regulated-industry
work, so nothing derived from them may enter a committed document. Harvest
output points at what to prove; it does not itself license a Verified (or any public)
label. Anything it surfaces that is worth publishing must be re-established by a proof
or a citable public source before it reaches `guides/`.

Do not use the owner's own Claude Code configuration (`~/.claude`, its settings, hooks,
agents or skills) as a source or example; those files embed private project details.
Examples are synthetic and sourced from public documentation.

## Known lint gaps

Not fixed. The first two hide a known value from the bare-value scan (confirmed with
`findBareValues`):

- A URL-like link destination in angle brackets containing spaces, e.g.
  `[x](<./text with a value>)`: the whole bracketed text is treated as a URL.
- A bare URL that runs into following text through `.` or `;` with no space
  (`https://example.com/x;value`): the value is swallowed into the URL span.

Do not write either form. Reviewers check for them by eye.

The lint is also exact-string by design, so two further kinds of text escape it:

- **Formatting variants of a recorded value are not matched.** A record whose value is
  `200000` does not catch `200,000` or `200K` unless those spellings are themselves
  indexed (as `display` or `lint_literals`). The same holds for alternate currency or
  unit spellings, a markdown-escaped id (`claude\_opus`), and a multi-word `display`
  value that Prettier or an author wraps across two lines. Catching variants is the
  Verify stage's job.
- **Text inside marker-comment attributes is not scanned.** A value written into
  `headers="…"` or any other attribute of a terminated `corpus:data` or `corpus:table` opener lies
  inside the marker block's covered range. Keep attributes to field names, tags and
  column labels.

## Known limitations (deferred to sub-project 2)

| Finding | Limitation                                                                                                                | Workaround until then                                                                                                                                                                                                   |
| ------- | ------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| F2      | Page cadence is the maximum record volatility; one incidental high-volatility value shortens an evergreen page's cadence. | Keep high-volatility values off concept pages; link the page that owns them.                                                                                                                                            |
| F3      | No templated code snippets: a value cannot be interpolated into a fenced example.                                         | Fetch values at runtime or take them as input; keep fences free of known values.                                                                                                                                        |
| F5      | `corpus:data` cannot select one field of a row record.                                                                    | Point prose at the table ("see the Input price column") or describe the relation without the figure; add a separate single-value record only if the figure is essential, and list both records under "Where this rots". |
| F14     | Safety-relevant identifiers cannot be flagged for priority re-checking.                                                   | List them first in "Where this rots" with why they matter for safety.                                                                                                                                                   |
