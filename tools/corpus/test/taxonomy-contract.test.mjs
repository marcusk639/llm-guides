import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import os from "node:os";
import { loadTopics } from "../site-nav.mjs";
import { validateFrontmatter } from "../lint.mjs";
import { lintCorpus } from "../cli.mjs";

// Four levels: dirname() on the file path strips the filename first, so
// tools/corpus/test/<file> needs four to reach the repo root, not three.
const root = path.dirname(
  path.dirname(path.dirname(path.dirname(fileURLToPath(import.meta.url)))),
);
const contract = fs.readFileSync(path.join(root, "CLAUDE.md"), "utf8");

// Matching a topic name anywhere in CLAUDE.md is useless as a guard:
// "tools" occurs 27 times in this file, "context" 17, "models" 15, none of
// them in the topic list. So parse the one sentence that IS the list.
//
// Two things make that parse honest, and both were added after a review
// found the guard going green on a stale contract:
//   - the regex is global and the match count is asserted. With a
//     non-global regex String.match returns only the FIRST hit, so a
//     correct duplicate sentence earlier in the file masked a stale
//     canonical one and all five tests passed.
//   - the spelled count is captured from the SAME match as the list. An
//     `includes("The sixteen topics")` anywhere in the file is satisfied
//     by an unrelated sentence while the real one carries no count at all.
const LIST = /The (\w+) topics, from `meta\/taxonomy\.yaml`:\s*([^.]+)\./g;

const NUMBER_WORDS = {
  13: "thirteen",
  14: "fourteen",
  15: "fifteen",
  16: "sixteen",
  17: "seventeen",
  18: "eighteen",
};

function topicSentence() {
  const all = [...contract.matchAll(LIST)];
  assert.equal(
    all.length,
    1,
    `expected exactly one topic-list sentence in CLAUDE.md, found ${all.length}`,
  );
  const [, count, list] = all[0];
  return {
    count,
    topics: list
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean),
  };
}

test("CLAUDE.md's topic list is exactly meta/taxonomy.yaml", () => {
  const declared = loadTopics(root);
  assert.ok(declared.length > 0, "taxonomy.yaml declared no topics");
  // Set equality catches BOTH directions: a topic added to the taxonomy and
  // never documented, and a topic deleted from the taxonomy but left in the
  // prose, which would promise a topic that no longer validates.
  assert.deepEqual([...topicSentence().topics].sort(), [...declared].sort());
});

test("CLAUDE.md's topic list is in taxonomy order", () => {
  assert.deepEqual(topicSentence().topics, loadTopics(root));
});

test("CLAUDE.md's spelled topic count matches the list", () => {
  const n = loadTopics(root).length;
  const word = NUMBER_WORDS[n];
  assert.ok(word, `no spelled form on file for ${n} topics; extend NUMBER_WORDS`);
  assert.equal(
    topicSentence().count,
    word,
    `the topic-list sentence should open "The ${word} topics" for ${n} topics`,
  );
});

test("security is a taxonomy topic", () => {
  assert.ok(loadTopics(root).includes("security"));
});

// Decision 1 of the scope-expansion spec states a record posture for the
// security topic, as Decision 2 does for practice pages. Both are unenforced
// by any tool, so the contract's wording is the only thing carrying them.
// Inter-word whitespace is \s+ because CLAUDE.md is hand-wrapped at 80 and
// the clause can straddle a line break -- a literal space fails on any
// rewrap, which changes the formatting and not what the contract says.
test("CLAUDE.md states the security topic's record posture", () => {
  assert.ok(
    /`security` carries[^.]*no\s+`data\/`\s+records/.test(contract),
    "the contract must say security pages carry no `data/` records; this test " +
      "pins the exact clause, so update the regex if the reword was intentional",
  );
});

// Decision 2 of the scope-expansion spec. This pins the exact clause; if a
// reword is intentional, update the regex rather than loosening it into two
// separate `includes` checks, which would pass on text torn apart across
// sections.
test("CLAUDE.md states the provider facts/practice split", () => {
  assert.ok(
    contract.includes("Provider facts and provider practice are different pages"),
    "the facts/practice rule is missing from CLAUDE.md",
  );
  assert.ok(
    /practice page[^.]*no\s+`data\/`\s+records/.test(contract),
    "the contract must say a practice page carries no `data/` records; this test " +
      "pins the exact clause, so update the regex if the reword was intentional",
  );
});

// Review Focus 4 of the scope-expansion plan was verified by hand during
// execution and left no regression test. These two pin it. The first asserts
// the rule accepts the new topic AND still rejects a near miss -- an accept-only
// assertion would pass against a check that accepts everything.
test("lint accepts a security page and rejects a near-miss topic", () => {
  const topics = loadTopics(root);
  const fired = (data) =>
    validateFrontmatter(data, topics).some(
      (i) => i.rule === "frontmatter-topic",
    );
  assert.equal(fired({ topic: "security" }), false, "security should validate");
  assert.equal(fired({ topic: "sekurity" }), true, "a typo should be reported");
});

// cli.mjs loads the taxonomy itself rather than through site-nav's loader, and
// its version returned `.topics ?? []` -- so a `topics:` that is a string left
// `topics.includes(data.topic)` doing a SUBSTRING match, silently turning the
// topic check permissive. Failing closed costs a loud error on a malformed
// taxonomy; failing open admits topics nobody declared.
test("a malformed topics: list rejects every topic rather than substring-matching", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "tax-malformed-"));
  fs.mkdirSync(path.join(dir, "meta"), { recursive: true });
  fs.mkdirSync(path.join(dir, "data"), { recursive: true });
  fs.mkdirSync(path.join(dir, "guides", "t"), { recursive: true });
  fs.writeFileSync(
    path.join(dir, "meta", "taxonomy.yaml"),
    "topics: security-and-harness\n",
  );
  const page = (topic) =>
    `---\ntitle: P\nsummary: s\ntopic: ${topic}\nverified: '2026-01-01'\napplies_to: [x]\nsources: []\nrelated: []\n---\n\nbody\n`;
  // "sec" is only a substring; "security" is a substring AND a real taxonomy
  // topic. Failing closed has to reject both, or the check is still partly
  // driven by what the malformed string happens to contain.
  fs.writeFileSync(path.join(dir, "guides", "t", "p.md"), page("sec"));
  fs.writeFileSync(path.join(dir, "guides", "t", "q.md"), page("security"));
  try {
    const fired = lintCorpus(dir, "2026-10-13").filter(
      (i) => i.rule === "frontmatter-topic",
    );
    assert.equal(fired.length, 2, "both pages must be reported");
  } finally {
    // M3: these accumulated in $TMPDIR on every run.
    fs.rmSync(dir, { recursive: true, force: true });
  }
});
