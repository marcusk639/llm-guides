// Falsifies: refreshing an unchanged refresh unit changes only `verified` dates,
// plus a one-time `research:` field per page. Time-independent: every date
// written comes from the artifact, never from the clock.
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { loadRecords } from "../../tools/corpus/data.mjs";
import {
  resolveUnit,
  artifactPathFor,
} from "../../tools/corpus/refresh-units.mjs";
import { workOrder } from "../../tools/corpus/refresh-order.mjs";
import {
  parseArtifact,
  dumpArtifact,
  renderArtifactSkeleton,
} from "../../tools/corpus/refresh-artifact.mjs";
import { stampUnit, revertUnit } from "../../tools/corpus/refresh-stamp.mjs";

const FETCHED = "2026-09-28";
const READ = "2026-09-27";
// THREE distinct dates, deliberately. The proof's second claim is that every
// date written comes from the artifact and never from the clock, and it can
// only fail if `today` differs from both of the artifact's dates: passing
// `{ today: FETCHED }` made the page-side assertion tautological, so sourcing
// the page date from the clock passed this proof and the whole unit suite.
// TODAY is later than both, which is also the ordinary case: an artifact filled
// on Monday and stamped on Friday must still date its pages Monday.
const TODAY = "2026-09-30";

const PAGE = (title) =>
  [
    "---",
    `title: ${title}`,
    "summary: Synthetic page for the refresh idempotence proof.",
    "topic: models",
    "verified: 2026-09-16",
    "applies_to:",
    '  - "Synthetic fixture 1.0, read on 2026-09-16"',
    "sources:",
    "  - https://example.invalid/docs",
    "related: []",
    "seed: true",
    "---",
    "",
    `# ${title}`,
    "",
    "## 1. What this covers / who it's for",
    "",
    "A synthetic page.",
    "",
    "## 2. The 60-second version",
    "",
    "Window: <!-- corpus:data key=proof.model.context -->200K<!-- /corpus:data -->",
    "",
    "## 3. How it actually works",
    "",
    "Nothing moves.",
    "",
    "## 4. Patterns that hold up",
    "",
    "Evidence: **Documented** — [docs](https://example.invalid/docs), read 2026-09-16.",
    "",
    "## 5. Edge cases and failure modes",
    "",
    "None.",
    "",
    "## 6. Where this rots",
    "",
    "| Claim  | Record                | Volatility | Why it moves |",
    "| ------ | --------------------- | ---------- | ------------ |",
    "| Window | `proof.model.context` | high       | Synthetic    |",
    "",
    "Re-check on refresh: the synthetic identifier `PROOF_FLAG`.",
    "",
    "Deliberately absent: everything else.",
    "",
    "## 7. Proofs",
    "",
    "This page is the proof's own fixture.",
    "",
    "## 8. Sources",
    "",
    "- https://example.invalid/docs",
    "",
  ].join("\n");

const DATA = [
  "# Synthetic records for the refresh idempotence proof.",
  "records:",
  "  - key: proof.model.context",
  '    value: "200000"',
  '    display: "200K"',
  "    volatility: high",
  "    source: https://example.invalid/docs",
  '    verified: "2026-09-16"',
  "    tags: [proof]",
  "",
].join("\n");

const root = fs.mkdtempSync(path.join(os.tmpdir(), "refresh-idempotence-"));
fs.mkdirSync(path.join(root, "guides", "models"), { recursive: true });
fs.mkdirSync(path.join(root, "data"), { recursive: true });
fs.mkdirSync(path.join(root, "meta"), { recursive: true });
fs.writeFileSync(path.join(root, "meta", "taxonomy.yaml"), "topics: [models]\n");
fs.writeFileSync(path.join(root, "data", "proof.yaml"), DATA);
fs.writeFileSync(path.join(root, "guides", "models", "one.md"), PAGE("One"));
fs.writeFileSync(path.join(root, "guides", "models", "two.md"), PAGE("Two"));

const TRACKED = [
  "guides/models/one.md",
  "guides/models/two.md",
  "data/proof.yaml",
];
const readAll = () =>
  Object.fromEntries(
    TRACKED.map((rel) => [rel, fs.readFileSync(path.join(root, rel), "utf8")]),
  );

