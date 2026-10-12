# Corpus Roadmap Stage 0 (Structural) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Land the structural changes every later roadmap stage depends on — four new taxonomy topics, the `CLAUDE.md` scope amendment, the open-weight table split onto its own page, and the move of `claude-models.md` into the new `providers` topic.

**Architecture:** No tooling changes. This is a content-and-contract stage: edits to `meta/taxonomy.yaml`, `CLAUDE.md`, two guide pages, one new guide page, and four data records. The verification cycle for every task is the repository's four existing gates, which already encode the rules this stage must not break.

**Tech Stack:** Node 22+, the existing `tools/corpus/cli.mjs` (`render`, `lint`, `verify`, `ledger`), js-yaml, Prettier via a PostToolUse hook.

**Spec:** `docs/superpowers/specs/2026-10-07-corpus-roadmap-design.md`

## Global Constraints

- Node 22 or later. The CLI is `node tools/corpus/cli.mjs <command> [--write] [dir]`.
- **Never touch `meta/ledger.yaml` on this branch.** It is regenerated on `master` after merge, and only then. One file, one writer.
- **`seed: true` is permanent provenance** and is never removed from a page, including a page that is moved.
- **Stage by filename.** Never `git add -A` or `git add .`.
- A Prettier PostToolUse hook reformats `.md` after every Edit/Write. That is expected; render compares formatter-stable forms, so Prettier's table padding is not a pending change.
- Creating a new directory under this repo can cause a local hook to drop a `.claude/` folder inside it. Check for it and `rm -rf` it before staging.
- Every task ends with all four gates clean: `node tools/corpus/cli.mjs render --check .` exits 0 with no `would render:` line; `lint .` prints `lint: clean`; `verify .` prints `verify: clean`; `npm test` reports `# fail 0`.
- No volatile value may appear in a guide body outside a marker block. The closed-world lint enforces this as `bare-value`.
- Do not use `git checkout --`, `git restore`, `git reset`, or `git clean`.

## Review Focus

1. **A page whose `topic` is not yet in the taxonomy.** `lint` fails it as `frontmatter-topic`. Task 1 must land before Tasks 3 and 4, which introduce pages with `topic: providers`. → covered by Task 1 Step 4 and Task 3 Step 6.
2. **A `related:` entry naming a path that no longer exists.** `verify` fails it as `related-path-unresolved`. `comparison.md` lists `guides/models/claude-models.md`, which Task 4 moves. → covered by Task 4 Step 5.
3. **A new page that is not `seed: true` and names no `research:` artifact.** `verify` fails it as `research-required`. The open-weight page is new, so it is not a seed and must name its grounding artifact. → covered by Task 3 Step 6.
4. **A relative body link to a moved page. No gate checks body links at all** — `verify` checks `related:` front-matter paths only. `guides/models/comparison.md:190` links `[Claude models](claude-models.md)`, which becomes a dead link on the published site the moment Task 4 runs, and every gate stays green. → covered by Task 4 Step 4.
5. **A page whose marker blocks reference records its section 6 never mentions.** `verify` fails it as `rots-table-incomplete`. The new open-weight page renders four records and must carry their rows. → covered by Task 3 Step 6.

---

### Task 1: Add the four taxonomy topics

**Files:**

- Modify: `meta/taxonomy.yaml`

**Interfaces:**

- Consumes: nothing.
- Produces: the topic slugs `providers`, `evals`, `multimodal`, `orchestration`, which Tasks 3 and 4 use in page front-matter. `lint`'s `frontmatter-topic` rule reads this file, so no page may declare these topics before this task lands.

- [ ] **Step 1: Write the failing check**

Create `local/check-taxonomy.mjs`. `local/` is gitignored, and a relative import
resolves from the script's own directory, so run every check from the repo root:

```js
import fs from "node:fs";
import yaml from "js-yaml";
const t = yaml.load(fs.readFileSync("meta/taxonomy.yaml", "utf8")).topics;
const want = ["providers", "evals", "multimodal", "orchestration"];
const missing = want.filter((x) => !t.includes(x));
if (missing.length) {
  console.error("MISSING: " + missing.join(", "));
  process.exit(1);
}
if (t.length !== 15) {
  console.error("expected 15 topics, got " + t.length);
  process.exit(1);
}
console.log("taxonomy ok: " + t.length + " topics");
```

