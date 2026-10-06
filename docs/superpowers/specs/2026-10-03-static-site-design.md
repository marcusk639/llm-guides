---
title: Static Site — Design
date: 2026-10-03
revision: 1
status: draft
scope: sub-project 5 of 5 (static site — publishing surface only)
---

# Static Site — Design

## Purpose

Publish the corpus as a reading site whose distinguishing property is that **every page and
every figure carries a verification date**.

The foundation spec names this sub-project in one line: "Static site — renders front-matter,
freshness banners, tier navigation, search"
(`2026-09-16-llm-corpus-foundation-design.md:52`). That line is the whole of its prior
specification. This document fills it in.

The corpus already knows, per page, when it was last checked and when it goes stale, and it
already knows, per figure, which vendor URL that number came from and on what date. No
competing resource in this space can say either. The site's entire reason to exist is to put
that on screen honestly — including when the answer is unflattering.

Nothing here writes new content. Nothing here changes the contract's authoring rules. The
site is a renderer over what `guides/` and `data/` already contain.

## Context and constraints

Decisions settled with the project owner on 2026-10-03, in the brainstorming session that
produced this document:

| Decision            | Choice                                                                                                                                                    |
| ------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Product shape       | A reading site with freshness. Guided learning paths, progress tracking and accounts were considered and **deferred**, not rejected.                      |
| Sequencing          | Content first, thin site now. The site ships over the four populated topics; breadth accrues as sub-project 3 lands.                                      |
| Build approach      | A `site` subcommand inside the existing corpus CLI. No framework, no SSG, no docs platform.                                                               |
| Freshness source    | The site **derives** freshness itself and uses `meta/ledger.yaml` as a cross-check that fails the build on disagreement. This amends the foundation spec. |
| Topic display names | Derived from the slug with a small exceptions map. `meta/taxonomy.yaml` is not changed.                                                                   |
| Empty topics        | Not listed in navigation. The full taxonomy may appear as a roadmap, never as a menu.                                                                     |
| Expired pages       | Labelled above the fold, never hidden.                                                                                                                    |

Three decisions settled earlier, in the refresh-loop spec
(`2026-09-27-corpus-refresh-loop-design.md:31`, `:33`, `:34`), still bind and are reproduced
here because they constrain this design directly:

| Decision   | Choice                                                                                                                                                                                   |
| ---------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Audience   | "Public and reputational. Strangers arrive via search and sharing; the site should read as an authority. Being caught stale is the primary risk."                                        |
| Launch bar | "Machinery proven first, then publish thin: the site ships once one refresh cycle has landed a merged PR, with a front page framing the corpus method-first. Breadth accrues in public." |
| Sequencing | "This loop before the site. The site is a separate sub-project downstream of a working loop."                                                                                            |

Two constraints carry over from the foundation and bind every choice below.

**A wrong-but-plausible number is worse than no number.** The site is the first component
that shows figures to strangers. A confident banner over a stale price is the failure this
whole corpus exists to prevent, and the site is the last place it can happen before a reader
sees it.

**Maintenance reality: one person, working through Claude Code sessions, with no team.**
Mechanisms are judged on whether they survive neglect, not on whether they are thorough
(`2026-09-16-llm-corpus-foundation-design.md:29-32`). This is the single strongest argument
in the build-approach decision below: a site that dies because its build tooling rotted takes
the corpus's credibility with it.

A third constraint is specific to this sub-project. **Being caught stale is the primary
risk**, and the site is what makes the corpus catchable. Every honesty rule below follows
from that.

## Repository state at the time of writing

Verified against the tree at `9e7c2f6`, by reading the files rather than trusting prior
summaries:

- Gates clean: `render --check` exits 0 with no output, `lint: clean`, `verify: clean`,
  `npm test` 372/372.
- **Five guides, covering 4 of 11 topics**: `claude-code` 1, `context` 1, `domains` 1,
  `models` 2. All five carry `seed: true`. Seven topics have zero guides.
