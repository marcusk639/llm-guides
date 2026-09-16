# Corpus Foundation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the structural contract for the LLM corpus — directory skeleton, provisional instruction file, and a three-command CLI (`render`, `lint`, `ledger`) plus a proof runner — then write five seed guides that stress-test it.

**Architecture:** A small Node ESM tool at `tools/corpus/` reads YAML data records and Markdown guides. `render` expands marker blocks in prose from data records; `lint` validates front-matter and performs a closed-world search for known volatile values appearing bare in prose; `ledger` derives per-page freshness from the records each page references. The tool is built test-first against adversarial fixtures, before any real guide exists, so the lint cannot be shaped to pass real content.

**Tech Stack:** Node 20+ (ESM, no build step), `node:test` + `node:assert/strict`, `js-yaml` (only runtime dependency), Prettier (already active via a global hook on `.md`).

**Spec:** `docs/superpowers/specs/2026-09-16-llm-corpus-foundation-design.md` (revision 2)

## Deviation from the spec

The spec orders phases seeds → codify → enforce. This plan builds the tool
before the seeds, for two reasons: seeds cannot be authored without a working
renderer and a fixed marker syntax, and a lint written after the real seeds gets
shaped to pass them. The tool is therefore developed against deliberately
adversarial fixtures (Tasks 2–9), the seeds are written against the working tool
(Tasks 10–14), and the spec's amendment step is preserved as Task 15.

## Global Constraints

- **Identifiers vs values.** Identifiers (hook event names, tool names, parameter names, flag names) are free in prose. Values (model ids, prices, context and rate limits, parameter defaults, availability dates) must exist as a record in `data/` and may appear in prose only inside a marker block.
- **The lint is closed-world.** It searches prose only for value strings the corpus already has records for. It must never attempt to recognize volatile values in the abstract, and must produce no false positives on ordinary numbers.
- **Marker comments sit outside fenced code blocks.** A generated region may contain a complete fence.
- **Public labels require public evidence.** `Verified` requires a passing proof that ships in the repo. Nothing derived from session transcripts may enter a committed document.
- **`local/` is gitignored** and holds anything derived from session transcripts.
- **`volatility` is a data-record field, never front-matter.** Page cadence is derived as the maximum volatility of referenced records.
- **Cadence (provisional):** high 30 days, medium 90 days, low 270 days.
- **Evidence labels:** `Verified`, `Documented`, `Plausible` — exact casing.
- **Front-matter required fields:** `title`, `summary`, `topic`, `verified`, `applies_to`, `sources`, `related`. Optional: `research`, `seed`, `status`.
- **Dates are `YYYY-MM-DD` strings.** All YAML is loaded with `yaml.JSON_SCHEMA` so dates stay strings and are never coerced to `Date`.
- **Topic values (closed set):** `foundations`, `prompting`, `context`, `agents`, `claude-code`, `cowork`, `harness`, `models`, `tools`, `building`, `domains`.

---

## File Structure

| File                           | Responsibility                                           |
| ------------------------------ | -------------------------------------------------------- |
| `package.json`                 | Root manifest; `type: module`, `corpus` bin, `npm test`  |
| `tools/corpus/frontmatter.mjs` | Split front-matter from body; validate required fields   |
| `tools/corpus/data.mjs`        | Load data records; build the closed-world literal index  |
| `tools/corpus/markers.mjs`     | Find, parse, and replace marker blocks                   |
| `tools/corpus/render.mjs`      | Expand marker blocks from records                        |
| `tools/corpus/lint.mjs`        | Front-matter, bare-value, marker-integrity, expiry rules |
| `tools/corpus/ledger.mjs`      | Derive page volatility, expiry; emit the ledger          |
| `tools/corpus/proofs.mjs`      | Discover, run, and re-stamp proofs                       |
| `tools/corpus/cli.mjs`         | Argument parsing and command dispatch                    |
| `tools/corpus/test/*.test.mjs` | One test file per module                                 |
| `tools/corpus/test/fixtures/`  | Adversarial fixture corpus                               |

---

### Task 1: Repository skeleton and provisional instruction file

**Files:**

- Create: `package.json`, `.gitignore`, `meta/taxonomy.yaml`, `CLAUDE.md` (rewrite)
- Create (empty, with `.gitkeep`): `guides/`, `data/`, `research/`, `examples/`, `meta/`

**Interfaces:**

- Consumes: nothing.
- Produces: `meta/taxonomy.yaml` with an eleven-entry `topics` list, consumed by Task 4's topic validation.

- [ ] **Step 1: Create the directory skeleton**

```bash
# from the repository root
mkdir -p guides data research examples meta local tools/corpus/test/fixtures
for d in guides data research examples meta; do touch "$d/.gitkeep"; done
```

- [ ] **Step 2: Create `.gitignore`**

```
node_modules/
local/
.superpowers/
.DS_Store
```

- [ ] **Step 3: Create `package.json`**

```json
{
  "name": "llm-guides",
  "version": "0.1.0",
  "private": true,
  "type": "module",
  "bin": { "corpus": "./tools/corpus/cli.mjs" },
  "scripts": {
    "test": "node --test tools/corpus/test/",
    "lint": "node tools/corpus/cli.mjs lint",
    "render": "node tools/corpus/cli.mjs render",
    "ledger": "node tools/corpus/cli.mjs ledger"
  },
  "dependencies": { "js-yaml": "^4.1.0" },
  "engines": { "node": ">=20" }
}
```

- [ ] **Step 4: Install the dependency**

Run: `npm install`
Expected: `js-yaml` added, `package-lock.json` created.

- [ ] **Step 5: Create `meta/taxonomy.yaml`**

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
```

- [ ] **Step 6: Rewrite `CLAUDE.md` as the provisional instruction file**

Replace the whole file. It must state: the directory layout from the File Structure table above; the identifier/value split with the "would a reader paste this into their own config?" test; the marker-block syntax from Task 6; the eight-part page template; the three evidence labels; the four source tiers; that `local/` is gitignored and transcript-derived content never enters a committed document; and that the root-level tooling decision supersedes the previous "no repo-wide build, lint, or test commands" convention.

Begin the file with:

```markdown
> **Provisional.** This file encodes `docs/superpowers/specs/2026-09-16-llm-corpus-foundation-design.md` (revision 2) before the seed guides have tested it. Amendments land in Task 15.
```

- [ ] **Step 7: Verify a cold session follows it**

Run: `node -e "const t=require('node:fs').readFileSync('CLAUDE.md','utf8');for(const s of ['identifier','value','corpus:data','Verified','Documented','Plausible','local/'])if(!t.includes(s))throw new Error('missing: '+s);console.log('ok')"`
Expected: `ok`

- [ ] **Step 8: Commit**

```bash
git add package.json package-lock.json .gitignore CLAUDE.md meta/taxonomy.yaml guides/.gitkeep data/.gitkeep research/.gitkeep examples/.gitkeep meta/.gitkeep
git commit -m "feat: corpus skeleton and provisional instruction file"
```

---

### Task 2: Front-matter parsing

**Files:**

- Create: `tools/corpus/frontmatter.mjs`
- Test: `tools/corpus/test/frontmatter.test.mjs`

**Interfaces:**

- Consumes: nothing.
- Produces: `parseFrontmatter(text) -> { data: object|null, body: string, bodyOffset: number }`. `bodyOffset` is the character index in `text` where the body begins; Task 5 needs it to report correct line numbers and to skip front-matter when scanning.

- [ ] **Step 1: Write the failing test**

```js
// tools/corpus/test/frontmatter.test.mjs
import test from "node:test";
import assert from "node:assert/strict";
import { parseFrontmatter } from "../frontmatter.mjs";

