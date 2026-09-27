import test from "node:test";
import assert from "node:assert/strict";
import {
  checkAppliesToShape,
  checkRelatedPaths,
  checkResearchRequired,
  checkTemplateSections,
  numberedSections,
  checkEvidenceLabels,
  evidenceSegments,
  VALID_LABELS,
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
  const issues = checkTemplateSections(text);
  assert.equal(issues.length, 1);
  assert.equal(issues[0].rule, "template-sections");
  assert.match(issues[0].message, /"## 3\." appears after "## 4\."/);
});

test("reports a duplicated section number", () => {
  const text = eightSections((xs) => [...xs, "## 8. Sources again"]);
  const issues = checkTemplateSections(text);
  assert.equal(issues.length, 1);
  assert.equal(issues[0].rule, "template-sections");
  assert.match(issues[0].message, /"## 8\." is duplicated/);
});

test("reports a stray out-of-range heading once, as an extras issue, not as an ordering violation", () => {
  const text = eightSections((xs) => {
    const out = [...xs];
    out.splice(2, 0, "## 9. Not a real section");
    return out;
  });
  const issues = checkTemplateSections(text);
  assert.equal(issues.length, 1);
  assert.equal(issues[0].rule, "template-sections");
  assert.match(issues[0].message, /unexpected numbered section "## 9\."/);
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

test("exports exactly the three label spellings", () => {
  assert.deepEqual([...VALID_LABELS], ["Verified", "Documented", "Plausible"]);
});

test("accepts a single-label Evidence line", () => {
  const text =
    "Evidence: **Documented** — [caching](https://x.invalid), read 2026-09-16.\n";
  assert.deepEqual(checkEvidenceLabels(text), []);
});

test("accepts a mixed-label Evidence line", () => {
  const text =
    "Evidence: the setup is **Documented** ([ref](https://x.invalid)); the failure shapes are **Plausible**.\n";
  assert.deepEqual(checkEvidenceLabels(text), []);
});

test("ignores bolded Verified in ordinary prose", () => {
  const text =
    "Nothing on this page is **Verified**: no proof in this repository backs these claims.\n";
  assert.deepEqual(checkEvidenceLabels(text), []);
});

test("reports a miscased label on an Evidence line", () => {
  const text = "Evidence: **documented** — [ref](https://x.invalid).\n";
  const issues = checkEvidenceLabels(text);
  assert.equal(issues.length, 1);
  assert.equal(issues[0].rule, "evidence-label-invalid");
  assert.match(issues[0].message, /documented/);
});

test("reports an Evidence line whose only bold text is not a label", () => {
  const text = "Evidence: **the vendor changelog** says so.\n";
  const issues = checkEvidenceLabels(text);
  assert.equal(issues.length, 1);
  assert.match(issues[0].message, /no evidence label/);
});

test("reports an Evidence line with no bold text at all", () => {
  assert.equal(checkEvidenceLabels("Evidence: it seemed right.\n").length, 1);
});

test("reports the line number of the offending Evidence line", () => {
  const text = "intro\n\nEvidence: **plausible** — a guess.\n";
  assert.equal(checkEvidenceLabels(text)[0].line, 3);
});

test("ignores an Evidence line inside a fenced code block", () => {
  const text = "```\nEvidence: **documented** — sample.\n```\n";
  assert.deepEqual(checkEvidenceLabels(text), []);
});

test("accepts a label that follows a trailing caveat on the same line", () => {
  // The shape at guides/claude-code/hooks.md:158.
  const text =
    "One caveat: `xargs` splits on whitespace. Evidence: **Plausible** — standard behavior.\n";
  assert.deepEqual(checkEvidenceLabels(text), []);
});

test("reports a miscased label that follows a trailing caveat", () => {
  const text = "A caveat holds here. Evidence: **plausible** — a guess.\n";
  const issues = checkEvidenceLabels(text);
  assert.equal(issues.length, 1);
  assert.equal(issues[0].line, 1);
});

test("evidenceSegments finds both column-0 and mid-line labels", () => {
  const text = "Evidence: **Documented** — a.\n\nprose. Evidence: **Plausible** — b.\n";
  assert.deepEqual(
    evidenceSegments(text).map((s) => s.line),
    [1, 3],
  );
});

test("a bolded label in ordinary prose with no Evidence token is ignored", () => {
  assert.deepEqual(
    checkEvidenceLabels("Nothing here is **Verified**, and that is honest.\n"),
    [],
  );
});

test("checkTemplateSections reports one issue, naming the unterminated fence, when the file ends inside an open fence instead of the usual missing-section artifacts", () => {
  const text =
    "## 1. Covers\n\n```\nsome code that never closes\n## 2. Not real, still inside the fence\n";
  const issues = checkTemplateSections(text);
  assert.equal(issues.length, 1);
  assert.equal(issues[0].rule, "template-sections");
  assert.match(issues[0].message, /unterminated code fence/);
});

test("checkEvidenceLabels reports one issue, naming the unterminated fence, when the file ends inside an open fence instead of going silent", () => {
  const text = "```\nEvidence: **documented** — inside an unterminated fence.\n";
  const issues = checkEvidenceLabels(text);
  assert.equal(issues.length, 1);
  assert.equal(issues[0].rule, "evidence-label-invalid");
  assert.match(issues[0].message, /unterminated code fence/);
});