- `package.json`: `"type": "module"`, `engines.node >= 22`, **one** runtime dependency
  (`js-yaml ^4.1.0`), **zero** devDependencies, tests by built-in `node --test`.
- **No markdown-to-HTML path exists anywhere in the repo.** The tooling treats guides as
  text: `render.mjs` splices strings between marker comments, `lint.mjs` regex-scans.
- **No CI exists. No `.github` directory exists at all** — despite `CLAUDE.md` repeatedly
  calling the four gates "the CI gates" and justifying `verify` being strictly read-only so
  it can "run unconditionally as a CI gate". They are run by hand today.
- `.gitignore` holds `node_modules/`, `local/`, `.superpowers/`, `.DS_Store`, `.claude/`,
  `.serena/`, `.token-optimizer/` — **no build-output entry**.
- `meta/taxonomy.yaml` is a bare list of eleven slugs: no titles, no ordering metadata, no
  descriptions.
- `meta/ledger.yaml`: `generated` plus 5 entries of `path`, `verified`, `volatility`,
  `expires`. No title, summary or topic.
- `research/` holds exactly one artifact, `verdict: blocked`.
- Both `models` pages expire **2026-10-16**; the other three expire 2026-12-15.

### Markdown surface actually used

Measured across all five guides, because it determines the one dependency this design adds:

| Feature                            | Count                        | Consequence                        |
| ---------------------------------- | ---------------------------- | ---------------------------------- |
| GFM table rows                     | 96                           | Tables are mandatory, not optional |
| Fenced blocks                      | 16 (32 delimiters)           | All language-tagged                |
| Fence languages                    | `bash` 8, `json` 5, `text` 3 | Three languages, no more           |
| ATX headings                       | 103                          | The `## N.` eight-part structure   |
| Footnotes, admonitions, containers | 0                            | No extension needed                |
| Images, raw HTML blocks            | 0                            | No extension needed                |

**The requirement is exactly CommonMark plus GFM tables.** Nothing more. (A naive scan
reports one footnote; it is a bash character class inside a fence, not markdown.)

## Scope

Four deliverables, matching the foundation spec's four nouns:

1. **`site` subcommand** — `tools/corpus/site.mjs`, exporting `siteCorpus(root, { write })`.
2. **Page rendering** — front-matter, the eight sections, in-page tier navigation, and
   per-figure provenance.
3. **Freshness** — derived banner states, cross-checked against the ledger.
4. **Search** — a build-time index and a client-side script.

Plus the two things that make it shippable: an output directory, and a CI workflow that runs
the gates before it builds.

Out of scope, each deferred rather than rejected: accounts, progress tracking, guided
learning paths, comments, analytics, and any content the corpus does not have.

### What the site covers at launch

**Claude Code (hooks), context management, software engineering, and model comparison.**

It does **not** cover Codex, Hermes, Cursor, or agentic tooling generally. The corpus
contains one comparative clause about Codex reading `AGENTS.md`, one mention of Cursor as the
tool in a cited study, and nothing whatsoever on Hermes. Shipping navigation that implies
otherwise would be the exact failure mode — being caught overclaiming — that the audience
decision names as the primary risk.

## The two observations this design rests on

### Per-figure provenance is already computable

`findBlocks(text)` (`markers.mjs:12`) returns every marker block with its attributes and
range. `recordsByKey(records)` (`data.mjs:112`) maps each key to its record, which the
contract requires to carry `source` and `verified`.

So for any figure rendered inside a marker block, the site can already state **the date that
number was read** and **link the vendor page it was read from** — independently of the
page's own `verified` date. The contract's central discipline, that every value lives in a
record with a source and a date, was built for correctness; it turns out to also be the
feature.

This is the differentiator, and it is a join over two existing functions. It should be
first-class in the page design, not a tooltip.

### Deriving freshness is safer than reading the ledger

