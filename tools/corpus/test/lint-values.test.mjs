import test from "node:test";
import assert from "node:assert/strict";
import { findBareValues } from "../lint.mjs";

const index = new Map([
  ["200K", ["example.model.context_window"]],
  ["200000", ["example.model.context_window"]],
  ["example-model-4-5-20260101", ["example.model.api_id"]],
]);

test("flags a known value written bare in prose", () => {
  const text = "---\ntitle: t\n---\nThe window is 200K tokens.\n";
  const [issue] = findBareValues(text, index);
  assert.equal(issue.rule, "bare-value");
  assert.equal(issue.line, 4);
  assert.match(issue.message, /example\.model\.context_window/);
});

test("does not flag a value inside a marker block", () => {
  const text =
    "---\ntitle: t\n---\n<!-- corpus:data key=example.model.context_window -->\n200K\n<!-- /corpus:data -->\n";
  assert.deepEqual(findBareValues(text, index), []);
});

test("does not flag values appearing in front-matter", () => {
  const text =
    "---\ntitle: t\nsources:\n  - https://x.invalid/200000\n---\nBody.\n";
  assert.deepEqual(findBareValues(text, index), []);
});

test("does not flag ordinary numbers the corpus knows nothing about", () => {
  const text =
    "---\ntitle: t\n---\nThere are three labels and HTTP 429 exists. RFC 3339 too.\n";
  assert.deepEqual(findBareValues(text, index), []);
});

test("respects word boundaries", () => {
  const text =
    "---\ntitle: t\n---\nThe id is example-model-4-5-20260101x here.\n";
  assert.deepEqual(findBareValues(text, index), []);
});

test("flags a bare value inside a fenced code block outside any marker", () => {
  const text =
    "---\ntitle: t\n---\n```bash\ncall --model example-model-4-5-20260101\n```\n";
  assert.equal(findBareValues(text, index).length, 1);
});

const overlappingIndex = new Map([
  ["example-model-4-1", ["m.alias"]],
  ["example-model-4-1-20260101", ["m.snapshot"]],
  ["200K", ["m.context"]],
]);

test("does not misattribute a longer literal's match to a shorter contained literal", () => {
  const text = "---\ntitle: t\n---\nThe id is example-model-4-1-20260101.\n";
  const issues = findBareValues(text, overlappingIndex);
  assert.equal(issues.length, 1);
  assert.match(issues[0].message, /m\.snapshot/);
  assert.doesNotMatch(issues[0].message, /m\.alias/);
});

test("flags the shorter literal on its own when the longer literal is absent", () => {
  const text = "---\ntitle: t\n---\nThe id is example-model-4-1 here.\n";
  const issues = findBareValues(text, overlappingIndex);
  assert.equal(issues.length, 1);
  assert.match(issues[0].message, /m\.alias/);
});

test("still flags a value followed by '-' or '.' since those are not word characters", () => {
  const text =
    "---\ntitle: t\n---\na 200K-token context. The window is 200K.\n";
  assert.equal(findBareValues(text, overlappingIndex).length, 2);
});

const urlIndex = new Map([["claude-opus-5", ["anthropic.models.opus-5"]]]);
const doc = (body) => `---\ntitle: t\n---\n${body}\n`;

test("does not flag a known literal inside a Markdown inline link destination", () => {
  const text = doc("See [the model page](https://docs.example.invalid/models/claude-opus-5).");
  assert.deepEqual(findBareValues(text, urlIndex), []);
});

test("does not flag a known literal inside a link destination that carries a title", () => {
  const text = doc('See [the page](/models/claude-opus-5 "Model page").');
  assert.deepEqual(findBareValues(text, urlIndex), []);
});

test("does not flag a known literal inside an angle-bracket autolink", () => {
  for (const scheme of ["http", "https"]) {
    const text = doc(`Docs: <${scheme}://docs.example.invalid/claude-opus-5>.`);
    assert.deepEqual(findBareValues(text, urlIndex), [], scheme);
  }
});

test("an autolink covers its whole URL, including ) and ] that end a bare URL", () => {
  const text = doc("Docs: <https://wiki.example.invalid/Model_(opus)/claude-opus-5>.");
  assert.deepEqual(findBareValues(text, urlIndex), []);
});

test("does not flag a known literal inside a bare URL", () => {
  for (const url of [
    "http://docs.example.invalid/claude-opus-5",
    "https://docs.example.invalid/claude-opus-5?tab=pricing",
    "https://docs.example.invalid/m/claude-opus-5/overview",
  ]) {
    assert.deepEqual(findBareValues(doc(`Docs live at ${url} today.`), urlIndex), [], url);
  }
});

test("still flags a known literal in the link text", () => {
  const issues = findBareValues(
    doc("See [claude-opus-5](https://docs.example.invalid/models/claude-opus-5)."),
    urlIndex,
  );
  assert.equal(issues.length, 1);
  assert.match(issues[0].message, /anthropic\.models\.opus-5/);
});

