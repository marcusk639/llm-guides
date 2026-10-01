// tools/corpus/refresh-stamp.mjs
// Single-line surgical edits, never a YAML round trip. Dumping data/*.yaml
// would strip the contract-required comments at the top of data/models.yaml and
// data/models-other.yaml and rewrite every line, so two units editing the same
// file would conflict on every concurrent run. Record-scoped line edits are
// disjoint by construction and git auto-merges them.
import { RefreshError } from "./refresh-units.mjs";

// Three capture groups so the body can be rebuilt byte-exactly: the opening
// fence, the body without its trailing newline, and the closing fence. Mirrors
// frontmatter.mjs's FM pattern.
const FRONTMATTER = /^(---\r?\n)([\s\S]*?)(\r?\n---[ \t]*\r?\n?)/;

function escapeKey(key) {
  return key.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

// A record block runs from its own `- key:` line to the next one, or EOF. The
// key is anchored to end of line, so `anthropic.models.opus-5` cannot match
// inside `anthropic.models.opus-5-preview`.
export function recordBlockRange(yamlText, key) {
  const lines = yamlText.split("\n");
  const open = new RegExp(
    `^\\s*-\\s+key:\\s*(["']?)${escapeKey(key)}\\1\\s*$`,
  );
  const anyOpen = /^\s*-\s+key:\s/;
  let start = -1;
  for (let i = 0; i < lines.length; i++) {
    if (open.test(lines[i])) {
      start = i;
      break;
    }
  }
  if (start === -1) return null;
  let end = lines.length;
  for (let i = start + 1; i < lines.length; i++) {
    if (anyOpen.test(lines[i])) {
      end = i;
      break;
    }
  }
  return { lines, start, end };
}

// The quote character is captured and re-emitted, so a quoted date stays quoted
// and an unquoted one stays unquoted: the corpus uses both (records quote,
// guides do not) and rewriting the style would widen every diff.
const RECORD_DATE = /^(\s*verified:\s*)(["']?)([^"'\s]*)\2([ \t]*)$/;

export function setRecordVerified(yamlText, key, date) {
  const range = recordBlockRange(yamlText, key);
  if (range === null)
    throw new RefreshError(
      "refresh-record-not-found",
      `no record with key ${key} in this data file`,
    );
  const { lines, start, end } = range;
  for (let i = start; i < end; i++) {
    const m = RECORD_DATE.exec(lines[i]);
    if (m === null) continue;
    const previous = m[3];
    lines[i] = `${m[1]}${m[2]}${date}${m[2]}${m[4]}`;
    return { text: lines.join("\n"), previous };
  }
  throw new RefreshError(
    "refresh-record-verified-missing",
    `record ${key} has no verified: line to bump; skipping it would leave a stale record date under a freshly dated page`,
  );
}

function frontmatterParts(pageText) {
  const m = FRONTMATTER.exec(pageText);
  if (m === null)
    throw new RefreshError(
      "refresh-frontmatter-missing",
      "page has no --- front-matter block",
    );
  return {
    open: m[1],
    body: m[2],
    close: m[3],
    rest: pageText.slice(m[0].length),
  };
}

function rebuild(fm, lines) {
  return fm.open + lines.join("\n") + fm.close + fm.rest;
}

const PAGE_DATE = /^(verified:\s*)(["']?)([^"'\s]*)\2([ \t]*)$/;

export function setPageVerified(pageText, date) {
  const fm = frontmatterParts(pageText);
  const lines = fm.body.split("\n");
  for (let i = 0; i < lines.length; i++) {
    const m = PAGE_DATE.exec(lines[i]);
    if (m === null) continue;
    const previous = m[3];
    lines[i] = `${m[1]}${m[2]}${date}${m[2]}${m[4]}`;
    return { text: rebuild(fm, lines), previous };
  }
  throw new RefreshError(
    "refresh-page-verified-missing",
    "page front-matter has no verified: line",
  );
}

// Four captures, exactly like PAGE_DATE: the label and its spacing, the quote
// character, the value, and any trailing whitespace. The replace path re-emits
// all of them, so rewriting a research: line preserves bytes and not merely the
// value — which is what makes --revert byte-exact on a page's second refresh.
const PAGE_RESEARCH = /^(research:\s*)(["']?)([^"'\s]*)\2([ \t]*)$/;

// Never touches `seed:`. It is permanent provenance — "a document authored
// before the pipeline existed" — not a status a refresh clears.
export function setPageResearch(pageText, researchPath) {
  const fm = frontmatterParts(pageText);
  const lines = fm.body.split("\n");
  for (let i = 0; i < lines.length; i++) {
    const m = PAGE_RESEARCH.exec(lines[i]);
    if (m === null) continue;
    const previous = m[3];
    lines[i] = `${m[1]}${m[2]}${researchPath}${m[2]}${m[4]}`;
    return { text: rebuild(fm, lines), added: false, previous };
  }
  const seedAt = lines.findIndex((l) => /^seed:\s/.test(l));
  const verifiedAt = lines.findIndex((l) => /^verified:\s/.test(l));
  const at =
    seedAt !== -1 ? seedAt : verifiedAt !== -1 ? verifiedAt + 1 : lines.length;
  lines.splice(at, 0, `research: ${researchPath}`);
  return { text: rebuild(fm, lines), added: true, previous: null };
}

export function removePageResearch(pageText) {
  const fm = frontmatterParts(pageText);
  const lines = fm.body.split("\n");
  const at = lines.findIndex((l) => PAGE_RESEARCH.test(l));
  if (at === -1) return { text: pageText, removed: false };
  lines.splice(at, 1);
  return { text: rebuild(fm, lines), removed: true };
}
