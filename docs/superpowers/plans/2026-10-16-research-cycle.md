# Research Cycle Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the initial-research half of the grounding pipeline — a `kind: research` artifact, the command that writes and validates it, the one that grounds pages from it, and the three gate changes that stop a page claiming grounding it does not have.

**Architecture:** A new `tools/corpus/research-artifact.mjs` owns the schema and a pure validator, mirroring how `refresh-artifact.mjs` owns the refresh schema. A new `research` subcommand in `cli.mjs` writes skeletons, validates, and grounds. Three gates change: `research-required` gains an existence check, a new rule rejects an artifact carrying no claims, and `refresh --stamp` is stopped from overwriting a research pointer it cannot replace. No page is written — that is the cycle's output, not this plan's.

**Tech Stack:** Node 22+, ESM `.mjs`, `node:test` + `node:assert/strict`, `js-yaml` with `JSON_SCHEMA`. No new dependencies.

**Spec:** `docs/superpowers/specs/2026-10-13-research-cycle-design.md` (status: approved)

## Global Constraints

- **Never write a volatile value from memory.** No model id, price, limit or availability date enters any file in this plan. This plan builds mechanism; it writes no guide page and no `data/` record.
- **`meta/ledger.yaml` stays untouched.** No task here adds, removes or deprecates a page, and none changes a `verified` date or a referenced record, so no regeneration is owed. Verify with `git status --porcelain meta/ledger.yaml` after each task.
- **The four gates must pass and stay network-free:** `node tools/corpus/cli.mjs render --check .` (exit 0, no `would render:` line), `node tools/corpus/cli.mjs lint .` (`lint: clean`), `node tools/corpus/cli.mjs verify .` (`verify: clean`), `npm test` (`# fail 0`). Research is a local-file operation; nothing in this plan opens a socket.
- **`verify` is strictly read-only.** Task 2 adds a check to it; that check may read the filesystem through an injected predicate and must not write.
- **Test-count discipline.** `# fail 0` alone does not prove a suite is intact — a truncated test file reports zero failures while silently dropping its tests, which has happened in this repo. State each task's expectation as a delta over the total measured at that task's start. Baseline measured on `master` at `7b8181f`, 2026-10-16: **571**.
- **Editing `CLAUDE.md` goes through Python:** read → `assert s.count(old) == 1` → replace → write. It is tens of kilobytes, the native edit tool refuses it, and that path also bypasses the Prettier hook. Count anchors with `python3 -c "print(open('FILE').read().count('''ANCHOR'''))"` rather than by reading — the contract warns the local read path mangles files without marking it.
- **Every new rule name must appear in `CLAUDE.md`.** `tools/corpus/test/contract.test.mjs` asserts this for a list of rules; a new rule not added to both the contract and that list ships undocumented, which is the gap that let `site` ship undocumented once.
- **Stage by filename.** Not `git add -A`, `git add .` or `git add -f`. A task that creates a directory deletes any stray `.claude/` folder before staging.

## Review Focus

Five failure modes the spec implies that no obvious test would catch. Each has its test assigned to the task that owns the code.

1. **Adding a second parameter to `checkResearchRequired` breaks seven existing call sites silently.** `tools/corpus/test/verify-pages.test.mjs` calls it with one argument in seven places (lines 61, 73, 111, 116, 122, 128, 132) and `cli.mjs:143` calls it with one. An `exists` parameter with no default makes `exists(...)` throw a TypeError inside a verify run — or, worse, a default of `() => false` would report every page in the corpus. The default must be `() => true`, so an uninjected caller behaves exactly as before. → **Task 2, Steps 1 and 6.**
2. **A check added after the `seed === true` early return inspects one pointer in three.** `guides/models/comparison.md` and `guides/providers/anthropic.md` are both `seed: true` and both carry `research:`. Seeds are exempt from *needing* a pointer; a pointer they do carry must still resolve. → **Task 2, Steps 1 and 4.**
3. **The empty-artifact forgery.** Reproduced on 2026-10-15: `refresh --skeleton` on a record-less page writes `unit_keys: []`/`records: []`, and after flipping `verdict` to `confirmed`, `--stamp` writes `research:`, bumps `verified`, and both `verify` and `lint` report clean on a page with zero grounding. An existence check does not close this, because the artifact resolves. Only a content check does. → **Task 1, Step 5; Task 4, Step 1.**
4. **A research artifact that grounds a page it does not name.** The spec's Decision 2 exists so "the artifact names this page" is expressible. If `--ground` writes `research:` onto a page absent from the artifact's `pages` list, the corpus reacquires the exact mis-filing the spec's problem section describes. → **Task 5, Step 1.**
5. **`refresh --stamp` laundering a research pointer.** A record-less page derives `volatility: null` and sits on the low cadence, so every page this cycle produces is eventually refreshed. That refresh re-reads nothing and overwrites `research:` in place, replacing an accepted claim-to-source table with an artifact documenting nothing. → **Task 6, Step 1.**

---

## Task 1: The research artifact schema and its validator

**Files:**
- Create: `tools/corpus/research-artifact.mjs`
- Test: `tools/corpus/test/research-artifact.test.mjs`

**Interfaces:**
- Consumes: `isAbsoluteHttpUrl(value) -> boolean` from `tools/corpus/paths.mjs` (true only for a string `new URL()` parses with an `http:` or `https:` protocol).
- Produces:
  - `RESEARCH_ARTIFACT_FIELDS` — frozen array of required front-matter field names: `["kind","subject","topic","pages","path","gathered","verdict","claims"]`.
  - `RESEARCH_VERDICTS` — frozen `["grounded","insufficient"]`.
  - `CLAIM_FIELDS` — frozen required per-claim fields: `["claim","source","tier","read","label"]`.
  - `SOURCE_TIERS` — frozen `[1,2,3,4]`.
  - `VALID_LABELS` is **not** redefined here; import it from `tools/corpus/verify-pages.mjs`, which already exports the evidence-label vocabulary.
  - `validateResearchArtifact(doc, options) -> issues[]` where `options` is `{ today }` (a `"YYYY-MM-DD"` string) and each issue is `{ rule, message }`.

The verdict vocabulary answers the spec's "research proves the page should not exist" outcome: `insufficient` records a cycle that found nothing citable, which is a successful outcome whose correct consequence is no page.

- [ ] **Step 1: Write the failing tests**

Create `tools/corpus/test/research-artifact.test.mjs`:

```javascript
import test from "node:test";
import assert from "node:assert/strict";
import {
  RESEARCH_ARTIFACT_FIELDS,
  RESEARCH_VERDICTS,
  CLAIM_FIELDS,
  SOURCE_TIERS,
  validateResearchArtifact,
} from "../research-artifact.mjs";

const TODAY = "2026-10-16";

function claim(over = {}) {
  return {
    claim: "Tool results are untrusted input.",
    source: "https://example.com/doc",
    tier: 1,
    read: "2026-10-16",
    label: "Documented",
    ...over,
  };
}

function doc(over = {}) {
  return {
    kind: "research",
    subject: "prompt-injection",
    topic: "security",
    pages: ["guides/security/prompt-injection.md"],
    path: "research/security/2026-10-16-prompt-injection-research.md",
    gathered: "2026-10-16",
    verdict: "grounded",
    claims: [claim()],
    ...over,
  };
}

const rules = (d) =>
  validateResearchArtifact(d, { today: TODAY }).map((i) => i.rule);

test("a well-formed grounded artifact has no issues", () => {
  assert.deepEqual(validateResearchArtifact(doc(), { today: TODAY }), []);
});

test("a non-mapping artifact is reported, not thrown", () => {
  for (const bad of [null, undefined, 42, "text", []]) {
    assert.deepEqual(rules(bad), ["research-artifact-shape"]);
  }
});

test("kind must be research", () => {
  assert.deepEqual(rules(doc({ kind: "refresh" })), ["research-artifact-kind"]);
});

test("every required field is required", () => {
  for (const field of RESEARCH_ARTIFACT_FIELDS) {
    if (field === "kind") continue;
    const d = doc();
    delete d[field];
    assert.ok(
      rules(d).includes("research-artifact-field"),
      `omitting ${field} should be reported`,
    );
  }
});

// Review Focus 3: the forgery an existence check cannot catch.
test("a grounded artifact carrying no claims is rejected", () => {
  assert.ok(rules(doc({ claims: [] })).includes("research-artifact-empty"));
  assert.ok(rules(doc({ claims: "many" })).includes("research-artifact-empty"));
});

test("an insufficient artifact may carry no claims, and must carry no pages", () => {
  assert.deepEqual(
    validateResearchArtifact(
      doc({ verdict: "insufficient", claims: [], pages: [] }),
      { today: TODAY },
    ),
    [],
  );
  assert.ok(
    rules(doc({ verdict: "insufficient", claims: [] })).includes(
      "research-insufficient-grounds-page",
    ),
    "an insufficient cycle must not ground a page",
  );
});

test("the verdict vocabulary is closed", () => {
  assert.deepEqual(RESEARCH_VERDICTS, ["grounded", "insufficient"]);
  assert.deepEqual(rules(doc({ verdict: "confirmed" })), [
    "research-artifact-verdict",
  ]);
});

test("pages must be repo-root-relative guide paths", () => {
  for (const bad of ["security/x.md", "/guides/security/x.md", 42]) {
    assert.ok(
      rules(doc({ pages: [bad] })).includes("research-page-path"),
      `${JSON.stringify(bad)} should be reported`,
    );
  }
});

test("each claim carries claim, source, tier, read and label", () => {
  for (const field of CLAIM_FIELDS) {
    const c = claim();
    delete c[field];
    assert.ok(
      rules(doc({ claims: [c] })).includes("research-claim-field"),
      `omitting ${field} should be reported`,
    );
  }
});

test("a claim source must be an absolute http(s) URL", () => {
  for (const bad of ["./local.md", "mailto:a@b.c", "example.com/x", 42]) {
    assert.ok(
      rules(doc({ claims: [claim({ source: bad })] })).includes(
        "research-claim-source",
      ),
    );
  }
});

test("a claim tier must be one of the four source tiers", () => {
  assert.deepEqual(SOURCE_TIERS, [1, 2, 3, 4]);
  for (const bad of [0, 5, "1", null]) {
    assert.ok(
      rules(doc({ claims: [claim({ tier: bad })] })).includes(
        "research-claim-tier",
      ),
    );
  }
});

test("a claim label must be an evidence label, and Verified needs a proof", () => {
  assert.ok(
    rules(doc({ claims: [claim({ label: "documented" })] })).includes(
      "research-claim-label",
    ),
    "labels are case-sensitive",
  );
  // Only a proof shipping in this repo licenses Verified, and research produces
  // citations rather than proofs, so the artifact may never assert it.
  assert.ok(
    rules(doc({ claims: [claim({ label: "Verified" })] })).includes(
      "research-claim-label",
    ),
  );
});

test("a tier 1 or 2 source may be Documented; tier 3 or 4 caps at Plausible", () => {
  assert.deepEqual(
    validateResearchArtifact(doc({ claims: [claim({ tier: 2 })] }), {
      today: TODAY,
    }),
    [],
  );
  assert.ok(
    rules(doc({ claims: [claim({ tier: 3, label: "Documented" })] })).includes(
      "research-claim-tier-ceiling",
    ),
  );
  assert.deepEqual(
    validateResearchArtifact(
      doc({ claims: [claim({ tier: 4, label: "Plausible" })] }),
      { today: TODAY },
    ),
    [],
  );
});

test("gathered and each claim read must be real dates, not in the future", () => {
  assert.ok(rules(doc({ gathered: "2026-13-01" })).includes("research-artifact-date"));
  assert.ok(rules(doc({ gathered: "2026-10-17" })).includes("research-date-in-future"));
  assert.ok(
    rules(doc({ claims: [claim({ read: "2026-10-17" })] })).includes(
      "research-date-in-future",
    ),
  );
});

test("accepted, when present, must be a real non-future date", () => {
  assert.deepEqual(
    validateResearchArtifact(doc({ accepted: "2026-10-16" }), { today: TODAY }),
    [],
  );
  assert.ok(rules(doc({ accepted: "nope" })).includes("research-accepted-date"));
  assert.ok(
    rules(doc({ accepted: "2026-10-17" })).includes("research-date-in-future"),
  );
});
```

