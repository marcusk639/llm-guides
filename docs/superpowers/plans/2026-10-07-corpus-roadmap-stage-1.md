# Corpus Roadmap Stage 1 (Provider Facts Layer) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Complete the provider facts layer by giving OpenAI and Google their own pages under `providers`, rendering rows the corpus already carries and already verifies.

**Architecture:** No new records and no new research. The three OpenAI rows and three Google rows exist in `data/models-other.yaml` and are grounded by the `2026-10-06` refresh artifact, but carry only the `comparison-hosted` tag, so no page can select one vendor's rows alone. Each task adds a per-vendor tag to three existing records — tags only, never values — and adds a page that renders it. Both pages join the existing hosted refresh unit rather than creating a new one, which is the whole economic argument of the spec.

**Tech Stack:** Node 22+, `tools/corpus/cli.mjs` (`render`, `lint`, `verify`, `site`), js-yaml, Prettier via a PostToolUse hook.

**Spec:** `docs/superpowers/specs/2026-10-07-corpus-roadmap-design.md` (Stage 1)

## Global Constraints

- Node 22 or later. Run every command from the repository root.
- **Never touch `meta/ledger.yaml` on this branch.** It is regenerated on `master` after merge. One file, one writer.
- **Add tags and fields to a shared record; never change its `value`, `key`, `volatility` or lint configuration.** Those rows are owned by the hosted unit and refreshed there.
- **No volatile value in a guide body outside a marker block.** The closed-world lint enforces this as `bare-value`.
- These pages are new, so they are **not** `seed: true` and **must** name a `research:` artifact, or `verify` fails them as `research-required`.
- **Stage by filename.** Never `git add -A` or `git add .`.
- A Prettier PostToolUse hook reformats `.md` after every Edit/Write. Expected.
- Creating a directory can cause a local hook to drop a `.claude/` folder in it. `rm -rf` it before staging.
- Every task ends with all four gates clean: `render --check .` exits 0 with no `would render:` line; `lint .` prints `lint: clean`; `verify .` prints `verify: clean`; `npm test` reports `# fail 0`.
- Do not use `git checkout --`, `git restore`, `git reset`, or `git clean`.

## Review Focus

1. **A new page that names no `research:` artifact.** `verify` fails it as `research-required`. Both pages are new and neither is a seed. → covered by Task 1 Step 6 and Task 2 Step 6.
2. **A page whose marker block selects records its section 6 never mentions.** `verify` fails it as `rots-table-incomplete`. → covered by Task 1 Step 6 and Task 2 Step 6.
3. **A relative body link that does not resolve.** `guide-links.test.mjs` catches it; no other gate does, and the site never rewrites body `.md` links to `.html`. Both pages link siblings. → covered by Task 1 Step 6 and Task 2 Step 6, which run `npm test`.
4. **A new tag that selects the wrong rows.** `render-empty-table` catches a tag matching nothing, but nothing catches a tag matching _too much_ — adding `openai-current` to a Google row would render a wrong table and still pass every gate. → covered by Task 1 Step 2 and Task 2 Step 2, which assert the exact selected key set.
5. **A per-vendor page accidentally forming its own refresh unit.** If a page rendered only records nothing else renders, it would become a separate unit with its own 30-day obligation, silently doubling the refresh bill the spec budgeted. → covered by Task 1 Step 2 and Task 2 Step 2, which assert the page resolves into the unit containing `comparison.md`.

---

### Task 1: The OpenAI provider page

**Files:**

- Modify: `data/models-other.yaml` — add the tag `openai-current` to three existing records
- Create: `guides/providers/openai.md`
- Test: `tools/corpus/test/provider-pages.test.mjs`

**Interfaces:**

- Consumes: the `providers` topic (added in Stage 0); the records `openai.models.gpt6-astra`, `openai.models.gpt-5-6-terra`, `openai.models.gpt-5-6-luna`, which exist and carry only `comparison-hosted`.
- Produces: the tag `openai-current` selecting exactly those three records, and `guides/providers/openai.md`. Task 2 copies this shape for Google but shares no file with it except the data file, which the contract explicitly permits two units to share.

