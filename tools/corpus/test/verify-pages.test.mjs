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
  referencedRecordKeys,
  checkRotsTable,
  sectionSixText,
  checkKnownLintGapForm,
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

const RECORDS = [
  { key: "a.one", value: "1", tags: ["alpha"], file: "a.yaml" },
  { key: "a.two", value: "2", tags: ["alpha", "beta"], file: "a.yaml" },
  { key: "b.one", value: "3", tags: ["beta"], file: "b.yaml" },
  { key: "c.none", value: "4", file: "c.yaml" },
];

test("collects the key of a terminated corpus:data block", () => {
  const text = "<!-- corpus:data key=a.one -->1<!-- /corpus:data -->\n";
  assert.deepEqual([...referencedRecordKeys(text, RECORDS)], ["a.one"]);
});

test("collects every record a tagged corpus:table selects", () => {
  const text =
    "<!-- corpus:table fields=key,value tag=beta -->\n\n| x |\n\n<!-- /corpus:table -->\n";
  assert.deepEqual([...referencedRecordKeys(text, RECORDS)].sort(), [
    "a.two",
    "b.one",
  ]);
});

test("a table with no tag references every record in the corpus", () => {
  const text =
    "<!-- corpus:table fields=key,value -->\n\n| x |\n\n<!-- /corpus:table -->\n";
  assert.equal(referencedRecordKeys(text, RECORDS).size, RECORDS.length);
});

test("ignores an unterminated block", () => {
  const text =
    "<!-- corpus:data key=a.one -->\n<!-- corpus:data key=a.two -->x<!-- /corpus:data -->\n";
  const keys = referencedRecordKeys(text, RECORDS);
  assert.equal(keys.has("a.one"), false);
  assert.equal(keys.has("a.two"), true);
});

test("returns an empty set for a page with no marker blocks", () => {
  assert.equal(referencedRecordKeys("just prose\n", RECORDS).size, 0);
});

const withRots = (body) =>
  [
    "## 5. Edge cases and failure modes",
    "prose",
    "## 6. Where this rots",
    body,
    "## 7. Proofs",
    "None yet.",
  ].join("\n\n");

test("sectionSixText returns the body between section 6 and section 7", () => {
  const got = sectionSixText(withRots("the rot table"));
  assert.match(got, /the rot table/);
  assert.equal(/None yet/.test(got), false);
});

test("sectionSixText returns null when there is no section 6", () => {
  assert.equal(sectionSixText("## 1. Intro\n\nprose\n"), null);
});

test("accepts a page whose section 6 names every referenced record", () => {
  const text =
    "<!-- corpus:data key=a.one -->1<!-- /corpus:data -->\n\n" +
    withRots("| Claim | Record |\n| --- | --- |\n| x | `a.one` |");
  assert.deepEqual(checkRotsTable(text, RECORDS), []);
});

test("accepts several records collapsed into one row", () => {
  const text =
    "<!-- corpus:table fields=key,value tag=beta -->\n\n| x |\n\n<!-- /corpus:table -->\n\n" +
    withRots("| Claim | Record |\n| --- | --- |\n| rows | `a.two`, `b.one` |");
  assert.deepEqual(checkRotsTable(text, RECORDS), []);
});

test("reports a referenced record missing from section 6", () => {
  const text =
    "<!-- corpus:table fields=key,value tag=beta -->\n\n| x |\n\n<!-- /corpus:table -->\n\n" +
    withRots("| Claim | Record |\n| --- | --- |\n| rows | `a.two` |");
  const issues = checkRotsTable(text, RECORDS);
  assert.equal(issues.length, 1);
  assert.equal(issues[0].rule, "rots-table-incomplete");
  assert.match(issues[0].message, /b\.one/);
});

test("reports a page that references records but has no section 6 at all", () => {
  const text = "<!-- corpus:data key=a.one -->1<!-- /corpus:data -->\n";
  const issues = checkRotsTable(text, RECORDS);
  assert.equal(issues.length, 1);
  assert.match(issues[0].message, /no "## 6\." section/);
});

test("stays silent on a page that references no records", () => {
  assert.deepEqual(checkRotsTable(withRots("nothing rots here"), RECORDS), []);
});


