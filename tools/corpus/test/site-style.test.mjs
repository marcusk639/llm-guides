// tools/corpus/test/site-style.test.mjs
import test from "node:test";
import assert from "node:assert/strict";
import { styleSheet } from "../site-style.mjs";

test("the stylesheet defines its palette as custom properties on :root", () => {
  const css = styleSheet();
  assert.match(css, /:root\s*\{/);
  assert.match(css, /--bg:/);
  assert.match(css, /--fg:/);
});

test("dark mode is honoured from the reader's OS setting", () => {
  const css = styleSheet();
  assert.match(css, /@media \(prefers-color-scheme: dark\)/);
  // No toggle, so nothing to persist and no JavaScript involved.
  assert.equal(css.includes("localStorage"), false);
});

test("every class the build emits has a rule", () => {
  const css = styleSheet();
  for (const cls of [
    "freshness",
    "seed-note",
    "applies-to",
    "tiers",
    "sources",
    "related",
    "summary",
    "provenance",
    "site",
    "search",
    "topics",
    "topic",
    "method",
    "table-scroll",
  ])
    assert.match(css, new RegExp(`\\.${cls}\\b`), `no rule for .${cls}`);
});

test("each freshness state is styled distinctly, since the badge is the trust signal", () => {
  const css = styleSheet();
  for (const s of ["badge-fresh", "badge-due", "badge-expired"])
    assert.match(css, new RegExp(`\\.${s}\\b`), `no rule for .${s}`);
});

test("a provenance sub-row opts out of the sticky first column", () => {
  const css = styleSheet();
  // Its single td IS :first-child, so without an opt-out it would stick and
  // float over the scrolling columns.
  assert.match(css, /\.provenance\s+td\s*\{[^}]*position:\s*static/);
});

test("no external resource is fetched, so the page survives offline and link rot", () => {
  const css = styleSheet();
  assert.equal(/@import/.test(css), false);
  assert.equal(/url\(\s*['"]?https?:/.test(css), false);
  assert.equal(css.includes("fonts.googleapis"), false);
});
