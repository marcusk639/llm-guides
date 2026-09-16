import test from "node:test";
import assert from "node:assert/strict";
import {
  CADENCE_DAYS,
  derivePageVolatility,
  expiryFor,
  buildLedger,
} from "../ledger.mjs";
import { checkExpiry } from "../lint.mjs";

const records = [
  { key: "a.low", volatility: "low" },
  { key: "a.high", volatility: "high" },
  { key: "a.medium", volatility: "medium", tags: ["frontier"] },
];

test("cadence matches the provisional spec values", () => {
  assert.deepEqual(CADENCE_DAYS, { high: 30, medium: 90, low: 270 });
});

test("page volatility is the maximum of referenced records", () => {
  const text =
    "<!-- corpus:data key=a.low -->x<!-- /corpus:data --><!-- corpus:data key=a.high -->y<!-- /corpus:data -->";
  assert.equal(derivePageVolatility(text, records), "high");
});

test("a page referencing no records has no derived volatility", () => {
  assert.equal(derivePageVolatility("plain prose", records), null);
});

test("a table block makes the page as volatile as its most volatile row", () => {
  const text =
    "<!-- corpus:table fields=key tag=frontier -->\nold\n<!-- /corpus:table -->";
  assert.equal(derivePageVolatility(text, records), "medium");
});

test("expiry adds the cadence to the verified date", () => {
  assert.equal(expiryFor("2026-09-16", "high"), "2026-10-16");
  assert.equal(expiryFor("2026-01-01", "low"), "2026-09-28");
});

test("buildLedger emits one entry per page with a generated timestamp", () => {
  const ledger = buildLedger([
    { path: "guides/models/x.md", verified: "2026-09-16", volatility: "high" },
  ]);
  assert.equal(ledger.entries.length, 1);
  assert.equal(ledger.entries[0].expires, "2026-10-16");
  assert.equal(typeof ledger.generated, "string");
});

test("expiry fails only after a full extra cadence has elapsed", () => {
  const entry = {
    path: "p.md",
    verified: "2026-09-16",
    volatility: "high",
    expires: "2026-10-16",
  };
  assert.deepEqual(checkExpiry(entry, "2026-10-20"), []);
  assert.equal(checkExpiry(entry, "2026-11-20").length, 1);
  assert.equal(checkExpiry(entry, "2026-11-20")[0].rule, "expired");
});

test("a deprecated page is never expired", () => {
  const entry = {
    path: "p.md",
    verified: "2020-01-01",
    volatility: "high",
    expires: "2020-01-31",
    status: "deprecated",
  };
  assert.deepEqual(checkExpiry(entry, "2026-11-20"), []);
});

test("buildLedger excludes deprecated pages", () => {
  const ledger = buildLedger([
    {
      path: "guides/old.md",
      verified: "2020-01-01",
      volatility: "high",
      status: "deprecated",
    },
    {
      path: "guides/current.md",
      verified: "2026-09-16",
      volatility: "high",
    },
  ]);
  assert.equal(ledger.entries.length, 1);
  assert.equal(ledger.entries[0].path, "guides/current.md");
});

test("page volatility is the max of referenced records regardless of block order", () => {
  const text =
    "<!-- corpus:data key=a.high -->x<!-- /corpus:data --><!-- corpus:data key=a.low -->y<!-- /corpus:data -->";
  assert.equal(derivePageVolatility(text, records), "high");
});

test("table volatility is the max across matching rows regardless of record order", () => {
  const mixedOrderRecords = [
    { key: "b.high", volatility: "high", tags: ["mixed"] },
    { key: "b.low", volatility: "low", tags: ["mixed"] },
  ];
  const text =
    "<!-- corpus:table fields=key tag=mixed -->\nold\n<!-- /corpus:table -->";
  assert.equal(derivePageVolatility(text, mixedOrderRecords), "high");
});

// Task 15d: a record with an invalid volatility (missing, or not one of
// low/medium/high) must never crash derivePageVolatility/expiryFor, and must
// be ignored for cadence purposes as if the page never referenced it.
test("derivePageVolatility ignores a record with an invalid volatility and does not throw", () => {
  const bad = [{ key: "bad.one", volatility: "hi" }];
  const text = "<!-- corpus:data key=bad.one -->x<!-- /corpus:data -->";
  let volatility;
  assert.doesNotThrow(() => {
    volatility = derivePageVolatility(text, bad);
  });
  assert.equal(volatility, null);
  assert.equal(expiryFor("2026-09-16", volatility), expiryFor("2026-09-16", null));
});

test("derivePageVolatility ignores a record with no volatility field and does not throw", () => {
  const bad = [{ key: "bad.none" }];
  const text = "<!-- corpus:data key=bad.none -->x<!-- /corpus:data -->";
  let volatility;
  assert.doesNotThrow(() => {
    volatility = derivePageVolatility(text, bad);
  });
  assert.equal(volatility, null);
});

test("an invalid-volatility record does not throw whether it is referenced first or last", () => {
  const mixed = [
    { key: "bad.first", volatility: "hi" },
    { key: "good.last", volatility: "medium" },
  ];
  const firstBad =
    "<!-- corpus:data key=bad.first -->x<!-- /corpus:data --><!-- corpus:data key=good.last -->y<!-- /corpus:data -->";
  const lastBad =
    "<!-- corpus:data key=good.last -->y<!-- /corpus:data --><!-- corpus:data key=bad.first -->x<!-- /corpus:data -->";
  let a, b;
  assert.doesNotThrow(() => {
    a = derivePageVolatility(firstBad, mixed);
  });
  assert.doesNotThrow(() => {
    b = derivePageVolatility(lastBad, mixed);
  });
  assert.equal(a, "medium");
  assert.equal(b, "medium");
  assert.doesNotThrow(() => expiryFor("2026-09-16", a));
});

test("expiry boundary is exact: fails the day after a full extra cadence, not on it", () => {
  const entry = {
    path: "p.md",
    verified: "2026-09-16",
    volatility: "high",
    expires: "2026-10-16",
  };
  assert.deepEqual(checkExpiry(entry, "2026-11-15"), []);
  const failed = checkExpiry(entry, "2026-11-16");
  assert.equal(failed.length, 1);
  assert.equal(failed[0].rule, "expired");
});
