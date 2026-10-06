// tools/corpus/test/site-output.test.mjs
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { siteCorpus } from "../site.mjs";

const FIXTURE = new URL("./fixtures/corpus/", import.meta.url).pathname;

function tmpCopy() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "site-out-"));
  fs.cpSync(FIXTURE, dir, { recursive: true });
  return dir;
}

test("write emits one html file per guide at its guide path", () => {
  const root = tmpCopy();
  siteCorpus(root, { write: true });
  assert.equal(fs.existsSync(path.join(root, "dist", "guides", "clean.html")), true);
  assert.equal(
    fs.existsSync(path.join(root, "dist", "guides", "verify", "deprecated.html")),
    true,
  );
});

test("write emits a front page and a search index", () => {
  const root = tmpCopy();
  siteCorpus(root, { write: true });
  assert.equal(fs.existsSync(path.join(root, "dist", "index.html")), true);
  const idx = JSON.parse(
    fs.readFileSync(path.join(root, "dist", "search-index.json"), "utf8"),
  );
  assert.equal(Array.isArray(idx), true);
});

test("without write, nothing is emitted", () => {
  const root = tmpCopy();
  siteCorpus(root, { write: false });
  assert.equal(fs.existsSync(path.join(root, "dist")), false);
});