test("accepts an ordinary angle-bracket destination with no space", () => {
  assert.deepEqual(
    checkKnownLintGapForm("see [x](<./guides/models/comparison.md>)\n"),
    [],
  );
});

test("accepts an ordinary link destination", () => {
  assert.deepEqual(
    checkKnownLintGapForm("see [x](https://example.invalid/a%20b)\n"),
    [],
  );
});

test("reports an angle-bracket destination containing a space", () => {
  const issues = checkKnownLintGapForm("see [x](<./text with 200000 in it>)\n");
  assert.equal(issues.length, 1);
  assert.equal(issues[0].rule, "known-lint-gap-form");
  assert.equal(issues[0].line, 1);
});

test("reports each occurrence on its own line", () => {
  const text = "a [x](<a b>)\n\nc [y](<c d>)\n";
  assert.deepEqual(
    checkKnownLintGapForm(text).map((i) => i.line),
    [1, 3],
  );
});

test("does not report a bare URL running into text — Form 2 is not automated", () => {
  assert.deepEqual(
    checkKnownLintGapForm("see https://example.invalid/x;200000 here\n"),
    [],
  );
});

// --- Fix round 1: harden known-lint-gap-form against a trailing link title
// and a backslash-escaped ">" inside the destination. The original regex
// required ">" to be followed immediately by ")" (so a title after the
// destination defeated it) and used a character class that stops at any
// literal ">" regardless of a preceding backslash (so an escaped ">" inside
// the destination defeated it too).

test("still accepts an ordinary angle-bracket destination with no space (round 1)", () => {
  assert.deepEqual(
    checkKnownLintGapForm("see [x](<./guides/models/comparison.md>)\n"),
    [],
  );
});

test("accepts an angle-bracket destination with a title but no space in the destination", () => {
  assert.deepEqual(checkKnownLintGapForm('see [x](<./file.md> "title")\n'), []);
});

test("still accepts an ordinary (non-angle-bracket) link destination (round 1)", () => {
  assert.deepEqual(
    checkKnownLintGapForm("see [x](https://example.invalid/a%20b)\n"),
    [],
  );
});

test("still ignores Form 2 — a bare URL running into text (round 1)", () => {
  assert.deepEqual(
    checkKnownLintGapForm("see https://example.invalid/x;200000 here\n"),
    [],
  );
});

test("ignores '](' with no angle bracket at all", () => {
  assert.deepEqual(checkKnownLintGapForm("call handlers[i](some-id) here\n"), []);
});

test("reports a space in the destination even with a double-quoted title", () => {
  const issues = checkKnownLintGapForm('see [x](<a b> "title")\n');
  assert.equal(issues.length, 1);
  assert.equal(issues[0].rule, "known-lint-gap-form");
  assert.equal(issues[0].line, 1);
});

test("reports a space in the destination even with a single-quoted title", () => {
  const issues = checkKnownLintGapForm("see [x](<a b> 'title')\n");
  assert.equal(issues.length, 1);
  assert.equal(issues[0].line, 1);
});

test("reports a space in the destination even with a parenthesised title", () => {
  const issues = checkKnownLintGapForm("see [x](<a b> (title))\n");
  assert.equal(issues.length, 1);
  assert.equal(issues[0].line, 1);
});

test("reports a backslash-escaped '>' inside the destination", () => {
  const issues = checkKnownLintGapForm("see [x](<a\\> b>)\n");
  assert.equal(issues.length, 1);
  assert.equal(issues[0].rule, "known-lint-gap-form");
  assert.equal(issues[0].line, 1);
});

test("reports a tab used instead of a space inside the destination", () => {
  const issues = checkKnownLintGapForm("see [x](<a\tb>)\n");
  assert.equal(issues.length, 1);
  assert.equal(issues[0].line, 1);
});

test("reports two spaced destinations on one line as two issues", () => {
  const text = "a [x](<a b>) and c [y](<c d>)\n";
  const issues = checkKnownLintGapForm(text);
  assert.equal(issues.length, 2);
  assert.deepEqual(
    issues.map((i) => i.line),
    [1, 1],
  );
});
