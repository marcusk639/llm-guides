// tools/corpus/test/verify-cli.test.mjs
import test from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { verifyCorpus, renderCorpus, verifyStats } from "../cli.mjs";

// fileURLToPath, not .pathname: a URL pathname is percent-encoded, so a repo
// checked out under a path containing a space resolves wrongly. The existing
// test files use .pathname and share that latent bug; do not copy it here.
const ROOT = fileURLToPath(new URL("./fixtures/corpus/", import.meta.url));
const CLI = fileURLToPath(new URL("../cli.mjs", import.meta.url));
const REPO = fileURLToPath(new URL("../../../", import.meta.url));

test("the fixture corpus still renders clean with the new page", () => {
  // Guards the trap this task nearly walked into: an unknown corpus:data key
  // makes cli.test.mjs:50-55 fail, and that assertion does not filter by
  // filename, so the failure looks unrelated to this task.
  for (const r of renderCorpus(ROOT, { write: false }))
    assert.deepEqual(r.issues, [], `render issues on ${r.path}`);
});

test("the unverifiable fixture page trips every page-level rule", () => {
  const rules = new Set(
    verifyCorpus(ROOT)
      .filter((i) => i.path.endsWith("unverifiable.md"))
      .map((i) => i.rule),
  );
  for (const rule of [
    "frontmatter-applies-to-shape",
    "related-path-unresolved",
    "research-required",
    "template-sections",
    "evidence-label-invalid",
    "rots-table-incomplete",
    "known-lint-gap-form",
  ]) {
    assert.equal(rules.has(rule), true, `expected rule to fire: ${rule}`);
  }
});

test("every issue carries a path", () => {
  for (const i of verifyCorpus(ROOT)) {
    assert.equal(typeof i.path, "string");
    assert.equal(i.path.length > 0, true);
  }
});

test("the real corpus verifies clean", () => {
  assert.deepEqual(verifyCorpus(REPO), []);
});

test("the CLI exits 1 and prints a count when there are issues", () => {
  const r = spawnSync(process.execPath, [CLI, "verify", ROOT], {
    encoding: "utf8",
  });
  assert.equal(r.status, 1);
  assert.match(r.stdout, /verify: \d+ issue\(s\)/);
});

// Exactly ONE live-corpus assertion in this file (the deepEqual above). Every
// other test uses fixtures, so adding a guide cannot turn npm test red for a
// reason unrelated to the code under test.
test("verify rejects --write", () => {
  const r = spawnSync(process.execPath, [CLI, "verify", "--write", ROOT], {
    encoding: "utf8",
  });
  assert.equal(r.status, 2);
  assert.match(r.stderr, /usage:/);
});

// The deprecation carve-out, pinned. CLAUDE.md asserts exactly where this line
// falls; before these tests all four wiring mutations (adding or removing the
// `deprecated` gate on any of the four rules) survived the whole suite, so the
// contract and the code agreed only by coincidence.
const deprecatedRules = () =>
  new Set(
    verifyCorpus(ROOT)
      .filter((i) => i.path.endsWith("deprecated.md"))
      .map((i) => i.rule),
  );

test("a deprecated page is exempt from the rules only a refresh could satisfy", () => {
  const rules = deprecatedRules();
  for (const rule of [
    "template-sections",
    "rots-table-incomplete",
    "research-required",
  ]) {
    assert.equal(
      rules.has(rule),
      false,
      `${rule} must not fire on a deprecated page`,
    );
  }
});

test("a deprecated page still answers to the typo-class and shape rules", () => {
  const rules = deprecatedRules();
  for (const rule of [
    "evidence-label-invalid",
    "known-lint-gap-form",
    "frontmatter-applies-to-shape",
    "related-path-unresolved",
  ]) {
    assert.equal(rules.has(rule), true, `${rule} must fire on a deprecated page`);
  }
});

test("the non-deprecated twin still trips the rules the carve-out suppresses", () => {
  // Without this, the test above would pass even if those rules were broken
  // outright rather than merely suppressed for deprecation.
  const rules = new Set(
    verifyCorpus(ROOT)
      .filter((i) => i.path.endsWith("unverifiable.md"))
      .map((i) => i.rule),
  );
  for (const rule of [
    "template-sections",
    "rots-table-incomplete",
    "research-required",
  ]) {
    assert.equal(rules.has(rule), true, `${rule} must fire on a non-deprecated page`);
  }
});

test("verifyStats reports every counter as a number", () => {
  // The counters exist to distinguish "the rule ran and found nothing" from
  // "the rule never ran" — a distinction `verify: clean` cannot make. Nothing
  // pinned their presence, so a counter could silently disappear in a refactor
  // and every gate would still look green.
  const stats = verifyStats(ROOT);
  for (const key of [
    "records",
    "guides",
    "recordsChecked",
    "recordsWithSource",
    "recordsWithLintLiterals",
    "lintLiteralEntries",
    "relatedEntries",
    "seedPages",
    "numberedHeadings",
    "evidenceLines",
    "recordReferences",
  ]) {
    assert.equal(typeof stats[key], "number", `${key} must be a number`);
  }
});

test("verifyStats counts the fixture corpus, not zero", () => {
  // A stats block of zeroes satisfies the shape test above while proving the
  // rules inspected nothing — and `typeof 0 === "number"`, so the shape test
  // alone let six counters be zeroed without any test noticing, including
  // evidenceLines and recordReferences, the two that matter most.
  // Asserted on every counter that is legitimately non-zero on this fixture.
  // recordsWithLintLiterals, lintLiteralEntries and seedPages are genuinely 0
  // here — the fixture has no literal-bearing record and no seed page — so
  // pinning those would encode fixture trivia rather than behavior.
  const stats = verifyStats(ROOT);
  for (const key of [
    "records",
    "guides",
    "recordsChecked",
    "recordsWithSource",
    "relatedEntries",
    "numberedHeadings",
    "evidenceLines",
    "recordReferences",
  ]) {
    assert.ok(stats[key] > 0, `${key} must be greater than zero on the fixture`);
  }
});

