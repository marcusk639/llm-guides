import { findBlocks } from "./markers.mjs";
import { recordsByKey } from "./data.mjs";

function buildTable(records, attrs) {
  const fields = (attrs.fields ?? "key,value").split(",").map((f) => f.trim());
  const rows = attrs.tag
    ? records.filter((r) => (r.tags ?? []).includes(attrs.tag))
    : records;
  const header = `| ${fields.join(" | ")} |`;
  const divider = `| ${fields.map(() => "---").join(" | ")} |`;
  const body = rows.map(
    (r) => `| ${fields.map((f) => r[f] ?? "").join(" | ")} |`,
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
    } else {
      out += buildTable(records, block.attrs);
    }
    cursor = block.contentStart + block.content.length;
  }
  out += text.slice(cursor);
  return { text: out, issues };
}
