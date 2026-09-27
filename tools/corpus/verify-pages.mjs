// tools/corpus/verify-pages.mjs
// Page-level checks the contract assigns to the Verify stage. Every rule
// tolerates null front-matter: a page with none is already reported by lint's
// frontmatter-missing, and these rules must not throw on top of it.

// `typeof data !== "object"` rather than a null check: front-matter that is a
// bare string or number parses to a non-object, and `"applies_to" in data`
// throws a TypeError on those.
export function checkAppliesToShape(data) {
  if (data == null || typeof data !== "object") return [];
  if (!("applies_to" in data)) return [];
  const v = data.applies_to;
  const bad = !Array.isArray(v)
    ? `must be a list of strings, got ${v === null ? "null" : typeof v}`
    : v.length === 0
      ? "must not be empty; name the product or scope, its version, and the date the docs were read"
      : v.some((e) => typeof e !== "string")
        ? "must contain only strings"
        : null;
  return bad
    ? [{ rule: "frontmatter-applies-to-shape", message: `applies_to ${bad}` }]
    : [];
}

// `related` entries are repo-root-relative (`guides/context/context-management.md`),
// unlike the page-relative links in the same files' prose (`../../CLAUDE.md`).
// Resolve against the repo root, not the page's directory.
export function checkRelatedPaths(data, exists) {
  if (data == null || typeof data !== "object") return [];
  if (!Array.isArray(data.related)) return [];
  const issues = [];
  for (const entry of data.related) {
    if (typeof entry !== "string") {
      issues.push({
        rule: "related-path-unresolved",
        message: `related entry must be a repo path string, got ${JSON.stringify(entry)}`,
      });
      continue;
    }
    if (exists(entry)) continue;
    issues.push({
      rule: "related-path-unresolved",
      message: `related path does not exist in the repository: ${entry}`,
    });
  }
  return issues;
}

// seed: true is permanent provenance — a page authored before the pipeline
// existed — so seeds are exempt forever. The rule's real subject is
// pipeline-authored pages, which have a research artifact by construction.
export function checkResearchRequired(data) {
  if (data == null || typeof data !== "object") return [];
  if (data.seed === true || data.status === "deprecated") return [];
  if (typeof data.research === "string" && data.research.trim() !== "")
    return [];
  return [
    {
      rule: "research-required",
      message:
        "page is not a seed and names no research artifact; every pipeline-authored page must point at its grounding under research/",
    },
  ];
}

const EXPECTED_SECTIONS = 8;
const NUMBERED_H2 = /^##\s+(\d+)\.\s*(.*)$/;

// Lines outside fenced code blocks only: a guide may quote the template inside
// a fence, and that is documentation, not structure.
export function numberedSections(text) {
  const out = [];
  let fenced = false;
  const lines = text.split("\n");
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (/^\s*(```|~~~)/.test(line)) {
      fenced = !fenced;
      continue;
    }
    if (fenced) continue;
    const m = NUMBERED_H2.exec(line);
    if (m) out.push({ n: Number(m[1]), line: i + 1, title: m[2].trim() });
  }
  return out;
}

export function checkTemplateSections(text) {
  const found = numberedSections(text);
  const issues = [];
  const seen = found.map((s) => s.n);
  for (let n = 1; n <= EXPECTED_SECTIONS; n++) {
    if (!seen.includes(n)) {
      issues.push({
        rule: "template-sections",
        message: `missing template section: expected a "## ${n}." heading`,
      });
    }
  }
  const extras = found.filter((s) => s.n < 1 || s.n > EXPECTED_SECTIONS);
  for (const s of extras) {
    issues.push({
      rule: "template-sections",
      message: `unexpected numbered section "## ${s.n}."; the template has ${EXPECTED_SECTIONS} sections`,
      line: s.line,
    });
  }
  for (let i = 1; i < found.length; i++) {
    if (found[i].n <= found[i - 1].n) {
      issues.push({
        rule: "template-sections",
        message: `template section "## ${found[i].n}." appears after "## ${found[i - 1].n}."; sections must run 1 to ${EXPECTED_SECTIONS} in order`,
        line: found[i].line,
      });
    }
  }
  return issues;
}