- [ ] **Step 2: Run them to verify they fail**

Run: `node --test tools/corpus/test/research-artifact.test.mjs`
Expected: FAIL — `Cannot find module '.../tools/corpus/research-artifact.mjs'`

- [ ] **Step 3: Write `tools/corpus/research-artifact.mjs`**

```javascript
import { isAbsoluteHttpUrl } from "./paths.mjs";
import { VALID_LABELS } from "./verify-pages.mjs";

// The refresh artifact answers "did this change?"; this one answers "what is
// true, and who says so?". So there is no `was` and no per-record verdict here,
// and there is a claim list instead. See Decision 1 of
// docs/superpowers/specs/2026-10-13-research-cycle-design.md.
export const RESEARCH_ARTIFACT_FIELDS = Object.freeze([
  "kind",
  "subject",
  "topic",
  "pages",
  "path",
  "gathered",
  "verdict",
  "claims",
]);

// `insufficient` records a cycle that found nothing citable. That is a
// successful outcome whose correct consequence is no page, which is why it is a
// verdict rather than an absence.
export const RESEARCH_VERDICTS = Object.freeze(["grounded", "insufficient"]);
export const CLAIM_FIELDS = Object.freeze([
  "claim",
  "source",
  "tier",
  "read",
  "label",
]);
export const SOURCE_TIERS = Object.freeze([1, 2, 3, 4]);

// A tier 1 or 2 source may reach Documented; tier 3 and 4 cap at Plausible.
// Verified is absent on purpose: only a proof shipping under examples/ licenses
// it, and research produces citations, not proofs.
const TIER_CEILING = Object.freeze({
  1: "Documented",
  2: "Documented",
  3: "Plausible",
  4: "Plausible",
});

const DATE = /^\d{4}-\d{2}-\d{2}$/;

function realDate(value) {
  if (typeof value !== "string" || !DATE.test(value)) return false;
  const d = new Date(`${value}T00:00:00Z`);
  return (
    !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === value
  );
}

export function validateResearchArtifact(doc, options = {}) {
  const { today } = options;
  if (doc == null || typeof doc !== "object" || Array.isArray(doc))
    return [
      {
        rule: "research-artifact-shape",
        message: "a research artifact's front-matter must be a mapping",
      },
    ];

  const issues = [];
  const add = (rule, message) => issues.push({ rule, message });

  if (doc.kind !== "research")
    add(
      "research-artifact-kind",
      `kind must be "research"; got ${JSON.stringify(doc.kind)}`,
    );

  for (const field of RESEARCH_ARTIFACT_FIELDS) {
    if (field === "kind") continue;
    if (doc[field] == null)
      add("research-artifact-field", `missing required field: ${field}`);
  }

  if (!RESEARCH_VERDICTS.includes(doc.verdict))
    add(
      "research-artifact-verdict",
      `verdict must be one of ${RESEARCH_VERDICTS.join(", ")}; got ${JSON.stringify(doc.verdict)}`,
    );

  const claims = Array.isArray(doc.claims) ? doc.claims : null;
  const grounded = doc.verdict === "grounded";

  // The gate the existence check cannot close: an artifact that resolves on
  // disk and grounds nothing. A grounded artifact asserts at least one claim.
  if (grounded && (claims === null || claims.length === 0))
    add(
      "research-artifact-empty",
      "a grounded research artifact must carry at least one claim; an artifact with no claims grounds nothing",
    );

  const pages = Array.isArray(doc.pages) ? doc.pages : null;
  if (doc.pages != null && pages === null)
    add("research-page-path", "pages must be a list of repo-root-relative guide paths");
  for (const p of pages ?? []) {
    if (typeof p !== "string" || !p.startsWith("guides/") || !p.endsWith(".md"))
      add(
        "research-page-path",
        `pages entry must be a repo-root-relative path under guides/ ending in .md; got ${JSON.stringify(p)}`,
      );
  }

  // An insufficient cycle found nothing citable, so it must not be the thing a
  // page points at as its grounding.
  if (doc.verdict === "insufficient" && (pages ?? []).length > 0)
    add(
      "research-insufficient-grounds-page",
      "an insufficient research artifact must name no pages; the outcome is no page, not a page grounded by nothing",
    );

  if (doc.gathered != null && !realDate(doc.gathered))
    add(
      "research-artifact-date",
      `gathered must be a real date written YYYY-MM-DD; got ${JSON.stringify(doc.gathered)}`,
    );
  if (realDate(doc.gathered) && today && doc.gathered > today)
    add("research-date-in-future", `gathered is after today: ${doc.gathered}`);

  if (doc.accepted != null) {
    if (!realDate(doc.accepted))
      add(
        "research-accepted-date",
        `accepted must be a real date written YYYY-MM-DD; got ${JSON.stringify(doc.accepted)}`,
      );
    else if (today && doc.accepted > today)
      add("research-date-in-future", `accepted is after today: ${doc.accepted}`);
  }

  for (const [i, c] of (claims ?? []).entries()) {
    const at = `claims[${i}]`;
    if (c == null || typeof c !== "object" || Array.isArray(c)) {
      add("research-claim-field", `${at} must be a mapping`);
      continue;
    }
    for (const field of CLAIM_FIELDS)
      if (c[field] == null)
        add("research-claim-field", `${at} is missing ${field}`);

    if (c.source != null && !isAbsoluteHttpUrl(c.source))
      add(
        "research-claim-source",
        `${at}.source must be an absolute http(s) URL; got ${JSON.stringify(c.source)}`,
      );
    if (c.tier != null && !SOURCE_TIERS.includes(c.tier))
      add(
        "research-claim-tier",
        `${at}.tier must be one of ${SOURCE_TIERS.join(", ")}; got ${JSON.stringify(c.tier)}`,
      );
    if (c.read != null && !realDate(c.read))
      add(
        "research-artifact-date",
        `${at}.read must be a real date written YYYY-MM-DD; got ${JSON.stringify(c.read)}`,
      );
    if (realDate(c.read) && today && c.read > today)
      add("research-date-in-future", `${at}.read is after today: ${c.read}`);

    if (c.label != null) {
      if (!VALID_LABELS.includes(c.label) || c.label === "Verified")
        add(
          "research-claim-label",
          `${at}.label must be exactly Documented or Plausible; Verified requires a proof shipping under examples/, which research does not produce. Got ${JSON.stringify(c.label)}`,
        );
      else if (
        SOURCE_TIERS.includes(c.tier) &&
        c.label === "Documented" &&
        TIER_CEILING[c.tier] !== "Documented"
      )
        add(
          "research-claim-tier-ceiling",
          `${at} is tier ${c.tier}, which caps at ${TIER_CEILING[c.tier]}; relabel it or cite a tier 1 or 2 source`,
        );
    }
  }

  return issues;
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `node --test tools/corpus/test/research-artifact.test.mjs 2>&1 | grep -E "^# (tests|pass|fail)"`
Expected: `# fail 0`, 15 tests passing.

If `VALID_LABELS` is not exported from `tools/corpus/verify-pages.mjs`, stop: check its export list rather than defining a second label vocabulary here, because two spellings of the evidence labels is the drift `refresh-prompts.test.mjs` exists to prevent.

- [ ] **Step 5: Prove the empty-artifact rule can actually reject**

A check that has never rejected anything is not a check. Review Focus 3:

```bash
cd ~/dev/llm-guides
node -e '
import("./tools/corpus/research-artifact.mjs").then((m) => {
  const base = {
    kind: "research", subject: "s", topic: "security",
    pages: ["guides/security/x.md"],
    path: "research/security/2026-10-16-s-research.md",
    gathered: "2026-10-16", verdict: "grounded",
  };
  const empty = m.validateResearchArtifact({ ...base, claims: [] }, { today: "2026-10-16" });
  console.log("empty rejected:", empty.some((i) => i.rule === "research-artifact-empty"));
  const full = m.validateResearchArtifact({ ...base, claims: [
    { claim: "c", source: "https://e.com/a", tier: 1, read: "2026-10-16", label: "Documented" },
  ] }, { today: "2026-10-16" });
  console.log("full accepted:", full.length === 0);
})'
```

Expected: `empty rejected: true` and `full accepted: true`. Both halves matter — the second proves the rule is not rejecting everything.

- [ ] **Step 6: Run the four gates**

```bash
cd ~/dev/llm-guides
npm test 2>&1 | grep -E "^# (tests|fail)"
node tools/corpus/cli.mjs render --check . ; echo "render exit=$?"
node tools/corpus/cli.mjs lint .
node tools/corpus/cli.mjs verify .
git status --porcelain meta/ledger.yaml
```

Expected: `# fail 0` with the total **+15** over this task's starting measurement, `render exit=0`, `lint: clean`, `verify: clean`, and no output from the `git status` line.

- [ ] **Step 7: Commit**

```bash
cd ~/dev/llm-guides
git add tools/corpus/research-artifact.mjs tools/corpus/test/research-artifact.test.mjs
git commit -m "feat: add the kind: research artifact schema and its validator"
```

---

## Task 2: The gate checks that a research pointer resolves

**Files:**
- Modify: `tools/corpus/verify-pages.mjs` (`checkResearchRequired`, currently at line 54)
- Modify: `tools/corpus/cli.mjs:143` (pass the existing `exists` predicate)
- Modify: `CLAUDE.md` (one new row in the Issue rules table)
- Modify: `tools/corpus/test/contract.test.mjs` (add the new rule to `RULES`)
- Modify: `tools/corpus/refresh-stamp.mjs` (one comment this task falsifies)
- Test: `tools/corpus/test/verify-pages.test.mjs` (append)

**Interfaces:**
- Consumes: nothing from Task 1.
- Produces: `checkResearchRequired(data, exists = () => true) -> issues[]`. The second parameter is a predicate taking a repo-root-relative path and returning whether it exists, exactly like `checkRelatedPaths(data, exists)` at `tools/corpus/verify-pages.mjs:30`. The default keeps all seven existing one-argument test call sites and any future caller behaving as before. New rule name: `research-path-unresolved`.

