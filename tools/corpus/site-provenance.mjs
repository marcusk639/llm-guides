// tools/corpus/site-provenance.mjs
//
// The differentiator: a rendered figure carries the date THAT NUMBER was read
// and a link to the page it came from, independent of the page's own verified
// date. This is a join over findBlocks (markers.mjs) and recordsByKey
// (data.mjs), both of which already exist.

// A link whose text names the vendor page rather than showing a bare URL.
export function sourceLabel(url) {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return url;
  }
}

export function provenanceFor(block, byKey, records = []) {
  const issues = [];
  const entries = [];
  const push = (key) => {
    const rec = byKey.get(key);
    if (!rec) {
      issues.push({
        rule: "site-provenance-unknown-key",
        message: `marker block names record ${key}, which no record defines`,
      });
      return;
    }
    if (!rec.source) {
      issues.push({
        rule: "site-provenance-no-source",
        message: `record ${key} has no source, so its figure cannot be attributed`,
      });
      return;
    }
    entries.push({
      key,
      verified: rec.verified ?? null,
      source: rec.source,
      label: sourceLabel(rec.source),
    });
  };

  if (block.unterminated) return { entries, issues };

  if (block.kind === "data" && block.attrs.key) {
    push(block.attrs.key);
  } else if (block.kind === "table" && block.attrs.tag) {
    for (const rec of records)
      if ((rec.tags ?? []).includes(block.attrs.tag)) push(rec.key);
  }
  return { entries, issues };
}

const esc = (s) =>
  String(s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");

// Visible by default, spanning the table's full width, never extra columns.
export function renderSubRow(entries, columnCount) {
  if (entries.length === 0) return "";
  const keys = entries.map((e) => esc(e.key)).join(" ");
  const dates = new Set(entries.map((e) => e.verified));
  const sources = new Set(entries.map((e) => e.source));

  // Identical dates and sources are stated once rather than per column.
  const text =
    dates.size === 1 && sources.size === 1
      ? `Read ${esc([...dates][0])} from <a href="${esc(entries[0].source)}">${esc(entries[0].label)}</a>`
      : entries
          .map(
            (e) =>
              `${esc(e.key)}: read ${esc(e.verified)} from <a href="${esc(e.source)}">${esc(e.label)}</a>`,
          )
          .join("; ");

  return `<tr class="provenance" data-record-key="${keys}"><td colspan="${columnCount}">${text}</td></tr>`;
}