The ledger carries no `title`, `summary` or `topic`, so the site must open every page's
front-matter regardless. Once it has the page text, `derivePageVolatility(text, records)`
(`ledger.mjs:21`) and `expiryFor(verified, volatility)` (`ledger.mjs:47`) give it the same
answers the ledger holds, computed from the same source of truth.

`lint.mjs` already does exactly this and deliberately never reads `meta/ledger.yaml`, so that
a stale or missing ledger can never change lint results. The same reasoning applies with more
force to the site: the ledger is regenerated **only on `master` after a merge**, so it is
routinely stale on a branch, and a site that read it would be the one component whose banner
could contradict the gates.

**The site therefore derives, and uses the ledger as a test.** It compares its derived values
against `meta/ledger.yaml` and fails the build on any disagreement. This converts the ledger
from a dependency that can silently poison output into a check that catches a stale ledger
instead of rendering it.

## Component 1: the `site` subcommand

### Why a subcommand and not a framework

Judged on the neglect test. An SSG or docs platform brings a dependency tree that needs
feeding; a transitive break two years out, on a one-person project, is how the site quietly
dies and takes the corpus's authority with it. A subcommand inside the existing CLI has **no
failure mode independent of the corpus tooling already maintained** — the same `npm test`
harness covers it, and it shares the freshness functions with `lint` and `ledger` so the
three cannot disagree.

The cost is hand-rolled HTML templating and search. Given the measured markdown surface above
and five pages, that cost is small and bounded, and it buys the only property that matters
here: the site cannot rot independently of the corpus.

### Shape and reuse

`tools/corpus/site.mjs` exports `siteCorpus(root, { write })`, following `ledgerCorpus`'s
shape.

It **imports rather than reimplements**:

| Need                  | Use                                                 | From                         |
| --------------------- | --------------------------------------------------- | ---------------------------- |
| Walk `guides/`        | `guidePages(root)`                                  | `refresh-units.mjs:23`       |
| Per-page facts        | `pageFacts(root, records)`                          | `refresh-units.mjs:38`       |
| Front-matter          | `parseFrontmatter(text)`                            | `frontmatter.mjs:5`          |
| Records               | `loadRecords(dataDir)`, `recordsByKey(records)`     | `data.mjs:28`, `:112`        |
| Marker blocks         | `findBlocks(text)`                                  | `markers.mjs:12`             |
| Volatility and expiry | `derivePageVolatility`, `expiryFor`, `CADENCE_DAYS` | `ledger.mjs:21`, `:47`, `:3` |

Two reuse points are load-bearing and easy to get wrong:

**The guide walk must be imported, not copied.** The identical walk already exists twice — as
exported `guidePages` (`refresh-units.mjs:23`) and as private `guidePaths` (`cli.mjs:52`),
whose own comment acknowledges the duplication. That is a latent bug: two copies can drift,
and a third makes it worse. The site imports `guidePages`. Collapsing the existing pair is
out of scope here but should be noted as debt.

**`parseFrontmatter`'s `yaml.JSON_SCHEMA` is load-bearing** (`frontmatter.mjs:8`). Without
it, an unquoted `verified: 2026-09-16` parses as a JavaScript `Date` rather than a string,
and every date comparison downstream changes behaviour silently. The site must use this
function, not its own YAML load.

`pageFacts(root, records)` already returns `{path, topic, status, verified, keys}` — a site
index row missing only `title` and `summary`, both of which `parseFrontmatter` supplies.

### CLI integration, and its exact cost

`main(argv)` at `cli.mjs:462` is a flat if/else chain. Flags are membership tests over the
argument list; the positional directory is the first non-`--` argument.

- **`site --write` drops in cleanly**: one `else if` branch plus the exported function.
- **`site --check` does not.** `cli.mjs:477` hard-codes
  `if (check && (command !== "render" || write)) usage();` — which rejects `--check` on any
  command but `render`. Supporting `site --check` requires editing that guard.

