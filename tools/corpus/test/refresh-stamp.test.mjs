// tools/corpus/test/refresh-stamp.test.mjs
import test from "node:test";
import assert from "node:assert/strict";
import { RefreshError } from "../refresh-units.mjs";
import {
  recordBlockRange,
  setRecordVerified,
  setPageVerified,
  setPageResearch,
  removePageResearch,
} from "../refresh-stamp.mjs";

// Review Focus 1: opus-5 must not match inside opus-5-preview, and the longer
// record's block must not be entered at all.
const PREFIX_YAML = [
  "# leading comment the loader needs",
  "records:",
  "  - key: anthropic.models.opus-5",
  "    value: claude-opus-5",
  '    verified: "2026-09-16"',
  "  - key: anthropic.models.opus-5-preview",
  "    value: claude-opus-5-preview",
  '    verified: "2026-09-01"',
  "",
].join("\n");

test("a record key is matched whole, never as a prefix of a longer key", () => {
  const { text, previous } = setRecordVerified(
    PREFIX_YAML,
    "anthropic.models.opus-5",
    "2026-09-28",
  );
  assert.equal(previous, "2026-09-16");
  assert.equal(text.includes('verified: "2026-09-28"'), true);
  // The longer key's own date is untouched.
  assert.equal(text.includes('verified: "2026-09-01"'), true);
  // And the comment survives: this is a line edit, not a YAML round trip.
  assert.equal(text.startsWith("# leading comment the loader needs"), true);
});

test("the longer key can still be addressed on its own", () => {
  const { previous } = setRecordVerified(
    PREFIX_YAML,
    "anthropic.models.opus-5-preview",
    "2026-09-28",
  );
  assert.equal(previous, "2026-09-01");
});

test("recordBlockRange stops at the next - key: line", () => {
  const range = recordBlockRange(PREFIX_YAML, "anthropic.models.opus-5");
  assert.equal(range.start, 2);
  assert.equal(range.end, 5);
});

// Added beyond the brief: PREFIX_YAML happens to list the shorter key first,
// so a regression that drops the trailing end-of-line anchor on `open` is not
// actually caught by the two tests above (first-match-wins already lands on
// the short key's own line regardless of anchoring). With the longer key's
// record listed FIRST, a missing anchor lets "anthropic.models.opus-5" match
// as a literal prefix of "anthropic.models.opus-5-preview" on that earlier
// line, returning the wrong record's date.
const PREFIX_YAML_REVERSED = [
  "records:",
  "  - key: anthropic.models.opus-5-preview",
  "    value: claude-opus-5-preview",
  '    verified: "2026-09-01"',
  "  - key: anthropic.models.opus-5",
  "    value: claude-opus-5",
  '    verified: "2026-09-16"',
  "",
].join("\n");

test("a shorter key is not matched against an earlier, longer key's line", () => {
  const { previous } = setRecordVerified(
    PREFIX_YAML_REVERSED,
    "anthropic.models.opus-5",
    "2026-09-28",
  );
  assert.equal(previous, "2026-09-16");
});

test("an unknown key raises", () => {
  assert.throws(
    () => setRecordVerified(PREFIX_YAML, "anthropic.models.nope", "2026-09-28"),
    (err) =>
      err instanceof RefreshError && err.rule === "refresh-record-not-found",
  );
});

// Review Focus 1, second half: a silently skipped record keeps a stale date
// under a freshly dated page — exactly the laundering the blocked outcome
// exists to prevent — so a missing verified: line must raise.
test("a record block with no verified: line raises rather than being skipped", () => {
  const yaml = [
    "records:",
    "  - key: fix.noverified.five",
    "    value: noverified-five",
    "",
  ].join("\n");
  assert.throws(
    () => setRecordVerified(yaml, "fix.noverified.five", "2026-09-28"),
    (err) =>
      err instanceof RefreshError &&
      err.rule === "refresh-record-verified-missing",
  );
});

