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
