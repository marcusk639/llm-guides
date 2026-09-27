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
