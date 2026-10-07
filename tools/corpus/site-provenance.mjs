// tools/corpus/site-provenance.mjs
//
// The differentiator: a rendered figure carries the date THAT NUMBER was read
// and a link to the page it came from, independent of the page's own verified
// date. This is a join over findBlocks (markers.mjs) and recordsByKey
// (data.mjs), both of which already exist.

import { findBlocks } from "./markers.mjs";
import { isValidIsoDate } from "./ledger.mjs";

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
    const entry = entryFor(key, byKey, issues);
    if (entry) entries.push(entry);
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

// Mirrors render.mjs's escapeCell, which that module does not export: a
// generated cell has its pipes escaped and its newlines turned into <br>.
function cellForm(value) {
  const s = value == null ? "" : String(value);
  return s.replace(/\|/g, "\\|").replace(/\r?\n/g, "<br>");
}

function splitRow(line) {
  return line
    .trim()
    .replace(/^\|/, "")
    .replace(/\|$/, "")
    .split(/(?<!\\)\|/)
    .map((c) => c.trim());
}

const isTableLine = (line) => /^\s*\|/.test(line);
const isDivider = (line) => /^\s*\|[\s:|-]+\|\s*$/.test(line);

function entryFor(key, byKey, issues) {
  const rec = byKey.get(key);
  if (!rec) {
    issues.push({
      rule: "site-provenance-unknown-key",
      message: `marker block names record ${key}, which no record defines`,
    });
    return null;
  }
  if (!rec.source) {
    issues.push({
      rule: "site-provenance-no-source",
      message: `record ${key} has no source, so its figure cannot be attributed`,
    });
    return null;
  }
  // A figure with no readable date cannot carry a provenance claim: rendering
  // one produces the literal text "read null". Treated like a missing source.
  if (!rec.verified || !isValidIsoDate(rec.verified)) {
    issues.push({
      rule: "site-provenance-no-verified",
      message: `record ${key} has no readable verified date, so its figure cannot be dated`,
    });
    return null;
  }
  return {
    key,
    verified: rec.verified,
    source: rec.source,
    label: sourceLabel(rec.source),
  };
}

function renderInline(entry) {
  return `<span class="provenance" data-record-key="${esc(entry.key)}">read ${esc(
    entry.verified,
  )} from <a href="${esc(entry.source)}">${esc(entry.label)}</a></span>`;
}

// A generated row's cells are exactly its record's `fields` values, so a row is
// matched to its record by cell equality rather than by position: a block
// carrying sort= renders its rows in an order the record list does not share.
function matchRecord(cells, fields, candidates, used) {
  for (const rec of candidates) {
    if (used.has(rec.key)) continue;
    if (
      cells.length === fields.length &&
      fields.every((f, i) => cellForm(rec[f]).trim() === cells[i])
    ) {
      used.add(rec.key);
      return rec;
    }
  }
  return null;
}

// Rewrites the body so each generated table row is followed by a sentinel row,
// and each inline corpus:data figure carries its provenance span. The sentinel
// survives markdown rendering as an ordinary table row, which injectProvenance
// then swaps for the real sub-row — the only way to place a colspan row beneath
// a specific data row without guessing which rendered table it belongs to.
export function annotateBody(body, byKey, records = []) {
  const issues = [];
  const subRows = new Map();
  let out = body;
  let counter = 0;
  const blocks = findBlocks(body).filter((b) => !b.unterminated);

  for (const block of [...blocks].reverse()) {
    const start = block.contentStart;
    const stop = start + block.content.length;
    let replacement = null;

    if (block.kind === "data" && block.attrs.key) {
      const entry = entryFor(block.attrs.key, byKey, issues);
      if (entry) replacement = block.content + renderInline(entry);
    } else if (block.kind === "table") {
      const fields = (block.attrs.fields ?? "key,value")
        .split(",")
        .map((f) => f.trim());
      const candidates = block.attrs.tag
        ? records.filter((r) => (r.tags ?? []).includes(block.attrs.tag))
        : records;
      const used = new Set();
      const lines = block.content.split("\n");
      const dividerAt = lines.findIndex(
        (l, i) => isDivider(l) && i > 0 && isTableLine(lines[i - 1]),
      );
      if (dividerAt !== -1) {
        const columns = splitRow(lines[dividerAt - 1]).length;
        const kept = lines.slice(0, dividerAt + 1);
        for (const line of lines.slice(dividerAt + 1)) {
          kept.push(line);
          if (!isTableLine(line)) continue;
          const rec = matchRecord(splitRow(line), fields, candidates, used);
          if (!rec) continue;
          const entry = entryFor(rec.key, byKey, issues);
          if (!entry) continue;
          const token = `@@PROV${counter++}@@`;
          subRows.set(token, renderSubRow([entry], columns));
          kept.push(`| ${token} |${" |".repeat(columns - 1)}`);
        }
        replacement = kept.join("\n");
      }
    }

    if (replacement !== null)
      out = out.slice(0, start) + replacement + out.slice(stop);
  }

  return { body: out, subRows, issues };
}

// The html-space half: each sentinel row is swapped for its provenance sub-row.
// Recomputing the map from the body is deterministic, so this stays a pure
// function of (html, model) and keeps the signature the plan declares.
export function injectProvenance(html, model, byKey, records = []) {
  const { subRows } = annotateBody(model.body, byKey, records);
  let out = html;
  for (const [token, row] of subRows) {
    const re = new RegExp(
      `<tr[^>]*>\\s*<td[^>]*>\\s*${token}\\s*</td>[\\s\\S]*?</tr>`,
    );
    out = re.test(out) ? out.replace(re, row) : out;
  }
  // A sentinel that did not render as a table row must still never ship.
  return out
    .replace(/<tr[^>]*>\s*<td[^>]*>\s*@@PROV\d+@@\s*<\/td>[\s\S]*?<\/tr>/g, "")
    .replace(/@@PROV\d+@@/g, "");
}
