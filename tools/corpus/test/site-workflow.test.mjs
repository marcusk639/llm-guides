// tools/corpus/test/site-workflow.test.mjs
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const WF = new URL("../../../.github/workflows/site.yml", import.meta.url)
  .pathname;

test("the workflow runs all four gates before it builds the site", () => {
  const text = fs.readFileSync(WF, "utf8");
  const order = [
    "render --check .",
    "lint .",
    "verify .",
    "npm test",
    "site --write .",
  ].map((s) => text.indexOf(s));
  assert.equal(order.every((i) => i > -1), true, "a step is missing");
  const sorted = [...order].sort((a, b) => a - b);
  assert.deepEqual(order, sorted, "gates must precede the build");
});

test("deploy is gated on master pushes only", () => {
  const text = fs.readFileSync(WF, "utf8");
  assert.match(text, /refs\/heads\/master/);
  assert.match(text, /github\.event_name == 'push'/);
});
