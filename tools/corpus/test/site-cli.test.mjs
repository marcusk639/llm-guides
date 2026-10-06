// tools/corpus/test/site-cli.test.mjs
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { spawnSync } from "node:child_process";
import { siteCorpus } from "../site.mjs";

const ROOT = new URL("./fixtures/corpus/", import.meta.url).pathname;

test("siteCorpus returns a page per guide in the fixture corpus", () => {
  const { pages } = siteCorpus(ROOT, { write: false });
  const paths = pages.map((p) => p.path).sort();
  assert.deepEqual(paths, [
    "guides/clean.md",
    "guides/dirty.md",
    "guides/verify/deprecated.md",
    "guides/verify/unverifiable.md",
  ]);
});

test("siteCorpus reports issues as an array", () => {
  const { issues } = siteCorpus(ROOT, { write: false });
  assert.equal(Array.isArray(issues), true);
});

test("siteCorpus never reads meta/ledger.yaml", () => {
  const src = new URL("../site.mjs", import.meta.url).pathname;
  assert.equal(fs.readFileSync(src, "utf8").includes("ledger.yaml"), false);
});

test("the site command exits 0 and prints a page count on a clean corpus", () => {
  const CLI = new URL("../cli.mjs", import.meta.url).pathname;
  const r = spawnSync(process.execPath, [CLI, "site", ROOT], {
    encoding: "utf8",
  });
  assert.equal(r.status, 0);
  assert.match(r.stdout, /^site: 4 pages$/m);
});

test("site rejects --check, because site --check is deliberately absent", () => {
  const CLI = new URL("../cli.mjs", import.meta.url).pathname;
  const r = spawnSync(process.execPath, [CLI, "site", "--check", ROOT], {
    encoding: "utf8",
  });
  assert.equal(r.status, 2);
  assert.match(r.stderr, /usage: corpus/);
});
