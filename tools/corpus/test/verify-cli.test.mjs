// tools/corpus/test/verify-cli.test.mjs
import test from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { verifyCorpus, renderCorpus } from "../cli.mjs";

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
