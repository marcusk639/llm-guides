# Refresh prompt

You are re-verifying one refresh unit of this corpus against its live sources.
The CLI has already worked out what to check. Your job is the part no code can
do: reading the sources and reaching a verdict.

**Never write a value from memory.** A wrong-but-plausible number is worse than
no number, and an autonomous refresh is the single largest source of one. Every
figure you record must come from a page you fetched in this run, and you record
what the page actually said, not what you expected it to say.

## What the CLI gives you

Run the work order first:

    node tools/corpus/cli.mjs refresh --page=<guides/topic/page.md> --order .

It prints the unit (every page sharing one of the entry page's records,
transitively), the exact record list with each record's current `value`,
`display`, `volatility`, `verified` and `source`, and each page's section 6
**verbatim**. Section 6 is the work order: the contract required its author to
list every record, every identifier tied to `applies_to`, every value the lint
cannot guard, and every dated study. Work that list; do not infer your own.

If `--order` exits 1, stop. A `refresh-section-six-missing` or
`refresh-record-source-missing` issue means the checklist is incomplete before
any fetch, and an incomplete checklist is not "nothing to check" — fix the page
or the record first.

Use `--key=<record.key>` to narrow a unit to one repriced record. It never
widens one, and it **stamps records only**: no page's `verified` moves and no
page's `research:` is set. A page's `verified` asserts its whole section 6 was
worked, and a key-scoped run works one item on that list. If you want the page
dates to move, do a full refresh of the unit.

The skeleton records that narrowing as `key_scoped: true`, with that one key in
`unit_keys`, and the stamp reads `key_scoped` to skip the page loop entirely. Do
not hand-edit either field between `--skeleton` and `--stamp`: a `key_scoped`
artifact carrying more than one key is refused at stamp time with
`refresh-key-scope-widened`, and the fix is to regenerate the skeleton with the
`--key` you actually meant.

## The procedure

1. Write the artifact skeleton:

       node tools/corpus/cli.mjs refresh --page=<page> --skeleton .

   It lands at `research/<topic>/<YYYY-MM-DD>-<slug>-refresh.md`. It starts
   `verdict: blocked` with every record `unreachable`, on purpose: a skeleton
   nobody filled in must not be stampable.

   **Run `--skeleton` once.** The path is keyed on the unit and the date, not on
   `--key`, so a second run on the same day overwrites the first — which would
   silently discard the artifact you filled in. Nothing in the code stops this.

2. For each record in the unit, fetch its `source` once (and `price_source`
   where the record has one) and compare the live figure to `value` and
   `display`.

   **Do not name the figure you expect in the fetch prompt, and do not accept a
   summarised page as a reading.** Ask for the field, not for confirmation of a
   value: "quote the input price row verbatim", never "confirm the input price is
   $0.75". A summarising fetch primed with the expected number has been observed
   returning it as a quoted, verbatim-looking row that does not exist in the
   page's bytes — which is the most likely way a derived figure entered this
   corpus in the first place. Where a figure decides a verdict, fetch the raw
   payload and search it, and treat a tooltip or footnote as content: an
   HTML-to-text pass drops both, which can make a live pricing note look deleted.

   Fill that record's entry:
   - `verdict: confirmed` — the source states the same figure.
   - `verdict: corrected` — the source states a different figure. Correct the
     record in `data/` and adjust the prose around it, then re-render.
   - `verdict: unreachable` — you could not read the figure, and guessing is the
     one thing this loop exists to prevent. Before settling on it, decide which
     of two different things happened, because only one of them blocks:
     - **The URL rotted.** The page moved, the vendor reorganised its docs, or
       the host served a challenge page instead of content. A 200 response whose
       body reads like a bot check is this case, not a confirmation — a challenge
       page is worse than a 404 because it looks like prose. Find the vendor's
       current page for the same figure, **repoint the record's `source` in
       `data/`**, re-fetch, and record the new URL in `url`. The record's verdict
       is then `confirmed` or `corrected` as the figure dictates, and the unit's
       is `changed`, because `data/` changed. Say in the pull request body that
       the `source` was repointed and from what.
     - **The figure was withdrawn.** The vendor's current documentation no longer
       states it anywhere, or the identifier `applies_to` pins is gone. There is
       nothing to repoint to. This is `unreachable`, the unit is `blocked`, and
       nothing is written. Propose `status: deprecated` with a reason and a
       replacement link where the whole page can no longer be refreshed.

     Bound the search: at most two attempts per host, then stop and report. A
     third attempt on a host that is challenge-walling you is not going to work
     and the run has already told you what you need to know.

   - `url` — the page you actually read.
   - `stated` — what that page said, in its own words or figures.
   - `read` — the date you read it. This becomes the record's `verified`, so it
     must be the real read date, not today by default.

3. For every identifier on each page's re-check list, confirm it still exists at
   the version `applies_to` pins. Safety-relevant identifiers first — the
   contract puts them first in section 6 for this reason. Record the result under
   that page's heading in the artifact body.

4. For every value the lint cannot guard, check it by hand. Nothing else will:
   the lint is closed-world and these are the values it cannot see.

5. For dated studies, confirm the citation still resolves and note if it has been
   superseded. Studies do not change; they age.

6. Set the unit `verdict`:
   - `confirmed` — nothing moved. The only diff is dates plus, on a page's first
     refresh, a new `research:` field. This is still a real change: it asserts a
     reviewed agent re-read these sources on this date.
   - `changed` — records corrected, prose adjusted, pages re-rendered.
   - `blocked` — **any** record came back `unreachable`. The schema enforces
     this, and a blocked unit writes nothing at all. Where a page cannot be
     refreshed at all, propose `status: deprecated` with a reason and a
     replacement link, which is what the contract already prescribes.

7. Re-render and re-lint, then stamp:

       node tools/corpus/cli.mjs render --write .
       node tools/corpus/cli.mjs lint .
       node tools/corpus/cli.mjs refresh --page=<page> --stamp --artifact=<artifact> .

   Stamping sets each page's `verified` to the artifact's `fetched`, each
   record's `verified` to that entry's `read`, and every non-deprecated page's
   `research:` to the artifact. It writes a `stamped:` receipt into the artifact.
   It is all-or-nothing.

8. Run all four gates before opening anything:

       node tools/corpus/cli.mjs render --check .
       node tools/corpus/cli.mjs lint .
       node tools/corpus/cli.mjs verify .
       npm test

## Rules you must not break

- **`seed: true` is never removed.** It marks a document authored before the
  pipeline existed — permanent provenance, not a status a page grows out of. A
  refreshed seed is a seed with fresh sources.
- **Never regenerate `meta/ledger.yaml`.** One file, one writer: it is rebuilt on
  `master` after a merge. Touching it on a refresh branch guarantees a conflict
  and breaks `corpus verify` as a read-only gate.
- **Narrative goes in the pull request body, not in the artifact.** The artifact
  carries verdicts, URLs, stated figures and dates. It is a grounding artifact,
  not a log.
- **Do not use `~/.claude` or anything under `local/` as a source or example.**
  Examples are synthetic and sourced from public documentation.
- **A source you could not reach must not bump `verified`.** There is no partial
  freshness; `--revert` exists for when the gate disagrees with you.
