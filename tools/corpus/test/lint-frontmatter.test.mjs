import test from "node:test";
import assert from "node:assert/strict";
import { validateFrontmatter, REQUIRED_FIELDS } from "../lint.mjs";

const TOPICS = ["claude-code", "models"];
const ok = {
  title: "Hooks",
  summary: "What hooks are and when they fire.",
  topic: "claude-code",
  verified: "2026-09-16",
  applies_to: { "claude-code": ">=2.0" },
  sources: ["https://example.invalid/docs"],
  related: [],
};

test("accepts a complete front-matter block", () => {
  assert.deepEqual(validateFrontmatter(ok, TOPICS), []);
});

test("reports every missing required field", () => {
  const issues = validateFrontmatter({ title: "x" }, TOPICS);
  const missing = issues.filter((i) => i.rule === "frontmatter-required");
  assert.equal(missing.length, REQUIRED_FIELDS.length - 1);
});

test("rejects a topic outside the taxonomy", () => {
  const issues = validateFrontmatter({ ...ok, topic: "astrology" }, TOPICS);
  assert.equal(
    issues.some((i) => i.rule === "frontmatter-topic"),
    true,
  );
});

test("rejects a verified date that is not YYYY-MM-DD", () => {
  const issues = validateFrontmatter(
    { ...ok, verified: "September 2026" },
    TOPICS,
  );
  assert.equal(
    issues.some((i) => i.rule === "frontmatter-date"),
    true,
  );
});

test("rejects a volatility field on a page", () => {
  const issues = validateFrontmatter({ ...ok, volatility: "high" }, TOPICS);
  assert.equal(
    issues.some((i) => i.rule === "frontmatter-derived-volatility"),
    true,
  );
});

test("reports entirely missing front-matter", () => {
  const issues = validateFrontmatter(null, TOPICS);
  assert.equal(issues.length, 1);
  assert.equal(issues[0].rule, "frontmatter-missing");
});

// Final review (I3): a pattern-valid but impossible date is rejected.
test("rejects a verified date that matches YYYY-MM-DD but does not exist", () => {
  for (const verified of ["2026-13-45", "2026-02-30"]) {
    const issues = validateFrontmatter({ ...ok, verified }, TOPICS);
    assert.equal(
      issues.some((i) => i.rule === "frontmatter-date"),
      true,
      verified,
    );
  }
});

test("accepts a leap-day verified date", () => {
  assert.deepEqual(validateFrontmatter({ ...ok, verified: "2028-02-29" }, TOPICS), []);
});