- [ ] **Step 2: Run it to verify it fails**

Run: `node local/check-taxonomy.mjs`
Expected: FAIL — `MISSING: providers, evals, multimodal, orchestration`, exit 1.

- [ ] **Step 3: Add the topics**

Edit `meta/taxonomy.yaml`. Append the four slugs to the end of the list, preserving the existing order (navigation follows list order, so new topics sort after the established ones):

```yaml
topics:
  - foundations
  - prompting
  - context
  - agents
  - claude-code
  - cowork
  - harness
  - models
  - tools
  - building
  - domains
  - providers
  - evals
  - multimodal
  - orchestration
```

- [ ] **Step 4: Run the check and the gates**

Run: `node local/check-taxonomy.mjs`
Expected: PASS — `taxonomy ok: 15 topics`.

Run: `node tools/corpus/cli.mjs render --check . ; echo "render=$?" ; node tools/corpus/cli.mjs lint . ; node tools/corpus/cli.mjs verify .`
Expected: `render=0` with no `would render:` line, `lint: clean`, `verify: clean`. Adding an unused topic changes nothing else; empty topics are invisible in navigation by design.

- [ ] **Step 5: Commit**

```bash
git add meta/taxonomy.yaml
git commit -m "feat: add providers, evals, multimodal and orchestration topics"
```

---

### Task 2: Amend the CLAUDE.md scope statement

**Files:**

- Modify: `CLAUDE.md`

**Interfaces:**

- Consumes: nothing.
- Produces: the amended scope sentence. No code reads it; it is the contract later stages argue from, and the quarantine principle it states is what keeps concept pages off the 30-day cadence.

- [ ] **Step 1: Confirm the current wording**

Run: `grep -n "Claude-first depth today" CLAUDE.md`
Expected: exactly one hit, in the "What this repo is" section.

- [ ] **Step 2: Replace the scope sentence**

`CLAUDE.md` is large; edit it with a Python script through Bash rather than the native edit tool, and assert the anchor is unique before writing:

```bash
python3 - <<'PY'
p = "CLAUDE.md"
s = open(p).read()
old = "Claude-first depth today, with a documented recipe for expanding to other\nmodels and domains on demand."
assert s.count(old) == 1, s.count(old)
new = (
    "Provider-weighted depth: Anthropic, OpenAI and Google carry the bulk of the\n"
    "coverage, with dedicated pages for smaller providers and for running models\n"
    "locally. Concepts are written so they hold across providers; mechanisms are\n"
    "documented where the vendor documents them."
)
open(p, "w").write(s.replace(old, new))
print("scope amended")
PY
```

- [ ] **Step 3: Add the quarantine principle**

Append a paragraph to the same section, immediately after the amended sentence:

```bash
python3 - <<'PY'
p = "CLAUDE.md"
s = open(p).read()
anchor = "documented where the vendor documents them."
assert s.count(anchor) == 1
add = anchor + (
    "\n\n**The quarantine principle.** Volatile values live in the `providers` topic\n"
    "and nowhere else. Every other page is written free of data records and links\n"
    "to the provider page that owns the figure. This is finding F2's workaround\n"
    "promoted to a rule: page cadence is the maximum volatility of any record the\n"
    "page references, so a single model price on a concept page puts that page on\n"
    "a 30-day clock permanently."
)
open(p, "w").write(s.replace(anchor, add))
print("quarantine principle added")
PY
```

- [ ] **Step 4: Verify both edits landed and the gates still pass**

Run: `grep -c "Claude-first depth today" CLAUDE.md ; grep -c "quarantine principle" CLAUDE.md`
Expected: `0` then `1`.

Run: `node tools/corpus/cli.mjs lint . ; node tools/corpus/cli.mjs verify .`
Expected: `lint: clean`, `verify: clean`. `CLAUDE.md` is not linted; this is a regression check.

- [ ] **Step 5: Commit**

```bash
git add CLAUDE.md
git commit -m "docs: provider-weighted scope and the quarantine principle"
```