- [ ] **Step 1: Write the failing tests**

Append to `tools/corpus/test/verify-pages.test.mjs`. The file already imports `checkResearchRequired`; do not add a second import.

```javascript
// Review Focus 1: seven existing call sites pass one argument. The default must
// keep them behaving exactly as before, which a default of () => false would not.
test("checkResearchRequired with no exists predicate behaves as before", () => {
  assert.deepEqual(
    checkResearchRequired(fm({ research: "research/x/a.md" })),
    [],
  );
  assert.equal(checkResearchRequired(fm()).length, 1);
});

test("a research pointer that does not resolve is reported", () => {
  const issues = checkResearchRequired(
    fm({ research: "research/x/missing.md" }),
    () => false,
  );
  assert.equal(issues.length, 1);
  assert.equal(issues[0].rule, "research-path-unresolved");
});

test("a research pointer that resolves is clean", () => {
  assert.deepEqual(
    checkResearchRequired(fm({ research: "research/x/there.md" }), () => true),
    [],
  );
});

// Review Focus 2: seeds are exempt from NEEDING a pointer, but two seed pages
// carry one today, so an unresolvable pointer on a seed must still be reported.
test("a seed's research pointer must still resolve", () => {
  const issues = checkResearchRequired(
    fm({ seed: true, research: "research/x/missing.md" }),
    () => false,
  );
  assert.equal(issues.length, 1);
  assert.equal(issues[0].rule, "research-path-unresolved");
});

test("a seed with no research pointer is still exempt", () => {
  assert.deepEqual(checkResearchRequired(fm({ seed: true }), () => false), []);
});

test("a deprecated page with no pointer is still exempt", () => {
  assert.deepEqual(
    checkResearchRequired(fm({ status: "deprecated" }), () => false),
    [],
  );
});

test("the existence check is given the path verbatim", () => {
  const seen = [];
  checkResearchRequired(fm({ research: "research/security/a.md" }), (p) => {
    seen.push(p);
    return true;
  });
  assert.deepEqual(seen, ["research/security/a.md"]);
});
```

- [ ] **Step 2: Run them to verify they fail**

Run: `node --test tools/corpus/test/verify-pages.test.mjs 2>&1 | grep -E "^# (pass|fail)|^not ok"`
Expected: FAIL on the unresolvable cases — they currently return `[]` because nothing checks existence. The two exemption tests and the "behaves as before" test pass already; that is correct and not a problem.

- [ ] **Step 3: Replace `checkResearchRequired`**

Replace the whole function. The existence check sits **before** the seed early return, because `guides/models/comparison.md` and `guides/providers/anthropic.md` are both `seed: true` and both carry `research:` — a check after the return would inspect one pointer in three.

```javascript
// seed: true is permanent provenance — a page authored before the pipeline
// existed — so seeds are exempt from NEEDING an artifact, forever. They are not
// exempt from the one they do name resolving: two seed pages carry a research:
// pointer today, and a pointer that cannot be opened is not grounding in any
// sense a reader would accept. So the existence check runs first, and the
// requirement check runs after the exemptions.
export function checkResearchRequired(data, exists = () => true) {
  if (data == null || typeof data !== "object") return [];

  const named =
    typeof data.research === "string" && data.research.trim() !== ""
      ? data.research.trim()
      : null;

  if (named !== null && !exists(named))
    return [
      {
        rule: "research-path-unresolved",
        message: `research names a path that does not exist in the repository: ${named}`,
      },
    ];

  if (data.seed === true || data.status === "deprecated") return [];
  if (named !== null) return [];

  return [
    {
      rule: "research-required",
      message:
        "page is not a seed and names no research artifact; every pipeline-authored page must point at its grounding under research/",
    },
  ];
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `node --test tools/corpus/test/verify-pages.test.mjs 2>&1 | grep -E "^# (tests|pass|fail)"`
Expected: `# fail 0`.

- [ ] **Step 5: Wire the predicate in `cli.mjs`**

`cli.mjs:130` already builds `const exists = (rel) => fs.existsSync(path.join(root, rel));` for `checkRelatedPaths`. Pass the same one:

```bash
cd ~/dev/llm-guides
TOKEN_OPTIMIZER_MODE=off python3 - <<'PY'
p = "tools/corpus/cli.mjs"
s = open(p).read()
old = "      ...checkResearchRequired(data),"
assert s.count(old) == 1, s.count(old)
s = s.replace(old, "      ...checkResearchRequired(data, exists),", 1)
open(p, "w").write(s)
PY
node tools/corpus/cli.mjs verify .
```

Expected: `verify: clean`. All six pages' pointers resolve today — the three that carry one all name the same existing file.

- [ ] **Step 6: Prove the new rule can reject, against the real corpus**

```bash
cd ~/dev/llm-guides
cp guides/providers/open-weight.md /tmp/ow-backup.md
TOKEN_OPTIMIZER_MODE=off python3 - <<'PY'
p = "guides/providers/open-weight.md"
s = open(p).read()
old = "research: research/models/2026-10-06-claude-models-comparison-refresh.md"
assert s.count(old) == 1, s.count(old)
s = s.replace(old, "research: research/models/does-not-exist.md", 1)
open(p, "w").write(s)
PY
node tools/corpus/cli.mjs verify . ; echo "exit=$?"
cp /tmp/ow-backup.md guides/providers/open-weight.md && rm /tmp/ow-backup.md
node tools/corpus/cli.mjs verify . ; echo "restored exit=$?"
git status --porcelain guides/
```

Expected: the first run prints a `research-path-unresolved` line and `exit=1`; the second prints `verify: clean` and `restored exit=0`; the `git status` line prints nothing.

- [ ] **Step 7: Document the rule in the contract and pin it**

```bash
cd ~/dev/llm-guides
TOKEN_OPTIMIZER_MODE=off python3 - <<'PY'
p = "CLAUDE.md"
s = open(p).read()
anchor = "| `research-required`              | verify | The page is neither `seed: true` nor `status: deprecated`, and names no `research:` artifact.    | Add `research:` pointing at the page's grounding under `research/`, or mark it a seed.                                                                                              |\n"
assert s.count(anchor) == 1, s.count(anchor)
row = "| `research-path-unresolved`       | verify | A page's `research:` names a path that does not exist in the repository. Checked **before** the `seed: true` exemption, because two seed pages carry a pointer today and a pointer that cannot be opened is not grounding. It does not check that the artifact grounds that page — see the research cycle design spec. | Fix the path, or write the artifact it names. |\n"
s = s.replace(anchor, anchor + row, 1)
open(p, "w").write(s)
PY
TOKEN_OPTIMIZER_MODE=off python3 - <<'PY'
p = "tools/corpus/test/contract.test.mjs"
s = open(p).read()
old = '  "refresh-record-archived-unparseable",\n'
assert s.count(old) == 1, s.count(old)
s = s.replace(old, old + '  "research-path-unresolved",\n', 1)
open(p, "w").write(s)
PY
node --test tools/corpus/test/contract.test.mjs 2>&1 | grep -E "^# (tests|fail)"
```

Expected: `# fail 0`. If the `anchor` assert fails, the Issue rules table has been reworded — locate the `research-required` row with `grep -n 'research-required' CLAUDE.md` and use its current text rather than editing a different row.

- [ ] **Step 8: Correct the comment this task falsifies**

`tools/corpus/refresh-stamp.mjs` carries a comment saying no
`research-path-unresolved` rule exists, which is why its own existence check is
the only one. This task creates that rule, so the comment now teaches the wrong
mechanism — and a comment asserting a rule does not exist is how the next
session concludes it has to build one.

```bash
cd ~/dev/llm-guides
TOKEN_OPTIMIZER_MODE=off python3 - <<'PY'
p = "tools/corpus/refresh-stamp.mjs"
s = open(p).read()
old = """  // checkResearchRequired only checks research: is a non-empty string, and no
  // research-path-unresolved rule exists, so this is the only place a path that
  // does not resolve can be refused."""
new = """  // verify's research-path-unresolved refuses a page pointer that does not
  // resolve, but it runs over pages, not over the artifact a stamp was handed.
  // This check is what refuses an --artifact whose own path is gone, which no
  // page-side rule can see."""
assert s.count(old) == 1, s.count(old)
s = s.replace(old, new, 1)
open(p, "w").write(s)
PY
grep -c "research-path-unresolved" tools/corpus/refresh-stamp.mjs
```

Expected: `1` — the single mention inside the corrected comment.

- [ ] **Step 9: Run the four gates**

```bash
cd ~/dev/llm-guides
npm test 2>&1 | grep -E "^# (tests|fail)"
node tools/corpus/cli.mjs render --check . ; echo "render exit=$?"
node tools/corpus/cli.mjs lint .
node tools/corpus/cli.mjs verify .
git status --porcelain meta/ledger.yaml
```

Expected: `# fail 0` with the total **+8** over this task's starting measurement (7 new verify-pages tests, 1 new contract rule test), `render exit=0`, `lint: clean`, `verify: clean`, no ledger change.

- [ ] **Step 10: Commit**

```bash
cd ~/dev/llm-guides
git add tools/corpus/verify-pages.mjs tools/corpus/cli.mjs CLAUDE.md \
  tools/corpus/refresh-stamp.mjs \
  tools/corpus/test/verify-pages.test.mjs tools/corpus/test/contract.test.mjs
git commit -m "feat: verify a page's research pointer resolves on disk"
```

---

## Task 3: `corpus research --skeleton` and `--validate`

**Files:**
- Create: `tools/corpus/research.mjs`
- Modify: `tools/corpus/cli.mjs` (`KNOWN_FLAGS`, the usage text, and a `research` branch)
- Test: `tools/corpus/test/research.test.mjs`

**Interfaces:**
- Consumes: `validateResearchArtifact(doc, { today }) -> issues[]`, `RESEARCH_ARTIFACT_FIELDS`, `RESEARCH_VERDICTS` from `tools/corpus/research-artifact.mjs` (Task 1).
- Produces:
  - `researchArtifactPath(subject, topic, gathered) -> string` — `research/<topic>/<gathered>-<subject>-research.md`. Deterministic, mirroring refresh's deterministic path, so a second skeleton on the same subject on the same day collides rather than silently overwriting.
  - `ResearchError` — an `Error` subclass carrying `rule`.
  - `writeSkeleton(root, { subject, topic, today, writeImpl, existsImpl }) -> string` (the relative path written). Throws `ResearchError` with rule `research-skeleton-exists` when the target is present, and `research-topic-not-in-taxonomy` when `topic` is not in `meta/taxonomy.yaml`.
  - `validateArtifactFile(root, rel, { today, readImpl }) -> issues[]`.

- [ ] **Step 1: Write the failing tests**

Create `tools/corpus/test/research.test.mjs`:

