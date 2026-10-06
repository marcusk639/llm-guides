// tools/corpus/test/site-markdown.test.mjs
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { renderMarkdown } from "../site-markdown.mjs";

test("a GFM table renders as a table element", () => {
  const md = "| A | B |\n| --- | --- |\n| 1 | 2 |\n";
  const html = renderMarkdown(md);
  assert.match(html, /<table>/);
  assert.match(html, /<td>1<\/td>/);
});

test("a generated <br> inside a table cell survives", () => {
  const md = "| A |\n| --- |\n| first line<br>second line |\n";
  const html = renderMarkdown(md);
  assert.match(html, /first line<br>second line/);
  assert.equal(html.includes("&lt;br&gt;"), false);
});

test("an escaped pipe inside a table cell renders as a literal pipe", () => {
  const md = "| A |\n| --- |\n| a \\| b |\n";
  const html = renderMarkdown(md);
  assert.match(html, /a \| b/);
});

test("a language-tagged fence keeps its language class", () => {
  const html = renderMarkdown("```bash\necho hi\n```\n");
  assert.match(html, /language-bash/);
});

test("the eight-part heading structure renders as h2 elements", () => {
  const html = renderMarkdown("## 1. What this covers\n\n## 2. The 60-second version\n");
  assert.match(html, /<h2[^>]*>1\. What this covers<\/h2>/);
});

// The brief's version of this test read the fixture guide, which has no table
// rows and no literal <br> — so asserting the output lacks the ESCAPED forms
// would have passed whatever the renderer did. It is pointed at a real corpus
// guide instead, and asserts its preconditions first so it cannot go vacuous.
test("a real corpus guide's tables render without escaping their markup", () => {
  const REPO = new URL("../../../", import.meta.url).pathname;
  const text = readFileSync(join(REPO, "guides", "models", "comparison.md"), "utf8");

  // Preconditions: if these ever stop holding, this test fails loudly rather
  // than silently proving nothing.
  assert.equal(
    text.split("\n").some((l) => l.startsWith("|")),
    true,
    "precondition: the guide must contain at least one pipe-table row",
  );

  const html = renderMarkdown(text);
  assert.match(html, /<table>/);
  assert.equal(html.includes("&lt;table&gt;"), false);
  assert.equal(html.includes("&lt;br&gt;"), false);
});