This design specifies **`site --write` only**, and does not add `site --check`. Rationale: the
gate that matters for the site is the ledger cross-check, which fails the build from inside
`siteCorpus` regardless of flag, and leaving `cli.mjs:477` untouched keeps the change
additive. If a dry-run mode is wanted later, that guard is the one line to change.

Exit conventions follow the existing commands exactly:

| Outcome      | Behaviour                                                                 |
| ------------ | ------------------------------------------------------------------------- |
| Usage error  | message to stderr, `process.exit(2)` via `usage()`                        |
| Issues found | `path:line [rule] message` per issue to stderr, summary to stdout, exit 1 |
| Clean        | summary to stdout (`site: N pages`), exit 0                               |

## Component 2: page rendering

### Page anatomy

In order, top to bottom:

1. **Title and summary** from front-matter. `summary` is prose (often a folded scalar) and
   doubles as the meta description — which matters, because strangers arrive via search.
2. **Freshness banner** — state, `verified` date, `expires` date, derived volatility.
3. **`applies_to`, stated plainly.** This is what makes identifier drift legible: it is the
   page's own declaration of which product version it describes. Burying it would hide the
   corpus's answer to the hardest staleness problem it has.
4. **The eight numbered sections**, with in-page tier navigation.
5. **Section 6, "Where this rots", surfaced prominently.** A guide that states what it cannot
   promise is the trust signal, not an appendix. It is the single most persuasive thing on
   the page to a sceptical stranger.
6. **Sources** (section 8) and **related** links.

### Tier navigation

The foundation spec settles that beginner/intermediate/advanced are "laddered sections within
one document per topic" (`:43`). Tier navigation therefore means **in-page movement across
the eight-part template** — jump to §2 for the 60-second version, §5 for edge cases and
failure modes — and **not** separate beginner and advanced areas of the site, and **not**
difficulty-filtered browsing.

This is a deliberate constraint, not an omission. Splitting the ladder across pages would
contradict how every guide is authored and would require an ordering layer the corpus does
not have.

### Per-figure provenance

For each terminated marker block on the page, the rendered output carries, attached to the
figure itself:

- the `verified` date of the record (or records) behind it, and
- a link to that record's `source` URL.

For a `corpus:table`, that is per row, because each row is its own record. For a
`corpus:data` block, it is the single record named by `key`.

A figure whose record's `verified` is older than the page's own date is the normal, honest
state — `--key`-scoped refreshes move a record without moving its pages, by design — and the
site shows both rather than reconciling them.

### Markdown rendering

One new dependency, configured for CommonMark plus GFM tables and nothing else.

Three traps to honour, each derived from code in this repo:

**Generated `<br>` must survive.** `render.mjs:6` escapes `|` and converts newlines to `<br>`
inside generated table cells. A renderer configured to escape raw HTML wholesale will emit a
literal escaped `<br>` in every multi-line generated cell. Raw HTML must pass through at
least to the extent that generated table content renders. All content is authored in-repo
under version control, not user-submitted, so this is a correctness concern rather than an
injection one.

**Marker comments must not leak visibly.** `<!-- corpus:data … -->` and its closer are HTML
comments; a renderer passing them through produces invisible-but-present comments in output.
They should be consumed by the provenance pass rather than emitted.

**Fence languages are exactly `bash`, `json`, `text`.** Syntax highlighting, if added, needs
no more. A highlighter is explicitly not required for launch.

### Topic display names

Derived from the slug — `claude-code` becomes "Claude Code" — with a small exceptions map for
casing that cannot be inferred from a slug.

`meta/taxonomy.yaml` is **not** changed. It stays the bare eleven-slug list it is today.
Adding a topic is a contract change under `CLAUDE.md`, and presentation metadata is not worth
touching a contract-governed file for. Navigation order follows the existing order of the
list.

### Navigation and the honesty rules