```javascript
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import {
  researchArtifactPath,
  writeSkeleton,
  validateArtifactFile,
  ResearchError,
} from "../research.mjs";

function corpus() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "research-"));
  fs.mkdirSync(path.join(root, "meta"), { recursive: true });
  fs.writeFileSync(
    path.join(root, "meta", "taxonomy.yaml"),
    "topics:\n  - security\n  - models\n",
  );
  return root;
}

test("the artifact path is deterministic and lives under its topic", () => {
  assert.equal(
    researchArtifactPath("prompt-injection", "security", "2026-10-16"),
    "research/security/2026-10-16-prompt-injection-research.md",
  );
});

test("writeSkeleton writes a fail-closed artifact under the topic", () => {
  const root = corpus();
  try {
    const rel = writeSkeleton(root, {
      subject: "prompt-injection",
      topic: "security",
      today: "2026-10-16",
    });
    assert.equal(
      rel,
      "research/security/2026-10-16-prompt-injection-research.md",
    );
    const text = fs.readFileSync(path.join(root, rel), "utf8");
    // Fail closed: a skeleton nobody filled in must not be groundable.
    assert.match(text, /^kind: research$/m);
    assert.match(text, /^verdict: insufficient$/m);
    assert.match(text, /^claims: \[\]$/m);
    assert.match(text, /^pages: \[\]$/m);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test("writeSkeleton refuses to overwrite an existing artifact", () => {
  const root = corpus();
  try {
    const opts = {
      subject: "prompt-injection",
      topic: "security",
      today: "2026-10-16",
    };
    writeSkeleton(root, opts);
    assert.throws(
      () => writeSkeleton(root, opts),
      (e) => e instanceof ResearchError && e.rule === "research-skeleton-exists",
    );
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test("writeSkeleton refuses a topic outside the taxonomy", () => {
  const root = corpus();
  try {
    assert.throws(
      () =>
        writeSkeleton(root, {
          subject: "x",
          topic: "../../../tmp/evil",
          today: "2026-10-16",
        }),
      (e) =>
        e instanceof ResearchError &&
        e.rule === "research-topic-not-in-taxonomy",
    );
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test("a skeleton validates as an insufficient artifact, not a grounded one", () => {
  const root = corpus();
  try {
    const rel = writeSkeleton(root, {
      subject: "prompt-injection",
      topic: "security",
      today: "2026-10-16",
    });
    assert.deepEqual(
      validateArtifactFile(root, rel, { today: "2026-10-16" }),
      [],
    );
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test("validateArtifactFile reports a missing file rather than throwing", () => {
  const root = corpus();
  try {
    const issues = validateArtifactFile(root, "research/security/nope.md", {
      today: "2026-10-16",
    });
    assert.equal(issues.length, 1);
    assert.equal(issues[0].rule, "research-artifact-not-found");
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test("validateArtifactFile reports a file with no front-matter", () => {
  const root = corpus();
  try {
    fs.mkdirSync(path.join(root, "research", "security"), { recursive: true });
    const rel = "research/security/bare.md";
    fs.writeFileSync(path.join(root, rel), "no front matter here\n");
    const issues = validateArtifactFile(root, rel, { today: "2026-10-16" });
    assert.equal(issues[0].rule, "research-artifact-frontmatter");
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test("validateArtifactFile surfaces the schema's own issues", () => {
  const root = corpus();
  try {
    fs.mkdirSync(path.join(root, "research", "security"), { recursive: true });
    const rel = "research/security/empty.md";
    fs.writeFileSync(
      path.join(root, rel),
      [
        "---",
        "kind: research",
        "subject: s",
        "topic: security",
        "pages: [guides/security/x.md]",
        `path: ${rel}`,
        "gathered: '2026-10-16'",
        "verdict: grounded",
        "claims: []",
        "---",
        "",
        "body",
        "",
      ].join("\n"),
    );
    const rules = validateArtifactFile(root, rel, {
      today: "2026-10-16",
    }).map((i) => i.rule);
    assert.ok(rules.includes("research-artifact-empty"));
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test("validateArtifactFile reports a path field disagreeing with the file", () => {
  const root = corpus();
  try {
    fs.mkdirSync(path.join(root, "research", "security"), { recursive: true });
    const rel = "research/security/mismatch.md";
    fs.writeFileSync(
      path.join(root, rel),
      [
        "---",
        "kind: research",
        "subject: s",
        "topic: security",
        "pages: []",
        "path: research/security/other.md",
        "gathered: '2026-10-16'",
        "verdict: insufficient",
        "claims: []",
        "---",
        "",
        "body",
        "",
      ].join("\n"),
    );
    const rules = validateArtifactFile(root, rel, {
      today: "2026-10-16",
    }).map((i) => i.rule);
    assert.ok(rules.includes("research-artifact-path-mismatch"));
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});
```

- [ ] **Step 2: Run them to verify they fail**

Run: `node --test tools/corpus/test/research.test.mjs`
Expected: FAIL — `Cannot find module '.../tools/corpus/research.mjs'`

- [ ] **Step 3: Write `tools/corpus/research.mjs`**

```javascript
import fs from "node:fs";
import path from "node:path";
import yaml from "js-yaml";
import { parseFrontmatter } from "./frontmatter.mjs";
import { loadTopics } from "./taxonomy.mjs";
import { validateResearchArtifact } from "./research-artifact.mjs";

export class ResearchError extends Error {
  constructor(rule, message) {
    super(message);
    this.name = "ResearchError";
    this.rule = rule;
  }
}

// Deterministic, like refresh's artifact path, so a second run on the same
// subject on the same day collides loudly instead of discarding whatever an
// operator had filled in.
export function researchArtifactPath(subject, topic, gathered) {
  return `research/${topic}/${gathered}-${subject}-research.md`;
}

const SKELETON = (subject, topic, rel, today) =>
  `---
kind: research
subject: ${subject}
topic: ${topic}
pages: []
path: ${rel}
gathered: '${today}'
verdict: insufficient
claims: []
---

# Research: ${subject} (${today})

## What was asked

One or two lines: the question this cycle set out to answer.

## Claims

Fill \`claims:\` above, one entry per claim, each with its \`source\` (an
absolute http(s) URL), its \`tier\` (1-4), the \`read\` date, and the \`label\`
that tier licenses — Documented for tier 1 or 2, Plausible for tier 3 or 4.

A claim belongs here only if a reader could check it from the source given.
Narrative about the search belongs in the pull request, not in this file: an
artifact that becomes a log makes the grounding gate satisfiable by a log.

## Pages this grounds

Fill \`pages:\` above with every page this subject grounds, repo-root-relative.
Leave it empty while \`verdict\` is \`insufficient\`.

## Verdict

\`grounded\` once the claims above support the pages named. \`insufficient\` if
the sources do not exist or do not say what the page would need — that is a
real outcome, and its consequence is no page rather than a page written from
inference.
`;

export function writeSkeleton(root, options) {
  const {
    subject,
    topic,
    today,
    writeImpl = fs.writeFileSync,
    existsImpl = fs.existsSync,
  } = options;

  const topics = loadTopics(root);
  if (!topics.includes(topic))
    throw new ResearchError(
      "research-topic-not-in-taxonomy",
      `${topic} is not a topic listed in meta/taxonomy.yaml, so research/${topic}/ is not a safe artifact home — check for a typo, or register the topic if it is genuinely new`,
    );

  const rel = researchArtifactPath(subject, topic, today);
  const abs = path.join(root, rel);
  if (existsImpl(abs))
    throw new ResearchError(
      "research-skeleton-exists",
      `${rel} already exists; fill in the artifact that is there, or delete it deliberately before regenerating`,
    );

  fs.mkdirSync(path.dirname(abs), { recursive: true });
  writeImpl(abs, SKELETON(subject, topic, rel, today), "utf8");
  return rel;
}

export function validateArtifactFile(root, rel, options = {}) {
  const { today, readImpl = fs.readFileSync } = options;
  const abs = path.join(root, rel);
  if (!fs.existsSync(abs))
    return [
      {
        rule: "research-artifact-not-found",
        message: `${rel} does not exist on disk`,
      },
    ];

  const text = readImpl(abs, "utf8");
  const { data } = parseFrontmatter(text);
  if (data == null)
    return [
      {
        rule: "research-artifact-frontmatter",
        message: `${rel} has no --- front-matter to validate`,
      },
    ];

  const issues = validateResearchArtifact(data, { today });
  if (typeof data.path === "string" && data.path !== rel)
    issues.push({
      rule: "research-artifact-path-mismatch",
      message: `the artifact's own path field says ${data.path}, but it is at ${rel}`,
    });
  return issues;
}
```

If `parseFrontmatter` returns a different shape than `{ data, body }`, read its export in `tools/corpus/frontmatter.mjs` and use the shape it actually returns; `citations.mjs` destructures `{ data, body }` from it, so that is the expected shape.

- [ ] **Step 4: Run the tests to verify they pass**

Run: `node --test tools/corpus/test/research.test.mjs 2>&1 | grep -E "^# (tests|pass|fail)"`
Expected: `# fail 0`, 9 tests passing.

- [ ] **Step 5: Wire the subcommand into `cli.mjs`**

Three edits: the flag allowlist, the usage text, and the dispatch branch.

```bash
cd ~/dev/llm-guides
TOKEN_OPTIMIZER_MODE=off python3 - <<'PY'
p = "tools/corpus/cli.mjs"
s = open(p).read()

old = '''const KNOWN_FLAG_PREFIXES = Object.freeze(["--page=", "--artifact=", "--key="]);'''
new = '''const KNOWN_FLAG_PREFIXES = Object.freeze([
  "--page=",
  "--artifact=",
  "--key=",
  "--subject=",
  "--topic=",
]);'''
assert s.count(old) == 1, ("prefixes", s.count(old))
s = s.replace(old, new, 1)

old = '''  "--page",
  "--key",
]);'''
new = '''  "--page",
  "--key",
  "--validate",
]);'''
assert s.count(old) == 1, ("flags", s.count(old))
s = s.replace(old, new, 1)

old = '''      "usage: corpus <render|lint|verify|ledger|refresh|site|sources> [--write] [dir]",'''
new = '''      "usage: corpus <render|lint|verify|ledger|refresh|site|sources|research> [--write] [dir]",'''
assert s.count(old) == 1, ("usage", s.count(old))
s = s.replace(old, new, 1)

old = '''  if (check && (command !== "render" || write)) usage();'''
new = '''  if (check && (command !== "render" || write)) usage();
  if (command === "research") {
    const today = new Date().toISOString().slice(0, 10);
    const valueOf = (prefix) => {
      const hit = rest.find((a) => a.startsWith(prefix));
      return hit === undefined ? null : hit.slice(prefix.length);
    };
    const artifact = valueOf("--artifact=");
    if (rest.includes("--validate")) {
      if (artifact === null) usage();
      const issues = validateArtifactFile(root, artifact, { today });
      for (const i of issues) console.error(`${artifact} [${i.rule}] ${i.message}`);
      if (issues.length > 0) process.exit(1);
      console.log("research: artifact valid");
      process.exit(0);
    }
    if (rest.includes("--skeleton")) {
      const subject = valueOf("--subject=");
      const topic = valueOf("--topic=");
      if (subject === null || topic === null) usage();
      try {
        const rel = writeSkeleton(root, { subject, topic, today });
        console.log(`research: wrote ${rel}`);
        process.exit(0);
      } catch (e) {
        if (e instanceof ResearchError) {
          console.error(`research: [${e.rule}] ${e.message}`);
          process.exit(2);
        }
        throw e;
      }
    }
    usage();
  }'''
assert s.count(old) == 1, ("dispatch", s.count(old))
s = s.replace(old, new, 1)

old = '''import { loadTopics } from "./taxonomy.mjs";'''
new = '''import { loadTopics } from "./taxonomy.mjs";
import {
  ResearchError,
  validateArtifactFile,
  writeSkeleton,
} from "./research.mjs";'''
assert s.count(old) == 1, ("import", s.count(old))
s = s.replace(old, new, 1)

open(p, "w").write(s)
PY
node tools/corpus/cli.mjs research ; echo "no-mode exit=$?"
node tools/corpus/cli.mjs research --validate ; echo "no-artifact exit=$?"
```