test("still flags a known literal in prose right after a URL", () => {
  for (const body of [
    "At https://docs.example.invalid/x claude-opus-5 is listed.",
    "(see https://docs.example.invalid/x)claude-opus-5 is listed.",
    "[docs](https://docs.example.invalid/x) claude-opus-5 is listed.",
    "<https://docs.example.invalid/x> claude-opus-5 is listed.",
    "[https://docs.example.invalid/x]claude-opus-5 is listed.",
  ]) {
    assert.equal(findBareValues(doc(body), urlIndex).length, 1, body);
  }
});

test("a URL-like word without a scheme is still scanned", () => {
  const text = doc("Call docs.example.invalid/claude-opus-5 directly.");
  assert.equal(findBareValues(text, urlIndex).length, 1);
});

test("a '](' with no ')' on the same line does not hide later prose", () => {
  const text = doc("Index with arr[i](\nthen claude-opus-5 is listed (really).");
  assert.equal(findBareValues(text, urlIndex).length, 1);
});

// Fix round 1 (I1): only a genuine link destination is excluded.
test("flags a literal in a code call that merely looks like ](...)", () => {
  const text = doc('Call fn[k]("claude-opus-5") here.');
  assert.equal(findBareValues(text, urlIndex).length, 1);
});

test("flags a literal in bracket-paren prose that is not a URL destination", () => {
  const text = doc("See [1](the claude-opus-5 model) for details.");
  assert.equal(findBareValues(text, urlIndex).length, 1);
});

test("flags a literal inside a link title", () => {
  for (const title of ['"claude-opus-5"', "'claude-opus-5'"]) {
    const text = doc(`See [x](https://a.example.invalid ${title}).`);
    assert.equal(findBareValues(text, urlIndex).length, 1, title);
  }
});

test("flags a literal in a fenced JS call that looks like ](...)", () => {
  const text = doc('```js\nhandlers[type]({ model: "claude-opus-5" });\n```');
  assert.equal(findBareValues(text, urlIndex).length, 1);
});

test("does not flag a literal inside an angle-bracketed link destination", () => {
  const text = doc("See [the page](</models/claude-opus-5>).");
  assert.deepEqual(findBareValues(text, urlIndex), []);
});

test("does not flag a relative destination with surrounding spaces and a single-quoted title", () => {
  const text = doc("See [the page]( /models/claude-opus-5 'Model page' ).");
  assert.deepEqual(findBareValues(text, urlIndex), []);
});

// Fix round 1 (m3): a bare URL stops at quotes, comma, pipe, < and *.
test("flags a literal run on after a bare URL through a comma or quote", () => {
  for (const body of [
    "See https://a.example.invalid/x,claude-opus-5 here.",
    'See "https://a.example.invalid/"claude-opus-5 here.',
    "See 'https://a.example.invalid/'claude-opus-5 here.",
    "See `https://a.example.invalid/`claude-opus-5 here.",
    "| https://a.example.invalid/x|claude-opus-5 |",
    "See https://a.example.invalid/x<claude-opus-5 here.",
    "See **https://a.example.invalid/x**claude-opus-5 here.",
  ]) {
    assert.equal(findBareValues(doc(body), urlIndex).length, 1, body);
  }
});

// Final review (I1): a link destination is excluded only when it is URL-like
// (contains "://", or starts with "/", "./", "../" or "mailto:"). Bare tokens
// and "#anchor" targets are scanned.
test("flags a literal in a non-URL link destination", () => {
  for (const body of [
    "```js\nhandlers[i](claude-opus-5)\n```",
    "See [see](claude-opus-5) here.",
    "See [see](#claude-opus-5) here.",
    "See [see](<claude-opus-5>) here.",
    "See [see](<#claude-opus-5>) here.",
  ]) {
    assert.equal(findBareValues(doc(body), urlIndex).length, 1, body);
  }
});

test("does not flag a literal in a URL-like link destination", () => {
  for (const dest of [
    "https://docs.example.invalid/claude-opus-5",
    "/models/claude-opus-5",
    "./claude-opus-5.md",
    "../models/claude-opus-5.md",
    "mailto:claude-opus-5@example.invalid",
    "<./models/claude-opus-5>",
    "<mailto:claude-opus-5@example.invalid>",
  ]) {
    assert.deepEqual(findBareValues(doc(`See [see](${dest}) here.`), urlIndex), [], dest);
  }
});

// Final review (m4): a bare URL also stops at an em dash.
test("flags a literal run on after a bare URL through an em dash", () => {
  const body = "See https://a.example.invalid/x—claude-opus-5 here.";
  assert.equal(findBareValues(doc(body), urlIndex).length, 1);
});
