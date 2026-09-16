import { parseFrontmatter } from "./frontmatter.mjs";
import { findBlocks, coveredRanges } from "./markers.mjs";

export const REQUIRED_FIELDS = [
  "title",
  "summary",
  "topic",
  "verified",
  "applies_to",
  "sources",
  "related",
];

const DATE = /^\d{4}-\d{2}-\d{2}$/;

export function validateFrontmatter(data, topics) {
  if (data == null) {
    return [
      { rule: "frontmatter-missing", message: "document has no front-matter" },
    ];
  }
  const issues = [];
  for (const field of REQUIRED_FIELDS) {
    if (!(field in data)) {
      issues.push({
        rule: "frontmatter-required",
        message: `missing required field: ${field}`,
      });
    }
  }
  if ("topic" in data && !topics.includes(data.topic)) {
    issues.push({
      rule: "frontmatter-topic",
      message: `unknown topic: ${data.topic}`,
    });
  }
  if ("verified" in data && !DATE.test(String(data.verified))) {
    issues.push({
      rule: "frontmatter-date",
      message: `verified must be YYYY-MM-DD, got: ${data.verified}`,
    });
  }
  if ("volatility" in data) {
    issues.push({
      rule: "frontmatter-derived-volatility",
      message:
        "volatility is derived from referenced records; remove it from front-matter",
    });
  }
  return issues;
}

const WORD = /[A-Za-z0-9]/;

function isBoundedMatch(text, at, literal) {
  const before = text[at - 1];
  const after = text[at + literal.length];
  return !(before && WORD.test(before)) && !(after && WORD.test(after));
}

export function findBareValues(text, index) {
  const { bodyOffset } = parseFrontmatter(text);
  const ranges = coveredRanges(findBlocks(text));
  const inBlock = (i) => ranges.some(([s, e]) => i >= s && i < e);
  const issues = [];
  for (const [literal, keys] of index) {
    let at = text.indexOf(literal, bodyOffset);
    while (at !== -1) {
      if (!inBlock(at) && isBoundedMatch(text, at, literal)) {
        issues.push({
          rule: "bare-value",
          message: `value "${literal}" belongs to record(s) ${keys.join(", ")}; wrap it in a marker block`,
          line: text.slice(0, at).split("\n").length,
        });
      }
      at = text.indexOf(literal, at + literal.length);
    }
  }
  return issues.sort((a, b) => a.line - b.line);
}
