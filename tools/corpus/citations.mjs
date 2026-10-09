import fs from "node:fs";
import path from "node:path";
import { loadRecords } from "./data.mjs";
import { parseFrontmatter } from "./frontmatter.mjs";
import { urlRanges } from "./lint.mjs";
import { guidePaths, isAbsoluteHttpUrl } from "./paths.mjs";

export const CITATION_CLASSES = Object.freeze([
  "record-source",
  "record-secondary",
  "page-frontmatter",
  "page-body",
  "snapshot",
]);

// Record fields that carry a citation URL, and the class each one reports as.
const RECORD_FIELDS = Object.freeze([
  ["source", "record-source"],
  ["price_source", "record-secondary"],
  ["licence_source", "record-secondary"],
  ["source_archived", "snapshot"],
]);

function malformed(cls, origin, field, value) {
  return {
    class: cls,
    origin,
    rule: "citation-malformed",
    message: `${field} is not a string: ${JSON.stringify(value)}`,
  };
}

export function collectCitations(root) {
  const citations = [];
  const issues = [];
  const seen = new Set();
  const add = (url, cls, origin) => {
    const k = `${cls}\u0000${origin}\u0000${url}`;
    if (seen.has(k)) return;
    seen.add(k);
    citations.push({ url, class: cls, origin });
  };

  for (const record of loadRecords(path.join(root, "data"))) {
    const origin = String(record.key ?? "(unkeyed)");
    for (const [field, cls] of RECORD_FIELDS) {
      const v = record[field];
      if (v == null) continue;
      if (typeof v !== "string") {
        issues.push(malformed(cls, origin, field, v));
        continue;
      }
      add(v, cls, origin);
    }
  }

  for (const abs of guidePaths(root)) {
    const origin = path.relative(root, abs).split(path.sep).join("/");
    const text = fs.readFileSync(abs, "utf8");
    const { data, body } = parseFrontmatter(text);
    const declared = data?.sources;
    if (declared != null) {
      if (!Array.isArray(declared)) {
        issues.push(malformed("page-frontmatter", origin, "sources", declared));
      } else {
        for (const v of declared) {
          if (typeof v !== "string") {
            issues.push(malformed("page-frontmatter", origin, "sources[]", v));
            continue;
          }
          add(v, "page-frontmatter", origin);
        }
      }
    }
    // `urlRanges` exists to tell the lint which spans to SKIP, so
    // `isUrlLikeDestination` deliberately accepts `./x`, `../x`, `/x` and
    // `mailto:`. Collecting those would hand the audit 29 unfetchable strings
    // (measured against guides/ on 2026-10-09) and report every internal
    // guide link as dead, so the body class keeps absolute http(s) only.
    for (const [a, b] of urlRanges(body)) {
      const span = body.slice(a, b);
      if (!isAbsoluteHttpUrl(span)) continue;
      add(span, "page-body", origin);
    }
  }

  return { citations, issues };
}