- [ ] **Step 1: Write the failing test**

Create `tools/corpus/test/provider-pages.test.mjs`:

```js
// tools/corpus/test/provider-pages.test.mjs
//
// A per-vendor page must select exactly its own vendor's rows, and must join
// the hosted refresh unit rather than forming a new one. Nothing else checks
// either: render-empty-table catches a tag that matches nothing, but a tag
// that matches too much renders a wrong table and passes every gate, and a
// page that accidentally forms its own unit silently adds a 30-day obligation.
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { loadRecords } from "../data.mjs";
import { resolveUnit } from "../refresh-units.mjs";

const ROOT = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../../..",
);
const records = () => loadRecords(path.join(ROOT, "data"));

function keysWithTag(tag) {
  return records()
    .filter((r) => (r.tags ?? []).includes(tag))
    .map((r) => r.key)
    .sort();
}

test("openai-current selects exactly the three OpenAI rows", () => {
  assert.deepEqual(keysWithTag("openai-current"), [
    "openai.models.gpt-5-6-luna",
    "openai.models.gpt-5-6-terra",
    "openai.models.gpt6-astra",
  ]);
});

test("the OpenAI page joins the hosted unit instead of forming its own", () => {
  const unit = resolveUnit(ROOT, "guides/providers/openai.md", records());
  assert.equal(
    unit.pages.some((p) => p.path === "guides/models/comparison.md"),
    true,
    "openai.md must share rows with comparison.md, or it becomes a new unit",
  );
});

test("the OpenAI page exists and sits in the providers topic", () => {
  const p = path.join(ROOT, "guides/providers/openai.md");
  assert.equal(fs.existsSync(p), true);
  assert.match(fs.readFileSync(p, "utf8"), /^topic: providers$/m);
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `node --test tools/corpus/test/provider-pages.test.mjs`
Expected: FAIL, all 3. `openai-current selects exactly the three OpenAI rows` reports `[]` against the three expected keys; the unit test throws a `RefreshError` rather than an assertion, because `resolveUnit` rejects a page that does not exist yet — that is the correct RED, not a broken test; the third reports the file is missing.

- [ ] **Step 3: Add the tag to the three OpenAI records**

Tags only. Do not touch any value, key, volatility or lint setting on these rows — they are owned by the hosted unit.

```bash
python3 - <<'PY'
p = "data/models-other.yaml"
s = open(p).read()
keys = ["openai.models.gpt6-astra", "openai.models.gpt-5-6-terra",
        "openai.models.gpt-5-6-luna"]
for k in keys:
    i = s.index("key: " + k)
    j = s.index("- comparison-hosted", i)
    nxt = s.find("- key:", i + 1)
    assert nxt == -1 or j < nxt, "tags for %s lie past the next record" % k
    s = s[:j] + "- comparison-hosted\n      - openai-current" + s[j + len("- comparison-hosted"):]
