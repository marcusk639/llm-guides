# Adversarial review — Corpus Verify Gate Implementation Plan (2a-i)

**Reviewed:** `docs/superpowers/plans/2026-09-27-corpus-verify-gate.md` (1866 lines)
**Against:** the working tree at `50a3522` — `tools/corpus/*.mjs`, `tools/corpus/test/`, the five guides, `data/`, `CLAUDE.md`
**Date:** 2026-09-27
**Verdict: Needs clarification** (2 blockers, both small and local; the architecture is sound)

Every claim below was checked by executing the plan's own logic against the real files, not by reading alone. Where I say "fires N times" I ran it.

---

## 1. Strengths (brief)

- **The module split is right.** `verify-records.mjs` (whole record set) vs `verify-pages.mjs` (one page's text) matches the actual input shapes, and `verifyCorpus` mirrors `lintCorpus`'s walk (`cli.mjs:50-102`) closely enough that the shared printer in `main()` works unchanged.
- **Interfaces all exist and are correctly named.** `isValidIsoDate` (`ledger.mjs:9`), `isIndexableFieldValue` (`data.mjs:83`), `findBlocks` (`markers.mjs:12`), `parseFrontmatter` returning `{data}` (used identically at `cli.mjs:72`), `loadRecords` stamping `file` (`data.mjs:37`). No import in the plan is wrong.
- **The two contested design calls are both correct, and I verified the counterfactual each avoids.**
  - Substring (not equality) `lint_literals`: with `h.includes(needle)` **0 of 13** literal-bearing records fire; mutated to `h === needle`, **11** fire, starting with `claude_code.hooks.session_end_budget` / `"1.5-second budget"` in `data/claude-code.yaml`. The plan's mutation proof (Task 3 Step 7) reproduces exactly as written.
  - Loose reading of section 6: all **29** referenced keys across the five guides appear in their page's section 6 (7 / 3 / 2 / 4 / 13 per guide). Strict row-matching would indeed fail `comparison.md`.
- **`findBlocks`'s unterminated semantics are as the plan assumes.** `markers.mjs:27` marks a block unterminated when the next opener precedes the closer, and `re.lastIndex` is left at `contentStart` (`markers.mjs:37-38`), so the following block is still found. Task 7's "ignores an unterminated block" test traces correctly.
- **`sectionSixText`'s line slicing is off-by-one-free.** `six.line` is 1-based, `slice(six.line, after.line - 1)` starts one line past the heading and stops one line before the next — I traced it against the plan's own `withRots` fixture and it yields exactly the intended body.
- The five Review Focus classes are real input classes, not invented ones.

---

## 2. Critical issues (blockers)

### C1 — Task 10's fixture page, exactly as written, breaks an existing test

`tools/corpus/test/cli.test.mjs:50-55`:

```js
test("corpus render exits 0 against the existing fixture corpus", () => {
  const result = spawnSync(process.execPath, [CLI, "render", ROOT], {
    encoding: "utf8",
  });
  assert.equal(result.status, 0);
});
```

This is **the one assertion at `ROOT` that does not filter by filename.** The other four (`cli.test.mjs:13-18`, `:20-36`, `:38-42`, `:44-49`) all filter on `clean.md` / `dirty.md`, so the plan's Step 1 note ("which filter by filename") is true of four tests and false of the fifth.

The fixture page at plan line 1695 contains `<!-- corpus:data key=fixture.value.one -->`. The fixture corpus holds exactly one record — `example.model.context_window` in `tools/corpus/test/fixtures/corpus/data/models.yaml`. An unknown key produces `render-unknown-key`, `main()` sets `hasIssues` and exits 1 (`cli.mjs:164-179`).

**I ran it.** Copying the fixture corpus to a temp dir and adding the plan's page verbatim:

```
node tools/corpus/cli.mjs render $T   ->  render exit: 1
```

So `npm test` goes red at Task 10 Step 7. Plan line 1676 does say "substitute … a real fixture record key … if they differ", but the page body is presented as a ready-to-paste block and a task-scoped subagent will paste it. Worse, Step 7's remediation — _"Fix the fixture or tighten that assertion's filter"_ — invites weakening a genuine whole-corpus render gate.

**There is a second, latent half.** Even with the right key, the block's content must equal what `renderText` would write, or `render --check` reports `would render:`. No existing test runs `--check` at `ROOT`, so it passes today, but it is a trap for the next person. I verified both directions:

```
key=example.model.context_window, content "200K"  ->  render exit 0, render --check exit 0
```

**Fix (do this in the plan text, not at implementation time):** replace the fixture block with

```markdown
<!-- corpus:data key=example.model.context_window -->200K<!-- /corpus:data -->
```

and delete the "Modify: `tools/corpus/test/fixtures/corpus/data/` (add a fixture data file)" line from Task 10's Files list — no new data file is needed, and adding one risks perturbing the `literalIndex` that `clean.md`'s `bare-value` assertions depend on. Then rewrite Step 7's remediation to _"do not relax `cli.test.mjs:50-55`; it is the only unfiltered render assertion and it is load-bearing."_

### C2 — Task 8's mutation proof is not runnable as written

Plan line 1442:

> Temporarily change `six.includes(k)` to a strict row check — ``new RegExp(`^\\|[^|]_\`${k}\`[^|]_\\|`, "m")``

The `*` quantifiers were eaten by Markdown emphasis and came out as `_`. The regex as printed matches a literal underscore and will not reproduce the strict-reading false positive the step exists to demonstrate — it will match nothing, the mutation will appear to "pass", and the proof silently proves nothing. The intended form is `[^|]*` on both sides, and it needs escaping that survives Markdown (put the whole snippet in a fenced block, not an inline span).

---

## 3. Rules that would never fire on the real corpus

This was the stated worry, so here is the measured answer per rule. "Inspects" = the rule examines real content; "fires" = reports an issue.

| Rule                           | Inspects on real corpus                   | Fires                         | Positive control the task needs                                     |
| ------------------------------ | ----------------------------------------- | ----------------------------- | ------------------------------------------------------------------- |
| `record-duplicate-key`         | 25 records                                | 0 (none duplicated)           | Unit test ✓ (Task 1 Step 1)                                         |
| `record-source-missing`        | 25                                        | 0 (all have `source`)         | Unit test ✓                                                         |
| `record-verified-missing`      | 25                                        | 0                             | Unit test ✓                                                         |
| `record-verified-invalid`      | 25                                        | 0 (all `typeof === "string"`) | Unit test ✓ — **but see F1**                                        |
| `lint-literals-stale`          | 13 literal-bearing records                | 0                             | Unit test ✓ + corpus-level equality mutation ✓ (genuinely fires 11) |
| `frontmatter-applies-to-shape` | 5 pages, all list-of-strings              | 0                             | Unit test ✓ + fixture ✓                                             |
| `related-path-unresolved`      | **7** entries (not six)                   | 0                             | Unit test ✓ + fixture ✓                                             |
| `template-sections`            | 5 pages × 8 headings, all `1..8` in order | 0                             | Unit test ✓ + fixture ✓                                             |
| `evidence-label-invalid`       | **46** `^Evidence:` lines (9/8/17/6/6)    | 0                             | Unit test ✓ + fixture ✓ — **but see C3**                            |
| `rots-table-incomplete`        | **29** referenced keys                    | 0                             | Unit test ✓ + fixture ✓                                             |
| `known-lint-gap-form`          | 0 candidate constructs                    | 0                             | **Weak — see F2**                                                   |
| `research-required`            | 5 pages, all `seed: true`                 | 0 **by design**               | Unit test ✓ + fixture ✓                                             |

**Bottom line: no rule is a no-op.** `checkEvidenceLabels`, `checkTemplateSections` and `checkRotsTable` all genuinely inspect substantial real content — 46 lines, 40 headings and 29 keys respectively — and each would fire if that content degraded. `verify: clean` on the real corpus is therefore a meaningful green, not a vacuous one, **with the two exceptions below.**

### C3 — `/^Evidence:/` misses two real evidence labels (coverage hole, not a blocker)

Two of the corpus's evidence labels are **mid-line**, not at column 0:

- `guides/claude-code/hooks.md:158` — `One caveat: \`xargs\` splits on whitespace, … several arguments. Evidence: **Plausible** — standard \`xargs\` behavior, not stated in the hooks docs.`
- `guides/models/claude-models.md:91` — `Why prefer it: … lets a harness size requests from live data. Evidence: **Plausible** — this is inference from the documented fields, not a vendor statement.`

Neither is scanned. The contract (`CLAUDE.md`, "Evidence labels") says placement is _"an `Evidence:` line after each recipe"_ — so these two pages are arguably already off-contract, and the rule that exists to police label spelling is precisely the rule that cannot see them.

Two clean options, pick one in the plan rather than at implementation time:

1. **Widen the match to `/(^|\s)Evidence:\s/`** and add a Task 6 Step 6 note that this fires on two existing lines which must be checked (they are correctly spelled `**Plausible**`, so it stays clean) — this raises coverage from 46 to 48 lines and makes the rule match the contract's intent.
2. **Keep `/^Evidence:/`** and add a separate, explicitly-named limitation to Task 12 Step 3 and to `CLAUDE.md`'s issue-rules table: _only labels at the start of a line are checked; a mid-sentence `Evidence:` is invisible to verify._ Otherwise a future reader will assume full coverage.

Option 1 is better: it is a two-character change and it closes the hole rather than documenting it.

_(The plan's justification for the scoping — line 1015 — is correct. I checked all five cited lines: each does carry a bolded label in prose, and `hooks.md:315` too. Do not remove the scoping.)_

### F2 — `known-lint-gap-form` has zero near-miss coverage

`grep -rn '](\s*<' guides/` returns **nothing**. There is not a single angle-bracket link destination anywhere under `guides/`, with or without a space. The only occurrences in the repo are the contract's own examples at `CLAUDE.md:310` and `CLAUDE.md:547`, and `guidePaths` (`cli.mjs:24-37`) walks only `guides/`, so they are never scanned — which is correct, but it means this rule's entire evidence is unit tests plus the fixture. That is acceptable for a guard, but the plan should say so plainly in Task 9 Step 6 rather than letting `verify: clean` imply the rule was exercised.

---

## 4. Questions / assumptions to verify

### Q1 — `related:` entry form (answered: the plan is right)

All seven entries in all five guides are **repo-root-relative paths**:

```
hooks.md               -> guides/context/context-management.md
context-management.md  -> []
software-engineering.md-> guides/context/context-management.md, guides/claude-code/hooks.md, guides/models/claude-models.md
claude-models.md       -> guides/context/context-management.md
comparison.md          -> guides/models/claude-models.md, guides/context/context-management.md
```

`fs.existsSync(path.join(root, entry))` resolves **all seven**. Note this is _not_ the form used for prose links in the same files, which are page-relative (`../../CLAUDE.md`) — the two conventions coexist and `checkRelatedPaths` correctly assumes the front-matter one. Worth a one-line comment in the implementation so nobody "fixes" it later.

**Correction to the plan:** Task 4 Step 6 (line 811) says _"all six `related` entries resolve"_. It is **seven**.

### F1 — Task 2's Date test rests on a false premise

Plan lines 299-300: _"An unquoted 2026-09-16 in YAML is a date, not a string."_ Not in this codebase. `readDataDoc` loads with `schema: yaml.JSON_SCHEMA` (`data.mjs:9-11`), which resolves only null/bool/int/float and falls through to string. I confirmed empirically: `typeof record.verified` is `"string"` for **all 25** records, and `tools/corpus/test/fixtures/corpus/data/models.yaml` carries `verified: 2026-09-16` **unquoted** and loads as a string.

The test still passes (it constructs a `Date` directly), and the `typeof !== "string"` guard is still worth keeping for numbers, booleans and maps. But the comment must be corrected or it will mislead — and the plan's Step 7 mutation proof depends on that test, so the guard's real justification should be stated as _"a non-string `verified` (a number, a map, a `Date` from a future loader change)"_, not _"YAML parses dates"_.

### Q6 — fence-toggle fragility (measured: safe today, fail-open by design)

Every guide has an **even** fence count (16 / 2 / 10 / 2 / 2), no `~~~` fences, and no four-backtick fences anywhere under `guides/`. So `numberedSections` and `checkEvidenceLabels` are correct on today's corpus.

The fragility is real but latent: an unbalanced fence **inverts the state for the remainder of the file**, and both rules then silently stop inspecting — `template-sections` would report all eight sections missing (loud, fine), but `checkEvidenceLabels` would simply go quiet (silent under-report). That is the exact false-negative class this review was asked to hunt.

**Suggestion (cheap):** have `numberedSections` also return the final fence state, and add an `unbalanced-fence` issue when it is still `true` at end of file. One extra rule name, three lines, and it converts a silent failure into a loud one. If that is out of scope for 2a-i, say so explicitly in Task 5 and in `CLAUDE.md`.

Also worth noting: `referencedRecordKeys` uses `findBlocks`, which is deliberately **fence-blind** (`CLAUDE.md`: "Fences do not protect marker syntax"), while `sectionSixText` is fence-**aware**. That asymmetry is correct — but it is surprising enough to deserve a comment in `verify-pages.mjs`, because the two functions sit ten lines apart and disagree about fences.

### Q7 — `verifyCorpus(REPO)` in the unit suite

The existing suite has **no** precedent for asserting on live content: every test uses `fixtures/corpus/` or a `mkdtemp` corpus. Task 10 introduces three REPO-coupled tests (plan lines 1640-1642, 1652-1658, 1660-1666).

- `verify rejects --write` (1660) does not depend on content at all — **point it at `ROOT`**, and it stops being a live-content test.
- The two `verify: clean` assertions genuinely duplicate each per-task "Step 6: confirm the real corpus is still clean", and they convert _any_ future guide edit into a red `npm test` rather than a red gate run. That is arguably a feature (it is the gate), but it means the unit suite can no longer be run against a work-in-progress guide edit.

**Recommendation:** keep **one** of them — `assert.deepEqual(verifyCorpus(REPO), [])` — and drop the spawned duplicate at 1652, which tests the same thing through a slower path. Add a one-line comment saying this test is intentionally coupled to live content and is the in-suite mirror of the CI gate. Also note `new URL(...).pathname` (1610-1612) is percent-encoded — it breaks on a repo path containing a space. The existing tests already do this, so it is consistent, but `fileURLToPath` is the correct call and this is the moment to stop spreading it.

### Q5 — other fixture side effects (checked, all clear)

Adding `guides/verify/unverifiable.md` to the fixture corpus:

- `guidePaths` walks recursively (`cli.mjs:28-35`), so the new subdirectory is picked up. ✓
- `lintCorpus(ROOT)` now reports 9 issues for it — **no unfiltered lint assertion exists at `ROOT`**, so nothing breaks. ✓
- `ledgerCorpus(ROOT)` gains an entry (valid `verified`, not deprecated) — the ledger test finds by `clean.md` (`cli.test.mjs:44-49`), and no entry-count assertion exists at `ROOT`. ✓
- `topic: models` is in the fixture taxonomy (`topics: [claude-code, models]`). ✓
- All seven expected rules do fire on it — I traced each. ✓
- **Only** `cli.test.mjs:50-55` breaks. See **C1**.

---

## 5. Suggestions, by impact

**High**

1. **No `status: deprecated` handling anywhere in `verifyCorpus`.** `lintCorpus` explicitly skips deprecated pages for expiry (`cli.mjs:88`), and `CLAUDE.md` says deprecated pages _"stay readable … are still linted for front-matter and bare values"_ — i.e. a deliberately reduced rule set. Verify applies the **full** set. The first page that gets `status: deprecated` (there are none today, so this is silent) will be permanently held to `research-required`, `template-sections` and `rots-table-incomplete` even though the contract says it is a page that _cannot be refreshed_. Decide now, in Task 4, which rules a deprecated page is exempt from, and write it into Task 12.

2. **`checkAppliesToShape` throws on non-object front-matter.** `data == null || !("applies_to" in data)` — if `parseFrontmatter` yields a string or number (front-matter that is a scalar or a list), `"applies_to" in data` raises `TypeError: Cannot use 'in' operator`. Review Focus item 1 covers `null` but not "not an object". One-word fix: `if (data == null || typeof data !== "object")`. Add it to the Task 4 test alongside the null case.

3. **Fix C3 and F2's documentation gaps before writing `CLAUDE.md` in Task 12.** Task 12 Step 3 already carves out two rules for explicit documentation; add the `Evidence:` placement limitation and the `known-lint-gap-form` zero-coverage note to that list, or the contract will overstate what the gate checks.

**Medium**

4. **Task 1 Step 6's insertion instruction is ambiguous.** `main()`'s lint branch closes on the same line as the render branch opens (`cli.mjs:164`: `  } else if (command === "render") {`). "Immediately after the `if (command === "lint") { ... }` block closes, before `else if (command === "render")`" means _splitting that line_ — the snippet supplies its own leading `}` and no trailing one. It is syntactically correct if done exactly right and a syntax error otherwise. Give the implementer the resulting five lines of context instead of a positional instruction.

5. **`checkDuplicateKeys` returns `{rule, file, message}`**, which contradicts the Global Constraint _"Issue objects are `{rule, message}` with an optional `line`."_ It is deliberate (the comment says so) and `verifyCorpus` destructures it away exactly as `lintCorpus` does for `checkDataFiles` (`cli.mjs:64-65`) — but amend the constraint text so the next rule author does not think `file` is forbidden.

6. **Duplicate-key issues are reported only against the first file.** `file: files[0]` with a message naming all of them. For a key duplicated across `models.yaml` and `models-other.yaml` the issue lands on one path. Fine, but state it — a reader grepping the second file's issues will find nothing.

7. **`checkTemplateSections`'s duplicate-section message is wrong.** The Task 5 test "reports a duplicated section number" appends a second `## 8.`; the issue that fires comes from the ordering loop and reads _"`## 8.` appears after `## 8.`; sections must run 1 to 8 in order"_. True but confusing. Either add an explicit duplicate check or reword to _"section number 8 appears more than once, or out of order"_.

**Low**

8. Task 4 Step 6: "six `related` entries" → **seven**.
9. Task 2's Date-parsing comment (plan 299-300) is factually wrong for this loader — see **F1**.
10. `sectionSixText` uses `sections.find(s => s.n === 6)`, taking the first of any duplicates. Harmless given `template-sections` also reports the duplicate, but note the interaction.
11. Task 9's `ANGLE_DESTINATION_WITH_SPACE` and Task 5's `NUMBERED_H2` are non-global regexes used with `.test`/`.exec` — safe. `BOLD` is global but only ever reaches `String.prototype.matchAll`, which clones the regex, so `lastIndex` never leaks between lines. I checked this specifically because it is the classic bug in this shape; the code is correct. Add a comment so nobody "optimises" it into `BOLD.exec`.
12. Task 11 Step 2's verification greps (`grep -n 'sort\|order_by\|localeCompare' tools/corpus/render.mjs`) are fine, but the stale claims it targets are already recorded as resolved in observation 8521 — point the implementer at that rather than at a grep.

---

## 6. What I could not check

- Whether Task 11's rewritten `comparison.md` section 6 still names all 13 of its referenced keys — that depends on text that does not exist yet. Task 11 Step 4 already gates on `verify: clean`, which is the right check.
- Whether the spec (revision 3) and this plan disagree anywhere; I reviewed the plan against the code, per the brief.

---

## 7. Verdict

**Needs clarification.**

Two blockers, both fixable in the plan document in under twenty minutes: **C1** (the fixture page as written turns `cli.test.mjs:50-55` red, and the plan's own remediation invites weakening it) and **C2** (Task 8's mutation regex is Markdown-mangled and proves nothing). Beyond those, one genuine coverage hole worth closing now (**C3**, two real `Evidence:` labels are invisible to the rule), one unmade design decision that will bite on the first deprecation (**deprecated-page exemptions**), and one small crash path (`checkAppliesToShape` on non-object front-matter).

Everything else holds up. I could not find a rule that never inspects anything: the three you were most worried about examine 46 Evidence lines, 40 numbered headings and 29 record references respectively across the real corpus, and each one's failure mode is reachable from the fixture page. `verify: clean` will mean something.
