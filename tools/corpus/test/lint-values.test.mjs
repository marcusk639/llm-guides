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
