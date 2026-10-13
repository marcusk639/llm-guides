import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { loadTopics } from "../site-nav.mjs";

// Four levels: dirname() on the file path strips the filename first, so
// tools/corpus/test/<file> needs four to reach the repo root, not three.
const root = path.dirname(
  path.dirname(path.dirname(path.dirname(fileURLToPath(import.meta.url)))),
);
const contract = fs.readFileSync(path.join(root, "CLAUDE.md"), "utf8");

// Matching a topic name anywhere in CLAUDE.md is useless as a guard:
// "tools" appears 27 times in this file, "context" 17, "models" 15, none
// of them in the topic list. So parse the one sentence that IS the list.
// It runs from the colon after the taxonomy filename to the next period,
// and no topic name contains a period.
const LIST = /topics, from `meta\/taxonomy\.yaml`:\s*([^.]+)\./;

const NUMBER_WORDS = {
  13: "thirteen",
  14: "fourteen",
  15: "fifteen",
  16: "sixteen",
  17: "seventeen",
  18: "eighteen",
};

function listedTopics() {
  const m = contract.match(LIST);
  assert.ok(m, "CLAUDE.md no longer contains a parseable topic-list sentence");
  return m[1]
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
}

test("CLAUDE.md's topic list is exactly meta/taxonomy.yaml", () => {
  const declared = loadTopics(root);
  assert.ok(declared.length > 0, "taxonomy.yaml declared no topics");
  // Set equality catches BOTH directions: a topic added to the taxonomy and
  // never documented, and a topic deleted from the taxonomy but left in the
  // prose, which would promise a topic that no longer validates.
  assert.deepEqual([...listedTopics()].sort(), [...declared].sort());
});

test("CLAUDE.md's topic list is in taxonomy order", () => {
  assert.deepEqual(listedTopics(), loadTopics(root));
});

test("CLAUDE.md's spelled topic count matches the list", () => {
  const n = loadTopics(root).length;
  const word = NUMBER_WORDS[n];
  assert.ok(word, `no spelled form on file for ${n} topics; extend NUMBER_WORDS`);
  assert.ok(
    contract.includes(`The ${word} topics`),
    `CLAUDE.md should read "The ${word} topics" for ${n} topics`,
  );
});

test("security is a taxonomy topic", () => {
  assert.ok(loadTopics(root).includes("security"));
});
