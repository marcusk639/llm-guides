import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { guidePaths, isAbsoluteHttpUrl } from "../paths.mjs";

function tmpCorpus() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "paths-"));
  fs.mkdirSync(path.join(root, "guides", "alpha"), { recursive: true });
  fs.writeFileSync(path.join(root, "guides", "alpha", "one.md"), "x");
  fs.writeFileSync(path.join(root, "guides", "top.md"), "x");
  fs.writeFileSync(path.join(root, "guides", "alpha", "skip.txt"), "x");
  return root;
}

test("guidePaths finds .md files recursively and ignores other extensions", () => {
  const root = tmpCorpus();
  const found = guidePaths(root)
    .map((p) => path.relative(root, p))
    .sort();
  assert.deepEqual(found, ["guides/alpha/one.md", "guides/top.md"]);
});

test("guidePaths returns [] when guides/ is absent", () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "paths-empty-"));
  assert.deepEqual(guidePaths(root), []);
});

test("isAbsoluteHttpUrl accepts only absolute http and https strings", () => {
  for (const good of [
    "http://e.com/a",
    "https://e.com/a?q=1#f",
    "https://archive.example/w/1/https://e.com/a",
  ]) {
    assert.equal(isAbsoluteHttpUrl(good), true, good);
  }
  for (const bad of [
    "./page.md",
    "../providers/anthropic.md",
    "/abs/path",
    "#anchor",
    "mailto:a@b.c",
    "ftp://e.com/a",
    "e.com/a",
    "",
    42,
    null,
    undefined,
    ["https://e.com/a"],
  ]) {
    assert.equal(isAbsoluteHttpUrl(bad), false, JSON.stringify(bad));
  }
});