Expected: both print the usage block and `exit=2`. A mode-less or argument-less invocation is a usage error, not a silent no-op.

- [ ] **Step 6: Drive the command end to end against the real corpus**

```bash
cd ~/dev/llm-guides
node tools/corpus/cli.mjs research --skeleton --subject=smoke-test --topic=security . ; echo "exit=$?"
TODAY=$(date +%F)
node tools/corpus/cli.mjs research --validate --artifact=research/security/$TODAY-smoke-test-research.md . ; echo "validate exit=$?"
node tools/corpus/cli.mjs research --skeleton --subject=smoke-test --topic=security . ; echo "second exit=$?"
node tools/corpus/cli.mjs research --skeleton --subject=x --topic=nope . ; echo "bad-topic exit=$?"
rm -rf research/security
git status --porcelain research/
```

Expected: the first writes the artifact and `exit=0`; the validate prints `research: artifact valid` and `exit=0` (a skeleton is a valid *insufficient* artifact); the second prints `research-skeleton-exists` and `exit=2`; the bad topic prints `research-topic-not-in-taxonomy` and `exit=2`; `git status --porcelain research/` prints nothing after the cleanup. If `research/security` held anything before this step, delete only the smoke-test file rather than the directory.

- [ ] **Step 7: Run the four gates**

```bash
cd ~/dev/llm-guides
npm test 2>&1 | grep -E "^# (tests|fail)"
node tools/corpus/cli.mjs render --check . ; echo "render exit=$?"
node tools/corpus/cli.mjs lint .
node tools/corpus/cli.mjs verify .
git status --porcelain meta/ledger.yaml
```

Expected: `# fail 0` with the total **+9** over this task's starting measurement, `render exit=0`, `lint: clean`, `verify: clean`, no ledger change.

- [ ] **Step 8: Commit**

```bash
cd ~/dev/llm-guides
git add tools/corpus/research.mjs tools/corpus/cli.mjs tools/corpus/test/research.test.mjs
git commit -m "feat: add corpus research --skeleton and --validate"
```

---

## Task 4: The content check that closes the forgery

**Files:**
- Modify: `tools/corpus/verify-pages.mjs` (add `checkResearchGrounds`)
- Modify: `tools/corpus/cli.mjs` (call it inside `verifyCorpus`)
- Modify: `CLAUDE.md` (two new Issue rules rows)
- Modify: `tools/corpus/test/contract.test.mjs` (add both rules to `RULES`)
- Test: `tools/corpus/test/verify-pages.test.mjs` (append)

**Interfaces:**
- Consumes: `validateResearchArtifact` is **not** used here — this check reads only the artifact's `kind` and, for a research artifact, its `claims` and `pages`. Full schema validation belongs to `corpus research --validate`, because `verify` must stay cheap enough to run unconditionally.
- Produces: `checkResearchGrounds(pageRel, data, readArtifact) -> issues[]`, where `readArtifact(rel)` returns the parsed front-matter mapping of that artifact or `null` when it cannot be read. New rules: `research-artifact-grounds-nothing` and `research-artifact-omits-page`.

A page may still point at a `kind: refresh` artifact — that is the legacy state the spec records for `guides/providers/open-weight.md`, and this check does not break it. The rules apply only when the artifact declares `kind: research`, which is the kind this plan introduces.

- [ ] **Step 1: Write the failing tests**

Append to `tools/corpus/test/verify-pages.test.mjs`:

```javascript
// Review Focus 3: an artifact that resolves and grounds nothing. The existence
// check in checkResearchRequired cannot see this; only reading the artifact can.
test("a page pointing at a claimless research artifact is reported", () => {
  const issues = checkResearchGrounds(
    "guides/security/x.md",
    fm({ research: "research/security/a.md" }),
    () => ({ kind: "research", claims: [], pages: ["guides/security/x.md"] }),
  );
  assert.equal(issues.length, 1);
  assert.equal(issues[0].rule, "research-artifact-grounds-nothing");
});

// Review Focus 4: the mis-filing the spec's problem section describes.
test("a research artifact that does not name the page is reported", () => {
  const issues = checkResearchGrounds(
    "guides/security/x.md",
    fm({ research: "research/security/a.md" }),
    () => ({
      kind: "research",
      claims: [{ claim: "c" }],
      pages: ["guides/security/other.md"],
    }),
  );
  assert.equal(issues.length, 1);
  assert.equal(issues[0].rule, "research-artifact-omits-page");
});

test("a research artifact with claims that names the page is clean", () => {
  assert.deepEqual(
    checkResearchGrounds(
      "guides/security/x.md",
      fm({ research: "research/security/a.md" }),
      () => ({
        kind: "research",
        claims: [{ claim: "c" }],
        pages: ["guides/security/x.md"],
      }),
    ),
    [],
  );
});

test("a legacy refresh artifact is left alone by both rules", () => {
  assert.deepEqual(
    checkResearchGrounds(
      "guides/providers/open-weight.md",
      fm({ research: "research/models/r.md" }),
      () => ({ kind: "refresh", unit: ["guides/models/comparison.md"] }),
    ),
    [],
  );
});

test("an unreadable or absent artifact is left to research-path-unresolved", () => {
  assert.deepEqual(
    checkResearchGrounds(
      "guides/security/x.md",
      fm({ research: "research/security/missing.md" }),
      () => null,
    ),
    [],
  );
});

test("a page naming no artifact is not this rule's business", () => {
  assert.deepEqual(checkResearchGrounds("guides/security/x.md", fm(), () => null), []);
});
```

Add `checkResearchGrounds` to the existing import from `../verify-pages.mjs` at the top of the file; do not add a second import statement.

- [ ] **Step 2: Run them to verify they fail**

Run: `node --test tools/corpus/test/verify-pages.test.mjs 2>&1 | grep -E "^# (pass|fail)|^not ok"`
Expected: FAIL — `checkResearchGrounds is not a function` (or an import error naming it).

- [ ] **Step 3: Implement the check**

Add to `tools/corpus/verify-pages.mjs`, below `checkResearchRequired`:

```javascript
// research-path-unresolved proves a pointer opens; this proves it leads
// somewhere. Without it, `refresh --skeleton` on a record-less page writes an
// artifact with no claims, `--stamp` points the page at it, and every gate
// reports clean on a page with no grounding at all — reproduced 2026-10-15.
// Scoped to `kind: research` so the legacy refresh pointers keep working.
export function checkResearchGrounds(pageRel, data, readArtifact) {
  if (data == null || typeof data !== "object") return [];
  const named =
    typeof data.research === "string" && data.research.trim() !== ""
      ? data.research.trim()
      : null;
  if (named === null) return [];

  const artifact = readArtifact(named);
  // An absent or unparseable artifact is research-path-unresolved's finding, not
  // this one's. Reporting it twice would make one fix look like two.
  if (artifact == null || typeof artifact !== "object") return [];
  if (artifact.kind !== "research") return [];

  const issues = [];
  if (!Array.isArray(artifact.claims) || artifact.claims.length === 0)
    issues.push({
      rule: "research-artifact-grounds-nothing",
      message: `${named} is a research artifact carrying no claims, so it grounds nothing; fill in its claims or mark the page deprecated`,
    });

  const pages = Array.isArray(artifact.pages) ? artifact.pages : [];
  if (!pages.includes(pageRel))
    issues.push({
      rule: "research-artifact-omits-page",
      message: `${named} does not name ${pageRel} in its pages list, so nothing ties this page to the grounding it claims`,
    });

  return issues;
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `node --test tools/corpus/test/verify-pages.test.mjs 2>&1 | grep -E "^# (tests|pass|fail)"`
Expected: `# fail 0`.

- [ ] **Step 5: Wire it into `verifyCorpus`**

```bash
cd ~/dev/llm-guides
TOKEN_OPTIMIZER_MODE=off python3 - <<'PY'
p = "tools/corpus/cli.mjs"
s = open(p).read()

old = "  checkResearchRequired,\n"
assert s.count(old) == 1, ("import", s.count(old))
s = s.replace(old, old + "  checkResearchGrounds,\n", 1)

old = "      ...checkResearchRequired(data, exists),\n"
assert s.count(old) == 1, ("call", s.count(old))
add = """      ...checkResearchGrounds(rel, data, (artRel) => {
        const abs = path.join(root, artRel);
        if (!fs.existsSync(abs)) return null;
        return parseFrontmatter(fs.readFileSync(abs, "utf8")).data;
      }),
"""
s = s.replace(old, old + add, 1)
open(p, "w").write(s)
PY
node tools/corpus/cli.mjs verify .
```

Expected: `verify: clean`. The three pages carrying a pointer all name a `kind: refresh` artifact, which both rules skip by design.

- [ ] **Step 6: Prove it closes the forgery, end to end**

This is the step that shows the gate is no longer fakeable. It writes to a sandbox copy, never to the repo:

```bash
cd ~/dev/llm-guides
SBX=$(mktemp -d)
git archive HEAD | tar -x -C "$SBX"
ln -sfn "$PWD/node_modules" "$SBX/node_modules"
mkdir -p "$SBX/guides/security" "$SBX/research/security"
printf '%s\n' '---' 'title: T' 'summary: s' 'topic: security' \
  'verified: "2026-10-16"' 'applies_to: ["x, read on 2026-10-16"]' \
  'sources: []' 'related: []' \
  'research: research/security/empty-research.md' '---' '' 'body' > "$SBX/guides/security/t.md"
printf '%s\n' '---' 'kind: research' 'subject: t' 'topic: security' \
  'pages: []' 'path: research/security/empty-research.md' \
  "gathered: '2026-10-16'" 'verdict: grounded' 'claims: []' '---' '' 'body' \
  > "$SBX/research/security/empty-research.md"
( cd "$SBX" && node tools/corpus/cli.mjs verify . ; echo "exit=$?" )
rm -rf "$SBX"
```

Expected: the run prints both `research-artifact-grounds-nothing` and `research-artifact-omits-page` for `guides/security/t.md`, and `exit=1`. Before this task, the same tree reported `verify: clean`.

- [ ] **Step 7: Document both rules and pin them**