---

### Task 3: Split the open-weight table onto its own page

**Files:**

- Create: `guides/providers/open-weight.md`
- Modify: `guides/models/comparison.md` — remove the open-weight marker block, its lead-in paragraph, and its four section-6 rows
- Modify: `data/models-other.yaml` — four records from `high` to `medium`

**Interfaces:**

- Consumes: the `providers` topic from Task 1; the tag `comparison-open-weight`, which selects exactly four records (`meta.models.llama-4-maverick`, `meta.models.llama-4-scout`, `qwen.models.qwen3-8-2-4t-a95b`, `qwen.models.qwen3-8-27b`).
- Produces: `guides/providers/open-weight.md`, which becomes its own refresh unit because it shares no record with `comparison.md` after this task. Task 4 does not depend on it.

- [ ] **Step 1: Write the failing check**

Create `local/check-split.mjs`:

```js
import fs from "node:fs";
import { loadRecords } from "../tools/corpus/data.mjs";
import { derivePageVolatility } from "../tools/corpus/ledger.mjs";
import { findBlocks } from "../tools/corpus/markers.mjs";

const records = loadRecords("data");
const fail = (m) => {
  console.error("FAIL: " + m);
  process.exitCode = 1;
};

const newPage = "guides/providers/open-weight.md";
if (!fs.existsSync(newPage)) fail(newPage + " does not exist");

const cmp = fs.readFileSync("guides/models/comparison.md", "utf8");
if (cmp.includes("comparison-open-weight"))
  fail("comparison.md still references comparison-open-weight");

const keys = [
  "meta.models.llama-4-maverick",
  "meta.models.llama-4-scout",
  "qwen.models.qwen3-8-2-4t-a95b",
  "qwen.models.qwen3-8-27b",
];
for (const k of keys) {
  const r = records.find((x) => x.key === k);
  if (!r) fail("missing record " + k);
  else if (r.volatility !== "medium")
    fail(k + " volatility is " + r.volatility + ", want medium");
}

if (fs.existsSync(newPage)) {
  const body = fs.readFileSync(newPage, "utf8");
  const tags = findBlocks(body)
    .filter((b) => !b.unterminated && b.kind === "table")
    .map((b) => b.attrs.tag);
  if (!tags.includes("comparison-open-weight"))
    fail("new page does not render comparison-open-weight");
  if (derivePageVolatility(body, records) !== "medium")
    fail("new page does not derive medium volatility");
}
if (!process.exitCode) console.log("split ok");
```

- [ ] **Step 2: Run it to verify it fails**

Run: `node local/check-split.mjs`
Expected: FAIL — `guides/providers/open-weight.md does not exist`, plus `comparison.md still references comparison-open-weight` and four volatility failures.

- [ ] **Step 3: Lower the four records to medium**

```bash
python3 - <<'PY'
import re
p = "data/models-other.yaml"
s = open(p).read()
keys = ["meta.models.llama-4-maverick", "meta.models.llama-4-scout",
        "qwen.models.qwen3-8-2-4t-a95b", "qwen.models.qwen3-8-27b"]
for k in keys:
    i = s.index("key: " + k)
    j = s.index("volatility: high", i)
    nxt = s.find("- key:", i + 1)
    assert nxt == -1 or j < nxt, "volatility for %s lies past the next record" % k
    s = s[:j] + "volatility: medium" + s[j + len("volatility: high"):]
open(p, "w").write(s)
print("four open-weight records set to medium")
PY
```

Why: a released checkpoint is immutable and open weights carry no prices. What moves is the lineup, on a release cadence, not a repricing cadence.

- [ ] **Step 4: Create the new page**

Create `guides/providers/open-weight.md` with this front-matter, then move content into it in Step 5:

```yaml
---
title: Open-weight models
summary: >-
  Open-weight models from Meta Llama and Alibaba Qwen as stated in each
  official model card on the verification date: model ids, parameter counts,
  context lengths and licences. There is no price column — what you pay
  depends on where and how you run the weights.
topic: providers
verified: 2026-10-06
applies_to:
  - "Hugging Face model cards in the meta-llama and Qwen organisations as published on 2026-10-06"
  - "Rows: Llama 4 Maverick, Llama 4 Scout; Qwen3.8-2.4T-A95B, Qwen3.8-27B"
sources:
  - https://huggingface.co/meta-llama/Llama-4-Maverick-17B-128E-Instruct
  - https://huggingface.co/meta-llama/Llama-4-Scout-17B-16E-Instruct
  - https://huggingface.co/Qwen/Qwen3.8-2.4T-A95B
  - https://huggingface.co/Qwen/Qwen3.8-27B
related:
  - guides/models/comparison.md
research: research/models/2026-10-06-claude-models-comparison-refresh.md
---
```

Note `seed: true` is **absent** — this page is new, not pre-pipeline, so claiming seed provenance would be false. It therefore needs `research:`, which points at the artifact that already grounds these rows.

- [ ] **Step 5: Move the content**

Move from `guides/models/comparison.md` into the new page, cutting from the source as you go:

1. The lead-in paragraph beginning `Open-weight models, as stated in each official model card` (one paragraph, immediately before the open-weight marker block).
2. The whole `corpus:table ... tag=comparison-open-weight` block including its opening and closing marker comments and the generated table between them.
3. The four section-6 rows whose Record column names the four keys (`Llama 4 Maverick row`, `Llama 4 Scout row`, `Qwen3.8-2.4T-A95B row`, `Qwen3.8-27B row`). Change their Volatility column from `high` to `medium` to match Step 3.

The new page uses the eight-part template. Write sections 1–8 around the moved content; section 6 must carry the four rows from (3), or `verify` fails with `rots-table-incomplete`.

- [ ] **Step 6: Run the check and the gates**

Run: `node local/check-split.mjs`
Expected: PASS — `split ok`.

Run: `node tools/corpus/cli.mjs render --write . && node tools/corpus/cli.mjs render --check . ; echo "render=$?"`
Expected: the new page's table renders, then `render=0` with no `would render:` line.

Run: `node tools/corpus/cli.mjs lint . ; node tools/corpus/cli.mjs verify . ; npm test 2>&1 | grep -E '^# (pass|fail)'`
Expected: `lint: clean`, `verify: clean`, `# fail 0`.

If `verify` reports `rots-table-incomplete` for the new page, section 6 is missing the four record keys. If it reports `research-required`, the `research:` line is missing.

- [ ] **Step 7: Remove any hook artifact and commit**

```bash
rm -rf guides/providers/.claude
git add guides/providers/open-weight.md guides/models/comparison.md data/models-other.yaml
git commit -m "feat: split open-weight models onto their own page at a 90-day cadence"
```

---

### Task 4: Move claude-models.md into the providers topic

**Files:**

- Rename: `guides/models/claude-models.md` → `guides/providers/anthropic.md`
- Modify: the moved page's `topic` and `related`
- Modify: `guides/models/comparison.md` — `related:` entry and the section-6 body link
- Modify: `guides/domains/software-engineering.md` — its reference to the old path

**Interfaces:**

- Consumes: the `providers` topic from Task 1.
- Produces: `guides/providers/anthropic.md`. It keeps `seed: true` and keeps sharing the `anthropic`/`claude-current` records with `comparison.md`, so the two stay one refresh unit — the move changes where the page lives, not what it costs.

- [ ] **Step 1: Write the failing check**

Create `local/check-move.mjs`:

```js
import fs from "node:fs";
const fail = (m) => {
  console.error("FAIL: " + m);
  process.exitCode = 1;
};
if (fs.existsSync("guides/models/claude-models.md"))
  fail("old path still exists");
if (!fs.existsSync("guides/providers/anthropic.md")) fail("new path missing");
else {
  const p = fs.readFileSync("guides/providers/anthropic.md", "utf8");
  if (!/^topic: providers$/m.test(p)) fail("moved page topic is not providers");
  if (!/^seed: true$/m.test(p))
    fail("seed: true was dropped — it is permanent");
}
for (const f of [
  "guides/models/comparison.md",
  "guides/domains/software-engineering.md",
]) {
  if (fs.readFileSync(f, "utf8").includes("models/claude-models.md"))
    fail(f + " still points at the old path");
}
const cmp = fs.readFileSync("guides/models/comparison.md", "utf8");
if (/\]\(claude-models\.md\)/.test(cmp))
  fail("comparison.md body still links the old relative path");
if (!process.exitCode) console.log("move ok");
```

