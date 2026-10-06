// tools/corpus/test/site-freshness.test.mjs
import test from "node:test";
import assert from "node:assert/strict";
import { clientScript, freshnessFacts, stateLabel } from "../site-freshness.mjs";
import { checkExpiry } from "../lint.mjs";

const high = {
  verified: "2026-10-06",
  volatility: "high",
  seed: true,
  status: null,
};

test("facts carry the cadence and the derived expiry", () => {
  const f = freshnessFacts(high);
  assert.equal(f.verified, "2026-10-06");
  assert.equal(f.cadenceDays, 30);
  assert.equal(f.expires, "2026-11-05");
  assert.equal(f.volatility, "high");
});

test("the hard-fail boundary is one further cadence past expiry", () => {
  const f = freshnessFacts(high);
  assert.equal(f.hardFail, "2026-12-05");
});

test("a deprecated page has no freshness facts at all", () => {
  assert.equal(
    freshnessFacts({ ...high, status: "deprecated" }),
    null,
  );
});

test("all three states are reachable from one fixture with an injected date", () => {
  const f = freshnessFacts(high); // expires 2026-11-05, hardFail 2026-12-05
  assert.equal(stateLabel(f, "2026-10-06"), "fresh");
  assert.equal(stateLabel(f, "2026-11-05"), "fresh");
  assert.equal(stateLabel(f, "2026-11-06"), "due");
  assert.equal(stateLabel(f, "2026-12-05"), "due");
  assert.equal(stateLabel(f, "2026-12-06"), "expired");
});

test("the expired threshold matches checkExpiry exactly", () => {
  const f = freshnessFacts(high);
  const entry = {
    path: "p",
    expires: f.expires,
    volatility: "high",
    status: null,
  };
  // lint fails when today > addDays(expires, cadence); the banner must say
  // "expired" on exactly the same days and no others.
  assert.equal(checkExpiry(entry, "2026-12-05").length, 0);
  assert.equal(stateLabel(f, "2026-12-05"), "due");
  assert.equal(checkExpiry(entry, "2026-12-06").length, 1);
  assert.equal(stateLabel(f, "2026-12-06"), "expired");
});

test("a page referencing no records falls back to the low cadence", () => {
  const f = freshnessFacts({
    verified: "2026-01-01",
    volatility: null,
    seed: false,
    status: null,
  });
  assert.equal(f.cadenceDays, 270);
  assert.equal(f.expires, "2026-09-28");
  assert.match(f.expires, /^\d{4}-\d{2}-\d{2}$/);
  assert.equal(stateLabel(f, "2026-09-28"), "fresh");
  assert.equal(stateLabel(f, "2026-09-29"), "due");
});

test("a page with no verified date renders a banner that says so, not a computed expiry", () => {
  const f = freshnessFacts({
    verified: null,
    volatility: "high",
    seed: false,
    status: null,
  });
  assert.equal(f.unreadableDate, true);
  assert.equal(f.expires, null);
  assert.equal(stateLabel(f, "2026-10-06"), null);
});

test("a malformed verified date is treated as unreadable, not parsed loosely", () => {
  const f = freshnessFacts({
    verified: "2026-02-30",
    volatility: "high",
    seed: false,
    status: null,
  });
  assert.equal(f.unreadableDate, true);
  assert.equal(f.expires, null);
});

test("the client script computes the viewer's local date, never a UTC date", () => {
  const js = clientScript();
  assert.match(js, /getFullYear\(\)/);
  assert.match(js, /getMonth\(\) \+ 1/);
  assert.match(js, /getDate\(\)/);
  // toISOString() would be a UTC date and could show "due" a day early west
  // of UTC; its absence is the assertion.
  assert.equal(js.includes("toISOString"), false);
});

test("the client script carries the same stateLabel the tests drive", () => {
  const js = clientScript();
  assert.match(js, /todayIso <= facts\.expires/);
  assert.match(js, /todayIso <= facts\.hardFail/);
});