```bash
cd ~/dev/llm-guides
TOKEN_OPTIMIZER_MODE=off python3 - <<'PY'
p = "CLAUDE.md"
s = open(p).read()
anchor = "| `research-path-unresolved`       | verify |"
assert s.count(anchor) == 1, s.count(anchor)
start = s.index(anchor)
end = s.index("\n", start) + 1
rows = (
    "| `research-artifact-grounds-nothing` | verify | A page's `research:` names a `kind: research` artifact whose `claims` list is empty or absent, so the pointer resolves and grounds nothing. The existence check cannot see this: `refresh --skeleton` on a record-less page writes exactly such an artifact, and before this rule every gate reported clean on a page with no grounding. | Fill in the artifact's claims, or mark the page `status: deprecated`. |\n"
    "| `research-artifact-omits-page`   | verify | A page's `research:` names a `kind: research` artifact whose `pages` list does not include that page, so nothing ties the page to the grounding it claims. Scoped to `kind: research`; a legacy `kind: refresh` pointer is exempt. | Add the page to the artifact's `pages`, or point the page at the artifact that grounds it. |\n"
)
s = s[:end] + rows + s[end:]
open(p, "w").write(s)
PY
TOKEN_OPTIMIZER_MODE=off python3 - <<'PY'
p = "tools/corpus/test/contract.test.mjs"
s = open(p).read()
old = '  "research-path-unresolved",\n'
assert s.count(old) == 1, s.count(old)
s = s.replace(
    old,
    old
    + '  "research-artifact-grounds-nothing",\n'
    + '  "research-artifact-omits-page",\n',
    1,
)
open(p, "w").write(s)
PY
node --test tools/corpus/test/contract.test.mjs 2>&1 | grep -E "^# (tests|fail)"
```

Expected: `# fail 0`.

- [ ] **Step 8: Run the four gates**

```bash
cd ~/dev/llm-guides
npm test 2>&1 | grep -E "^# (tests|fail)"
node tools/corpus/cli.mjs render --check . ; echo "render exit=$?"
node tools/corpus/cli.mjs lint .
node tools/corpus/cli.mjs verify .
git status --porcelain meta/ledger.yaml
```

Expected: `# fail 0` with the total **+8** over this task's starting measurement (6 new verify-pages tests, 2 new contract rule tests), `render exit=0`, `lint: clean`, `verify: clean`, no ledger change.

- [ ] **Step 9: Commit**

```bash
cd ~/dev/llm-guides
git add tools/corpus/verify-pages.mjs tools/corpus/cli.mjs CLAUDE.md \
  tools/corpus/test/verify-pages.test.mjs tools/corpus/test/contract.test.mjs
git commit -m "feat: reject a research pointer that resolves but grounds nothing"
```

---

## Task 5: `corpus research --ground` writes the pointer

**Files:**
- Modify: `tools/corpus/research.mjs` (add `groundPages`)
- Modify: `tools/corpus/cli.mjs` (a `--ground` branch inside the `research` command)
- Modify: `CLAUDE.md` (the command table row for `research`, and the `research:` front-matter paragraph)
- Test: `tools/corpus/test/research.test.mjs` (append)

**Interfaces:**
- Consumes: `validateArtifactFile(root, rel, { today }) -> issues[]` and `ResearchError` from Task 3; `setPageResearch` is **not** reused — `refresh-stamp.mjs` owns it for the refresh path, and importing it here would couple the two pipelines the spec deliberately separates.
- Produces: `groundPages(root, rel, { today, writeImpl }) -> { pages: string[] }`. Throws `ResearchError` with rule `research-not-accepted` when the artifact has no `accepted` date, `research-artifact-invalid` when `validateArtifactFile` returns any issue, `research-ground-insufficient` when `verdict` is not `grounded`, and `research-page-not-found` when a named page is absent from disk. All-or-nothing: every page body is computed in memory and nothing is written until all of them succeed.

Acceptance is what licenses grounding. The spec says so, and nothing enforced it before this task: a page could name an unaccepted artifact and pass every gate.

- [ ] **Step 1: Write the failing tests**

Append to `tools/corpus/test/research.test.mjs`. Add `groundPages` to the existing import from `../research.mjs`.

```javascript
function groundable(root, over = {}) {
  fs.mkdirSync(path.join(root, "research", "security"), { recursive: true });
  fs.mkdirSync(path.join(root, "guides", "security"), { recursive: true });
  const rel = "research/security/2026-10-16-pi-research.md";
  const doc = {
    kind: "research",
    subject: "pi",
    topic: "security",
    pages: ["guides/security/pi.md"],
    path: rel,
    gathered: "2026-10-16",
    accepted: "2026-10-16",
    verdict: "grounded",
    claims: [
      {
        claim: "c",
        source: "https://example.com/a",
        tier: 1,
        read: "2026-10-16",
        label: "Documented",
      },
    ],
    ...over,
  };
  const body = Object.entries(doc)
    .map(([k, v]) =>
      typeof v === "string" ? `${k}: ${v}` : `${k}: ${JSON.stringify(v)}`,
    )
    .join("\n");
  fs.writeFileSync(path.join(root, rel), `---\n${body}\n---\n\nbody\n`);
  fs.writeFileSync(
    path.join(root, "guides", "security", "pi.md"),
    "---\ntitle: PI\nsummary: s\ntopic: security\nverified: \"2026-10-16\"\napplies_to: [x]\nsources: []\nrelated: []\n---\n\nbody\n",
  );
  return rel;
}

test("groundPages writes research: onto every page the artifact names", () => {
  const root = corpus();
  try {
    const rel = groundable(root);
    const out = groundPages(root, rel, { today: "2026-10-16" });
    assert.deepEqual(out.pages, ["guides/security/pi.md"]);
    const text = fs.readFileSync(
      path.join(root, "guides", "security", "pi.md"),
      "utf8",
    );
    assert.match(text, new RegExp(`^research: ${rel}$`, "m"));
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test("groundPages refuses an artifact with no accepted date", () => {
  const root = corpus();
  try {
    const rel = groundable(root, { accepted: undefined });
    assert.throws(
      () => groundPages(root, rel, { today: "2026-10-16" }),
      (e) => e instanceof ResearchError && e.rule === "research-not-accepted",
    );
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test("groundPages refuses an insufficient artifact", () => {
  const root = corpus();
  try {
    const rel = groundable(root, { verdict: "insufficient", pages: [] });
    assert.throws(
      () => groundPages(root, rel, { today: "2026-10-16" }),
      (e) =>
        e instanceof ResearchError && e.rule === "research-ground-insufficient",
    );
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test("groundPages refuses an artifact that does not validate", () => {
  const root = corpus();
  try {
    const rel = groundable(root, { claims: [] });
    assert.throws(
      () => groundPages(root, rel, { today: "2026-10-16" }),
      (e) => e instanceof ResearchError && e.rule === "research-artifact-invalid",
    );
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test("groundPages refuses when a named page is missing, and writes nothing", () => {
  const root = corpus();
  try {
    const rel = groundable(root, {
      pages: ["guides/security/pi.md", "guides/security/gone.md"],
    });
    assert.throws(
      () => groundPages(root, rel, { today: "2026-10-16" }),
      (e) => e instanceof ResearchError && e.rule === "research-page-not-found",
    );
    // All-or-nothing: the page that does exist must be untouched.
    const text = fs.readFileSync(
      path.join(root, "guides", "security", "pi.md"),
      "utf8",
    );
    assert.ok(!text.includes("research:"), "no page may be written on a refusal");
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test("groundPages replaces an existing research pointer rather than duplicating it", () => {
  const root = corpus();
  try {
    const rel = groundable(root);
    const page = path.join(root, "guides", "security", "pi.md");
    fs.writeFileSync(
      page,
      fs.readFileSync(page, "utf8").replace(
        "related: []",
        "related: []\nresearch: research/security/old.md",
      ),
    );
    groundPages(root, rel, { today: "2026-10-16" });
    const text = fs.readFileSync(page, "utf8");
    assert.equal((text.match(/^research:/gm) ?? []).length, 1);
    assert.match(text, new RegExp(`^research: ${rel}$`, "m"));
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});
```

- [ ] **Step 2: Run them to verify they fail**

Run: `node --test tools/corpus/test/research.test.mjs 2>&1 | grep -E "^# (pass|fail)|^not ok"`
Expected: FAIL — `groundPages is not a function` (or an import error naming it).

- [ ] **Step 3: Implement `groundPages`**

Add to `tools/corpus/research.mjs`:

```javascript
// research: is a single line in a page's front-matter, and the page may or may
// not already carry one. Rewrite in place when it does, insert after `related:`
// when it does not — a surgical single-line edit, never a YAML round trip,
// which would strip the contract-required comments other files rely on.
function setResearchPointer(text, rel) {
  if (/^research:.*$/m.test(text))
    return text.replace(/^research:.*$/m, `research: ${rel}`);
  if (/^related:.*$/m.test(text))
    return text.replace(/^(related:.*)$/m, `$1\nresearch: ${rel}`);
  throw new ResearchError(
    "research-page-frontmatter",
    "page front-matter has no research: or related: line to anchor the pointer to",
  );
}

export function groundPages(root, rel, options = {}) {
  const { today, writeImpl = fs.writeFileSync } = options;

  const issues = validateArtifactFile(root, rel, { today });
  if (issues.length > 0)
    throw new ResearchError(
      "research-artifact-invalid",
      `${rel} does not validate, so it cannot ground anything: ${issues
        .map((i) => i.rule)
        .join(", ")}`,
    );

  const { data } = parseFrontmatter(
    fs.readFileSync(path.join(root, rel), "utf8"),
  );

  // Acceptance is what licenses grounding. A machine gathered these claims, and
  // the one failure structure cannot catch is a real URL cited for a claim it
  // does not make — only a reader catches that.
  if (data.accepted == null)
    throw new ResearchError(
      "research-not-accepted",
      `${rel} carries no accepted date; a research artifact grounds a page only after a human has accepted it`,
    );

  if (data.verdict !== "grounded")
    throw new ResearchError(
      "research-ground-insufficient",
      `${rel} has verdict ${JSON.stringify(data.verdict)}; only a grounded artifact grounds a page, and the consequence of insufficient is no page`,
    );

  // Compute every new body before writing any, so a missing page cannot leave
  // half the unit pointed at this artifact and half not.
  const pending = [];
  for (const pageRel of data.pages) {
    const abs = path.join(root, pageRel);
    if (!fs.existsSync(abs))
      throw new ResearchError(
        "research-page-not-found",
        `${rel} names ${pageRel}, which does not exist on disk`,
      );
    pending.push([abs, setResearchPointer(fs.readFileSync(abs, "utf8"), rel)]);
  }

  for (const [abs, text] of pending) writeImpl(abs, text, "utf8");
  return { pages: [...data.pages] };
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `node --test tools/corpus/test/research.test.mjs 2>&1 | grep -E "^# (tests|pass|fail)"`
Expected: `# fail 0`, 15 tests passing.

- [ ] **Step 5: Wire `--ground` into the CLI**