open(p, "w").write(s)
print("tagged three OpenAI rows")
PY
```

Then confirm the YAML still parses and the indentation matched:

Run: `node --input-type=module -e "import {loadRecords} from './tools/corpus/data.mjs'; console.log(loadRecords('data').filter(r=>(r.tags??[]).includes('openai-current')).map(r=>r.key).join(' '))"`
Expected: the three OpenAI keys on one line. If it prints nothing, the inserted line's indentation does not match the surrounding list — open the file and align it with the neighbouring `- comparison-hosted` entry.

- [ ] **Step 4: Create the page**

Create `guides/providers/openai.md`. The `research:` artifact is the one that already grounds these rows; the page states figures only inside the marker block.

````markdown
---
title: OpenAI models
summary: >-
  The OpenAI models this corpus tracks, as published on the verification date:
  API ids, stated context and output limits, and list prices, each copied from
  OpenAI's own pages. For choosing between them, and for seeing what the API
  will actually accept.
topic: providers
verified: "2026-10-06"
applies_to:
  - "OpenAI API documentation as published on 2026-10-06"
  - "Rows: GPT-6 Astra, GPT-5.6 Terra, GPT-5.6 Luna"
sources:
  - https://developers.openai.com/api/docs/models
  - https://developers.openai.com/api/docs/pricing
  - https://developers.openai.com/api/reference/resources/models/methods/list
related:
  - guides/models/comparison.md
  - guides/providers/anthropic.md
research: research/models/2026-10-06-claude-models-comparison-refresh.md
---

# OpenAI models

## 1. What this covers / who it's for

The OpenAI models this corpus tracks, limited to what OpenAI states on its own
pages. For anyone choosing a model or estimating cost. It is not a ranking and
carries no benchmark scores.

## 2. The 60-second version

**Ask the API what your key can use rather than trusting any page, including
this one.** OpenAI's list endpoint returns ids but no limits or prices, so it
answers "which models" and not "how big or how much":

```bash
#!/usr/bin/env bash
# Requires: bash, curl, jq, and OPENAI_API_KEY in the environment.
set -euo pipefail
curl -sSf "https://api.openai.com/v1/models" \
  -H "Authorization: Bearer $OPENAI_API_KEY" |
  jq -r '.data[].id' | sort
```

The current lineup as published on the verification date:

<!-- corpus:table fields=name,api_id,context_window,max_output,input_price,output_price headers="Model,API ID,Context window,Max output,Input price,Output price" sort=name tag=openai-current -->
<!-- /corpus:table -->

## 3. How it actually works

OpenAI's model pages name a **default snapshot** per model, so an unversioned id
can move under you while a dated snapshot id does not. Which one you pin is a
deliberate choice: the unversioned id follows improvements, the snapshot id
follows nothing.

Limits and prices live on separate pages from the model list, and the list
endpoint carries neither. There is no single source that answers all three
questions, which is why this page copies from three.

## 4. Patterns that hold up

**Pin a snapshot id in anything you cannot re-test on short notice.** An
unversioned id is a moving target by design.

Evidence: **Documented** — OpenAI's model pages describe the default-snapshot
behaviour, read 2026-10-06.

**Read limits from the vendor's pages, not from this table, when the number
decides something.** This page is dated and will drift; section 6 says how fast.

Evidence: **Plausible** — a general consequence of the corpus's own freshness
model rather than anything OpenAI states.

## 5. Edge cases and failure modes

**A blank cell means OpenAI does not state that value**, not that it is zero or
unlimited, and not that it can be derived from another column.

**Context window and max output measure different things.** A model with a large
context may still cap output sharply; sizing a prompt against the wrong one
fails at generation time rather than at submission.

Evidence: **Documented** — both figures appear as separate values on OpenAI's
model pages, read 2026-10-06.

## 6. Where this rots

| Claim             | Record                        | Volatility | Why it moves                        |
| ----------------- | ----------------------------- | ---------- | ----------------------------------- |
| GPT-6 Astra row   | `openai.models.gpt6-astra`    | high       | Releases, repricing, lineup changes |
| GPT-5.6 Terra row | `openai.models.gpt-5-6-terra` | high       | Same                                |
| GPT-5.6 Luna row  | `openai.models.gpt-5-6-luna`  | high       | Same                                |

These rows are shared with [Comparing models across vendors](../models/comparison.md)
and refresh with it, in one unit and one pull request.

Identifiers to re-check against `applies_to`: the list endpoint path and the
`Authorization` header form in section 2, which break the runnable example if
they change, and the documentation URLs in section 8.

Deliberately absent: benchmark scores, which this corpus links but never
transcribes, and any figure for a model this corpus does not track.

## 7. Proofs

None ships. A proof could call the list endpoint and assert every `api_id` in
the table above still appears, which would make that column Verified rather than
Documented. It needs a key, so it would be API-key-gated.

## 8. Sources

- [OpenAI models](https://developers.openai.com/api/docs/models)
- [OpenAI pricing](https://developers.openai.com/api/docs/pricing)
- [OpenAI list models endpoint](https://developers.openai.com/api/reference/resources/models/methods/list)

Related: [Comparing models across vendors](../models/comparison.md), [Claude models](anthropic.md).
````

- [ ] **Step 5: Render the table**

Run: `node tools/corpus/cli.mjs render --write .`
Expected: `rendered: guides/providers/openai.md`. The marker block fills with three rows.

- [ ] **Step 6: Run the test and all four gates**

Run: `node --test tools/corpus/test/provider-pages.test.mjs`
Expected: PASS, 3 tests.

Run: `node tools/corpus/cli.mjs render --check . ; echo "render=$?" ; node tools/corpus/cli.mjs lint . ; node tools/corpus/cli.mjs verify . ; npm test 2>&1 | grep -E '^# (pass|fail)'`
Expected: `render=0` with no `would render:` line, `lint: clean`, `verify: clean`, `# fail 0`.