- [ ] **Step 2: Run it to verify it fails**

Run: `node local/check-move.mjs`
Expected: FAIL — `old path still exists` and `new path missing`.

- [ ] **Step 3: Move the file and set its topic**

```bash
git mv guides/models/claude-models.md guides/providers/anthropic.md
python3 - <<'PY'
p = "guides/providers/anthropic.md"
s = open(p).read()
assert s.count("topic: models") == 1
open(p, "w").write(s.replace("topic: models", "topic: providers"))
print("topic set to providers")
PY
```

`git mv` preserves history. Do not delete and recreate.

- [ ] **Step 4: Repoint the body link in comparison.md**

This is the one no gate catches. `comparison.md` section 6 links `[Claude models](claude-models.md)`, a sibling-relative path that is correct only while both pages live in `guides/models/`:

```bash
python3 - <<'PY'
p = "guides/models/comparison.md"
s = open(p).read()
old = "](claude-models.md)"
assert s.count(old) == 1, s.count(old)
open(p, "w").write(s.replace(old, "](../providers/anthropic.md)"))
print("body link repointed")
PY
```

- [ ] **Step 5: Repoint every `related:` and cross-reference**

```bash
python3 - <<'PY'
for p in ["guides/models/comparison.md", "guides/domains/software-engineering.md"]:
    s = open(p).read()
    n = s.count("guides/models/claude-models.md")
    if n:
        open(p, "w").write(s.replace("guides/models/claude-models.md",
                                     "guides/providers/anthropic.md"))
    print(p, "->", n, "reference(s) repointed")
PY
```

Then check the moved page's own `related:` list still resolves — it names `guides/context/context-management.md`, which has not moved, so no edit is needed there.

- [ ] **Step 6: Run the check and the gates**

Run: `node local/check-move.mjs`
Expected: PASS — `move ok`.

Run: `node tools/corpus/cli.mjs render --check . ; echo "render=$?" ; node tools/corpus/cli.mjs lint . ; node tools/corpus/cli.mjs verify . ; npm test 2>&1 | grep -E '^# (pass|fail)'`
Expected: `render=0` with no `would render:` line, `lint: clean`, `verify: clean`, `# fail 0`.

A `related-path-unresolved` from `verify` means Step 5 missed a reference.

- [ ] **Step 7: Confirm the built site has no dead in-page links**

```bash
node tools/corpus/cli.mjs site --write . >/dev/null
node -e '
const fs=require("fs");let dead=0;
for (const f of fs.readdirSync("dist/guides",{recursive:true}).filter(x=>x.endsWith(".html"))) {
  const h=fs.readFileSync("dist/guides/"+f,"utf8");
  for (const m of h.matchAll(/href="([^"#:]+\.html)"/g)) {
    const t=require("path").resolve("dist/guides/"+require("path").dirname(f), m[1]);
    if (!fs.existsSync(t)) { dead++; console.log("DEAD", f, "->", m[1]); }
  }
}
console.log("dead page links:", dead);'
```

Expected: `dead page links: 0`. This is the only check that would have caught the Step 4 link, so run it even if every gate is green.

- [ ] **Step 8: Remove any hook artifact and commit**

```bash
rm -rf guides/providers/.claude
git add guides/providers/anthropic.md guides/models/comparison.md guides/domains/software-engineering.md
git commit -m "refactor: move the Claude models page into the providers topic"
```

---

## After the last task

`meta/ledger.yaml` is now stale: it still lists `guides/models/claude-models.md` and does not know the new pages. **Leave it.** It is regenerated on `master` after this branch merges, by running `node tools/corpus/cli.mjs ledger --write .` there and committing the result. Doing it here would make this branch the second writer of a single-writer file.

The published URL `/guides/models/claude-models.html` dies with this merge. That is the intended, approved cost, taken now because the site has no inbound links yet.