```bash
cd ~/dev/llm-guides
TOKEN_OPTIMIZER_MODE=off python3 - <<'PY'
p = "tools/corpus/cli.mjs"
s = open(p).read()

old = '''  "--validate",
]);'''
new = '''  "--validate",
  "--ground",
]);'''
assert s.count(old) == 1, ("flags", s.count(old))
s = s.replace(old, new, 1)

old = '''    if (rest.includes("--skeleton")) {'''
new = '''    if (rest.includes("--ground")) {
      if (artifact === null) usage();
      try {
        const { pages } = groundPages(root, artifact, { today });
        for (const page of pages) console.log(`research: grounded ${page}`);
        process.exit(0);
      } catch (e) {
        if (e instanceof ResearchError) {
          console.error(`research: [${e.rule}] ${e.message}`);
          process.exit(e.rule === "research-artifact-invalid" ? 1 : 2);
        }
        throw e;
      }
    }
    if (rest.includes("--skeleton")) {'''
assert s.count(old) == 1, ("dispatch", s.count(old))
s = s.replace(old, new, 1)

old = '''  validateArtifactFile,
  writeSkeleton,
} from "./research.mjs";'''
new = '''  groundPages,
  validateArtifactFile,
  writeSkeleton,
} from "./research.mjs";'''
assert s.count(old) == 1, ("import", s.count(old))
s = s.replace(old, new, 1)

open(p, "w").write(s)
PY
node tools/corpus/cli.mjs research --ground ; echo "no-artifact exit=$?"
```

Expected: the usage block and `exit=2`.

- [ ] **Step 6: Document the command and the pointer's writer**

```bash
cd ~/dev/llm-guides
TOKEN_OPTIMIZER_MODE=off python3 - <<'PY'
p = "CLAUDE.md"
s = open(p).read()

old = "`node tools/corpus/cli.mjs <render|lint|verify|ledger|refresh|site|sources> [--write] [dir]` or"
new = "`node tools/corpus/cli.mjs <render|lint|verify|ledger|refresh|site|sources|research> [--write] [dir]` or"
assert s.count(old) == 1, ("usage", s.count(old))
s = s.replace(old, new, 1)

anchor = "| `node tools/corpus/cli.mjs sources .`"
assert s.count(anchor) == 1, ("table", s.count(anchor))
start = s.index(anchor)
end = s.index("\n", start) + 1
row = "| `node tools/corpus/cli.mjs research .`       | —                           | **Not a gate.** Initial grounding, the sibling of `refresh`. `--skeleton --subject=<slug> --topic=<topic>` writes a fail-closed `kind: research` artifact under `research/<topic>/`; `--validate --artifact=<research/...>` checks one against the schema; `--ground --artifact=<research/...>` writes `research:` onto every page the artifact names, all-or-nothing, and only when the artifact validates, carries an `accepted` date and has `verdict: grounded`. Writes `research/` and `guides/` — **never `data/`, never `meta/ledger.yaml`**. | 0 on success, 1 on an invalid artifact, 2 on a usage error or a refusal |\n"
s = s[:end] + row + s[end:]

old = """`research` has exactly one meaning — the page's current grounding artifact — whichever
stage produced it."""
new = """`research` has exactly one meaning — the page's current grounding artifact — whichever
stage produced it. `corpus research --ground` is what sets it for an initial
research cycle, and it refuses unless the artifact validates, names the page,
carries an `accepted` date and reads `verdict: grounded`; `refresh --stamp` is
what sets it for a refresh."""
assert s.count(old) == 1, ("frontmatter", s.count(old))
s = s.replace(old, new, 1)

open(p, "w").write(s)
PY
node --test tools/corpus/test/contract.test.mjs 2>&1 | grep -E "^# (tests|fail)"
```

Expected: `# fail 0`. The contract test asserts every CLI subcommand appears in `CLAUDE.md`; `research` now does.

- [ ] **Step 7: Run the four gates**

```bash
cd ~/dev/llm-guides
npm test 2>&1 | grep -E "^# (tests|fail)"
node tools/corpus/cli.mjs render --check . ; echo "render exit=$?"
node tools/corpus/cli.mjs lint .
node tools/corpus/cli.mjs verify .
git status --porcelain meta/ledger.yaml guides/ data/
```

Expected: `# fail 0` with the total **+6** over this task's starting measurement, `render exit=0`, `lint: clean`, `verify: clean`, and no output from the `git status` line — this task writes tooling only.

- [ ] **Step 8: Commit**

```bash
cd ~/dev/llm-guides
git add tools/corpus/research.mjs tools/corpus/cli.mjs CLAUDE.md \
  tools/corpus/test/research.test.mjs
git commit -m "feat: ground pages from an accepted research artifact"
```

---

## Task 6: `refresh --stamp` must not launder a research pointer

**Files:**
- Modify: `tools/corpus/refresh-stamp.mjs` (inside `stampUnit`, beside the existing `refresh-research-unresolved` check at line 307)
- Modify: `CLAUDE.md` (one new Issue rules row)
- Modify: `tools/corpus/test/contract.test.mjs` (add the rule to `RULES`)
- Test: `tools/corpus/test/refresh-stamp.test.mjs` (append)

**Interfaces:**
- Consumes: `stampUnit(root, artifact, { today })` — note it takes the **artifact**, not a resolved unit, so the page list is `artifact.unit` and the record keys are `artifact.unit_keys`. The module imports `node:path` as `nodePath`, not `path`. The new check goes immediately after the existing `refresh-research-unresolved` throw (around line 309), so it refuses before `pending` is built and therefore before anything is written.
- Produces: one new refusal, rule `refresh-would-launder-research`. No signature change.

- [ ] **Step 1: Write the failing test**

Review Focus 5. Append to `tools/corpus/test/refresh-stamp.test.mjs`, following that file's existing fixture helpers rather than inventing new ones — read the top of the file first and reuse whatever builds a unit and an artifact there.

```javascript
test("stampUnit refuses to overwrite a kind: research pointer on a record-less page", () => {
  // A record-less page derives volatility: null and sits on the low cadence, so
  // it IS eventually refreshed. That refresh re-reads nothing, and overwriting
  // research: would replace an accepted claim-to-source table with an artifact
  // documenting nothing -- the page's whole content is the claims that table
  // grounds.
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "launder-"));
  try {
    fs.mkdirSync(path.join(root, "guides", "security"), { recursive: true });
    fs.mkdirSync(path.join(root, "research", "security"), { recursive: true });
    fs.writeFileSync(
      path.join(root, "research", "security", "r.md"),
      "---\nkind: research\nsubject: s\ntopic: security\npages: [guides/security/p.md]\npath: research/security/r.md\ngathered: '2026-10-16'\naccepted: '2026-10-16'\nverdict: grounded\nclaims: [{claim: c}]\n---\n\nbody\n",
    );
    fs.writeFileSync(
      path.join(root, "guides", "security", "p.md"),
      "---\ntitle: P\nsummary: s\ntopic: security\nverified: \"2026-10-16\"\napplies_to: [x]\nsources: []\nrelated: []\nresearch: research/security/r.md\n---\n\nbody\n",
    );
    // stampUnit takes the artifact, so build one: a record-less unit has
    // unit_keys: [] and records: [], which is the shape --skeleton writes for
    // such a page.
    const artifact = {
      kind: "refresh",
      unit: ["guides/security/p.md"],
      entry: "guides/security/p.md",
      topic: "security",
      topics: ["security"],
      slug: "p",
      path: "research/security/r.md",
      fetched: "2026-10-16",
      verdict: "confirmed",
      key_scoped: false,
      unit_keys: [],
      unit_was: { "guides/security/p.md": "2026-10-16" },
      records: [],
    };
    const err = assert.throws(() =>
      stampUnit(root, artifact, { today: "2026-10-16" }),
    );
    assert.equal(err.rule, "refresh-would-launder-research");
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});
```

The artifact's `path` points at the research artifact the fixture wrote, because `stampUnit` refuses an artifact whose own `path` does not resolve (`refresh-research-unresolved`) before reaching the new check — so that file must exist for this test to reach what it tests. If `validateArtifact` rejects this hand-built artifact over a field the fixture omits, read `ARTIFACT_FIELDS` in `tools/corpus/refresh-artifact.mjs` and add it rather than loosening the validator.

- [ ] **Step 2: Run it to verify it fails**

Run: `node --test tools/corpus/test/refresh-stamp.test.mjs 2>&1 | grep -E "^# (pass|fail)|^not ok"`
Expected: FAIL — the stamp succeeds and the page's `research:` is overwritten, so no error is thrown and the assertion on `err.rule` fails.

- [ ] **Step 3: Implement the refusal**

Add beside the existing `refresh-research-unresolved` check in `stampUnit`, before any write:

```javascript
// A refresh of a record-less page re-reads nothing: its unit has no record
// entries, so the artifact it would write documents nothing. Overwriting a
// kind: research pointer with that is a silent downgrade of the page's only
// grounding, on exactly the page class the research cycle produces. The page
// still gets its verified date bumped by a refresh that re-checked its
// identifiers; what it does not get is its grounding replaced.
if (artifact.unit_keys.length === 0) {
  for (const pageRel of artifact.unit) {
    const pageAbs = nodePath.join(root, pageRel);
    if (!fs.existsSync(pageAbs)) continue;
    const { data } = parseFrontmatter(fs.readFileSync(pageAbs, "utf8"));
    const current =
      typeof data?.research === "string" && data.research.trim() !== ""
        ? data.research.trim()
        : null;
    if (current === null) continue;
    const artAbs = nodePath.join(root, current);
    if (!fs.existsSync(artAbs)) continue;
    const { data: artData } = parseFrontmatter(fs.readFileSync(artAbs, "utf8"));
    if (artData?.kind !== "research") continue;
    throw new RefreshError(
      "refresh-would-launder-research",
      `${pageRel} is grounded by the research artifact ${current}, and this unit references no records, so a refresh here would replace a claim-to-source table with an artifact documenting nothing — re-run the research cycle instead, or refresh a unit that owns records`,
    );
  }
}
```

Confirm `parseFrontmatter` is imported with `grep -n parseFrontmatter tools/corpus/refresh-stamp.mjs` and add the import only if it is absent. Do not reach into `research.mjs` — that would make the refresh pipeline depend on the research pipeline, which the spec separates deliberately, and all this needs is one `kind` field.

- [ ] **Step 4: Run the test to verify it passes**

Run: `node --test tools/corpus/test/refresh-stamp.test.mjs 2>&1 | grep -E "^# (tests|pass|fail)"`
Expected: `# fail 0`.

- [ ] **Step 5: Confirm the refresh path for record-owning units is untouched**

The whole existing refresh suite is the proof — this check must fire only when a unit references no records at all:

```bash
cd ~/dev/llm-guides
node --test "tools/corpus/test/refresh*.test.mjs" 2>&1 | grep -E "^# (tests|pass|fail)"
```

Expected: `# fail 0`, and the test total for those files is unchanged except for the one test you added. A failure here means the guard is firing on units that own records.

- [ ] **Step 6: Document the rule and pin it**

