// tools/corpus/test/refresh-order.test.mjs
import test from "node:test";
import assert from "node:assert/strict";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { loadRecords } from "../data.mjs";
import { RefreshError, resolveUnit } from "../refresh-units.mjs";
import { workOrder, renderWorkOrder } from "../refresh-order.mjs";

const FIX = fileURLToPath(new URL("./fixtures/refresh/", import.meta.url));
const fixRecords = () => loadRecords(path.join(FIX, "data"));
const order = (entry, opts) =>
  workOrder(FIX, resolveUnit(FIX, entry, fixRecords()), fixRecords(), opts);

test("the work order carries every record in the unit, with its source", () => {
  const o = order("guides/alpha/one.md");
  assert.deepEqual(
    o.records.map((r) => r.key),
    ["fix.bridge.two", "fix.shared.one", "fix.tail.three"],
  );
  const shared = o.records.find((r) => r.key === "fix.shared.one");
  assert.equal(shared.source, "https://example.invalid/one");
  assert.equal(shared.file, "data/units.yaml");
  assert.equal(shared.volatility, "high");
});

test("the work order carries each page's section 6 verbatim", () => {
  const o = order("guides/alpha/one.md");
  const one = o.pages.find((p) => p.path === "guides/alpha/one.md");
  assert.match(
    one.sectionSix,
    /Re-check on refresh: the fixture identifier `FIXTURE_FLAG`\./,
  );
  assert.equal(o.blocking.length, 0);
});

// Review Focus 5, second half: an empty checklist is not "nothing to check".
// nosix.md is its own unit of one, so this enters from nosix.md itself.
test("a page with no section 6 blocks the work order", () => {
  const o = order("guides/gamma/nosix.md");
  assert.deepEqual(
    o.pages.map((p) => p.path),
    ["guides/gamma/nosix.md"],
  );
  const issue = o.blocking.find(
    (b) => b.rule === "refresh-section-six-missing",
  );
  assert.equal(issue.path, "guides/gamma/nosix.md");
  assert.match(issue.message, /empty checklist/);
});

// lonely.md stays a unit of one and stays clean: nosix.md is not in its unit.
test("the neighbouring unit of one is unaffected and has no blocking issue", () => {
  const o = order("guides/gamma/lonely.md");
  assert.deepEqual(
    o.pages.map((p) => p.path),
    ["guides/gamma/lonely.md"],
  );
  assert.deepEqual(o.blocking, []);
});

// A deprecated page cannot be refreshed, so it is exempt from this block the
// same way corpus verify exempts it from template-sections.
test("a deprecated page with no section 6 does not block", () => {
  const o = order("guides/alpha/one.md");
  assert.equal(
    o.blocking.some((b) => b.path === "guides/beta/gone.md"),
    false,
  );
});

test("a record with no source blocks: there is nothing to re-read it against", () => {
  const records = [...fixRecords()];
  const unit = {
    entry: "guides/gamma/lonely.md",
    pages: [
      {
        path: "guides/gamma/lonely.md",
        topic: "gamma",
        status: null,
        keys: ["fix.nosource.six"],
      },
    ],
    keys: ["fix.nosource.six"],
    topics: ["gamma"],
    dataFiles: ["data/units.yaml"],
  };
  const o = workOrder(FIX, unit, records);
  assert.equal(
    o.blocking.some((b) => b.rule === "refresh-record-source-missing"),
    true,
  );
});

test("--key narrows a unit, records the narrowing, and refuses to widen one", () => {
  const o = order("guides/alpha/one.md", { key: "fix.tail.three" });
  assert.equal(o.key, "fix.tail.three");
  assert.equal(order("guides/alpha/one.md").key, null);
  assert.deepEqual(
    o.records.map((r) => r.key),
    ["fix.tail.three"],
  );
  assert.deepEqual(
    o.pages.map((p) => p.path),
    ["guides/beta/gone.md", "guides/beta/three.md"],
  );
  assert.throws(
    () => order("guides/alpha/one.md", { key: "fix.alone.four" }),
    (err) =>
      err instanceof RefreshError && err.rule === "refresh-key-out-of-unit",
  );
});

