import test from "node:test";
import assert from "node:assert/strict";
import { renderText } from "../render.mjs";

const records = [
  {
    key: "m.context",
    value: "200000",
    display: "200K",
    volatility: "high",
    source: "s",
    verified: "2026-09-16",
    tags: ["frontier"],
  },
  {
    key: "m.api_id",
    value: "example-model-4-5",
    volatility: "high",
    source: "s",
    verified: "2026-09-16",
    tags: ["frontier"],
  },
  {
    key: "other.thing",
    value: "nope",
    volatility: "low",
    source: "s",
    verified: "2026-09-16",
    tags: ["legacy"],
  },
];

test("expands a data block to display, falling back to value", () => {
  const src = "A <!-- corpus:data key=m.context -->OLD<!-- /corpus:data --> B";
  const { text } = renderText(src, records);
  assert.equal(
    text,
    "A <!-- corpus:data key=m.context -->200K<!-- /corpus:data --> B",
  );

  const src2 = "<!-- corpus:data key=m.api_id -->x<!-- /corpus:data -->";
  assert.equal(
    renderText(src2, records).text.includes("example-model-4-5"),
    true,
  );
});

test("reports an unknown key instead of silently emptying the block", () => {
  const { text, issues } = renderText(
    "<!-- corpus:data key=missing.key -->x<!-- /corpus:data -->",
    records,
  );
  assert.equal(issues.length, 1);
  assert.equal(issues[0].rule, "render-unknown-key");
  assert.equal(text.includes("x"), true);
});

test("builds a table filtered by tag", () => {
  const src =
    "<!-- corpus:table fields=key,display,value tag=frontier -->\nold\n<!-- /corpus:table -->";
  const { text } = renderText(src, records);
  assert.equal(text.includes("| key | display | value |"), true);
  assert.equal(text.includes("| m.context | 200K | 200000 |"), true);
  assert.equal(text.includes("other.thing"), false);
});

test("is idempotent", () => {
  const src = "A <!-- corpus:data key=m.context -->OLD<!-- /corpus:data -->";
  const once = renderText(src, records).text;
  assert.equal(renderText(once, records).text, once);
});

const escapingRecords = [
  {
    key: "pipe.thing",
    value: "a|b",
    volatility: "low",
    source: "s",
    verified: "2026-09-16",
    tags: ["esc"],
  },
  {
    key: "newline.thing",
    value: "line1\nline2",
    volatility: "low",
    source: "s",
    verified: "2026-09-16",
    tags: ["esc"],
  },
];

test("escapes pipes and newlines in table cells", () => {
  const src =
    "<!-- corpus:table fields=key,value tag=esc -->\nold\n<!-- /corpus:table -->";
  const { text } = renderText(src, escapingRecords);
  assert.equal(text.includes("a\\|b"), true);
  assert.equal(text.includes("line1<br>line2"), true);

  const bodyLines = text
    .split("\n")
    .filter((line) => line.startsWith("| "))
    .slice(2); // drop header and divider rows
  assert.equal(bodyLines.length, escapingRecords.length);
});

test("reports an empty table instead of wiping existing content", () => {
  const src =
    "<!-- corpus:table fields=key,value tag=nonexistent -->\nold\n<!-- /corpus:table -->";
  const { text, issues } = renderText(src, records);
  assert.equal(issues.length, 1);
  assert.equal(issues[0].rule, "render-empty-table");
  assert.equal(text.includes("old"), true);
});

test("table block is idempotent", () => {
  const src =
    "<!-- corpus:table fields=key,display,value tag=frontier -->\nold\n<!-- /corpus:table -->";
  const once = renderText(src, records).text;
  assert.equal(renderText(once, records).text, once);
});