test("an unquoted date stays unquoted and a quoted one keeps its quotes", () => {
  const unquoted = "records:\n  - key: a.b\n    verified: 2026-09-16\n";
  assert.equal(
    setRecordVerified(unquoted, "a.b", "2026-09-28").text,
    "records:\n  - key: a.b\n    verified: 2026-09-28\n",
  );
  const quoted = "records:\n  - key: a.b\n    verified: '2026-09-16'\n";
  assert.equal(
    setRecordVerified(quoted, "a.b", "2026-09-28").text,
    "records:\n  - key: a.b\n    verified: '2026-09-28'\n",
  );
});

// Mutation testing (fix round 1, Important 1) showed PAGE_DATE/RECORD_DATE's
// trailing-whitespace capture (m[4]) is dropped by every existing fixture, since
// none has whitespace after the date. Pin it here for the record path.
test("a record's verified date preserves trailing whitespace after it", () => {
  const trailing = "records:\n  - key: a.c\n    verified: 2026-09-16  \n";
  assert.equal(
    setRecordVerified(trailing, "a.c", "2026-09-28").text,
    "records:\n  - key: a.c\n    verified: 2026-09-28  \n",
  );
});

// Opportunistic (fix round 1, Minor): escapeKey's metacharacter escaping is
// otherwise unexercised. A literal "." in a key must not act as a regex
// wildcard — querying "a.b" must not match an unrelated key "aXb" that only
// differs at that position.
test("a literal '.' in a key is not treated as a regex wildcard", () => {
  const yaml = "records:\n  - key: aXb\n    verified: 2026-09-16\n";
  assert.throws(
    () => setRecordVerified(yaml, "a.b", "2026-09-28"),
    (err) =>
      err instanceof RefreshError && err.rule === "refresh-record-not-found",
  );
});

const PAGE = [
  "---",
  "title: One",
  "topic: alpha",
  "verified: 2026-09-16",
  "sources:",
  "  - https://example.invalid/one",
  "seed: true",
  "---",
  "",
  "# One",
  "",
].join("\n");

test("a page's verified date is bumped in front-matter only", () => {
  const { text, previous } = setPageVerified(PAGE, "2026-09-28");
  assert.equal(previous, "2026-09-16");
  assert.equal(text.includes("verified: 2026-09-28"), true);
  assert.equal(text.endsWith("# One\n"), true);
});

test("a page with no front-matter raises", () => {
  assert.throws(
    () => setPageVerified("# No front-matter\n", "2026-09-28"),
    (err) =>
      err instanceof RefreshError && err.rule === "refresh-frontmatter-missing",
  );
});

test("a page with no verified: line raises", () => {
  assert.throws(
    () => setPageVerified("---\ntitle: X\n---\n\nbody\n", "2026-09-28"),
    (err) =>
      err instanceof RefreshError &&
      err.rule === "refresh-page-verified-missing",
  );
});

test("research: is inserted before seed:, and seed: is never removed", () => {
  const { text, added, previous } = setPageResearch(
    PAGE,
    "research/alpha/2026-09-28-one-refresh.md",
  );
  assert.equal(added, true);
  assert.equal(previous, null);
  assert.match(
    text,
    /research: research\/alpha\/2026-09-28-one-refresh\.md\nseed: true/,
  );
  assert.equal(text.includes("seed: true"), true);
});

test("an existing research: value is replaced, not duplicated", () => {
  const once = setPageResearch(PAGE, "research/alpha/a.md").text;
  const twice = setPageResearch(once, "research/alpha/b.md");
  assert.equal(twice.added, false);
  assert.equal(twice.previous, "research/alpha/a.md");
  assert.equal(twice.text.match(/^research: /gm).length, 1);
});

test("removePageResearch restores the original bytes exactly", () => {
  const added = setPageResearch(PAGE, "research/alpha/a.md").text;
  const { text, removed } = removePageResearch(added);
  assert.equal(removed, true);
  assert.equal(text, PAGE);
});

