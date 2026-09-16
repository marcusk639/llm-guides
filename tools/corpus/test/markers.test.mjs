import test from "node:test";
import assert from "node:assert/strict";
import { findBlocks, coveredRanges, parseAttrs } from "../markers.mjs";

test("parses attributes including quoted values", () => {
  assert.deepEqual(parseAttrs('key=a.b filter="frontier tier" fields=x,y'), {
    key: "a.b",
    filter: "frontier tier",
    fields: "x,y",
  });
});

test("finds a data block and captures its content", () => {
  const text =
    "Before\n<!-- corpus:data key=a.b -->\n200K\n<!-- /corpus:data -->\nAfter\n";
  const [block] = findBlocks(text);
  assert.equal(block.kind, "data");
  assert.equal(block.attrs.key, "a.b");
  assert.equal(block.content.trim(), "200K");
  assert.equal(block.unterminated, false);
  assert.equal(
    text.slice(block.start, block.end).endsWith("<!-- /corpus:data -->"),
    true,
  );
});

test("a block may contain a complete fenced code block", () => {
  const text = [
    "<!-- corpus:data key=a.api_id -->",
    "```bash",
    "call --model example-model-4-5",
    "```",
    "<!-- /corpus:data -->",
  ].join("\n");
  const [block] = findBlocks(text);
  assert.equal(block.content.includes("```bash"), true);
  assert.equal(block.unterminated, false);
});

test("flags an unterminated block", () => {
  const [block] = findBlocks("<!-- corpus:data key=a.b -->\nno close\n");
  assert.equal(block.unterminated, true);
});

test("coveredRanges excludes unterminated blocks", () => {
  const text =
    "<!-- corpus:data key=a -->\nx\n<!-- /corpus:data -->\n<!-- corpus:table file=m.yaml -->\n";
  assert.equal(coveredRanges(findBlocks(text)).length, 1);
});

test("an unclosed block does not claim a later block's closer", () => {
  const text = [
    "<!-- corpus:data key=a -->",
    "no close here",
    "<!-- corpus:data key=b -->",
    "content",
    "<!-- /corpus:data -->",
  ].join("\n");
  const blocks = findBlocks(text);
  assert.equal(blocks.length, 2);
  assert.equal(blocks[0].attrs.key, "a");
  assert.equal(blocks[0].unterminated, true);
  assert.equal(blocks[1].attrs.key, "b");
  assert.equal(blocks[1].unterminated, false);
  assert.equal(blocks[1].content.trim(), "content");
  const ranges = coveredRanges(blocks);
  assert.equal(ranges.length, 1);
  assert.equal(ranges[0][0], blocks[1].start);
});

test("a data block containing an unclosed table opener before its own closer is unterminated", () => {
  const text =
    "<!-- corpus:data key=a -->\nx\n<!-- corpus:table fields=k -->\nrows\n<!-- /corpus:table -->\n<!-- /corpus:data -->";
  const blocks = findBlocks(text);
  assert.equal(blocks[0].kind, "data");
  assert.equal(blocks[0].unterminated, true);
  assert.equal(blocks[1].kind, "table");
  assert.equal(blocks[1].unterminated, false);
});
