// tools/corpus/test/site-search.test.mjs
import test from "node:test";
import assert from "node:assert/strict";
import { buildSearchIndex, searchScript } from "../site-search.mjs";

const model = {
  path: "guides/models/claude-models.md",
  title: "Claude models",
  summary: "Model ids and prices.",
  topic: "models",
  verified: "2026-10-06",
  volatility: "high",
  seed: true,
  status: null,
  body:
    "## 1. What this covers\n\nthe current lineup\n\n## 6. Where this rots\n\nprices move\n",
};

test("the index carries one entry per page with the contracted fields", () => {
  const index = buildSearchIndex([model]);
  assert.equal(index.length, 1);
  assert.deepEqual(Object.keys(index[0]).sort(), [
    "freshness",
    "path",
    "sections",
    "summary",
    "title",
    "topic",
  ]);
});

test("each numbered section contributes its heading and its text", () => {
  const [entry] = buildSearchIndex([model]);
  assert.deepEqual(
    entry.sections.map((s) => s.heading),
    ["1. What this covers", "6. Where this rots"],
  );
  assert.match(entry.sections[0].text, /the current lineup/);
  assert.match(entry.sections[1].text, /prices move/);
});

test("the entry carries freshness facts so a result can show staleness", () => {
  const [entry] = buildSearchIndex([model]);
  assert.equal(entry.freshness.expires, "2026-11-05");
  assert.equal(entry.freshness.hardFail, "2026-12-05");
});

test("a deprecated page has null freshness in the index", () => {
  const [entry] = buildSearchIndex([{ ...model, status: "deprecated" }]);
  assert.equal(entry.freshness, null);
});

test("the index is fetched on interaction, not on page load", () => {
  const js = searchScript();
  assert.match(js, /addEventListener\("focus", load/);
  assert.match(js, /addEventListener\("input"/);
  // A top-level fetch would be eager loading; the fetch must sit inside load().
  assert.equal(/^\s*fetch\(/m.test(js.replace(/function load\(\)[\s\S]*?\n  \}/, "")), false);
});

test("the index is a separate file so it caches independently", () => {
  assert.match(searchScript(), /search-index\.json/);
});

// No task in the plan inserts the search field, so the index and the script
// would ship with nothing to drive them. The front page is where the field
// goes: it sits at the deployed base path, so the index resolves relatively.
test("the fetch path is relative, so it survives a project-subpath deploy", () => {
  // actions/deploy-pages serves a project site under /<repo>/, where a
  // root-absolute /search-index.json resolves to the domain root and 404s.
  assert.equal(searchScript().includes('fetch("/search-index.json")'), false);
  assert.match(searchScript(), /fetch\("search-index\.json"\)/);
});