If `verify` reports `rots-table-incomplete`, section 6 is missing one of the three record keys. If it reports `research-required`, the `research:` line is missing. If `lint` reports `bare-value`, a figure was written into the prose — move it inside the marker block or remove it.

- [ ] **Step 7: Commit**

```bash
rm -rf guides/providers/.claude
git add data/models-other.yaml guides/providers/openai.md tools/corpus/test/provider-pages.test.mjs
git commit -m "feat: add the OpenAI provider page"
```

---

### Task 2: The Google provider page

**Files:**

- Modify: `data/models-other.yaml` — add the tag `google-current` to three existing records
- Create: `guides/providers/google.md`
- Modify: `tools/corpus/test/provider-pages.test.mjs` — add the Google cases

**Interfaces:**

- Consumes: the `providers` topic; the records `google.models.gemini-3-8-flash`, `google.models.gemini-3-1-pro-preview`, `google.models.gemini-3-5-flash-lite`; the helper `keysWithTag(tag)` defined in Task 1's test file.
- Produces: the tag `google-current` and `guides/providers/google.md`. Nothing later in this plan consumes them.

- [ ] **Step 1: Write the failing test**

Append to `tools/corpus/test/provider-pages.test.mjs`:

```js
test("google-current selects exactly the three Google rows", () => {
  assert.deepEqual(keysWithTag("google-current"), [
    "google.models.gemini-3-1-pro-preview",
    "google.models.gemini-3-5-flash-lite",
    "google.models.gemini-3-8-flash",
  ]);
});

test("the Google page joins the hosted unit instead of forming its own", () => {
  const unit = resolveUnit(ROOT, "guides/providers/google.md", records());
  assert.equal(
    unit.pages.some((p) => p.path === "guides/models/comparison.md"),
    true,
    "google.md must share rows with comparison.md, or it becomes a new unit",
  );
});

test("the Google page exists and sits in the providers topic", () => {
  const p = path.join(ROOT, "guides/providers/google.md");
  assert.equal(fs.existsSync(p), true);
  assert.match(fs.readFileSync(p, "utf8"), /^topic: providers$/m);
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `node --test tools/corpus/test/provider-pages.test.mjs`
Expected: FAIL on the three new cases — `google-current` selects `[]`, the unit case throws a `RefreshError` because `resolveUnit` rejects the not-yet-created page, and the third reports the file is missing. The three OpenAI cases from Task 1 still pass.

- [ ] **Step 3: Add the tag to the three Google records**

```bash
python3 - <<'PY'
p = "data/models-other.yaml"
s = open(p).read()
keys = ["google.models.gemini-3-8-flash", "google.models.gemini-3-1-pro-preview",
        "google.models.gemini-3-5-flash-lite"]