// The replace path must be byte-preserving, not just value-preserving: a page
// on its second refresh already carries research:, and a revert that restored
// the value but not the quoting would falsify the byte-exact claim.
const PAGE_QUOTED_RESEARCH = [
  "---",
  "title: Two",
  "topic: alpha",
  "verified: 2026-09-16",
  'research: "research/alpha/prior.md"  ',
  "seed: true",
  "---",
  "",
  "# Two",
  "",
].join("\n");

test("a quoted research: value keeps its quotes and its trailing whitespace", () => {
  const first = setPageResearch(
    PAGE_QUOTED_RESEARCH,
    "research/alpha/2026-09-28-one-refresh.md",
  );
  assert.equal(first.added, false);
  assert.equal(first.previous, "research/alpha/prior.md");
  assert.equal(
    first.text.includes(
      'research: "research/alpha/2026-09-28-one-refresh.md"  ',
    ),
    true,
  );
  // And restoring the previous value reproduces the original bytes exactly.
  const back = setPageResearch(first.text, "research/alpha/prior.md");
  assert.equal(back.text, PAGE_QUOTED_RESEARCH);
});

// Mutation testing (fix round 1, Important 1) showed PAGE_DATE's quote-char
// (m[2]) and trailing-whitespace (m[4]) captures are both dropped by every
// existing page fixture, since PAGE's verified: is unquoted with no trailing
// whitespace. Mirrors PAGE_QUOTED_RESEARCH's style, which already covers this
// for setPageResearch's replace path.
const PAGE_QUOTED_VERIFIED = [
  "---",
  "title: Three",
  "topic: alpha",
  'verified: "2026-09-16"  ',
  "sources:",
  "  - https://example.invalid/three",
  "seed: true",
  "---",
  "",
  "# Three",
  "",
].join("\n");

test("a quoted page verified: date keeps its quotes and its trailing whitespace", () => {
  const { text, previous } = setPageVerified(PAGE_QUOTED_VERIFIED, "2026-09-28");
  assert.equal(previous, "2026-09-16");
  assert.equal(text.includes('verified: "2026-09-28"  '), true);
});

// Mutation testing (fix round 1, Important 2) showed setPageResearch's
// verifiedAt+1 insertion branch is unexercised: both brief fixtures carry
// seed: true, so only the seedAt branch is ever hit. This is the common case
// going forward — seed: true marks only documents authored before the
// refresh pipeline existed, so a page the refresh loop creates will not carry
// it.
const PAGE_NO_SEED = [
  "---",
  "title: Four",
  "topic: alpha",
  "verified: 2026-09-16",
  "sources:",
  "  - https://example.invalid/four",
  "---",
  "",
  "# Four",
  "",
].join("\n");

test("research: is inserted immediately after verified: when there is no seed: line", () => {
  const { text, added } = setPageResearch(
    PAGE_NO_SEED,
    "research/alpha/2026-09-28-four-refresh.md",
  );
  assert.equal(added, true);
  assert.match(
    text,
    /verified: 2026-09-16\nresearch: research\/alpha\/2026-09-28-four-refresh\.md\n/,
  );
});

// The remaining fallback (neither seed: nor verified:) is reachable:
// setPageResearch only requires a parsable --- front-matter block, not any
// particular field inside it, so a page missing both still reaches the
// lines.length branch rather than being rejected earlier.
const PAGE_NO_SEED_NO_VERIFIED = [
  "---",
  "title: Five",
  "topic: alpha",
  "sources:",
  "  - https://example.invalid/five",
  "---",
  "",
  "# Five",
  "",
].join("\n");

