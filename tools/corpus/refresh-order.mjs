// tools/corpus/refresh-order.mjs
// Section 6 is already an executable work order. This module builds the
// mechanical half of it — the exact record list — and hands each page's
// section 6 through VERBATIM. The prose lists (identifiers, values lint cannot
// guard, dated studies) are deliberately NOT parsed: a parser would silently
// drop items it did not recognise, and refresh would then under-check a unit
// and still report success under a fresh date.
import fs from "node:fs";
import path from "node:path";
import { sectionSixText } from "./verify-pages.mjs";
import { RefreshError, unitSlug, unitTopic } from "./refresh-units.mjs";

export function workOrder(root, unit, records, { key = null } = {}) {
  const byKey = new Map(records.map((r) => [r.key, r]));
  const wanted = key === null ? unit.keys : unit.keys.filter((k) => k === key);
  if (key !== null && wanted.length === 0)
    throw new RefreshError(
      "refresh-key-out-of-unit",
      `record ${key} is not referenced by this unit; --key narrows a unit, it never widens one`,
    );
  const blocking = [];
  const pages = unit.pages
    .filter((p) => key === null || p.keys.includes(key))
    .map((p) => {
      const text = fs.readFileSync(path.join(root, p.path), "utf8");
      const six = sectionSixText(text);
      // A deprecated page could not be refreshed, so it is exempt — the same
      // carve-out corpus verify makes for template-sections.
      if (six === null && p.status !== "deprecated")
        blocking.push({
          rule: "refresh-section-six-missing",
          path: p.path,
          message:
            'no "## 6." section, so this page contributes an empty checklist; an empty checklist is not "nothing to check"',
        });
      return { ...p, sectionSix: six };
    });
  const recordsOut = wanted.map((k) => {
    const r = byKey.get(k) ?? {};
    if (r.source == null || String(r.source).trim() === "")
      blocking.push({
        rule: "refresh-record-source-missing",
        path: r.file ? `data/${r.file}` : "data/",
        message: `record ${k} has no source, so there is nothing to re-read it against`,
      });
    return {
      key: k,
      file: r.file ? `data/${r.file}` : null,
      source: r.source ?? null,
      price_source: r.price_source ?? null,
      value: r.value ?? null,
      display: r.display ?? null,
      volatility: r.volatility ?? null,
      verified: r.verified ?? null,
    };
  });
  return {
    unit,
    slug: unitSlug(unit),
    topic: unitTopic(unit),
    // Carried on the order so the artifact can record it. A key-scoped refresh
    // stamps records only; see "Decision: what `--key` is allowed to stamp".
    key,
    pages,
    records: recordsOut,
    blocking,
  };
}

export function renderWorkOrder(order) {
  const lines = [
    `# Refresh work order: ${order.slug}`,
    "",
    `Topic: ${order.topic}`,
    `Topics spanned: ${order.unit.topics.map((t) => String(t)).join(", ")}`,
    `Entry page: ${order.unit.entry}`,
    `Pages in unit: ${order.unit.pages.map((p) => p.path).join(", ")}`,
    `Data files written: ${order.unit.dataFiles.join(", ") || "(none)"}`,
    order.key === null
      ? "Scope: the whole unit."
      : `Scope: --key=${order.key} — records only. No page's verified moves and no research: is set.`,
    "",
    "## Records to re-read",
    "",
  ];
  for (const r of order.records)
    lines.push(
      `- \`${r.key}\` in ${r.file ?? "(no file)"} — value ${JSON.stringify(r.value)}, display ${JSON.stringify(r.display)}, volatility ${r.volatility ?? "(none)"}, verified ${r.verified ?? "(none)"}, source ${r.source ?? "(none)"}${r.price_source ? `, price_source ${r.price_source}` : ""}`,
    );
  lines.push("");
  for (const p of order.pages) {
    lines.push(`## Section 6 verbatim: ${p.path}`, "");
    lines.push(
      p.sectionSix ??
        (p.status === "deprecated"
          ? "(deprecated page, no section 6 — exempt)"
          : "(no section 6 — BLOCKING)"),
    );
    lines.push("");
  }
  if (order.blocking.length > 0) {
    lines.push("## Blocking before any fetch", "");
    for (const b of order.blocking)
      lines.push(`- ${b.path} [${b.rule}] ${b.message}`);
    lines.push("");
  }
  return lines.join("\n");
}