test("parses front-matter and returns the body", () => {
  const text =
    "---\ntitle: Hooks\nverified: 2026-09-16\n---\n# Hooks\n\nBody.\n";
  const { data, body, bodyOffset } = parseFrontmatter(text);
  assert.equal(data.title, "Hooks");
  assert.equal(data.verified, "2026-09-16");
  assert.equal(typeof data.verified, "string");
  assert.equal(body, "# Hooks\n\nBody.\n");
  assert.equal(text.slice(bodyOffset), body);
});

test("returns null data when no front-matter is present", () => {
  const { data, body, bodyOffset } = parseFrontmatter("# Bare\n");
  assert.equal(data, null);
  assert.equal(body, "# Bare\n");
  assert.equal(bodyOffset, 0);
});

test("returns an empty object for empty front-matter", () => {
  const { data } = parseFrontmatter("---\n\n---\nx\n");
  assert.deepEqual(data, {});
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `node --test tools/corpus/test/frontmatter.test.mjs`
Expected: FAIL — cannot find module `../frontmatter.mjs`

- [ ] **Step 3: Write the implementation**

```js
// tools/corpus/frontmatter.mjs
import yaml from "js-yaml";

const FM = /^---\r?\n([\s\S]*?)\r?\n---[ \t]*\r?\n?/;

export function parseFrontmatter(text) {
  const m = text.match(FM);
  if (!m) return { data: null, body: text, bodyOffset: 0 };
  const data = yaml.load(m[1], { schema: yaml.JSON_SCHEMA }) ?? {};
  return { data, body: text.slice(m[0].length), bodyOffset: m[0].length };
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `node --test tools/corpus/test/frontmatter.test.mjs`
Expected: PASS — 3 tests

- [ ] **Step 5: Commit**

```bash
git add tools/corpus/frontmatter.mjs tools/corpus/test/frontmatter.test.mjs
git commit -m "feat: front-matter parsing with string-preserving YAML load"
```

---

### Task 3: Data records and the closed-world literal index

**Files:**

- Create: `tools/corpus/data.mjs`
- Test: `tools/corpus/test/data.test.mjs`
- Create: `tools/corpus/test/fixtures/data/models.yaml`

**Interfaces:**

- Consumes: nothing.
- Produces: `loadRecords(dataDir) -> Record[]` where `Record` is `{ key, value, display?, unit?, volatility, source, verified, lint?, lint_literals?, tags?, file }`; and `literalIndex(records) -> Map<string, string[]>` mapping a searchable literal to the record keys that own it.

- [ ] **Step 1: Create the fixture**

```yaml
# tools/corpus/test/fixtures/data/models.yaml
records:
  - key: example.model.context_window
    value: "200000"
    display: "200K"
    unit: tokens
    volatility: high
    source: https://example.invalid/docs/models
    verified: 2026-09-16
    tags: [frontier]
  - key: example.model.price_in
    value: "3"
    volatility: high
    source: https://example.invalid/docs/pricing
    verified: 2026-09-16
    lint: false
    tags: [frontier]
  - key: example.model.api_id
    value: "example-model-4-5-20260101"
    volatility: high
    source: https://example.invalid/docs/models
    verified: 2026-09-16
    tags: [frontier]
```

- [ ] **Step 2: Write the failing test**

```js
// tools/corpus/test/data.test.mjs
import test from "node:test";
import assert from "node:assert/strict";
import { loadRecords, literalIndex, MIN_LITERAL_LENGTH } from "../data.mjs";

const DIR = new URL("./fixtures/data/", import.meta.url).pathname;

test("loads every record and tags it with its source file", () => {
  const records = loadRecords(DIR);
  assert.equal(records.length, 3);
  assert.equal(records[0].key, "example.model.context_window");
  assert.equal(records[0].file, "models.yaml");
  assert.equal(typeof records[0].verified, "string");
});

test("indexes both value and display", () => {
  const index = literalIndex(loadRecords(DIR));
  assert.deepEqual(index.get("200000"), ["example.model.context_window"]);
  assert.deepEqual(index.get("200K"), ["example.model.context_window"]);
});

test("omits records that opt out of linting", () => {
  const index = literalIndex(loadRecords(DIR));
  assert.equal(index.has("3"), false);
});

test("omits literals shorter than the minimum length", () => {
  const index = literalIndex([
    {
      key: "k",
      value: "42",
      volatility: "low",
      source: "s",
      verified: "2026-09-16",
    },
  ]);
  assert.equal(index.size, 0);
  assert.equal(MIN_LITERAL_LENGTH, 3);
});

test("honours explicit lint_literals over value and display", () => {
  const index = literalIndex([
    {
      key: "k",
      value: "7",
      display: "seven",
      lint_literals: ["seven dollars"],
      volatility: "low",
      source: "s",
      verified: "2026-09-16",
    },
  ]);
  assert.deepEqual([...index.keys()], ["seven dollars"]);
});
```

- [ ] **Step 3: Run the test to verify it fails**

Run: `node --test tools/corpus/test/data.test.mjs`
Expected: FAIL — cannot find module `../data.mjs`

- [ ] **Step 4: Write the implementation**

```js
// tools/corpus/data.mjs
import fs from "node:fs";
import path from "node:path";
import yaml from "js-yaml";

export const MIN_LITERAL_LENGTH = 3;

export function loadRecords(dataDir) {
  if (!fs.existsSync(dataDir)) return [];
  const out = [];
  for (const file of fs
    .readdirSync(dataDir)
    .filter((f) => f.endsWith(".yaml"))
    .sort()) {
    const doc =
      yaml.load(fs.readFileSync(path.join(dataDir, file), "utf8"), {
        schema: yaml.JSON_SCHEMA,
      }) ?? {};
    for (const r of doc.records ?? []) out.push({ ...r, file });
  }
  return out;
}

export function literalIndex(records) {
  const index = new Map();
  for (const r of records) {
    if (r.lint === false) continue;
    const literals =
      r.lint_literals ?? [r.value, r.display].filter((v) => v != null);
    for (const literal of literals.map(String)) {
      if (literal.length < MIN_LITERAL_LENGTH) continue;
      if (!index.has(literal)) index.set(literal, []);
      index.get(literal).push(r.key);
    }
  }
  return index;
}

export function recordsByKey(records) {
  return new Map(records.map((r) => [r.key, r]));
}
```

- [ ] **Step 5: Run the test to verify it passes**

Run: `node --test tools/corpus/test/data.test.mjs`
Expected: PASS — 5 tests

- [ ] **Step 6: Commit**

```bash
git add tools/corpus/data.mjs tools/corpus/test/data.test.mjs tools/corpus/test/fixtures/data/models.yaml
git commit -m "feat: data record loading and closed-world literal index"
```

---

### Task 4: Front-matter validation rules

**Files:**

- Create: `tools/corpus/lint.mjs`
- Test: `tools/corpus/test/lint-frontmatter.test.mjs`

**Interfaces:**

- Consumes: `parseFrontmatter` (Task 2); `meta/taxonomy.yaml` (Task 1).
- Produces: `validateFrontmatter(data, topics) -> Issue[]` where `Issue` is `{ rule, message, line? }`. Tasks 5 and 7 append to the same `Issue[]` shape.

- [ ] **Step 1: Write the failing test**

```js
// tools/corpus/test/lint-frontmatter.test.mjs
import test from "node:test";
import assert from "node:assert/strict";
import { validateFrontmatter, REQUIRED_FIELDS } from "../lint.mjs";

const TOPICS = ["claude-code", "models"];
const ok = {
  title: "Hooks",
  summary: "What hooks are and when they fire.",
  topic: "claude-code",
  verified: "2026-09-16",
  applies_to: { "claude-code": ">=2.0" },
  sources: ["https://example.invalid/docs"],
  related: [],
};

test("accepts a complete front-matter block", () => {
  assert.deepEqual(validateFrontmatter(ok, TOPICS), []);
});

test("reports every missing required field", () => {
  const issues = validateFrontmatter({ title: "x" }, TOPICS);
  const missing = issues.filter((i) => i.rule === "frontmatter-required");
  assert.equal(missing.length, REQUIRED_FIELDS.length - 1);
});

test("rejects a topic outside the taxonomy", () => {
  const issues = validateFrontmatter({ ...ok, topic: "astrology" }, TOPICS);
  assert.equal(
    issues.some((i) => i.rule === "frontmatter-topic"),
    true,
  );
});

test("rejects a verified date that is not YYYY-MM-DD", () => {
  const issues = validateFrontmatter(
    { ...ok, verified: "September 2026" },
    TOPICS,
  );
  assert.equal(
    issues.some((i) => i.rule === "frontmatter-date"),
    true,
  );
});

test("rejects a volatility field on a page", () => {
  const issues = validateFrontmatter({ ...ok, volatility: "high" }, TOPICS);
  assert.equal(
    issues.some((i) => i.rule === "frontmatter-derived-volatility"),
    true,
  );
});

test("reports entirely missing front-matter", () => {
  const issues = validateFrontmatter(null, TOPICS);
  assert.equal(issues.length, 1);
  assert.equal(issues[0].rule, "frontmatter-missing");
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `node --test tools/corpus/test/lint-frontmatter.test.mjs`
Expected: FAIL — cannot find module `../lint.mjs`

- [ ] **Step 3: Write the implementation**

```js
// tools/corpus/lint.mjs
export const REQUIRED_FIELDS = [
  "title",
  "summary",
  "topic",
  "verified",
  "applies_to",
  "sources",
  "related",
];

const DATE = /^\d{4}-\d{2}-\d{2}$/;

export function validateFrontmatter(data, topics) {
  if (data == null) {
    return [
      { rule: "frontmatter-missing", message: "document has no front-matter" },
    ];
  }
  const issues = [];
  for (const field of REQUIRED_FIELDS) {
    if (!(field in data)) {
      issues.push({
        rule: "frontmatter-required",
        message: `missing required field: ${field}`,
      });
    }
  }
  if ("topic" in data && !topics.includes(data.topic)) {
    issues.push({
      rule: "frontmatter-topic",
      message: `unknown topic: ${data.topic}`,
    });
  }
  if ("verified" in data && !DATE.test(String(data.verified))) {
    issues.push({
      rule: "frontmatter-date",
      message: `verified must be YYYY-MM-DD, got: ${data.verified}`,
    });
  }
  if ("volatility" in data) {
    issues.push({
      rule: "frontmatter-derived-volatility",
      message:
        "volatility is derived from referenced records; remove it from front-matter",
    });
  }
  return issues;
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `node --test tools/corpus/test/lint-frontmatter.test.mjs`
Expected: PASS — 6 tests

- [ ] **Step 5: Commit**

```bash
git add tools/corpus/lint.mjs tools/corpus/test/lint-frontmatter.test.mjs
git commit -m "feat: front-matter validation rules"
```

---

### Task 5: Marker block parsing

**Files:**

- Create: `tools/corpus/markers.mjs`
- Test: `tools/corpus/test/markers.test.mjs`

**Interfaces:**

- Consumes: nothing.
- Produces: `findBlocks(text) -> Block[]` where `Block` is `{ kind: 'data'|'table', attrs: object, start, contentStart, content, end, unterminated }`; and `coveredRanges(blocks) -> [start, end][]`, consumed by Task 6's bare-value scan.

- [ ] **Step 1: Write the failing test**

````js
// tools/corpus/test/markers.test.mjs
import test from "node:test";
import assert from "node:assert/strict";
import { findBlocks, coveredRanges, parseAttrs } from "../markers.mjs";

test("parses attributes including quoted values", () => {
  assert.deepEqual(parseAttrs('key=a.b filter="frontier tier" fields=x,y'), {
    key: "a.b",
    filter: "frontier tier",
    fields: "x,y",
  });
});

test("finds a data block and captures its content", () => {
  const text =
    "Before\n<!-- corpus:data key=a.b -->\n200K\n<!-- /corpus:data -->\nAfter\n";
  const [block] = findBlocks(text);
  assert.equal(block.kind, "data");
  assert.equal(block.attrs.key, "a.b");
  assert.equal(block.content.trim(), "200K");
  assert.equal(block.unterminated, false);
  assert.equal(
    text.slice(block.start, block.end).endsWith("<!-- /corpus:data -->"),
    true,
  );
});

test("a block may contain a complete fenced code block", () => {
  const text = [
    "<!-- corpus:data key=a.api_id -->",
    "```bash",
    "call --model example-model-4-5",
    "```",
    "<!-- /corpus:data -->",
  ].join("\n");
  const [block] = findBlocks(text);
  assert.equal(block.content.includes("```bash"), true);
  assert.equal(block.unterminated, false);
});

test("flags an unterminated block", () => {
  const [block] = findBlocks("<!-- corpus:data key=a.b -->\nno close\n");
  assert.equal(block.unterminated, true);
});

test("coveredRanges excludes unterminated blocks", () => {
  const text =
    "<!-- corpus:data key=a -->\nx\n<!-- /corpus:data -->\n<!-- corpus:table file=m.yaml -->\n";
  assert.equal(coveredRanges(findBlocks(text)).length, 1);
});
````

- [ ] **Step 2: Run the test to verify it fails**

Run: `node --test tools/corpus/test/markers.test.mjs`
Expected: FAIL — cannot find module `../markers.mjs`

- [ ] **Step 3: Write the implementation**

```js
// tools/corpus/markers.mjs
const OPEN = /<!--\s*corpus:(data|table)\s+([\s\S]*?)-->/g;

export function parseAttrs(source) {
  const attrs = {};
  for (const m of source.matchAll(/([\w-]+)=("[^"]*"|'[^']*'|\S+)/g)) {
    attrs[m[1]] = m[2].replace(/^["']|["']$/g, "");
  }
  return attrs;
}

export function findBlocks(text) {
  const blocks = [];
  const re = new RegExp(OPEN.source, "g");
  let m;
  while ((m = re.exec(text)) !== null) {
    const kind = m[1];
    const close = `<!-- /corpus:${kind} -->`;
    const contentStart = m.index + m[0].length;
    const closeIndex = text.indexOf(close, contentStart);
    if (closeIndex === -1) {
      blocks.push({
        kind,
        attrs: parseAttrs(m[2]),
        start: m.index,
        contentStart,
        content: "",
        end: contentStart,
        unterminated: true,
      });
      continue;
    }
    blocks.push({
      kind,
      attrs: parseAttrs(m[2]),
      start: m.index,
      contentStart,
      content: text.slice(contentStart, closeIndex),
      end: closeIndex + close.length,
      unterminated: false,
    });
    re.lastIndex = closeIndex + close.length;
  }
  return blocks;
}

export function coveredRanges(blocks) {
  return blocks.filter((b) => !b.unterminated).map((b) => [b.start, b.end]);
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `node --test tools/corpus/test/markers.test.mjs`
Expected: PASS — 5 tests

- [ ] **Step 5: Commit**

```bash
git add tools/corpus/markers.mjs tools/corpus/test/markers.test.mjs
git commit -m "feat: marker block parsing with fence-safe content capture"
```

---

### Task 6: The closed-world bare-value rule

**Files:**

- Modify: `tools/corpus/lint.mjs` (append `findBareValues`)
- Test: `tools/corpus/test/lint-values.test.mjs`

**Interfaces:**

- Consumes: `literalIndex` (Task 3), `findBlocks` / `coveredRanges` (Task 5), `parseFrontmatter` (Task 2).
- Produces: `findBareValues(text, index) -> Issue[]` with `rule: 'bare-value'` and a 1-based `line`.

This is the load-bearing rule. It must fire on a known value outside a marker block, and must not fire on ordinary numbers, on values inside marker blocks, or on the front-matter itself.

- [ ] **Step 1: Write the failing test**

````js
// tools/corpus/test/lint-values.test.mjs
import test from "node:test";
import assert from "node:assert/strict";
import { findBareValues } from "../lint.mjs";

const index = new Map([
  ["200K", ["example.model.context_window"]],
  ["200000", ["example.model.context_window"]],
  ["example-model-4-5-20260101", ["example.model.api_id"]],
]);

test("flags a known value written bare in prose", () => {
  const text = "---\ntitle: t\n---\nThe window is 200K tokens.\n";
  const [issue] = findBareValues(text, index);
  assert.equal(issue.rule, "bare-value");
  assert.equal(issue.line, 4);
  assert.match(issue.message, /example\.model\.context_window/);
});

test("does not flag a value inside a marker block", () => {
  const text =
    "---\ntitle: t\n---\n<!-- corpus:data key=example.model.context_window -->\n200K\n<!-- /corpus:data -->\n";
  assert.deepEqual(findBareValues(text, index), []);
});

test("does not flag values appearing in front-matter", () => {
  const text =
    "---\ntitle: t\nsources:\n  - https://x.invalid/200000\n---\nBody.\n";
  assert.deepEqual(findBareValues(text, index), []);
});

test("does not flag ordinary numbers the corpus knows nothing about", () => {
  const text =
    "---\ntitle: t\n---\nThere are three labels and HTTP 429 exists. RFC 3339 too.\n";
  assert.deepEqual(findBareValues(text, index), []);
});

test("respects word boundaries", () => {
  const text =
    "---\ntitle: t\n---\nThe id is example-model-4-5-20260101x here.\n";
  assert.deepEqual(findBareValues(text, index), []);
});

test("flags a bare value inside a fenced code block outside any marker", () => {
  const text =
    "---\ntitle: t\n---\n```bash\ncall --model example-model-4-5-20260101\n```\n";
  assert.equal(findBareValues(text, index).length, 1);
});
````

- [ ] **Step 2: Run the test to verify it fails**

Run: `node --test tools/corpus/test/lint-values.test.mjs`
Expected: FAIL — `findBareValues` is not exported

- [ ] **Step 3: Append the implementation to `tools/corpus/lint.mjs`**

```js
import { parseFrontmatter } from "./frontmatter.mjs";
import { findBlocks, coveredRanges } from "./markers.mjs";

const WORD = /[A-Za-z0-9]/;

function isBoundedMatch(text, at, literal) {
  const before = text[at - 1];
  const after = text[at + literal.length];
  return !(before && WORD.test(before)) && !(after && WORD.test(after));
}

export function findBareValues(text, index) {
  const { bodyOffset } = parseFrontmatter(text);
  const ranges = coveredRanges(findBlocks(text));
  const inBlock = (i) => ranges.some(([s, e]) => i >= s && i < e);
  const issues = [];
  for (const [literal, keys] of index) {
    let at = text.indexOf(literal, bodyOffset);
    while (at !== -1) {
      if (!inBlock(at) && isBoundedMatch(text, at, literal)) {
        issues.push({
          rule: "bare-value",
          message: `value "${literal}" belongs to record(s) ${keys.join(", ")}; wrap it in a marker block`,
          line: text.slice(0, at).split("\n").length,
        });
      }
      at = text.indexOf(literal, at + literal.length);
    }
  }
  return issues.sort((a, b) => a.line - b.line);
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `node --test tools/corpus/test/lint-values.test.mjs`
Expected: PASS — 6 tests

- [ ] **Step 5: Run the whole suite**

Run: `npm test`
Expected: PASS — all tests from Tasks 2–6

- [ ] **Step 6: Commit**

```bash
git add tools/corpus/lint.mjs tools/corpus/test/lint-values.test.mjs
git commit -m "feat: closed-world bare-value lint rule"
```

---

### Task 7: The renderer

**Files:**

- Create: `tools/corpus/render.mjs`
- Test: `tools/corpus/test/render.test.mjs`

**Interfaces:**

- Consumes: `findBlocks` (Task 5), `loadRecords` / `recordsByKey` (Task 3).
- Produces: `renderText(text, records) -> { text, issues }`. `corpus:data` blocks are replaced with the record's `display ?? value`; `corpus:table` blocks are replaced with a Markdown table built from `fields` and optional `tag` filtering.

- [ ] **Step 1: Write the failing test**

```js
// tools/corpus/test/render.test.mjs
import test from "node:test";
import assert from "node:assert/strict";
import { renderText } from "../render.mjs";

const records = [
  {
    key: "m.context",
    value: "200000",
    display: "200K",
    volatility: "high",
    source: "s",
    verified: "2026-09-16",
    tags: ["frontier"],
  },
  {
    key: "m.api_id",
    value: "example-model-4-5",
    volatility: "high",
    source: "s",
    verified: "2026-09-16",
    tags: ["frontier"],
  },
  {
    key: "other.thing",
    value: "nope",
    volatility: "low",
    source: "s",
    verified: "2026-09-16",
    tags: ["legacy"],
  },
];

test("expands a data block to display, falling back to value", () => {
  const src = "A <!-- corpus:data key=m.context -->OLD<!-- /corpus:data --> B";
  const { text } = renderText(src, records);
  assert.equal(
    text,
    "A <!-- corpus:data key=m.context -->200K<!-- /corpus:data --> B",
  );

  const src2 = "<!-- corpus:data key=m.api_id -->x<!-- /corpus:data -->";
  assert.equal(
    renderText(src2, records).text.includes("example-model-4-5"),
    true,
  );
});

test("reports an unknown key instead of silently emptying the block", () => {
  const { text, issues } = renderText(
    "<!-- corpus:data key=missing.key -->x<!-- /corpus:data -->",
    records,
  );
  assert.equal(issues.length, 1);
  assert.equal(issues[0].rule, "render-unknown-key");
  assert.equal(text.includes("x"), true);
});

test("builds a table filtered by tag", () => {
  const src =
    "<!-- corpus:table fields=key,display,value tag=frontier -->\nold\n<!-- /corpus:table -->";
  const { text } = renderText(src, records);
  assert.equal(text.includes("| key | display | value |"), true);
  assert.equal(text.includes("| m.context | 200K | 200000 |"), true);
  assert.equal(text.includes("other.thing"), false);
});

test("is idempotent", () => {
  const src = "A <!-- corpus:data key=m.context -->OLD<!-- /corpus:data -->";
  const once = renderText(src, records).text;
  assert.equal(renderText(once, records).text, once);
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `node --test tools/corpus/test/render.test.mjs`
Expected: FAIL — cannot find module `../render.mjs`

- [ ] **Step 3: Write the implementation**

```js
// tools/corpus/render.mjs
import { findBlocks } from "./markers.mjs";
import { recordsByKey } from "./data.mjs";

function buildTable(records, attrs) {
  const fields = (attrs.fields ?? "key,value").split(",").map((f) => f.trim());
  const rows = attrs.tag
    ? records.filter((r) => (r.tags ?? []).includes(attrs.tag))
    : records;
  const header = `| ${fields.join(" | ")} |`;
  const divider = `| ${fields.map(() => "---").join(" | ")} |`;
  const body = rows.map(
    (r) => `| ${fields.map((f) => r[f] ?? "").join(" | ")} |`,
  );
  return ["", header, divider, ...body, ""].join("\n");
}

export function renderText(text, records) {
  const byKey = recordsByKey(records);
  const issues = [];
  const blocks = findBlocks(text).filter((b) => !b.unterminated);
  let out = "";
  let cursor = 0;
  for (const block of blocks) {
    out += text.slice(cursor, block.contentStart);
    if (block.kind === "data") {
      const record = byKey.get(block.attrs.key);
      if (!record) {
        issues.push({
          rule: "render-unknown-key",
          message: `unknown record key: ${block.attrs.key}`,
        });
        out += block.content;
      } else {
        out += String(record.display ?? record.value);
      }
    } else {
      out += buildTable(records, block.attrs);
    }
    cursor = block.contentStart + block.content.length;
  }
  out += text.slice(cursor);
  return { text: out, issues };
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `node --test tools/corpus/test/render.test.mjs`
Expected: PASS — 4 tests

- [ ] **Step 5: Commit**

```bash
git add tools/corpus/render.mjs tools/corpus/test/render.test.mjs
git commit -m "feat: marker block renderer with data and table expansion"
```

---

### Task 8: The ledger and the expiry rule

**Files:**

- Create: `tools/corpus/ledger.mjs`
- Modify: `tools/corpus/lint.mjs` (append `checkExpiry`)
- Test: `tools/corpus/test/ledger.test.mjs`

**Interfaces:**

- Consumes: `findBlocks` (Task 5), `recordsByKey` (Task 3), `parseFrontmatter` (Task 2).
- Produces: `CADENCE_DAYS`; `derivePageVolatility(text, records) -> 'high'|'medium'|'low'|null`; `expiryFor(verified, volatility) -> string`; `buildLedger(pages) -> { generated, entries }`; and `checkExpiry(entry, today) -> Issue[]` with `rule: 'expired'`.

- [ ] **Step 1: Write the failing test**

```js
// tools/corpus/test/ledger.test.mjs
import test from "node:test";
import assert from "node:assert/strict";
import {
  CADENCE_DAYS,
  derivePageVolatility,
  expiryFor,
  buildLedger,
} from "../ledger.mjs";
import { checkExpiry } from "../lint.mjs";

const records = [
  { key: "a.low", volatility: "low" },
  { key: "a.high", volatility: "high" },
  { key: "a.medium", volatility: "medium", tags: ["frontier"] },
];

test("cadence matches the provisional spec values", () => {
  assert.deepEqual(CADENCE_DAYS, { high: 30, medium: 90, low: 270 });
});

test("page volatility is the maximum of referenced records", () => {
  const text =
    "<!-- corpus:data key=a.low -->x<!-- /corpus:data --><!-- corpus:data key=a.high -->y<!-- /corpus:data -->";
  assert.equal(derivePageVolatility(text, records), "high");
});

test("a page referencing no records has no derived volatility", () => {
  assert.equal(derivePageVolatility("plain prose", records), null);
});

test("a table block makes the page as volatile as its most volatile row", () => {
  const text =
    "<!-- corpus:table fields=key tag=frontier -->\nold\n<!-- /corpus:table -->";
  assert.equal(derivePageVolatility(text, records), "medium");
});

test("expiry adds the cadence to the verified date", () => {
  assert.equal(expiryFor("2026-09-16", "high"), "2026-10-16");
  assert.equal(expiryFor("2026-01-01", "low"), "2026-09-28");
});

test("buildLedger emits one entry per page with a generated timestamp", () => {
  const ledger = buildLedger([
    { path: "guides/models/x.md", verified: "2026-09-16", volatility: "high" },
  ]);
  assert.equal(ledger.entries.length, 1);
  assert.equal(ledger.entries[0].expires, "2026-10-16");
  assert.equal(typeof ledger.generated, "string");
});

test("expiry fails only after a full extra cadence has elapsed", () => {
  const entry = {
    path: "p.md",
    verified: "2026-09-16",
    volatility: "high",
    expires: "2026-10-16",
  };
  assert.deepEqual(checkExpiry(entry, "2026-10-20"), []);
  assert.equal(checkExpiry(entry, "2026-11-20").length, 1);
  assert.equal(checkExpiry(entry, "2026-11-20")[0].rule, "expired");
});

test("a deprecated page is never expired", () => {
  const entry = {
    path: "p.md",
    verified: "2020-01-01",
    volatility: "high",
    expires: "2020-01-31",
    status: "deprecated",
  };
  assert.deepEqual(checkExpiry(entry, "2026-11-20"), []);
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `node --test tools/corpus/test/ledger.test.mjs`
Expected: FAIL — cannot find module `../ledger.mjs`

- [ ] **Step 3: Write `tools/corpus/ledger.mjs`**

```js
// tools/corpus/ledger.mjs
import { findBlocks } from "./markers.mjs";

export const CADENCE_DAYS = { high: 30, medium: 90, low: 270 };
const RANK = { low: 0, medium: 1, high: 2 };

export function addDays(iso, days) {
  const d = new Date(`${iso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

export function derivePageVolatility(text, records) {
  const byKey = new Map(records.map((r) => [r.key, r]));
  let best = null;
  const bump = (v) => {
    if (v && (best === null || RANK[v] > RANK[best])) best = v;
  };
  for (const block of findBlocks(text)) {
    if (block.unterminated) continue;
    if (block.kind === "data") {
      bump(byKey.get(block.attrs.key)?.volatility);
    } else {
      // A table pulls in every record its filter admits, so the page is as
      // volatile as the most volatile row the table will render.
      const tag = block.attrs.tag;
      for (const r of records) {
        if (!tag || (r.tags ?? []).includes(tag)) bump(r.volatility);
      }
    }
  }
  return best;
}

export function expiryFor(verified, volatility) {
  return addDays(verified, CADENCE_DAYS[volatility ?? "low"]);
}

export function buildLedger(pages) {
  return {
    generated: new Date().toISOString().slice(0, 10),
    entries: pages.map((p) => ({
      path: p.path,
      verified: p.verified,
      volatility: p.volatility,
      expires: expiryFor(p.verified, p.volatility),
      ...(p.status ? { status: p.status } : {}),
    })),
  };
}
```

- [ ] **Step 4: Append `checkExpiry` to `tools/corpus/lint.mjs`**

```js
import { CADENCE_DAYS, addDays } from "./ledger.mjs";

export function checkExpiry(entry, today) {
  if (entry.status === "deprecated") return [];
  const hardFail = addDays(
    entry.expires,
    CADENCE_DAYS[entry.volatility ?? "low"],
  );
  if (today > hardFail) {
    return [
      {
        rule: "expired",
        message: `${entry.path} expired ${entry.expires} and is more than one full cadence overdue; refresh it or mark status: deprecated`,
      },
    ];
  }
  return [];
}
```

- [ ] **Step 5: Run the test to verify it passes**

Run: `node --test tools/corpus/test/ledger.test.mjs`
Expected: PASS — 8 tests

- [ ] **Step 6: Commit**

```bash
git add tools/corpus/ledger.mjs tools/corpus/lint.mjs tools/corpus/test/ledger.test.mjs
git commit -m "feat: derived page volatility, ledger generation, and expiry rule"
```

---

### Task 9: CLI wiring and an end-to-end adversarial fixture

**Files:**

- Create: `tools/corpus/cli.mjs`
- Create: `tools/corpus/test/fixtures/corpus/` (a complete miniature corpus)
- Test: `tools/corpus/test/cli.test.mjs`

**Interfaces:**

- Consumes: every module from Tasks 2–8.
- Produces: `corpus render [--write] [dir]`, `corpus lint [dir]`, `corpus ledger [--write] [dir]`. `lint` exits 1 when any issue is found, 0 otherwise.

The fixture corpus must contain one clean page and one page that violates every rule, so the suite proves each rule fires.

- [ ] **Step 1: Create the fixture corpus**

`tools/corpus/test/fixtures/corpus/data/models.yaml`:

```yaml
records:
  - key: example.model.context_window
    value: "200000"
    display: "200K"
    volatility: high
    source: https://example.invalid/docs
    verified: 2026-09-16
    tags: [frontier]
```

`tools/corpus/test/fixtures/corpus/meta/taxonomy.yaml`:

```yaml
topics: [claude-code, models]
```

`tools/corpus/test/fixtures/corpus/guides/clean.md`:

```markdown
---
title: Clean
summary: A page that satisfies every rule.
topic: models
verified: 2026-09-16
applies_to: { api: "2026-09" }
sources: [https://example.invalid/docs]
related: []
---

The window is <!-- corpus:data key=example.model.context_window -->200K<!-- /corpus:data --> tokens.
```

`tools/corpus/test/fixtures/corpus/guides/dirty.md`:

```markdown
---
title: Dirty
topic: astrology
verified: September 2026
volatility: high
---

The window is 200K tokens.
```

- [ ] **Step 2: Write the failing test**

```js
// tools/corpus/test/cli.test.mjs
import test from "node:test";
import assert from "node:assert/strict";
import { lintCorpus, renderCorpus, ledgerCorpus } from "../cli.mjs";

const ROOT = new URL("./fixtures/corpus/", import.meta.url).pathname;

test("the clean page produces no issues", () => {
  const issues = lintCorpus(ROOT, "2026-09-20").filter((i) =>
    i.path.endsWith("clean.md"),
  );
  assert.deepEqual(issues, []);
});

test("the dirty page trips every rule", () => {
  const rules = new Set(
    lintCorpus(ROOT, "2026-09-20")
      .filter((i) => i.path.endsWith("dirty.md"))
      .map((i) => i.rule),
  );
  for (const rule of [
    "frontmatter-required",
    "frontmatter-topic",
    "frontmatter-date",
    "frontmatter-derived-volatility",
    "bare-value",
  ]) {
    assert.equal(rules.has(rule), true, `expected rule to fire: ${rule}`);
  }
});

test("render is a no-op on an already-rendered corpus", () => {
  const results = renderCorpus(ROOT, { write: false });
  const clean = results.find((r) => r.path.endsWith("clean.md"));
  assert.equal(clean.changed, false);
});

test("ledger derives high volatility for the clean page", () => {
  const ledger = ledgerCorpus(ROOT, { write: false });
  const entry = ledger.entries.find((e) => e.path.endsWith("clean.md"));
  assert.equal(entry.volatility, "high");
  assert.equal(entry.expires, "2026-10-16");
});
```

- [ ] **Step 3: Run the test to verify it fails**

Run: `node --test tools/corpus/test/cli.test.mjs`
Expected: FAIL — cannot find module `../cli.mjs`

- [ ] **Step 4: Write the implementation**

```js
#!/usr/bin/env node
// tools/corpus/cli.mjs
import fs from "node:fs";
import path from "node:path";
import yaml from "js-yaml";
import { parseFrontmatter } from "./frontmatter.mjs";
import { loadRecords, literalIndex } from "./data.mjs";
import { validateFrontmatter, findBareValues, checkExpiry } from "./lint.mjs";
import { renderText } from "./render.mjs";
import { derivePageVolatility, buildLedger } from "./ledger.mjs";

function guidePaths(root) {
  const dir = path.join(root, "guides");
  if (!fs.existsSync(dir)) return [];
  const out = [];
  const walk = (d) => {
    for (const e of fs.readdirSync(d, { withFileTypes: true })) {
      const p = path.join(d, e.name);
      if (e.isDirectory()) walk(p);
      else if (e.name.endsWith(".md")) out.push(p);
    }
  };
  walk(dir);
  return out.sort();
}

function loadTopics(root) {
  const file = path.join(root, "meta", "taxonomy.yaml");
  if (!fs.existsSync(file)) return [];
  return (
    (
      yaml.load(fs.readFileSync(file, "utf8"), { schema: yaml.JSON_SCHEMA }) ??
      {}
    ).topics ?? []
  );
}

export function lintCorpus(
  root,
  today = new Date().toISOString().slice(0, 10),
) {
  const records = loadRecords(path.join(root, "data"));
  const index = literalIndex(records);
  const topics = loadTopics(root);
  const issues = [];
  for (const file of guidePaths(root)) {
    const text = fs.readFileSync(file, "utf8");
    const { data } = parseFrontmatter(text);
    const rel = path.relative(root, file);
    for (const i of validateFrontmatter(data, topics))
      issues.push({ ...i, path: rel });
    for (const i of findBareValues(text, index))
      issues.push({ ...i, path: rel });
    if (data?.verified && /^\d{4}-\d{2}-\d{2}$/.test(String(data.verified))) {
      const volatility = derivePageVolatility(text, records);
      const entry = buildLedger([
        { path: rel, verified: data.verified, volatility, status: data.status },
      ]).entries[0];
      for (const i of checkExpiry(entry, today))
        issues.push({ ...i, path: rel });
    }
  }
  return issues;
}

export function renderCorpus(root, { write = false } = {}) {
  const records = loadRecords(path.join(root, "data"));
  return guidePaths(root).map((file) => {
    const before = fs.readFileSync(file, "utf8");
    const { text, issues } = renderText(before, records);
    if (write && text !== before) fs.writeFileSync(file, text);
    return {
      path: path.relative(root, file),
      changed: text !== before,
      issues,
    };
  });
}

export function ledgerCorpus(root, { write = false } = {}) {
  const records = loadRecords(path.join(root, "data"));
  const pages = [];
  for (const file of guidePaths(root)) {
    const text = fs.readFileSync(file, "utf8");
    const { data } = parseFrontmatter(text);
    if (!data?.verified) continue;
    pages.push({
      path: path.relative(root, file),
      verified: String(data.verified),
      volatility: derivePageVolatility(text, records),
      status: data.status,
    });
  }
  const ledger = buildLedger(pages);
  if (write)
    fs.writeFileSync(path.join(root, "meta", "ledger.yaml"), yaml.dump(ledger));
  return ledger;
}

function main(argv) {
  const [command, ...rest] = argv;
  const write = rest.includes("--write");
  const root = rest.find((a) => !a.startsWith("--")) ?? process.cwd();
  if (command === "lint") {
    const issues = lintCorpus(root);
    for (const i of issues)
      console.error(
        `${i.path}${i.line ? `:${i.line}` : ""} [${i.rule}] ${i.message}`,
      );
    console.log(
      issues.length === 0 ? "lint: clean" : `lint: ${issues.length} issue(s)`,
    );
    process.exit(issues.length === 0 ? 0 : 1);
  } else if (command === "render") {
    for (const r of renderCorpus(root, { write })) {
      for (const i of r.issues)
        console.error(`${r.path} [${i.rule}] ${i.message}`);
      if (r.changed)
        console.log(`${write ? "rendered" : "would render"}: ${r.path}`);
    }
  } else if (command === "ledger") {
    const ledger = ledgerCorpus(root, { write });
    console.log(
      `ledger: ${ledger.entries.length} entries${write ? " written" : ""}`,
    );
  } else {
    console.error("usage: corpus <render|lint|ledger> [--write] [dir]");
    process.exit(2);
  }
}

if (import.meta.url === `file://${process.argv[1]}`)
  main(process.argv.slice(2));
```

- [ ] **Step 5: Run the test to verify it passes**

Run: `node --test tools/corpus/test/cli.test.mjs`
Expected: PASS — 4 tests

- [ ] **Step 6: Run the full suite and the CLI against the fixture**

Run: `npm test && node tools/corpus/cli.mjs lint tools/corpus/test/fixtures/corpus`
Expected: suite PASSes; the lint run prints issues for `dirty.md` and exits 1.

- [ ] **Step 7: Commit**

```bash
git add tools/corpus/cli.mjs tools/corpus/test/cli.test.mjs tools/corpus/test/fixtures/corpus
git commit -m "feat: corpus CLI with render, lint, and ledger commands"
```

---

### Task 10: Proof manifests and the proof runner

**Files:**

- Create: `tools/corpus/proofs.mjs`
- Create: `examples/marker-render-idempotence/proof.yaml`, `examples/marker-render-idempotence/run.mjs`, `examples/marker-render-idempotence/README.md`
- Test: `tools/corpus/test/proofs.test.mjs`

**Interfaces:**

- Consumes: nothing from earlier tasks.
- Produces: `discoverProofs(examplesDir) -> Proof[]` where `Proof` is `{ dir, claim, origin, tier, command, passes_when, last_run, result }`; and `runProof(proof) -> { result: 'pass'|'fail', exitCode }`.

This task also delivers the spec's required end-to-end proof, using a claim the repo can actually falsify.

- [ ] **Step 1: Write the failing test**

```js
// tools/corpus/test/proofs.test.mjs
import test from "node:test";
import assert from "node:assert/strict";
import { discoverProofs, runProof } from "../proofs.mjs";

const EXAMPLES = new URL("../../../examples/", import.meta.url).pathname;

test("discovers proof manifests and ignores plain examples", () => {
  const proofs = discoverProofs(EXAMPLES);
  assert.equal(proofs.length >= 1, true);
  assert.equal(
    proofs.every((p) => p.claim && p.command && p.tier != null),
    true,
  );
});

test("runs a proof and reports pass", () => {
  const proof = discoverProofs(EXAMPLES).find((p) =>
    p.dir.endsWith("marker-render-idempotence"),
  );
  assert.equal(runProof(proof).result, "pass");
});

test("reports fail on a non-zero exit", () => {
  const result = runProof({
    dir: EXAMPLES,
    command: 'node -e "process.exit(3)"',
  });
  assert.equal(result.result, "fail");
  assert.equal(result.exitCode, 3);
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `node --test tools/corpus/test/proofs.test.mjs`
Expected: FAIL — cannot find module `../proofs.mjs`

- [ ] **Step 3: Write `tools/corpus/proofs.mjs`**

```js
// tools/corpus/proofs.mjs
import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import yaml from "js-yaml";

export function discoverProofs(examplesDir) {
  if (!fs.existsSync(examplesDir)) return [];
  const proofs = [];
  for (const entry of fs.readdirSync(examplesDir, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue;
    const manifest = path.join(examplesDir, entry.name, "proof.yaml");
    if (!fs.existsSync(manifest)) continue;
    const doc =
      yaml.load(fs.readFileSync(manifest, "utf8"), {
        schema: yaml.JSON_SCHEMA,
      }) ?? {};
    if (doc.kind !== "proof") continue;
    proofs.push({ ...doc, dir: path.join(examplesDir, entry.name) });
  }
  return proofs;
}

export function runProof(proof) {
  const r = spawnSync(proof.command, {
    cwd: proof.dir,
    shell: true,
    encoding: "utf8",
  });
  return {
    result: r.status === 0 ? "pass" : "fail",
    exitCode: r.status,
    stdout: r.stdout,
    stderr: r.stderr,
  };
}

export function restamp(
  proof,
  result,
  today = new Date().toISOString().slice(0, 10),
) {
  const manifest = path.join(proof.dir, "proof.yaml");
  const doc = yaml.load(fs.readFileSync(manifest, "utf8"), {
    schema: yaml.JSON_SCHEMA,
  });
  doc.last_run = today;
  doc.result = result;
  fs.writeFileSync(manifest, yaml.dump(doc));
}
```

- [ ] **Step 4: Create the proof**

`examples/marker-render-idempotence/proof.yaml`:

```yaml
kind: proof
claim: Rendering a marker block twice produces the same bytes as rendering it once.
origin: docs/superpowers/specs/2026-09-16-llm-corpus-foundation-design.md
tier: 4
command: node run.mjs
passes_when: exit code 0
last_run: 2026-09-16
result: pass
```

`examples/marker-render-idempotence/run.mjs`:

```js
import assert from "node:assert/strict";
import { renderText } from "../../tools/corpus/render.mjs";

const records = [
  {
    key: "m.context",
    value: "200000",
    display: "200K",
    volatility: "high",
    source: "s",
    verified: "2026-09-16",
  },
];
const source =
  "Window: <!-- corpus:data key=m.context -->STALE<!-- /corpus:data -->\n";
const once = renderText(source, records).text;
const twice = renderText(once, records).text;

assert.equal(
  once.includes("200K"),
  true,
  "first render must substitute the record",
);
assert.equal(twice, once, "second render must be a no-op");
console.log("PASS: render is idempotent");
```

`examples/marker-render-idempotence/README.md`:

```markdown
# Proof: marker render idempotence

Establishes that `corpus render` can run repeatedly without drift, which is what
makes it safe to run on every change.

Run: `node run.mjs` — exits 0 on success.
```

- [ ] **Step 5: Run the test to verify it passes**

Run: `node --test tools/corpus/test/proofs.test.mjs`
Expected: PASS — 3 tests

- [ ] **Step 6: Commit**

```bash
git add tools/corpus/proofs.mjs tools/corpus/test/proofs.test.mjs examples/marker-render-idempotence
git commit -m "feat: proof manifests, runner, and the first end-to-end proof"
```

---

### Tasks 11–15: The five seed guides

Each seed is its own task and its own commit. They share one procedure, repeated
below in full for each, because the archetype and acceptance checks differ.

**Shared procedure for every seed:**

1. Research the topic against canonical vendor documentation. Record every source URL.
2. Create the data records for every value the guide needs, in the appropriate file under `data/`, each with `key`, `value`, optional `display`, `volatility`, `source`, `verified`.
3. Write the guide against the eight-part page template, using marker blocks for all values.
4. Run `node tools/corpus/cli.mjs render --write .` then `node tools/corpus/cli.mjs lint .`
5. Fix issues until the lint is clean.
6. Commit the guide, its records, and any example it references.

**Acceptance checks applied to every seed:**

- Front-matter carries all seven required fields, plus `seed: true`.
- Section 2 contains an example that a reader could run.
- Section 6 ("Where this rots") names at least one real record key.
- Every evidence label in the guide is one of `Verified`, `Documented`, `Plausible`.
- No `Verified` label appears unless a proof in `examples/` backs it.
- `node tools/corpus/cli.mjs lint .` exits 0.

---

### Task 11: Seed — evergreen concept guide

**Files:**

- Create: `guides/context/context-management.md`
- Modify: `data/` as needed

**Interfaces:**

- Consumes: the CLI from Tasks 7–9.
- Produces: the low-volatility reference case — a guide that should end up with few or no data records, proving the contract does not force ceremony onto evergreen prose.

- [ ] **Step 1: Research context management against canonical sources; record URLs**
- [ ] **Step 2: Write the guide using the eight-part template, `topic: context`, `seed: true`**
- [ ] **Step 3: Run `node tools/corpus/cli.mjs lint .`** — Expected: exits 0
- [ ] **Step 4: Confirm the acceptance checks above, including that "Where this rots" is honest about this page having little that rots**
- [ ] **Step 5: Commit**

```bash
git add guides/context/context-management.md data/
git commit -m "docs: seed guide — context management (evergreen archetype)"
```

---

### Task 12: Seed — high-volatility model facts

**Files:**

- Create: `guides/models/frontier-models.md`, `data/models.yaml`

**Interfaces:**

- Consumes: the CLI from Tasks 7–9.
- Produces: the stress case for `corpus:table` and for the closed-world lint — this page is nearly all values.

- [ ] **Step 1: Read the `claude-api` skill before writing any Anthropic model id, price, or limit**

The repo's own rules forbid writing these from memory. This step is mandatory.

- [ ] **Step 2: Create `data/models.yaml` with one record per value, every one carrying `source` and `verified`**
- [ ] **Step 3: Write the guide, using a `corpus:table` block for the comparison table and `corpus:data` blocks for inline values**
- [ ] **Step 4: Run `node tools/corpus/cli.mjs render --write . && node tools/corpus/cli.mjs lint .`** — Expected: render substitutes the table; lint exits 0
- [ ] **Step 5: Confirm the ledger derives `high` volatility for this page**

Run: `node tools/corpus/cli.mjs ledger .`
Expected: the entry for this page shows `volatility: high` and a 30-day expiry.

- [ ] **Step 6: Commit**

```bash
git add guides/models/frontier-models.md data/models.yaml
git commit -m "docs: seed guide — frontier model facts (high-volatility archetype)"
```

---

### Task 13: Seed — Claude Code tool reference

**Files:**

- Create: `guides/claude-code/hooks.md`

**Interfaces:**

- Consumes: the CLI from Tasks 7–9.
- Produces: the identifier/value split's hardest test — a guide dense with identifiers (hook event names) and sparse in values.

- [ ] **Step 1: Write the guide, naming hook events freely in prose as identifiers**
- [ ] **Step 2: Verify the lint does not flag any hook event name**

Run: `node tools/corpus/cli.mjs lint .`
Expected: exits 0, with no `bare-value` issue on any event name. If it does flag one, the identifier/value split is wrong and the finding belongs in Task 15.

- [ ] **Step 3: Confirm `applies_to` pins the Claude Code version this page describes**
- [ ] **Step 4: Commit**

```bash
git add guides/claude-code/hooks.md
git commit -m "docs: seed guide — Claude Code hooks (tool reference archetype)"
```

---

### Task 14: Seed — domain playbook and cross-model comparison

**Files:**

- Create: `guides/domains/software-engineering.md`, `guides/models/comparison.md`

**Interfaces:**

- Consumes: the CLI from Tasks 7–9.
- Produces: the two remaining archetypes. The comparison guide answers the spec's open question about whether the identifier/value split survives a page that is mostly table.

- [ ] **Step 1: Write the domain playbook, `topic: domains`, `seed: true`**
- [ ] **Step 2: Write the comparison guide, `topic: models`, using `corpus:table` for every cross-model claim**
- [ ] **Step 3: Record the answer to the open question**

In the comparison guide's "Where this rots" section, state plainly whether the
split held or whether the page had to fight the contract. This is the evidence
Task 15 amends from.

- [ ] **Step 4: Run `node tools/corpus/cli.mjs render --write . && node tools/corpus/cli.mjs lint .`** — Expected: exits 0
- [ ] **Step 5: Commit**

```bash
git add guides/domains/software-engineering.md guides/models/comparison.md data/
git commit -m "docs: seed guides — domain playbook and cross-model comparison"
```

---

### Task 15: Codify, reconcile, and de-provisionalize

**Files:**

- Modify: `CLAUDE.md`, `docs/superpowers/specs/2026-09-16-llm-corpus-foundation-design.md`
- Modify: whichever tool modules the seeds proved wrong
- Create: `meta/ledger.yaml`

**Interfaces:**

- Consumes: everything.
- Produces: a locked contract and a clean corpus.

- [ ] **Step 1: List every place a seed fought the contract**

Collect from the five "Where this rots" sections and from any lint rule that was
awkward to satisfy. Write the list into the spec under a new "Amendments from
seeds" heading, each entry naming the seed that motivated it.

- [ ] **Step 2: Apply the amendments to the tool and its tests**

For each amendment, write or change a test first, watch it fail, then change the
implementation. Do not amend the tool without a test.

- [ ] **Step 3: Generate the ledger**

Run: `node tools/corpus/cli.mjs ledger --write .`
Expected: `meta/ledger.yaml` written with one entry per seed.

- [ ] **Step 4: Run everything**

Run: `npm test && node tools/corpus/cli.mjs render . && node tools/corpus/cli.mjs lint . && node examples/marker-render-idempotence/run.mjs`
Expected: suite passes; render reports no pending changes; lint exits 0; proof prints PASS.

- [ ] **Step 5: Remove the provisional marker from `CLAUDE.md`** and fold in every amendment from Step 1.

- [ ] **Step 6: Commit**

```bash
git add CLAUDE.md meta/ledger.yaml docs/superpowers/specs/2026-09-16-llm-corpus-foundation-design.md tools/corpus guides data
git commit -m "feat: codify corpus contract from seed findings and lock the instruction file"
```

---

## Out of scope

Per the spec's non-goals: no static site, no pipeline skills (harvest, research,
write-guide, verify, refresh), no content breadth beyond the five seeds. Those
are sub-projects 2 through 5 and get their own specs.