test("research: is appended at the end of front-matter when neither seed: nor verified: is present", () => {
  const { text, added } = setPageResearch(
    PAGE_NO_SEED_NO_VERIFIED,
    "research/alpha/2026-09-28-five-refresh.md",
  );
  assert.equal(added, true);
  assert.match(
    text,
    /sources:\n  - https:\/\/example\.invalid\/five\nresearch: research\/alpha\/2026-09-28-five-refresh\.md\n---/,
  );
});

import fs from "node:fs";
import os from "node:os";
import nodePath from "node:path";
import { fileURLToPath } from "node:url";
import { loadRecords } from "../data.mjs";
import { resolveUnit, artifactPathFor } from "../refresh-units.mjs";
import { workOrder } from "../refresh-order.mjs";
import {
  parseArtifact,
  dumpArtifact,
  renderArtifactSkeleton,
  validateArtifact,
} from "../refresh-artifact.mjs";
import { stampUnit } from "../refresh-stamp.mjs";

const FIXTURE = fileURLToPath(new URL("./fixtures/refresh/", import.meta.url));

// Stamp and revert mutate files, so every test works on a throwaway copy.
function sandbox() {
  const dir = fs.mkdtempSync(nodePath.join(os.tmpdir(), "refresh-"));
  fs.cpSync(FIXTURE, dir, { recursive: true });
  return dir;
}

// Builds a filled-in, stampable artifact on disk and returns its parsed data.
function prepared(root, { verdict = "confirmed", read = "2026-09-28" } = {}) {
  const records = loadRecords(nodePath.join(root, "data"));
  const unit = resolveUnit(root, "guides/alpha/one.md", records);
  const order = workOrder(root, unit, records);
  const artifactPath = artifactPathFor(unit, "2026-09-28", root);
  const skeleton = renderArtifactSkeleton(order, {
    fetched: "2026-09-28",
    artifactPath,
  });
  const { data, body } = parseArtifact(skeleton);
  const filled = {
    ...data,
    verdict,
    records: data.records.map((r) => ({
      ...r,
      verdict: verdict === "blocked" ? "unreachable" : "confirmed",
      url: "https://example.invalid/one",
      stated: "unchanged",
      read,
    })),
  };
  fs.mkdirSync(nodePath.join(root, nodePath.dirname(artifactPath)), {
    recursive: true,
  });
  fs.writeFileSync(
    nodePath.join(root, artifactPath),
    dumpArtifact(filled, body),
  );
  return filled;
}

// The same, narrowed with --key. fix.tail.three is referenced by three.md and
// gone.md, so a page-wide sweep here would be visible on both.
function preparedKeyScoped(root, { read = "2026-09-28" } = {}) {
  const records = loadRecords(nodePath.join(root, "data"));
  const unit = resolveUnit(root, "guides/alpha/one.md", records);
  const order = workOrder(root, unit, records, { key: "fix.tail.three" });
  const artifactPath = artifactPathFor(unit, "2026-09-28", root);
  const { data, body } = parseArtifact(
    renderArtifactSkeleton(order, {
      fetched: "2026-09-28",
      artifactPath,
    }),
  );
  const filled = {
    ...data,
    verdict: "confirmed",
    records: data.records.map((r) => ({
      ...r,
      verdict: "confirmed",
      url: "https://example.invalid/three",
      stated: "unchanged",
      read,
    })),
  };
  fs.mkdirSync(nodePath.join(root, nodePath.dirname(artifactPath)), {
    recursive: true,
  });
  fs.writeFileSync(
    nodePath.join(root, artifactPath),
    dumpArtifact(filled, body),
  );
  return filled;
}

const read = (root, rel) => fs.readFileSync(nodePath.join(root, rel), "utf8");

test("a confirmed stamp bumps pages to fetched and records to their read date", () => {
  const root = sandbox();
  const artifact = prepared(root, { read: "2026-09-27" });
  const { receipt, written } = stampUnit(root, artifact, {
    today: "2026-09-28",
  });
  assert.equal(read(root, "guides/alpha/one.md").includes("verified: 2026-09-28"), true);
  // The record takes the date it was actually read, not today.
  assert.equal(
    read(root, "data/units.yaml").includes('verified: "2026-09-27"'),
    true,
  );
  assert.equal(receipt.at, "2026-09-28");
  assert.equal(written.includes(artifact.path), true);
});

