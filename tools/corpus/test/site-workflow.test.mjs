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

// Review finding (Important): workflow-level pages:write and id-token:write are
// held by the build job, which runs `npm ci` and `npm test` from a pull request
// branch. Deploy privileges belong to the job that deploys.
test("the build job holds no deploy privileges", () => {
  const text = fs.readFileSync(WF, "utf8");
  const top = text.slice(0, text.indexOf("jobs:"));
  assert.match(top, /permissions:\s*\n\s+contents: read\s*\n/);
  assert.equal(/^\s*pages: write/m.test(top), false, "pages:write is workflow-wide");
  assert.equal(/^\s*id-token: write/m.test(top), false, "id-token:write is workflow-wide");
  const deploy = text.slice(text.indexOf("deploy:"));
  assert.match(deploy, /pages: write/);
  assert.match(deploy, /id-token: write/);
});