**Only populated topics appear in navigation.** Four today. Listing all eleven would
advertise coverage the corpus does not have, to an audience the project has already decided
is "public and reputational" and whose primary risk is being caught overstating.

The full taxonomy may appear **as a roadmap** — a page that says plainly which topics are
planned and empty — but never as a navigation menu whose entries lead nowhere.

**Expired pages are labelled, never hidden.** An expired page states its state above the
fold, in the banner, before its content. Hiding it would break inbound links and suppress
precisely the signal the corpus exists to emit. A reader who arrives at a stale page and is
told so immediately has been served well; a reader who cannot find the page, or finds it
unmarked, has not.

### The front page

The launch bar requires "a front page framing the corpus method-first"
(`2026-09-27-corpus-refresh-loop-design.md:33`). The front page therefore leads with **how
claims earn their confidence** — the evidence labels, the source tiers, the record-and-date
discipline, and the fact that figures carry their own provenance — before it leads with
topics. With four populated topics, method is the honest headline anyway.

## Component 3: freshness

### Three states, borrowed from `lint`

The site invents no vocabulary. Its thresholds are `lint`'s thresholds, so a banner can never
assert something the gates would contradict:

| State     | Condition                                            | Matches                       |
| --------- | ---------------------------------------------------- | ----------------------------- |
| `fresh`   | today is on or before `expires`                      | lint passes                   |
| `due`     | today is after `expires`, within one further cadence | lint still passes, by design  |
| `expired` | more than one full cadence past `expires`            | what `lint` actually fails on |

`expires = verified + CADENCE_DAYS[volatility]`, with
`CADENCE_DAYS = { high: 30, medium: 90, low: 270 }` (`ledger.mjs:3`). A page referencing no
records derives `volatility: null` and expires on the low cadence — `expiryFor` already
handles this via its `?? "low"` fallback.

The `due` state exists because `lint` tolerates exactly that window. Collapsing it into either
neighbour would make the site either alarmist or quieter than the gates.

### Deprecated pages

A `status: deprecated` page is excluded from the ledger and from expiry entirely. The site
renders it with its deprecation reason and replacement link, and **no freshness banner** —
there is no freshness claim to make. It stays reachable, because the contract requires
deprecated pages never be silently deleted.

### The ledger cross-check

After deriving every page's volatility and expiry, `siteCorpus` reads `meta/ledger.yaml` and
compares. **Any disagreement fails the build**, reported in the standard issue form.

Disagreement means the ledger was not regenerated after a merge, which is a real and expected
condition on any branch. Failing loudly is correct: it catches the stale ledger at build time
rather than shipping two different answers to the same question.

A page present in `guides/` but absent from the ledger is a disagreement. So is the reverse.
The exception is any page the ledger legitimately omits, and the site must exclude those from
the comparison on exactly the same terms or the check will fail permanently on correct input.
Those terms live in **two different places**, which is easy to get wrong:

| Omitted                              | Enforced by     | Where             |
| ------------------------------------ | --------------- | ----------------- |
| `status: deprecated`                 | `buildLedger`   | `ledger.mjs:55`   |
| Missing or invalid `verified` date   | `ledgerCorpus`  | `cli.mjs:238-239` |

An implementer reading `buildLedger` alone would find only the first and would then see a
spurious disagreement for any page with a malformed date.

## Component 4: search

A **build-time JSON index** plus a short client-side script. No search library.

The index carries, per page: path, title, summary, topic, the heading text of each numbered
section, and that section's text. Matching is client-side over that index.

**Why no dependency.** At five pages — and realistically at fifty — a search library is not
yet earned, and every dependency is weighed against the neglect test. The index format is
specified as an explicit contract so that swapping in a real index later is a contained
change behind the same interface: the build emits an index file, the client reads it. Nothing
else in the site depends on how matching works.

Search results show the page title, the matching section, and the page's freshness state —
because a search result for a stale page should say so at the point of choosing, not after
the click.

## Component 5: output and CI

### Output