// Review Focus 2: verify-pages.mjs:54-66 only checks research: is a non-empty
// string, and there is no research-path-unresolved rule, so stampUnit is the
// only thing that can refuse a path that does not resolve.
test("a research: path that does not resolve is refused, and nothing is written", () => {
  const root = sandbox();
  const artifact = prepared(root);
  fs.rmSync(nodePath.join(root, artifact.path));
  const before = read(root, "guides/alpha/one.md");
  assert.throws(
    () => stampUnit(root, artifact, { today: "2026-09-28" }),
    (err) =>
      err instanceof RefreshError &&
      err.rule === "refresh-research-unresolved",
  );
  assert.equal(read(root, "guides/alpha/one.md"), before);
});

// Review Focus 3, second half: blocked writes nothing at all.
test("a blocked artifact writes nothing", () => {
  const root = sandbox();
  const artifact = prepared(root, { verdict: "blocked" });
  const beforePage = read(root, "guides/alpha/one.md");
  const beforeData = read(root, "data/units.yaml");
  assert.throws(
    () => stampUnit(root, artifact, { today: "2026-09-28" }),
    (err) => err instanceof RefreshError && err.rule === "refresh-blocked",
  );
  assert.equal(read(root, "guides/alpha/one.md"), beforePage);
  assert.equal(read(root, "data/units.yaml"), beforeData);
});

test("an incoherent artifact is refused before anything is written", () => {
  const root = sandbox();
  const artifact = prepared(root);
  artifact.records[0] = { ...artifact.records[0], verdict: "unreachable" };
  const before = read(root, "data/units.yaml");
  assert.throws(
    () => stampUnit(root, artifact, { today: "2026-09-28" }),
    (err) =>
      err instanceof RefreshError &&
      err.rule === "refresh-verdict-incoherent",
  );
  assert.equal(read(root, "data/units.yaml"), before);
});

// Review Focus 4: a deprecated page belongs to the unit but never gets a fresh
// date or a research: field.
test("a deprecated unit member gets neither a bumped date nor a research: field", () => {
  const root = sandbox();
  const artifact = prepared(root);
  const before = read(root, "guides/beta/gone.md");
  const { receipt } = stampUnit(root, artifact, { today: "2026-09-28" });
  assert.equal(read(root, "guides/beta/gone.md"), before);
  assert.equal(
    receipt.pages.some((p) => p.path === "guides/beta/gone.md"),
    false,
  );
  // Every other member of the unit was stamped.
  assert.deepEqual(
    receipt.pages.map((p) => p.path).sort(),
    ["guides/alpha/one.md", "guides/alpha/two.md", "guides/beta/three.md"],
  );
});

test("a record outside unit_keys is refused before anything is written", () => {
  const root = sandbox();
  const artifact = prepared(root);
  artifact.records = [
    ...artifact.records,
    {
      key: "fix.alone.four",
      file: "data/units.yaml",
      verdict: "confirmed",
      url: "https://example.invalid/four",
      stated: "unchanged",
      read: "2026-09-28",
    },
  ];
  const before = read(root, "data/units.yaml");
  assert.throws(
    () => stampUnit(root, artifact, { today: "2026-09-28" }),
    (err) =>
      err instanceof RefreshError && err.rule === "refresh-record-out-of-unit",
  );
  assert.equal(read(root, "data/units.yaml"), before);
});

test("stamping twice is refused: the receipt is already there", () => {
  const root = sandbox();
  const artifact = prepared(root);
  stampUnit(root, artifact, { today: "2026-09-28" });
  const again = parseArtifact(read(root, artifact.path)).data;
  assert.throws(
    () => stampUnit(root, again, { today: "2026-09-28" }),
    (err) =>
      err instanceof RefreshError && err.rule === "refresh-already-stamped",
  );
});

