import { parseFrontmatter } from "./frontmatter.mjs";
import { findBlocks, coveredRanges } from "./markers.mjs";
import { CADENCE_DAYS, addDays } from "./ledger.mjs";

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
  const matches = [];
  for (const [literal, keys] of index) {
    let at = text.indexOf(literal, bodyOffset);
    while (at !== -1) {
      if (!inBlock(at) && isBoundedMatch(text, at, literal)) {
        matches.push({ start: at, end: at + literal.length, literal, keys });
      }
      at = text.indexOf(literal, at + literal.length);
    }
  }
  // Longest-match suppression: when one matched literal is a hyphen/other
  // non-word-bounded prefix (or substring) of another, the shorter match's
  // span lies entirely within the longer match's span. Drop it so a value
  // like "example-model-4-1-20260101" does not also get misattributed to a
  // shorter record like "example-model-4-1".
  const surviving = matches.filter(
    (m) =>
      !matches.some(
        (o) =>
          o !== m &&
          o.literal.length > m.literal.length &&
          o.start <= m.start &&
          m.end <= o.end,
      ),
  );
  return surviving
    .map((m) => ({
      rule: "bare-value",
      message: `value "${m.literal}" belongs to record(s) ${m.keys.join(", ")}; wrap it in a marker block`,
      line: text.slice(0, m.start).split("\n").length,
    }))
    .sort((a, b) => a.line - b.line);
}

export function checkExpiry(entry, today) {
  if (entry.status === "deprecated") return [];
  const hardFail = addDays(
    entry.expires,
    CADENCE_DAYS[entry.volatility ?? "low"],
  );
  if (today > hardFail) {
    return [
      {
        rule: "expired",
        message: `${entry.path} expired ${entry.expires} and is more than one full cadence overdue; refresh it or mark status: deprecated`,
      },
    ];
  }
  return [];
}