The site builds to `dist/`.

`.gitignore` currently has **no build-output entry**, so `dist/` must be added to it as part
of this work. Omitting that would stage a generated tree on the next commit.

### CI, which does not currently exist

There is no `.github` directory in this repo. `CLAUDE.md` nonetheless describes the four
gates as "the CI gates" and justifies `verify` being strictly read-only on the grounds that
this "lets it run unconditionally as a CI gate". Today they are run by hand.

This sub-project adds a GitHub Actions workflow that:

1. runs `render --check .`, `lint .`, `verify .`, and `npm test` — **first, and as blocking
   steps**;
2. builds the site with `site --write .` only if all four pass;
3. deploys `dist/` to GitHub Pages.

Ordering is the point. A site built from a tree that fails `verify` would publish exactly the
class of error the gates exist to catch. Gates before build, always.

This makes `CLAUDE.md`'s existing "CI gates" claim true for the first time, which is a side
benefit worth naming: the automation also removes a standing discipline requirement, and the
neglect test prefers automation to discipline every time.

The remote is `git@github.com:marcusk639/llm-guides.git`, so Pages is the path of least
operational burden — no server, no runtime, no credentials beyond the repository's own.

## Testing strategy

Follows the existing harness exactly: `node --test "tools/corpus/test/**/*.test.mjs"`, flat
`test("sentence describing the behaviour", () => {})`, `assert.equal` / `assert.deepEqual`,
no describe blocks, no mocking framework. A site emitting HTML uses the **on-disk fixture
corpus** pattern at `tools/corpus/test/fixtures/corpus/` rather than inline literals.

The tests that matter are the ones catching **silent wrongness** — output that looks right
and is not:

| Test                                       | Catches                                                                   |
| ------------------------------------------ | ------------------------------------------------------------------------- |
| Banner state at each threshold boundary    | Off-by-one at `expires` and at one-further-cadence, in both directions    |
| Record provenance on the correct figure    | Provenance rendered against the wrong record — plausible and invisible    |
| Marker comments absent from output         | Comments leaking into published HTML                                      |
| Generated `<br>` survives the table path   | A renderer escaping raw HTML and mangling every generated multi-line cell |
| Ledger cross-check fails on a stale ledger | The check being present but vacuous — the failure that makes it theatre   |
| Deprecated page renders with no banner     | Asserting freshness about a page that makes no freshness claim            |
| Empty topic absent from navigation         | The honesty rule regressing into a dead menu entry                        |

The ledger cross-check test is the one most worth writing carefully. A cross-check that
cannot fail is worse than none, because it produces the appearance of verification.

## Contract amendments

**Amendment 1 — the site derives freshness rather than reading the ledger.**

The foundation spec states: "The static site (sub-project 5) renders per-page freshness
banners from it [the ledger]" (`2026-09-16-llm-corpus-foundation-design.md:238`).

This design does not do that. The site derives volatility and expiry with
`derivePageVolatility` and `expiryFor`, and uses the ledger only as a cross-check that fails
the build on disagreement.

Reasoning, recorded in the manner `CLAUDE.md` records its own amendments from the seeds:

1. The ledger carries no `title`, `summary` or `topic`, so the site must read every page's
   front-matter regardless. Having done so, it already holds everything the derivation needs.
2. `lint.mjs` already derives these values itself and deliberately never reads the ledger,
   precisely so that a stale ledger cannot change results. A site reading the ledger would be
   the only component able to contradict the gates.
3. The ledger is regenerated **only on `master` after a merge**, never on a branch. Its
   normal state during development is stale.
4. Cross-checking is strictly stronger than reading: it produces the same banner on correct
   input and catches the stale-ledger case that reading would silently render.

The ledger's three stated consumers are unchanged in number; consumer 2 becomes a verifier
rather than a source.

**No other contract change.** `meta/taxonomy.yaml` is untouched, no front-matter field is
added, no record field is added, and no lint, render, verify or refresh rule changes.