test("seed: true survives a stamp", () => {
  const root = sandbox();
  stampUnit(root, prepared(root), { today: "2026-09-28" });
  assert.equal(read(root, "guides/alpha/one.md").includes("seed: true"), true);
});

// Review Focus 3(b): one record repriced, no page-wide sweep. The record's date
// moves; not one page's does, and no research: appears anywhere.
test("a key-scoped stamp moves the record and no page at all", () => {
  const root = sandbox();
  const pagesBefore = Object.fromEntries(
    [
      "guides/alpha/one.md",
      "guides/alpha/two.md",
      "guides/beta/three.md",
      "guides/beta/gone.md",
    ].map((rel) => [rel, read(root, rel)]),
  );
  const { receipt } = stampUnit(root, preparedKeyScoped(root), {
    today: "2026-09-28",
  });
  for (const [rel, before] of Object.entries(pagesBefore))
    assert.equal(read(root, rel), before, `${rel} must not move`);
  assert.deepEqual(receipt.pages, []);
  assert.deepEqual(
    receipt.records.map((r) => r.key),
    ["fix.tail.three"],
  );
  assert.equal(
    read(root, "data/units.yaml").includes('verified: "2026-09-28"'),
    true,
  );
});

// Widened coherently, so no other guard catches it: unit_keys and records agree,
// so validateArtifact's coverage rule passes and every key is in unit_keys, so
// refresh-record-out-of-unit passes too. Only the key-scope guard is left.
test("a key-scoped artifact widened by hand is refused before anything is written", () => {
  const root = sandbox();
  const artifact = preparedKeyScoped(root);
  artifact.unit_keys = [...artifact.unit_keys, "fix.shared.one"];
  artifact.records = [
    ...artifact.records,
    {
      key: "fix.shared.one",
      file: "data/units.yaml",
      verdict: "confirmed",
      url: "https://example.invalid/one",
      stated: "unchanged",
      read: "2026-09-28",
    },
  ];
  assert.deepEqual(validateArtifact(artifact), []);
  const before = read(root, "data/units.yaml");
  assert.throws(
    () => stampUnit(root, artifact, { today: "2026-09-28" }),
    (err) =>
      err instanceof RefreshError && err.rule === "refresh-key-scope-widened",
  );
  assert.equal(read(root, "data/units.yaml"), before);
});


import { revertUnit } from "../refresh-stamp.mjs";

const TRACKED = [
  "guides/alpha/one.md",
  "guides/alpha/two.md",
  "guides/beta/three.md",
  "guides/beta/gone.md",
  "guides/gamma/lonely.md",
  "guides/gamma/nosix.md",
  "data/units.yaml",
];

const snapshot = (root) =>
  Object.fromEntries(TRACKED.map((rel) => [rel, read(root, rel)]));

// The whole point: a blocked branch must be harmless to merge. guides/ and
// data/ come back byte-exact. The artifact itself is allowed to change — it
// keeps what was checked, which is what the next attempt needs.
//
// This exercises BOTH setPageResearch paths, which is why two.md carries a
// quoted `research:` in the fixture: one.md and three.md take the insert path
// (research_added: true, removed on revert) and two.md takes the replace path
// (research_added: false, previous value and its quoting restored on revert).
// Without a page in the second state the test structurally cannot see a replace
// branch that dropped the quote character.
test("stamp then revert is a byte-exact round trip over guides/ and data/", () => {
  const root = sandbox();
  const before = snapshot(root);
  const artifact = prepared(root);
  const { receipt } = stampUnit(root, artifact, { today: "2026-09-28" });
  assert.notDeepEqual(snapshot(root), before);
  const byPath = new Map(receipt.pages.map((p) => [p.path, p]));
  assert.equal(byPath.get("guides/alpha/one.md").research_added, true);
  assert.equal(byPath.get("guides/alpha/one.md").previous_research, null);
  // Both halves of the claim: the replace path was taken, and it is what the
  // revert below has to put back byte-for-byte.
  assert.equal(byPath.get("guides/alpha/two.md").research_added, false);
  assert.equal(
    byPath.get("guides/alpha/two.md").previous_research,
    "research/alpha/prior.md",
  );
  const stamped = parseArtifact(read(root, artifact.path)).data;
  const { restored } = revertUnit(root, stamped, { today: "2026-09-29" });
  assert.deepEqual(snapshot(root), before);
  assert.equal(restored.includes(artifact.path), true);
});