for k in keys:
    i = s.index("key: " + k)
    j = s.index("- comparison-hosted", i)
    nxt = s.find("- key:", i + 1)
    assert nxt == -1 or j < nxt, "tags for %s lie past the next record" % k
    s = s[:j] + "- comparison-hosted\n      - google-current" + s[j + len("- comparison-hosted"):]
open(p, "w").write(s)
print("tagged three Google rows")
PY
```

Run: `node --input-type=module -e "import {loadRecords} from './tools/corpus/data.mjs'; console.log(loadRecords('data').filter(r=>(r.tags??[]).includes('google-current')).map(r=>r.key).join(' '))"`
Expected: the three Google keys on one line. Empty output means the inserted line's indentation does not match its neighbour.

- [ ] **Step 4: Create the page**

Create `guides/providers/google.md`:

````markdown
---
title: Google Gemini models
summary: >-
  The Google Gemini models this corpus tracks, as published on the verification
  date: API ids, stated input and output token limits, and list prices, each
  copied from Google's own pages. Google states input and output limits
  separately rather than a single context window.
topic: providers
verified: "2026-10-06"
applies_to:
  - "Google Gemini API documentation as published on 2026-10-06"
  - "Rows: Gemini 3.8 Flash, Gemini 3.1 Pro Preview, Gemini 3.5 Flash-Lite"
sources:
  - https://ai.google.dev/gemini-api/docs/models
  - https://ai.google.dev/gemini-api/docs/pricing
  - https://ai.google.dev/api/models
related:
  - guides/models/comparison.md
  - guides/providers/anthropic.md
research: research/models/2026-10-06-claude-models-comparison-refresh.md
---

# Google Gemini models

## 1. What this covers / who it's for

The Gemini models this corpus tracks, limited to what Google states on its own
pages. For anyone choosing a model or estimating cost.

## 2. The 60-second version

**Ask the API, which here reports limits as well as ids** — Google's list
endpoint is the richest of the three major providers for this purpose:

```bash
#!/usr/bin/env bash
# Requires: bash, curl, jq, and GEMINI_API_KEY in the environment.
set -euo pipefail
curl -sSf "https://generativelanguage.googleapis.com/v1beta/models?pageSize=1000&key=$GEMINI_API_KEY" |
  jq -r '.models[] | [.name, .inputTokenLimit, .outputTokenLimit] | @tsv'
