// tools/corpus/test/site-template.test.mjs
import test from "node:test";
import assert from "node:assert/strict";
import { renderPage } from "../site-template.mjs";

const model = {
  path: "guides/models/claude-models.md",
  title: "Claude models",
  summary: "Current Claude model ids, limits and prices.",
  topic: "models",
  verified: "2026-10-06",
  status: null,
  seed: true,
  appliesTo: ["Claude API, read 2026-10-06"],
  sources: ["https://example.invalid/models"],
  related: ["guides/models/comparison.md"],
  body: "## 1. What this covers\n\ntext\n\n## 6. Where this rots\n\nrot text\n",
  keys: [],
  volatility: "high",
};

test("the page is a complete HTML document with a title", () => {
  const html = renderPage(model);
  assert.match(html, /^<!doctype html>/i);
  assert.match(html, /<title>Claude models<\/title>/);
  assert.match(html, /<\/html>\s*$/);
});

test("summary is emitted as the meta description", () => {
  const html = renderPage(model);
  assert.match(
    html,
    /<meta name="description" content="Current Claude model ids, limits and prices\.">/,
  );
});

test("applies_to is stated plainly, not hidden", () => {
  const html = renderPage(model);
  assert.match(html, /Claude API, read 2026-10-06/);
});

test("tier navigation links to the numbered sections in the body", () => {
  const html = renderPage(model);
  assert.match(html, /href="#1-what-this-covers"/);
  assert.match(html, /href="#6-where-this-rots"/);
});

test("sources and related links are rendered", () => {
  const html = renderPage(model);
  assert.match(html, /https:\/\/example\.invalid\/models/);
  assert.match(html, /guides\/models\/comparison\.md/);
});

test("marker comments do not appear in the rendered output", () => {
  const withMarkers = {
    ...model,
    body:
      "## 1. What this covers\n\n<!-- corpus:data key=a.b -->\n$5\n<!-- /corpus:data -->\n",
  };
  const html = renderPage(withMarkers);
  assert.equal(html.includes("corpus:data"), false);
});

test("the banner states the facts without a badge in the markup", () => {
  const html = renderPage(model);
  assert.match(html, /Verified 2026-10-06 · re-check every 30 days/);
  assert.match(html, /data-freshness=/);
  assert.equal(html.includes("badge-fresh"), false);
});

test("a seed page discloses that its date predates the pipeline", () => {
  const html = renderPage(model);
  assert.match(html, /authored before the refresh pipeline existed/);
});

test("a deprecated page renders no freshness banner at all", () => {
  const html = renderPage({ ...model, status: "deprecated" });
  assert.equal(html.includes("data-freshness"), false);
  assert.equal(html.includes("re-check every"), false);
});