test("renderWorkOrder names the unit, its records and its blocking issues", () => {
  const text = renderWorkOrder(order("guides/gamma/nosix.md"));
  assert.match(text, /^# Refresh work order: /m);
  assert.match(text, /^## Records to re-read$/m);
  assert.match(text, /^## Section 6 verbatim: guides\/gamma\/nosix\.md$/m);
  assert.match(text, /^## Blocking before any fetch$/m);
  assert.match(text, /refresh-section-six-missing/);
});

// Finding 1: the deprecated-page exemption's own rendered text. The unit
// entered from alpha/one.md includes beta/gone.md (deprecated, no section 6);
// renderWorkOrder must label it exempt rather than render nothing or render it
// as if BLOCKING. Mutating that literal string (or swapping it for the
// BLOCKING fallback) must turn this red.
test("renderWorkOrder marks a deprecated page's missing section 6 as exempt, not blocking", () => {
  const text = renderWorkOrder(order("guides/alpha/one.md"));
  assert.match(text, /^## Section 6 verbatim: guides\/beta\/gone\.md$/m);
  assert.match(text, /\(deprecated page, no section 6 — exempt\)/);
});

// Finding 2: the OTHER half of the source guard. fix.nosource.six (used above)
// has no `source` key at all, exercising only `r.source == null`. This record
// has an explicit empty-string source, exercising
// `String(r.source).trim() === ""`. Removing that second disjunct must turn
// this red while leaving the no-source-key test above green.
test("a record with an empty-string source blocks the same way as a missing one", () => {
  const records = [...fixRecords()];
  const unit = {
    entry: "guides/gamma/lonely.md",
    pages: [
      {
        path: "guides/gamma/lonely.md",
        topic: "gamma",
        status: null,
        keys: ["fix.emptysource.eight"],
      },
    ],
    keys: ["fix.emptysource.eight"],
    topics: ["gamma"],
    dataFiles: ["data/units.yaml"],
  };
  const o = workOrder(FIX, unit, records);
  assert.equal(
    o.blocking.some((b) => b.rule === "refresh-record-source-missing"),
    true,
  );
});

// Finding 4: a key referenced by the unit but absent from every data/ file is
// a different fact from one that exists with a missing source, and must raise
// its own rule with a sensible (non-bare-directory) path, not be
// misreported as refresh-record-source-missing with path "data/".
test("a wholly unknown record raises refresh-record-unknown, not refresh-record-source-missing", () => {
  const records = [...fixRecords()];
  const unit = {
    entry: "guides/gamma/lonely.md",
    pages: [
      {
        path: "guides/gamma/lonely.md",
        topic: "gamma",
        status: null,
        keys: ["fix.ghost.nine"],
      },
    ],
    keys: ["fix.ghost.nine"],
    topics: ["gamma"],
    dataFiles: [],
  };
  const o = workOrder(FIX, unit, records);
  const unknown = o.blocking.find((b) => b.rule === "refresh-record-unknown");
  assert.ok(unknown);
  assert.equal(unknown.path, "(not found in any data/ file)");
  assert.equal(
    o.blocking.some((b) => b.rule === "refresh-record-source-missing"),
    false,
  );
});

// Finding 6(a): a present-but-empty section 6 ("" from sectionSixText) is a
// real checklist of zero items, not a missing one — it must NOT trigger
// refresh-section-six-missing. Only the null (missing) case was tested
// before; mutating the null-check to a falsy-check must turn this red.
test("a present-but-empty section 6 does not block the work order", () => {
  const o = order("guides/gamma/emptysix.md");
  const page = o.pages.find((p) => p.path === "guides/gamma/emptysix.md");
  assert.equal(page.sectionSix, "");
  assert.equal(
    o.blocking.some((b) => b.rule === "refresh-section-six-missing"),
    false,
  );
});