test("a revert marks the artifact blocked and keeps what was checked", () => {
  const root = sandbox();
  const artifact = prepared(root);
  stampUnit(root, artifact, { today: "2026-09-28" });
  const stamped = parseArtifact(read(root, artifact.path)).data;
  revertUnit(root, stamped, { today: "2026-09-29" });
  const after = parseArtifact(read(root, artifact.path)).data;
  assert.equal(after.verdict, "blocked");
  assert.equal("stamped" in after, false);
  // The revert date and the stamp date are both kept, under distinct keys.
  assert.equal(after.reverted.at, "2026-09-29");
  assert.equal(after.reverted.stamped_at, "2026-09-28");
  assert.equal(stamped.stamped.at, "2026-09-28");
  assert.deepEqual(after.reverted.records, stamped.stamped.records);
  // The artifact stays on disk: what was checked and what was found is exactly
  // what the next attempt needs.
  assert.equal(fs.existsSync(nodePath.join(root, artifact.path)), true);
});

test("an artifact with no receipt has nothing to revert", () => {
  const root = sandbox();
  const artifact = prepared(root);
  assert.throws(
    () => revertUnit(root, artifact, { today: "2026-09-29" }),
    (err) => err instanceof RefreshError && err.rule === "refresh-no-receipt",
  );
});

// A key-scoped stamp touched no page, so its revert must restore the record and
// still touch no page. revertUnit needs no key_scoped branch for this: it walks
// receipt.pages, and a key-scoped receipt has none.
test("a key-scoped stamp reverts the record and still touches no page", () => {
  const root = sandbox();
  const before = snapshot(root);
  const artifact = preparedKeyScoped(root);
  stampUnit(root, artifact, { today: "2026-09-28" });
  assert.notDeepEqual(snapshot(root), before);
  const stamped = parseArtifact(read(root, artifact.path)).data;
  revertUnit(root, stamped, { today: "2026-09-29" });
  assert.deepEqual(snapshot(root), before);
  const after = parseArtifact(read(root, artifact.path)).data;
  assert.deepEqual(after.reverted.pages, []);
  assert.equal(after.reverted.stamped_at, "2026-09-28");
  assert.equal(after.reverted.at, "2026-09-29");
});

// Two units can share a data file. A revert must never clobber a date another
// unit already landed there.
test("a revert refuses on drift and writes nothing", () => {
  const root = sandbox();
  const artifact = prepared(root);
  stampUnit(root, artifact, { today: "2026-09-28" });
  const stamped = parseArtifact(read(root, artifact.path)).data;
  // Someone else moved fix.shared.one on afterwards.
  fs.writeFileSync(
    nodePath.join(root, "data/units.yaml"),
    setRecordVerified(read(root, "data/units.yaml"), "fix.shared.one", "2026-10-05").text,
  );
  const before = read(root, "data/units.yaml");
  const beforePage = read(root, "guides/alpha/one.md");
  assert.throws(
    () => revertUnit(root, stamped, { today: "2026-09-29" }),
    (err) => err instanceof RefreshError && err.rule === "refresh-revert-drift",
  );
  assert.equal(read(root, "data/units.yaml"), before);
  assert.equal(read(root, "guides/alpha/one.md"), beforePage);
});
