import test from "node:test";
import assert from "node:assert/strict";
import { parseFrontmatter } from "../frontmatter.mjs";

test("parses front-matter and returns the body", () => {
  const text =
    "---\ntitle: Hooks\nverified: 2026-09-16\n---\n# Hooks\n\nBody.\n";
  const { data, body, bodyOffset } = parseFrontmatter(text);
  assert.equal(data.title, "Hooks");
  assert.equal(data.verified, "2026-09-16");
  assert.equal(typeof data.verified, "string");
  assert.equal(body, "# Hooks\n\nBody.\n");
  assert.equal(text.slice(bodyOffset), body);
});

test("returns null data when no front-matter is present", () => {
  const { data, body, bodyOffset } = parseFrontmatter("# Bare\n");
  assert.equal(data, null);
  assert.equal(body, "# Bare\n");
  assert.equal(bodyOffset, 0);
});

test("returns an empty object for empty front-matter", () => {
  const { data } = parseFrontmatter("---\n\n---\nx\n");
  assert.deepEqual(data, {});
});