```

The current lineup as published on the verification date:

<!-- corpus:table fields=name,api_id,max_input,max_output,input_price,output_price headers="Model,API ID,Max input,Max output,Input price,Output price" sort=name tag=google-current -->
<!-- /corpus:table -->

## 3. How it actually works

Google states an **input token limit and an output token limit**, not a single
context window. That is a different measurement from the one Anthropic and
OpenAI publish, and the two are not interchangeable: summing them does not give
a context window, and comparing Google's input limit against another vendor's
context window compares different things.

Model versions are labelled Stable or Preview, and a Preview model can change or
be withdrawn. Google documents a separate model-version pattern page for how
those names are formed.

## 4. Patterns that hold up

**Read the limits from the list endpoint rather than a page when the number
matters.** Unlike the other two major providers, Google returns both limits per
model, so the live value is one call away.

Evidence: **Documented** — the list endpoint returns `inputTokenLimit` and
`outputTokenLimit` per model, read 2026-10-06.

**Treat a Preview model as unsuitable for anything you cannot quickly migrate.**
Preview status is Google's own signal that the model may change.

Evidence: **Documented** — Google's model pages label versions Stable or
Preview, read 2026-10-06.

## 5. Edge cases and failure modes

**Do not read Google's input limit and another vendor's context window as the
same measurement.** They are defined differently, and the comparison page keeps
them in separate columns for exactly this reason.

**A Preview id can disappear.** Code pinned to one needs a fallback, or it fails
closed when the preview ends.

Evidence: **Documented** — the Stable/Preview distinction is Google's own, read
2026-10-06. That a withdrawn preview breaks a pinned call is **Plausible**
practitioner inference; Google does not state a deprecation timetable here.

## 6. Where this rots

| Claim                      | Record                                 | Volatility | Why it moves                                |
| -------------------------- | -------------------------------------- | ---------- | ------------------------------------------- |
| Gemini 3.8 Flash row       | `google.models.gemini-3-8-flash`       | high       | Scheduled price changes; new Flash releases |
| Gemini 3.1 Pro Preview row | `google.models.gemini-3-1-pro-preview` | high       | Preview status; a stable Pro may replace it |
| Gemini 3.5 Flash-Lite row  | `google.models.gemini-3-5-flash-lite`  | high       | Newer Flash-Lite generations                |

These rows are shared with [Comparing models across vendors](../models/comparison.md)
and refresh with it, in one unit and one pull request.

Identifiers to re-check against `applies_to`: the `v1beta` path, the `pageSize`
and `key` query parameters, and the `inputTokenLimit`/`outputTokenLimit` field
names in section 2 — all four break the runnable example if Google renames them.

Deliberately absent: benchmark scores, and any Gemini model this corpus does not
track.

## 7. Proofs

None ships. A proof could call the list endpoint and assert each tracked
`api_id` still appears with the limits this table states, which would make three
columns Verified. It is API-key-gated.

## 8. Sources

- [Gemini models](https://ai.google.dev/gemini-api/docs/models)
- [Gemini pricing](https://ai.google.dev/gemini-api/docs/pricing)
- [Gemini list models endpoint](https://ai.google.dev/api/models)

Related: [Comparing models across vendors](../models/comparison.md), [Claude models](anthropic.md).
````

- [ ] **Step 5: Render the table**

Run: `node tools/corpus/cli.mjs render --write .`
Expected: `rendered: guides/providers/google.md`.

- [ ] **Step 6: Run the test and all four gates**

Run: `node --test tools/corpus/test/provider-pages.test.mjs`
Expected: PASS, 6 tests.

Run: `node tools/corpus/cli.mjs render --check . ; echo "render=$?" ; node tools/corpus/cli.mjs lint . ; node tools/corpus/cli.mjs verify . ; npm test 2>&1 | grep -E '^# (pass|fail)'`
Expected: `render=0` with no `would render:` line, `lint: clean`, `verify: clean`, `# fail 0`.

- [ ] **Step 7: Confirm the refresh bill did not grow**

The spec's economic claim is that these pages are nearly free because they join an existing unit. Check it rather than assume it:

```bash
node --input-type=module -e '
import {resolveUnit, unitSlug} from "./tools/corpus/refresh-units.mjs";
import {loadRecords} from "./tools/corpus/data.mjs";
const r = loadRecords("data");
const u = resolveUnit(".", "guides/models/comparison.md", r);
console.log("hosted unit pages:", u.pages.map(p => p.path).sort().join(", "));
console.log("slug:", unitSlug(u));
'
```

Expected: one unit containing `guides/models/comparison.md`, `guides/providers/anthropic.md`, `guides/providers/google.md` and `guides/providers/openai.md`. Four pages, one refresh. If any provider page is missing from that list, it formed its own unit and the stage added a 30-day obligation the budget did not allow.

- [ ] **Step 8: Commit**

```bash
rm -rf guides/providers/.claude
git add data/models-other.yaml guides/providers/google.md tools/corpus/test/provider-pages.test.mjs
git commit -m "feat: add the Google Gemini provider page"
```

---

## After the last task

`meta/ledger.yaml` is stale: it does not know the two new pages. **Leave it.** It
is regenerated on `master` after merge.

The hosted unit now spans four pages. Its refresh still happens twelve times a
year, but each run works section 6 on four pages instead of two. The spec
budgeted ~2.5 h per hosted refresh against unmeasured assumptions; this is the
stage that makes timing a real refresh worthwhile, and the first measured run
should be compared against that figure before Stage 2 is planned.