```bash
cd ~/dev/llm-guides
TOKEN_OPTIMIZER_MODE=off python3 - <<'PY'
p = "CLAUDE.md"
s = open(p).read()
anchor = "| `refresh-research-unresolved`"
assert s.count(anchor) == 1, s.count(anchor)
start = s.index(anchor)
end = s.index("\n", start) + 1
row = "| `refresh-would-launder-research`  | refresh | `--stamp` on a unit that references no records, where a page in the unit is grounded by a `kind: research` artifact. Such a refresh re-reads nothing, so the artifact it writes documents nothing, and overwriting `research:` with it would silently replace the page's only grounding. Record-less pages derive `volatility: null` and sit on the low cadence, so they are eventually refreshed — this is the guard that stops that being a downgrade. | Re-run the research cycle for that page, or refresh a unit that owns records. |\n"
s = s[:end] + row + s[end:]
open(p, "w").write(s)
PY
TOKEN_OPTIMIZER_MODE=off python3 - <<'PY'
p = "tools/corpus/test/contract.test.mjs"
s = open(p).read()
old = '  "research-artifact-omits-page",\n'
assert s.count(old) == 1, s.count(old)
s = s.replace(old, old + '  "refresh-would-launder-research",\n', 1)
open(p, "w").write(s)
PY
node --test tools/corpus/test/contract.test.mjs 2>&1 | grep -E "^# (tests|fail)"
```

Expected: `# fail 0`.

- [ ] **Step 7: Run the four gates**

```bash
cd ~/dev/llm-guides
npm test 2>&1 | grep -E "^# (tests|fail)"
node tools/corpus/cli.mjs render --check . ; echo "render exit=$?"
node tools/corpus/cli.mjs lint .
node tools/corpus/cli.mjs verify .
git status --porcelain meta/ledger.yaml
```

Expected: `# fail 0` with the total **+2** over this task's starting measurement, `render exit=0`, `lint: clean`, `verify: clean`, no ledger change.

- [ ] **Step 8: Commit**

```bash
cd ~/dev/llm-guides
git add tools/corpus/refresh-stamp.mjs CLAUDE.md \
  tools/corpus/test/refresh-stamp.test.mjs tools/corpus/test/contract.test.mjs
git commit -m "fix: refuse a refresh that would replace a research pointer with nothing"
```

---

## Task 7: The research prompt

**Files:**
- Create: `meta/prompts/research.md`
- Modify: `CLAUDE.md` (the prompt library enumeration)
- Test: `tools/corpus/test/refresh-prompts.test.mjs` (append)

**Interfaces:**
- Consumes: `RESEARCH_VERDICTS`, `CLAIM_FIELDS`, `SOURCE_TIERS` from `tools/corpus/research-artifact.mjs` (Task 1), and `VALID_LABELS` from `tools/corpus/verify-pages.mjs`.
- Produces: no code. The deliverable is the prompt the gathering subagent is given, plus a drift test pinning its vocabulary to the code's constants — which is why `refresh.md` and `verify-agent.md` each have one.

- [ ] **Step 1: Write the failing drift test**

Append to `tools/corpus/test/refresh-prompts.test.mjs`:

```javascript
const research = fs.readFileSync(
  new URL("../../../meta/prompts/research.md", import.meta.url),
  "utf8",
);

test("research.md names every research verdict", () => {
  for (const v of RESEARCH_VERDICTS)
    assert.ok(research.includes(v), `research.md omits the verdict ${v}`);
});

test("research.md names every required claim field", () => {
  for (const f of CLAIM_FIELDS)
    assert.ok(research.includes(f), `research.md omits the claim field ${f}`);
});

test("research.md states the tier ceiling and never licenses Verified", () => {
  for (const t of SOURCE_TIERS)
    assert.ok(research.includes(`tier ${t}`), `research.md omits tier ${t}`);
  assert.ok(research.includes("Documented"));
  assert.ok(research.includes("Plausible"));
  assert.ok(
    research.includes("never Verified") || research.includes("not Verified"),
    "research.md must say the artifact may never assert Verified, because only a shipped proof licenses it",
  );
});

test("CLAUDE.md's prompt library names research.md", () => {
  assert.ok(contract.includes("meta/prompts/research.md"));
});
```

Add `RESEARCH_VERDICTS`, `CLAIM_FIELDS` and `SOURCE_TIERS` to this file's imports from `../research-artifact.mjs`.

- [ ] **Step 2: Run it to verify it fails**

Run: `node --test tools/corpus/test/refresh-prompts.test.mjs 2>&1 | grep -E "^# (pass|fail)|^not ok"`
Expected: FAIL — `ENOENT` for `meta/prompts/research.md`.

- [ ] **Step 3: Write `meta/prompts/research.md`**

```markdown
# Research agent

You gather the grounding for a page that does not exist yet, and you write it
into one artifact. You do not write the page. You do not decide whether the page
gets written — the artifact's verdict does that, and a human accepts it before
anything is grounded.

## What you are given, and what you produce

You get a subject, a topic from `meta/taxonomy.yaml`, and the artifact
`corpus research --skeleton` has already written at
`research/<topic>/<date>-<subject>-research.md`. You fill that file in.

Its `claims` list is the artifact. Each entry is one claim a reader could check
from the source you give for it, carrying `claim`, `source` (an absolute http(s)
URL), `tier`, `read` (the date you read it) and `label`.

## Tiers set the ceiling, and you do not round up

Tier 1 is vendor canonical documentation. Tier 2 is papers, changelogs, official
cookbooks and engineering blogs. Tier 3 is reputable practitioners, talks and
well-documented open source. Tier 4 is gists, forums, threads and one-off
repositories.

A tier 1 or tier 2 source licenses **Documented**. A tier 3 or tier 4 source
licenses **Plausible**, and no amount of corroboration between tier 3 sources
promotes a claim to Documented — agreement among practitioners is still
practitioner inference.

**Never Verified.** That label requires a proof that ships in this repository
under `examples/`, and research produces citations rather than proofs. The
validator rejects it.

If the best source for a claim is tier 3, the honest artifact says tier 3. A
page that is mostly Plausible is worth less than its page count suggests, and
the way that fact reaches a reader is through these labels. Relabelling to make
the page look stronger converts a visible weakness into an invisible one.

## A claim is checkable, or it is not a claim

Before you write an entry, ask whether a reader opening that URL would find that
claim. A real URL cited for a claim it does not make is the one failure the
schema cannot catch and the accepting human exists to catch — do not make them
find it. If a source nearly says it, write what the source says and label it for
what it is.

Quote the figure, name the scope. A measured result holds within the models,
tasks and dates the study used; say so in the claim.

## Verdicts

`grounded` means the claims support the pages you name in `pages`, and a reader
could write those pages from this artifact without reaching for anything else.

`insufficient` means the sources do not exist, or do not say what the page would
need. **That is a successful outcome.** Its consequence is no page, not a page
written from inference, and `pages` stays empty. Say in the body what you looked
for and why what you found does not carry it, because the next attempt starts
from that.

Do not reach for `grounded` because the cycle would otherwise feel wasted. A
page written from an artifact that should have read `insufficient` is the exact
failure every rule in this corpus exists to prevent.

## Narrative belongs in the pull request

The artifact is a claim-to-source table. An account of the search — what you
queried, what was a dead end — goes in the pull request body. Conflating the two
makes the grounding gate satisfiable by a log, which is how a page comes to cite
a record of someone looking rather than a record of what is true.

## Volatile values

If the subject's claims require a model id, a price, a context limit or an
availability date, stop and say so. Those are values, they belong in a `data/`
record with its own `source` and `verified` date, and a page carrying one is on
a 30-day clock. The pages this cycle grounds are evergreen by design.

## When you are done

`corpus research --validate --artifact=<path>` must exit 0. Then the artifact
goes to a human, who adds `accepted:` with the date. Only then does
`corpus research --ground --artifact=<path>` write `research:` onto the pages.
```

- [ ] **Step 4: Add the prompt to the contract's enumeration**

```bash
cd ~/dev/llm-guides
TOKEN_OPTIMIZER_MODE=off python3 - <<'PY'
p = "CLAUDE.md"
s = open(p).read()
old = "`meta/prompts/refresh.md` carries the fetching"
new = "`meta/prompts/research.md` carries the initial-grounding procedure and the tier ceiling; `meta/prompts/refresh.md` carries the fetching"
assert s.count(old) == 1, s.count(old)
s = s.replace(old, new, 1)
open(p, "w").write(s)
PY
node --test tools/corpus/test/refresh-prompts.test.mjs 2>&1 | grep -E "^# (tests|pass|fail)"
```

Expected: `# fail 0`.

- [ ] **Step 5: Mutation-check the drift guard**

```bash
cd ~/dev/llm-guides
cp meta/prompts/research.md /tmp/r-backup.md
TOKEN_OPTIMIZER_MODE=off python3 -c "
p='meta/prompts/research.md'; s=open(p).read()
assert s.count('insufficient') >= 1
open(p,'w').write(s.replace('insufficient','inconclusive'))"
node --test tools/corpus/test/refresh-prompts.test.mjs 2>&1 | grep -E "^# fail|^not ok"
cp /tmp/r-backup.md meta/prompts/research.md && rm /tmp/r-backup.md
node --test tools/corpus/test/refresh-prompts.test.mjs 2>&1 | grep -E "^# (pass|fail)"
git status --porcelain meta/prompts/
```

Expected: the mutated run fails the verdict test; the restored run passes; `git status` prints nothing.

- [ ] **Step 6: Run the four gates**

```bash
cd ~/dev/llm-guides
npm test 2>&1 | grep -E "^# (tests|fail)"
node tools/corpus/cli.mjs render --check . ; echo "render exit=$?"
node tools/corpus/cli.mjs lint .
node tools/corpus/cli.mjs verify .
git status --porcelain meta/ledger.yaml
```

Expected: `# fail 0` with the total **+4** over this task's starting measurement, `render exit=0`, `lint: clean`, `verify: clean`, no ledger change.

- [ ] **Step 7: Commit**

```bash
cd ~/dev/llm-guides
git add meta/prompts/research.md CLAUDE.md tools/corpus/test/refresh-prompts.test.mjs
git commit -m "feat: add the research agent prompt and pin its vocabulary"
```

---

## What this plan deliberately leaves undone

- **Any guide page.** The first cycle's output is a `security` concept page and its split, and the spec is explicit that the split is the cycle's output rather than the spec's assertion. Running the cycle is the next piece of work; this plan builds what it runs on.
- **Re-filing `research/models/2026-10-06-claude-models-comparison-refresh.md`.** The spec records that `guides/providers/open-weight.md` is mis-filed rather than ungrounded — its four records were genuinely re-verified in that artifact — and that the fix is a front-matter change rather than a research cycle. Task 4's rules are scoped to `kind: research` precisely so that legacy pointer keeps passing until it is re-filed. Doing it is a one-artifact change and belongs with the first cycle.
- **An `accepted`-gated `verify` rule.** `--ground` refuses an unaccepted artifact, so the pointer cannot be written without acceptance; nothing stops a hand-edited `research:` bypassing that. Closing it means a verify rule reading the artifact's `accepted` field, which is cheap but asserts a policy the first cycle has not tested yet.
- **`sources --archive` for research artifacts.** `archive.mjs` rejects a `kind` other than `refresh`, so a research artifact's tier-3 citations get no snapshot — and tier-3 sources are the most likely to rot. This is the one gap worth scheduling next: the source-durability design exists and does not cover this sibling.
- **A `taxonomy-malformed` diagnostic.** Still deferred from the earlier review; unrelated to this plan.
