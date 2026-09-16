import { parseFrontmatter } from "./frontmatter.mjs";
import { findBlocks, coveredRanges } from "./markers.mjs";
import { CADENCE_DAYS, addDays, isValidIsoDate } from "./ledger.mjs";
import { isIndexableFieldValue } from "./data.mjs";

export const REQUIRED_FIELDS = [
  "title",
  "summary",
  "topic",
  "verified",
  "applies_to",
  "sources",
  "related",
];

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
  if ("verified" in data && !isValidIsoDate(String(data.verified))) {
    issues.push({
      rule: "frontmatter-date",
      message: `verified must be a real date written YYYY-MM-DD, got: ${data.verified}`,
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

// URL spans are excluded from the bare-value scan so prose can link a model's
// own page. Only the URL itself is covered: link TEXT (inside [ ... ]) and a
// link TITLE ("..." or '...') are still scanned, and a ](...) whose contents
// are not a single URL-like token (a code call, bracket-paren prose) is not a
// link destination at all.
const LINK_DESTINATION =
  /\]\([ \t]*(<[^>\n]*>|[^\s()<>"'`]+)(?:[ \t]+(?:"[^"\n]*"|'[^'\n]*'))?[ \t]*\)/dg;
const URL_SPANS = [
  // angle-bracket autolink
  /<(https?:\/\/[^>\s]*)>/dg,
  // bare URL, up to whitespace or ) > ] " ' ` , | < * or an em dash
  /(https?:\/\/[^\s)>\]"'`,|<*\u2014]+)/dg,
];

// A link destination (with or without angle brackets) is excluded only when
// it is URL-like. A bare token such as `handlers[i](some-id)` in code, or an
// `#anchor` target, is scanned like prose.
function isUrlLikeDestination(destination) {
  const d = destination.replace(/^<|>$/g, "");
  return (
    d.includes("://") ||
    d.startsWith("/") ||
    d.startsWith("./") ||
    d.startsWith("../") ||
    d.startsWith("mailto:")
  );
}

function urlRanges(text) {
  const ranges = [];
  for (const m of text.matchAll(LINK_DESTINATION)) {
    if (isUrlLikeDestination(m[1])) ranges.push(m.indices[1]);
  }
  for (const re of URL_SPANS) {
    for (const m of text.matchAll(re)) {
      ranges.push(m.indices[1]);
    }
  }
  return ranges;
}

export function findBareValues(text, index) {
  const { bodyOffset } = parseFrontmatter(text);
  const ranges = [...coveredRanges(findBlocks(text)), ...urlRanges(text)];
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

const VALID_VOLATILITIES = Object.keys(CADENCE_DAYS);

// Record-level lint configuration checks: names that silently lose coverage.
export function checkRecordLintConfig(record, topics) {
  const issues = [];
  if (!VALID_VOLATILITIES.includes(record.volatility)) {
    issues.push({
      rule: "record-volatility-invalid",
      message: `record ${record.key}: volatility must be one of ${VALID_VOLATILITIES.join(", ")}; got ${record.volatility == null ? "(missing)" : JSON.stringify(record.volatility)}`,
    });
  }
  if (record.lint_literals != null) {
    const ll = record.lint_literals;
    const problem = !Array.isArray(ll)
      ? "must be a list"
      : ll.length === 0
        ? "is empty, which unguards every value of the record (use lint: false to opt out deliberately)"
        : ll.some((l) => !isIndexableFieldValue(l))
          ? "must contain only strings or numbers"
          : null;
    if (problem) {
      issues.push({
        rule: "lint-literals-invalid",
        message: `record ${record.key}: lint_literals ${problem}`,
      });
    }
  }
  const fields = [].concat(record.lint_fields ?? []);
  const unknown = fields.filter((f) => !(f in record));
  if (unknown.length > 0) {
    issues.push({
      rule: "lint-fields-unknown",
      message: `record ${record.key}: lint_fields names field(s) not on the record: ${unknown.join(", ")}`,
    });
  }
  const unindexable = fields.filter(
    (f) => f in record && record[f] != null && !isIndexableFieldValue(record[f]),
  );
  if (unindexable.length > 0) {
    issues.push({
      rule: "lint-fields-unindexable",
      message: `record ${record.key}: lint_fields names field(s) whose value is not a string or number: ${unindexable.join(", ")}`,
    });
  }
  if (record.lint_scope != null) {
    const badScope = [].concat(record.lint_scope).filter((s) => !topics.includes(s));
    if (badScope.length > 0) {
      issues.push({
        rule: "lint-scope-unknown",
        message: `record ${record.key}: lint_scope names topic(s) not in meta/taxonomy.yaml: ${badScope.join(", ")}`,
      });
    }
  }
  return issues;
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