## Non-goals

- **Accounts, authentication, any user data.** The site handles no personal data and needs no
  privacy policy. Deferred, and reconsidered only when there is evidence anyone wants sync.
- **Progress tracking and guided learning paths.** Deferred to a later sub-project, to be
  specced against real content rather than against five pages. Paths need an ordering layer —
  a statement that one guide precedes another — which the corpus does not currently contain
  and which would itself need to be maintained and kept from rotting.
- **Comments, discussion, user-submitted content.**
- **Analytics.** Not at launch.
- **Coverage of Codex, Hermes, Cursor or agentic tooling generally.** The corpus does not
  contain it; the site will not imply it.
- **A search library, a syntax highlighter, a CSS framework, a JavaScript framework.**
- **`site --check`.** Specified as deliberately absent; see the CLI integration section.

## Deliberately absent

**Difficulty-filtered browsing.** The ladder lives inside each document by settled decision.

**A "coming soon" page per empty topic.** Seven stub pages advertising absent content is the
overclaiming failure in a different costume. The roadmap states the plan once, in prose.

**Reconciling a record date older than its page date.** That divergence is the honest output
of `--key`-scoped refreshes and is shown, not smoothed.

**Any mechanism requiring the owner to remember to do something.** Every check in this design
runs in CI or fails the build.

## Risks

**The site outruns the content.** Four populated topics is thin, and a polished site over
thin content invites the judgement that the project is more method than substance. Mitigated
by the method-first front page, which makes that framing deliberate rather than accidental —
and by the launch bar's own phrase, "publish thin … breadth accrues in public".

**Content throughput is gated by the refresh pipeline, not by writing speed.** `verify`
enforces `research-required` on every page that is not `seed: true`. All five current guides
are exempt only because they predate the pipeline. **Every new guide needs a research artifact
before it can land**, and `research/` currently holds exactly one, whose verdict is `blocked`.
This is not site scope, but it bounds how fast the site gains pages, and any plan that assumes
otherwise will slip.

**Both `models` pages expire 2026-10-16.** On current dates that is thirteen days after this
spec. If the site launches near that date, two of its five pages show `due` immediately. This
is the machinery working correctly, and the banner will say so, but it should be a conscious
launch-timing choice rather than a surprise.

**Hand-rolled HTML is work the design treats as small.** The measured markdown surface
supports that, but templating, layout and responsive behaviour are still real effort. If it
proves larger than estimated, the decision to avoid an SSG should be revisited explicitly
rather than absorbed silently.

## Open questions

**1. Does the launch bar's precondition hold?** It requires that "one refresh cycle has landed
a merged PR". A refresh cycle _has_ landed in a merged PR — `8efb7bb`, "corpus refresh loop +
first live run" — but that run's verdict was **`blocked`**, so it wrote nothing. It proved the
fail-closed path on live sources; it did not prove the success path of a `confirmed` or
`changed` run bumping dates and landing content.

Whether that satisfies "machinery proven first" is a judgement for the owner, not one this
document should make. Two readings are defensible: a blocked run is the harder half of the
machinery and proving it is worth more; or the bar means an end-to-end success and has not
yet been met. **This gates shipping, not building** — the spec and implementation can proceed
either way.

**2. Which markdown library.** Deliberately unspecified here. The requirement is fixed —
CommonMark plus GFM tables, raw HTML passing through far enough for generated `<br>` to
survive — and the choice should be made against that requirement, with its maintenance
posture weighed on the neglect test, at implementation-plan time.

**3. Visual design and layout.** This document specifies what the site renders and what it
must never misrepresent. It does not specify typography, colour, or responsive layout, and
does not need to in order for an implementation plan to be written.

## Revision history

| Revision | Date       | Change                                                           |
| -------- | ---------- | ---------------------------------------------------------------- |
| 1        | 2026-10-03 | Initial design, from the brainstorming session of the same date. |
