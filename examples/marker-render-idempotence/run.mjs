import assert from "node:assert/strict";
import { renderText } from "../../tools/corpus/render.mjs";

const records = [
  {
    key: "m.context",
    value: "200000",
    display: "200K",
    volatility: "high",
    source: "s",
    verified: "2026-09-16",
  },
];
const source =
  "Window: <!-- corpus:data key=m.context -->STALE<!-- /corpus:data -->\n";
const once = renderText(source, records).text;
const twice = renderText(once, records).text;

assert.equal(
  once.includes("200K"),
  true,
  "first render must substitute the record",
);
assert.equal(twice, once, "second render must be a no-op");
console.log("PASS: render is idempotent");
