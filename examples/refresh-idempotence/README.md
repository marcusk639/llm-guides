# refresh-idempotence

Falsifies: **refreshing an unchanged refresh unit changes only `verified` dates,
plus a one-time `research:` field per page.**

Run it from this directory:

    node run.mjs

It builds a two-page synthetic corpus in a temporary directory, resolves the unit
(both pages share one record), fills an artifact with `confirmed` verdicts whose
stated figures match the record, and stamps it. Then it checks five things:

1. Every line that appeared **or disappeared** in `guides/` or `data/` is a
   `verified:` line or a `research:` line — nothing else moved, and each page
   gained exactly one `research:` line and lost none.
2. The page date came from the artifact's `fetched` and the record date from that
   entry's `read`, not from the clock. This is what makes the proof
   time-independent: it does not start failing the day after it is written.
3. `seed: true` survived. It is permanent provenance.
4. `--revert` restores the prior bytes exactly, which is what makes a blocked
   branch harmless to merge.
5. Stamping the same artifact again reproduces the same bytes.

It does not touch the real corpus and makes no network calls.

**What it does not cover.** Both of its `stampUnit` calls start from a page with no
`research:` field — the second runs after the `--revert` in check 4 — so
`setPageResearch`'s update-in-place branch, which replaces an *existing*
`research:` value, is never exercised here. Check 1 asserts a `research:` line is
added and that none disappears, which is the first-refresh case only. The
update-in-place branch is guarded by the `refresh-stamp` unit tests instead
("an existing research: value is replaced, not duplicated", and the quoted-value
test). Do not read this proof as covering a second refresh of an already-stamped
page.
