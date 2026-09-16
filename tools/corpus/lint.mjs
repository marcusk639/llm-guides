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
