import { findBlocks } from "./markers.mjs";
import { recordsByKey } from "./data.mjs";

function escapeCell(value) {
  const s = value == null ? "" : String(value);
  return s.replace(/\|/g, "\\|").replace(/\r\n/g, "<br>").replace(/\n/g, "<br>");
}

function splitList(value) {
  return value.split(",").map((f) => f.trim());
}

function tableFields(attrs) {
  return splitList(attrs.fields ?? "key,value");
}

// sort=field ascending, sort=-field descending. Values compare as strings with
// localeCompare; records missing the field sort last in both directions; ties
// keep load order (Array.prototype.sort is stable).
function sortRows(rows, sort) {
  if (!sort) return rows;
  const descending = sort.startsWith("-");
  const field = descending ? sort.slice(1) : sort;
  return [...rows].sort((a, b) => {
    const aMissing = a[field] == null;
    const bMissing = b[field] == null;
    if (aMissing || bMissing) return Number(aMissing) - Number(bMissing);
    const cmp = String(a[field]).localeCompare(String(b[field]));
    return descending ? -cmp : cmp;
  });
}

function filterRows(records, attrs) {
  return attrs.tag
    ? records.filter((r) => (r.tags ?? []).includes(attrs.tag))
    : records;
}

// A sort= that is malformed (empty, bare "-") or names a field no row of this
// table carries would silently fall back to load order; report it instead.
// A field present on only some rows is fine (those rows sort last).
function sortProblem(records, attrs) {
  if (attrs.sort == null) return null;
  const field = attrs.sort.startsWith("-") ? attrs.sort.slice(1) : attrs.sort;
  if (field === "") return `malformed sort: "${attrs.sort}"`;
  const rows = filterRows(records, attrs);
  if (rows.length > 0 && rows.every((r) => r[field] == null))
    return `sort field not present on any row: ${field}`;
  return null;
}

function buildTable(records, attrs) {
  const fields = tableFields(attrs);
  const labels = attrs.headers == null ? fields : splitList(attrs.headers);
  const rows = sortRows(filterRows(records, attrs), attrs.sort);
  if (rows.length === 0) return null;
  const header = `| ${labels.map(escapeCell).join(" | ")} |`;
  const divider = `| ${fields.map(() => "---").join(" | ")} |`;
  const body = rows.map(
    (r) => `| ${fields.map((f) => escapeCell(r[f])).join(" | ")} |`,
  );
  return ["", header, divider, ...body, ""].join("\n");
}

export function renderText(text, records) {
  const byKey = recordsByKey(records);
  const issues = [];
  const blocks = findBlocks(text).filter((b) => !b.unterminated);
  let out = "";
  let cursor = 0;
  for (const block of blocks) {
    out += text.slice(cursor, block.contentStart);
    if (block.kind === "data") {
      const record = byKey.get(block.attrs.key);
      if (!record) {
        issues.push({
          rule: "render-unknown-key",
          message: `unknown record key: ${block.attrs.key}`,
        });
        out += block.content;
      } else {
        out += String(record.display ?? record.value);
      }
    } else if (
      block.attrs.headers != null &&
      splitList(block.attrs.headers).length !== tableFields(block.attrs).length
    ) {
      issues.push({
        rule: "render-headers-mismatch",
        message: `headers has ${splitList(block.attrs.headers).length} label(s) but fields has ${tableFields(block.attrs).length}`,
      });
      out += block.content;
    } else if (sortProblem(records, block.attrs)) {
      issues.push({
        rule: "render-sort-unknown",
        message: sortProblem(records, block.attrs),
      });
      out += block.content;
    } else {
      const table = buildTable(records, block.attrs);
      if (table === null) {
        issues.push({
          rule: "render-empty-table",
          message: block.attrs.tag
            ? `no records match tag: ${block.attrs.tag}`
            : "no records to render",
        });
        out += block.content;
      } else {
        out += table;
      }
    }
    cursor = block.contentStart + block.content.length;
  }
  out += text.slice(cursor);
  return { text: out, issues };
}

// Formatter-stable comparison form (finding F9). Markdown formatters such as
// Prettier pad table cells to column width, stretch divider dashes to match,
// and add a blank line after a corpus:table opener and before its closer.
// Inside each terminated table block this: drops leading/trailing blank lines,
// trims whitespace around every cell, and writes divider cells as `---`
// (keeping alignment colons) on the line after the header row only.
// Cell text, row order, row count, header labels,
// interior blank lines and everything outside table blocks are left exact.
function normaliseRow(line, isDividerLine) {
  const trimmed = line.trim();
  if (!trimmed.startsWith("|")) return line;
  const cells = trimmed
    .replace(/^\|/, "")
    .replace(/(?<!\\)\|$/, "")
    .split(/(?<!\\)\|/)
    .map((c) => c.trim());
  // Only the line straight after the header row is a divider; a data row of
  // "-" placeholders must keep its exact dash count.
  const isDivider =
    isDividerLine && cells.every((c) => /^:?-+:?$/.test(c));
  const out = isDivider
    ? cells.map((c) => c.replace(/-+/, "---"))
    : cells;
  return `| ${out.join(" | ")} |`;
}

function normaliseTableContent(content) {
  const lines = content.split("\n");
  while (lines.length && lines[0].trim() === "") lines.shift();
  while (lines.length && lines[lines.length - 1].trim() === "") lines.pop();
  const header = lines.findIndex((l) => l.trim().startsWith("|"));
  return lines
    .map((l, i) => normaliseRow(l, header !== -1 && i === header + 1))
    .join("\n");
}

export function normaliseForComparison(text) {
  let out = "";
  let cursor = 0;
  for (const block of findBlocks(text)) {
    if (block.unterminated || block.kind !== "table") continue;
    out += text.slice(cursor, block.contentStart);
    out += normaliseTableContent(block.content);
    cursor = block.contentStart + block.content.length;
  }
  return out + text.slice(cursor);
}