// An unchanged unit: the live figure equals the record, so every verdict is
// confirmed and nothing but a date should move.
function writeConfirmedArtifact() {
  const records = loadRecords(path.join(root, "data"));
  const unit = resolveUnit(root, "guides/models/one.md", records);
  assert.equal(unit.pages.length, 2, "the two pages share a record");
  const order = workOrder(root, unit, records);
  assert.deepEqual(order.blocking, [], "the fixture's section 6 is complete");
  const rel = artifactPathFor(unit, FETCHED, root);
  const { data, body } = parseArtifact(
    renderArtifactSkeleton(order, { fetched: FETCHED, artifactPath: rel }),
  );
  const filled = {
    ...data,
    verdict: "confirmed",
    records: data.records.map((e) => ({
      ...e,
      verdict: "confirmed",
      url: "https://example.invalid/docs",
      stated: "the same figure the record already holds",
      read: READ,
    })),
  };
  fs.mkdirSync(path.join(root, path.dirname(rel)), { recursive: true });
  fs.writeFileSync(path.join(root, rel), dumpArtifact(filled, body));
  return filled;
}

// A line-multiset difference: every line of `after` that `before` does not also
// contain, counting duplicates. Deliberately NOT a positional walk with a
// one-line lookahead: that mis-aligns on a two-line insertion or on a deletion
// and then reports lines as unchanged that are not, which makes the proof report
// a false PASS. A false pass is the wrong direction for a proof, and a multiset
// difference cannot desynchronise because it has no cursor to lose.
function linesNotIn(haystack, needleText) {
  const counts = new Map();
  for (const line of haystack.split("\n"))
    counts.set(line, (counts.get(line) ?? 0) + 1);
  const out = [];
  for (const line of needleText.split("\n")) {
    const n = counts.get(line) ?? 0;
    if (n > 0) counts.set(line, n - 1);
    else out.push(line);
  }
  return out;
}

// Both directions. Added-or-changed lines alone would miss a deletion; the proof
// has to see a line that vanished as well as one that appeared.
const addedLines = (before, after) => linesNotIn(before, after);
const removedLines = (before, after) => linesNotIn(after, before);

assert.equal(TODAY > FETCHED, true, "today must be later than fetched");
assert.equal(TODAY > READ, true, "today must be later than read");
assert.notEqual(FETCHED, READ, "fetched and read must stay distinct");

const before = readAll();
stampUnit(root, writeConfirmedArtifact(), { today: TODAY });
const after = readAll();

// 1. Only date lines and added research: lines differ, in BOTH directions.
for (const rel of TRACKED) {
  const added = addedLines(before[rel], after[rel]);
  const removed = removedLines(before[rel], after[rel]);
  assert.notEqual(added.length, 0, `${rel} should have changed`);
  for (const line of [...added, ...removed])
    assert.match(
      line,
      /^\s*(verified:|research:)/,
      `${rel}: only verified: and research: lines may appear or disappear, got ${JSON.stringify(line)}`,
    );
  // A page gains exactly one line, its research:, and loses none.
  if (rel.startsWith("guides/")) {
    assert.equal(
      added.filter((l) => l.startsWith("research:")).length,
      1,
      `${rel}: exactly one research: line is added`,
    );
    assert.equal(
      removed.filter((l) => l.startsWith("research:")).length,
      0,
      `${rel}: no research: line disappears on a first refresh`,
    );
  }
}

// 2. The dates written are the artifact's, not the clock's. TODAY appears
// nowhere in the result, which is the half of this claim that had no test.
assert.equal(
  after["guides/models/one.md"].includes(`verified: ${FETCHED}`),
  true,
  "page verified comes from the artifact's fetched",
);
assert.equal(
  after["data/proof.yaml"].includes(`verified: "${READ}"`),
  true,
  "record verified comes from that entry's read date",
);
for (const rel of TRACKED)
  assert.equal(
    after[rel].includes(TODAY),
    false,
    `${rel}: nothing a refresh writes may come from the clock, and ${TODAY} did`,
  );

// 3. seed: true survived.
assert.equal(
  after["guides/models/one.md"].includes("seed: true"),
  true,
  "seed: true is permanent provenance",
);

// 4. Revert restores the prior bytes exactly: a blocked branch is harmless.
const artifactRel = artifactPathFor(
  resolveUnit(root, "guides/models/one.md", loadRecords(path.join(root, "data"))),
  FETCHED,
  root,
);
const stamped = parseArtifact(
  fs.readFileSync(path.join(root, artifactRel), "utf8"),
).data;
revertUnit(root, stamped, { today: TODAY });
assert.deepEqual(readAll(), before, "revert must restore guides/ and data/");

// 5. Stamping the same confirmed artifact again reproduces the same bytes:
// idempotent, and independent of when the proof runs.
stampUnit(root, writeConfirmedArtifact(), { today: TODAY });
assert.deepEqual(readAll(), after, "a second identical refresh is a no-op");

fs.rmSync(root, { recursive: true, force: true });
console.log("PASS: an unchanged refresh unit diffs only in dates");
