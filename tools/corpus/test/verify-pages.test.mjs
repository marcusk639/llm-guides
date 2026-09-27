import test from "node:test";
import assert from "node:assert/strict";
import {
  checkAppliesToShape,
  checkRelatedPaths,
  checkResearchRequired,
  checkTemplateSections,
  numberedSections,
} from "../verify-pages.mjs";

const fm = (extra = {}) => ({
  title: "Claude models",
  summary: "Model ids, prices and limits.",
  topic: "models",
  verified: "2026-09-16",
  applies_to: ["Anthropic API, read on 2026-09-16"],
  sources: ["https://example.invalid/docs"],
  related: [],
  ...extra,
});

test("accepts applies_to as a non-empty list of strings", () => {
  assert.deepEqual(checkAppliesToShape(fm()), []);
});

test("rejects applies_to given as an object", () => {
  const issues = checkAppliesToShape(
    fm({ applies_to: { "claude-code": ">=2.0" } }),
  );
  assert.equal(issues.length, 1);
  assert.equal(issues[0].rule, "frontmatter-applies-to-shape");
});

test("rejects an empty applies_to list", () => {
  assert.equal(checkAppliesToShape(fm({ applies_to: [] })).length, 1);
});

test("rejects a non-string entry inside applies_to", () => {
  assert.equal(checkAppliesToShape(fm({ applies_to: ["ok", 42] })).length, 1);
});

test("stays silent when applies_to is absent — that is frontmatter-required's job", () => {
  const d = fm();
  delete d.applies_to;
  assert.deepEqual(checkAppliesToShape(d), []);
});

test("returns no issues rather than throwing on null front-matter", () => {
  assert.deepEqual(checkAppliesToShape(null), []);
  assert.deepEqual(
    checkRelatedPaths(null, () => true),
    [],
  );
  assert.deepEqual(checkResearchRequired(null), []);
});

test("returns no issues rather than throwing on non-object front-matter", () => {
  // parseFrontmatter can yield a string or a number for a malformed block, and
  // `"applies_to" in data` throws a TypeError on those.
  for (const bad of ["just a string", 42, true]) {
    assert.deepEqual(checkAppliesToShape(bad), []);
    assert.deepEqual(
      checkRelatedPaths(bad, () => true),
      [],
    );
    assert.deepEqual(checkResearchRequired(bad), []);
  }
});

test("accepts an empty related list", () => {
  assert.deepEqual(
    checkRelatedPaths(fm({ related: [] }), () => false),
    [],
  );
});

test("accepts related paths that resolve", () => {
  assert.deepEqual(
    checkRelatedPaths(
      fm({ related: ["guides/models/comparison.md"] }),
      () => true,
    ),
    [],
  );
});

test("reports a related path that does not resolve", () => {
  const issues = checkRelatedPaths(
    fm({ related: ["guides/models/ghost.md"] }),
    () => false,
  );
  assert.equal(issues.length, 1);
  assert.equal(issues[0].rule, "related-path-unresolved");
  assert.match(issues[0].message, /ghost\.md/);
});

test("reports a non-string related entry without throwing", () => {
  const issues = checkRelatedPaths(fm({ related: [42] }), () => true);
  assert.equal(issues.length, 1);
  assert.equal(issues[0].rule, "related-path-unresolved");
});

test("accepts a seed page with no research artifact", () => {
  assert.deepEqual(checkResearchRequired(fm({ seed: true })), []);
});

test("accepts a non-seed page that has a research artifact", () => {
  assert.deepEqual(
    checkResearchRequired(fm({ research: "research/models/2026-10-09-x.md" })),
    [],
  );
});

test("reports a non-seed page with no research artifact", () => {
  const issues = checkResearchRequired(fm());
  assert.equal(issues.length, 1);
  assert.equal(issues[0].rule, "research-required");
});

test("treats seed: false as not a seed", () => {
  assert.equal(checkResearchRequired(fm({ seed: false })).length, 1);
});

test("exempts a deprecated page from the research requirement", () => {
  assert.deepEqual(checkResearchRequired(fm({ status: "deprecated" })), []);
});

const eightSections = (mutate = (xs) => xs) =>
  mutate([
    "## 1. What this covers / who it's for",
    "## 2. The 60-second version",
    "## 3. How it actually works",
    "## 4. Patterns that hold up",
    "## 5. Edge cases and failure modes",
    "## 6. Where this rots",
    "## 7. Proofs",
    "## 8. Sources",
  ]).join("\n\nbody text\n\n");

test("accepts the eight numbered headings in order", () => {
  assert.deepEqual(checkTemplateSections(eightSections()), []);
});

test("ignores ### subheadings, numbered or not", () => {
  const text = eightSections() + "\n\n### 4.1 A subsection\n\n### Unnumbered\n";
  assert.deepEqual(checkTemplateSections(text), []);
});

test("ignores a numbered heading inside a fenced code block", () => {
  const text =
    eightSections() + "\n\n```markdown\n## 9. Not a real section\n```\n";
  assert.deepEqual(checkTemplateSections(text), []);
});

test("reports a missing section", () => {
  const text = eightSections((xs) => xs.filter((h) => !h.startsWith("## 7.")));
  const issues = checkTemplateSections(text);
  assert.equal(issues.length, 1);
  assert.equal(issues[0].rule, "template-sections");
  assert.match(issues[0].message, /7/);
});

test("reports sections in the wrong order", () => {
  const text = eightSections((xs) => {
    const out = [...xs];
    [out[2], out[3]] = [out[3], out[2]];
    return out;
  });
  assert.equal(
    checkTemplateSections(text).some((i) => i.rule === "template-sections"),
    true,
  );
});

test("reports a duplicated section number", () => {
  const text = eightSections((xs) => [...xs, "## 8. Sources again"]);
  assert.equal(checkTemplateSections(text).length >= 1, true);
});

test("numberedSections reports the line each heading sits on", () => {
  const found = numberedSections("intro\n\n## 1. First\n\n## 2. Second\n");
  assert.deepEqual(
    found.map((s) => [s.n, s.line]),
    [
      [1, 3],
      [2, 5],
    ],
  );
});
