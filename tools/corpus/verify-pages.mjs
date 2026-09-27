// tools/corpus/verify-pages.mjs
// Page-level checks the contract assigns to the Verify stage. Every rule
// tolerates null front-matter: a page with none is already reported by lint's
// frontmatter-missing, and these rules must not throw on top of it.

import { findBlocks } from "./markers.mjs";

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

// Shared line iterator: walks `text` line by line, skipping any line inside a
// fenced code block (``` or ~~~), and yields the non-fenced lines with their
// 1-based line numbers. Also reports whether the file ended still inside an
// open fence — an unbalanced fence otherwise inverts the toggle for every
// following line and silently swallows them, which corrupts both heading
// detection and Evidence-line detection without either check noticing.
function nonFencedLines(text) {
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
    out.push({ text: line, lineNo: i + 1 });
  }
  return { lines: out, unterminatedFence: fenced };
}

// Lines outside fenced code blocks only: a guide may quote the template inside
// a fence, and that is documentation, not structure.
export function numberedSections(text) {
  const out = [];
  for (const { text: line, lineNo } of nonFencedLines(text).lines) {
    const m = NUMBERED_H2.exec(line);
    if (m) out.push({ n: Number(m[1]), line: lineNo, title: m[2].trim() });
  }
  return out;
}

export function checkTemplateSections(text) {
  if (nonFencedLines(text).unterminatedFence) {
    return [
      {
        rule: "template-sections",
        message:
          "file ends inside an unterminated code fence, so heading detection is unreliable",
      },
    ];
  }
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
  // Ordering and duplicates are checked only over in-range headings: an
  // out-of-range heading (e.g. a stray "## 9.") is already reported once by
  // the extras check above, and walking the raw `found` array here would
  // additionally misattribute its position as a neighboring section's
  // ordering violation.
  const inRange = found.filter((s) => s.n >= 1 && s.n <= EXPECTED_SECTIONS);
  for (let i = 1; i < inRange.length; i++) {
    if (inRange[i].n === inRange[i - 1].n) {
      issues.push({
        rule: "template-sections",
        message: `template section "## ${inRange[i].n}." is duplicated`,
        line: inRange[i].line,
      });
    } else if (inRange[i].n < inRange[i - 1].n) {
      issues.push({
        rule: "template-sections",
        message: `template section "## ${inRange[i].n}." appears after "## ${inRange[i - 1].n}."; sections must run 1 to ${EXPECTED_SECTIONS} in order`,
        line: inRange[i].line,
      });
    }
  }
  return issues;
}

export const VALID_LABELS = Object.freeze([
  "Verified",
  "Documented",
  "Plausible",
]);
// Module-private: no test imports this, so it does not need to be public
// surface. VALID_LABELS is exported because a test does import it.
const EVIDENCE_TOKEN = "Evidence:";
const LABEL_LOOKUP = new Map(VALID_LABELS.map((l) => [l.toLowerCase(), l]));
const BOLD = /\*\*([^*]+)\*\*/g;

// Every line carrying the Evidence token, scanned from the token to end of
// line. Anchoring at column 0 would miss a label that follows a trailing
// caveat in the same paragraph, which two current pages do. Prose elsewhere is
// untouched: every guide discusses **Verified** while disclaiming it, and
// scanning whole bodies would fire on all five.
export function evidenceSegments(text) {
  const out = [];
  for (const { text: line, lineNo } of nonFencedLines(text).lines) {
    const at = line.indexOf(EVIDENCE_TOKEN);
    if (at === -1) continue;
    out.push({ segment: line.slice(at), line: lineNo });
  }
  return out;
}

export function checkEvidenceLabels(text) {
  if (nonFencedLines(text).unterminatedFence) {
    return [
      {
        rule: "evidence-label-invalid",
        message:
          "file ends inside an unterminated code fence, so evidence-label detection is unreliable",
      },
    ];
  }
  const issues = [];
  for (const { segment, line: lineNo } of evidenceSegments(text)) {
    const i = lineNo - 1;
    // Counts any bold text that names a label, correctly cased or not — a
    // miscased label ("**documented**") is still a label, so it must not also
    // trigger the "no evidence label" fallback below. That fallback exists
    // only for a line with no label-shaped bold text at all.
    let found = 0;
    for (const m of segment.matchAll(BOLD)) {
      const bold = m[1].trim();
      const canonical = LABEL_LOOKUP.get(bold.toLowerCase());
      if (canonical === undefined) continue; // bolding something else is fine
      found++;
      if (canonical !== bold) {
        issues.push({
          rule: "evidence-label-invalid",
          message: `evidence label ${JSON.stringify(bold)} must be spelled exactly ${JSON.stringify(canonical)}`,
          line: i + 1,
        });
      }
    }
    if (found === 0) {
      issues.push({
        rule: "evidence-label-invalid",
        message: `Evidence line has no evidence label; it must bold at least one of ${VALID_LABELS.join(", ")}`,
        line: i + 1,
      });
    }
  }
  return issues;
}

// Deliberately fence-BLIND, unlike sectionSixText and evidenceSegments ten
// lines away: findBlocks does not know about fences, and the contract is
// explicit that a marker inside a fence is a real marker that render rewrites.
// Agreeing with render matters more than agreeing with the neighbouring rules.
//
// Must agree with render's selection exactly, including that a corpus:table
// with no tag selects the whole corpus
// — which is why omitting a tag makes a page as volatile as the most volatile
// record anywhere.
export function referencedRecordKeys(text, records) {
  const keys = new Set();
  for (const block of findBlocks(text)) {
    if (block.unterminated) continue;
    if (block.kind === "data") {
      if (block.attrs.key) keys.add(block.attrs.key);
      continue;
    }
    if (block.kind !== "table") continue;
    const tag = block.attrs.tag;
    for (const r of records) {
      if (tag == null || [].concat(r.tags ?? []).includes(tag)) keys.add(r.key);
    }
  }
  return keys;
}

// Section 6 runs from its own heading to the next numbered ## heading.
export function sectionSixText(text) {
  const sections = numberedSections(text);
  const six = sections.find((s) => s.n === 6);
  if (!six) return null;
  const after = sections.find((s) => s.line > six.line);
  const lines = text.split("\n");
  return lines
    .slice(six.line, after ? after.line - 1 : lines.length)
    .join("\n");
}

// Loose reading: the key must appear SOMEWHERE in section 6, not as its own
// table row. comparison.md deliberately collapses three shared Claude records
// into one row; that documents a real relationship and must stay legal.
export function checkRotsTable(text, records) {
  const referenced = referencedRecordKeys(text, records);
  if (referenced.size === 0) return [];
  const six = sectionSixText(text);
  if (six === null) {
    return [
      {
        rule: "rots-table-incomplete",
        message: `page references ${referenced.size} record(s) but has no "## 6." section; refresh executes section 6, so there is nothing for it to work`,
      },
    ];
  }
  const missing = [...referenced].filter((k) => !six.includes(k)).sort();
  if (missing.length === 0) return [];
  return [
    {
      rule: "rots-table-incomplete",
      message: `section 6 does not mention referenced record(s): ${missing.join(", ")}; refresh would silently skip them`,
    },
  ];
}
