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

// Review finding (Important): provenance issues were generated and discarded,
// so siteCorpus's issues array was structurally always empty and `site` could
// never exit 1. Review Focus 1 requires the build to REPORT an unknown key.
test("a marker naming a record that no longer exists is reported with its page path", () => {
  const root = tmpCopy();
  const guide = path.join(root, "guides", "clean.md");
  const body = fs.readFileSync(guide, "utf8");
  fs.writeFileSync(
    guide,
    body +
      "\n<!-- corpus:data key=ghost.missing.record -->12345<!-- /corpus:data -->\n",
  );
  const { issues } = siteCorpus(root, { write: false });
  const found = issues.filter((i) => i.rule === "site-provenance-unknown-key");
  assert.equal(found.length, 1, "the unknown key was not reported");
  assert.equal(found[0].path, "guides/clean.md");
  assert.match(found[0].message, /ghost\.missing\.record/);
});

test("a clean corpus reports no issues, so the empty case is not vacuous", () => {
  const { issues } = siteCorpus(tmpCopy(), { write: false });
  assert.deepEqual(issues, []);
});

// Review finding (re-graded from Minor): dist/ was never cleaned, so a guide
// that is renamed or deleted left its old .html published on the manual
// `site --write .` path, which Task 9 names as the Actions-rot fallback.
test("a stale page from a previous build does not survive the next one", () => {
  const root = tmpCopy();
  siteCorpus(root, { write: true });
  const stale = path.join(root, "dist", "guides", "deleted-guide.html");
  fs.writeFileSync(stale, "<!doctype html><p>deleted</p>");
  siteCorpus(root, { write: true });
  assert.equal(fs.existsSync(stale), false, "stale output survived the rebuild");
  assert.equal(
    fs.existsSync(path.join(root, "dist", "guides", "clean.html")),
    true,
  );
});

test("write emits the stylesheet next to the front page", () => {
  const root = tmpCopy();
  siteCorpus(root, { write: true });
  const css = path.join(root, "dist", "style.css");
  assert.equal(fs.existsSync(css), true);
  assert.match(fs.readFileSync(css, "utf8"), /prefers-color-scheme: dark/);
});
