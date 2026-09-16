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

// --- headers= (finding F8) ---

test("headers= labels replace field names in the header row", () => {
  const src =
    '<!-- corpus:table fields=key,display,value headers="Record key,Shown as,Raw value" tag=frontier -->\nold\n<!-- /corpus:table -->';
  const { text, issues } = renderText(src, records);
  assert.deepEqual(issues, []);
  assert.equal(text.includes("| Record key | Shown as | Raw value |"), true);
  assert.equal(text.includes("| key | display | value |"), false);
  assert.equal(text.includes("| --- | --- | --- |"), true);
  assert.equal(text.includes("| m.context | 200K | 200000 |"), true);
});

test("absent headers= keeps field names as header cells", () => {
  const src =
    "<!-- corpus:table fields=key,value tag=frontier -->\nold\n<!-- /corpus:table -->";
  const { text } = renderText(src, records);
  assert.equal(text.includes("| key | value |"), true);
});

test("headers= count mismatch raises render-headers-mismatch and preserves content", () => {
  const src =
    '<!-- corpus:table fields=key,display,value headers="Record key,Shown as" tag=frontier -->\nold\n<!-- /corpus:table -->';
  const { text, issues } = renderText(src, records);
  assert.equal(issues.length, 1);
  assert.equal(issues[0].rule, "render-headers-mismatch");
  assert.equal(text, src);
});

test("header labels are escaped like cells", () => {
  const src =
    '<!-- corpus:table fields=key,value headers="Key,In|Out" tag=frontier -->\nold\n<!-- /corpus:table -->';
  const { text } = renderText(src, records);
  assert.equal(text.includes("| Key | In\\|Out |"), true);
});

// --- sort= (finding F16) ---

const sortRecords = [
  { key: "k1", name: "Bravo", tags: ["s"] },
  { key: "k2", name: "Alpha", tags: ["s"] },
  { key: "k3", tags: ["s"] },
  { key: "k4", name: "Zulu", tags: ["s"] }, // sorts after the string "undefined"
  { key: "k5", name: "Alpha", tags: ["s"] },
].map((r) => ({ volatility: "low", source: "s", verified: "2026-09-16", ...r }));

function rowKeys(sortAttr) {
  const src = `<!-- corpus:table fields=key,name tag=s${sortAttr} -->\nold\n<!-- /corpus:table -->`;
  const { text, issues } = renderText(src, sortRecords);
  assert.deepEqual(issues, []);
  return text
    .split("\n")
    .filter((line) => line.startsWith("| "))
    .slice(2)
    .map((line) => line.split(" | ")[0].slice(2));
}

test("absent sort= keeps data load order", () => {
  assert.deepEqual(rowKeys(""), ["k1", "k2", "k3", "k4", "k5"]);
});

test("sort=field orders rows ascending, ties stable, missing field last", () => {
  assert.deepEqual(rowKeys(" sort=name"), ["k2", "k5", "k1", "k4", "k3"]);
});

test("sort=-field orders rows descending, ties stable, missing field last", () => {
  assert.deepEqual(rowKeys(" sort=-name"), ["k4", "k1", "k2", "k5", "k3"]);
});

// --- fix round 1, m4: no silent sort fallback ---

for (const [what, attr, message] of [
  ["an unknown field", "sort=nosuchfield", /not present on any row: nosuchfield/],
  ["a bare '-'", "sort=-", /malformed sort/],
  ["an empty value", 'sort=""', /malformed sort/],
]) {
  test(`sort= naming ${what} raises render-sort-unknown and preserves content`, () => {
    const src = `<!-- corpus:table fields=key,name tag=s ${attr} -->\nold\n<!-- /corpus:table -->`;
    const { text, issues } = renderText(src, sortRecords);
    assert.equal(issues.length, 1);
    assert.equal(issues[0].rule, "render-sort-unknown");
    assert.match(issues[0].message, message);
    assert.equal(text, src);
  });
}

test("sort= on a field present on only some records renders normally", () => {
  // k3 lacks `name`; that is missing-last ordering, not an error.
  assert.deepEqual(rowKeys(" sort=name"), ["k2", "k5", "k1", "k4", "k3"]);
});
