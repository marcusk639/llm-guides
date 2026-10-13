// tools/corpus/test/guide-links.test.mjs
//
// No gate checked guide BODY links. `verify` validates `related:` front-matter
// paths only, and the site passes markdown links through verbatim — it never
// rewrites a body `.md` link to `.html` — so a renamed page left dead links in
// published output while render, lint, verify and the suite all stayed green.
// That is how two links survived a page move: the one-off checks written for it
// matched `](name.md)` with a closing paren and could not see `](name.md#anchor)`.
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../../..",
);

function bodyLinks() {
  const out = [];
  const guides = path.join(ROOT, "guides");
  for (const rel of fs
    .readdirSync(guides, { recursive: true })
    .filter((f) => String(f).endsWith(".md"))) {
    const file = path.join(guides, String(rel));
    const body = fs.readFileSync(file, "utf8");
    // A relative markdown link to another guide, with or without a #fragment.
    for (const m of body.matchAll(/\]\(([^)\s:#]+\.md)(#[^)\s]*)?\)/g))
      out.push({
        from: String(rel),
        target: m[1],
        fragment: m[2] ?? "",
        resolved: path.resolve(path.dirname(file), m[1]),
      });
  }
  return out;
}

test("every relative body link between guides resolves to a file that exists", () => {
  const links = bodyLinks();
  assert.ok(links.length > 0, "found no body links — the scanner is broken");
  const dead = links
    .filter((l) => !fs.existsSync(l.resolved))
    .map((l) => `${l.from} -> ${l.target}${l.fragment}`);
  assert.deepEqual(dead, [], "dead relative links in guide bodies");
});

test("a body link carrying a #fragment is still checked", () => {
  // The bug this file exists for: a check that required the closing paren
  // immediately after `.md` was blind to every anchored link.
  const withFragment = bodyLinks().filter((l) => l.fragment !== "");
  assert.ok(
    withFragment.length > 0,
    "no anchored body links found — this test would be vacuous",
  );
});
