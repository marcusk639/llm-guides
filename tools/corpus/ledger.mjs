import { findBlocks } from "./markers.mjs";

export const CADENCE_DAYS = { high: 30, medium: 90, low: 270 };
const RANK = { low: 0, medium: 1, high: 2 };

// A real calendar date written YYYY-MM-DD. The pattern alone accepts
// impossible dates such as 2026-13-45, which make addDays throw RangeError;
// the round trip rejects them (and 2026-02-30, which Date would roll over).
export function isValidIsoDate(s) {
  if (typeof s !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(s)) return false;
  const d = new Date(`${s}T00:00:00Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === s;
}

export function addDays(iso, days) {
  const d = new Date(`${iso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

export function derivePageVolatility(text, records) {
  const byKey = new Map(records.map((r) => [r.key, r]));
  let best = null;
  // A record whose volatility is missing or not one of low/medium/high is
  // ignored here, as if the page never referenced it — record-volatility-
  // invalid (lint.mjs) is what flags the bad record itself.
  const bump = (v) => {
    if (!Object.prototype.hasOwnProperty.call(RANK, v)) return;
    if (best === null || RANK[v] > RANK[best]) best = v;
  };
  for (const block of findBlocks(text)) {
    if (block.unterminated) continue;
    if (block.kind === "data") {
      bump(byKey.get(block.attrs.key)?.volatility);
    } else {
      // A table pulls in every record its filter admits, so the page is as
      // volatile as the most volatile row the table will render.
      const tag = block.attrs.tag;
      for (const r of records) {
        if (!tag || (r.tags ?? []).includes(tag)) bump(r.volatility);
      }
    }
  }
  return best;
}

export function expiryFor(verified, volatility) {
  return addDays(verified, CADENCE_DAYS[volatility ?? "low"]);
}

export function buildLedger(pages) {
  return {
    generated: new Date().toISOString().slice(0, 10),
    entries: pages
      .filter((p) => p.status !== "deprecated")
      .map((p) => ({
        path: p.path,
        verified: p.verified,
        volatility: p.volatility,
        expires: expiryFor(p.verified, p.volatility),
        ...(p.status ? { status: p.status } : {}),
      })),
  };
}
