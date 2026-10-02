// tools/corpus/refresh-stamp.mjs
// Single-line surgical edits, never a YAML round trip. Dumping data/*.yaml
// would strip the contract-required comments at the top of data/models.yaml and
// data/models-other.yaml and rewrite every line, so two units editing the same
// file would conflict on every concurrent run. Record-scoped line edits are
// disjoint by construction and git auto-merges them.
import { RefreshError } from "./refresh-units.mjs";
import fs from "node:fs";
import nodePath from "node:path";
import { parseFrontmatter } from "./frontmatter.mjs";
import { validateArtifact, withReceipt, withRevertMark } from "./refresh-artifact.mjs";

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

// All-or-nothing. Every new file body is computed in memory first; only when
// every edit has succeeded does anything reach disk, and the artifact's receipt
// is the last write. A partial stamp is the one outcome that would leave the
// corpus asserting freshness it cannot revert.
export function stampUnit(
  root,
  artifact,
  { today = new Date().toISOString().slice(0, 10) } = {},
) {
  const issues = validateArtifact(artifact);
  if (issues.length > 0)
    throw new RefreshError(
      issues[0].rule,
      `artifact is not stampable: ${issues[0].message}`,
    );
  if (artifact.verdict === "blocked")
    throw new RefreshError(
      "refresh-blocked",
      "verdict is blocked; a refresh that could not reach a source must not bump verified, so nothing was written",
    );
  if (artifact.stamped != null)
    throw new RefreshError(
      "refresh-already-stamped",
      "artifact already carries a stamped: receipt; revert it before stamping again",
    );
  // checkResearchRequired only checks research: is a non-empty string, and no
  // research-path-unresolved rule exists, so this is the only place a path that
  // does not resolve can be refused.
  if (!fs.existsSync(nodePath.join(root, artifact.path)))
    throw new RefreshError(
      "refresh-research-unresolved",
      `artifact path ${artifact.path} does not exist under ${root}; research: must point at a file that resolves`,
    );

  const unitKeys = new Set(artifact.unit_keys);
  const pending = new Map();
  const readPending = (rel) =>
    pending.has(rel)
      ? pending.get(rel)
      : fs.readFileSync(nodePath.join(root, rel), "utf8");

  const recordReceipts = [];
  for (const entry of artifact.records) {
    if (!unitKeys.has(entry.key))
      throw new RefreshError(
        "refresh-record-out-of-unit",
        `record ${entry.key} is not in unit_keys; a unit must not widen its footprint into another unit's records`,
      );
    // The record's date is the date THIS entry was read, not today: two sources
    // in one unit can legitimately be read on different days, and using the
    // entry's own date also makes the idempotence proof time-independent.
    const { text, previous } = setRecordVerified(
      readPending(entry.file),
      entry.key,
      entry.read,
    );
    pending.set(entry.file, text);
    recordReceipts.push({
      key: entry.key,
      file: entry.file,
      previous_verified: previous,
      new_verified: entry.read,
    });
  }

  const pageReceipts = [];
  // --key is surgical: "one record repriced, no page-wide sweep". A page's
  // `verified` asserts its WHOLE section 6 was worked — every record, every
  // identifier tied to applies_to, every value the lint cannot guard, every
  // dated study — and a key-scoped run worked one item on that list. So a
  // key-scoped artifact stamps records only, and the receipt's empty `pages`
  // list is what makes revertUnit correct here without a second branch.
  if (artifact.key_scoped === true) {
    if (artifact.unit_keys.length !== 1)
      throw new RefreshError(
        "refresh-key-scope-widened",
        `a key_scoped artifact must carry exactly one key, got ${artifact.unit_keys.length}; --key narrows a unit to one record, so this artifact was widened by hand after --skeleton`,
      );
  } else {
    for (const rel of artifact.unit) {
      const text = readPending(rel);
      const { data } = parseFrontmatter(text);
      // A deprecated page belongs to the unit — its records are shared and were
      // fetched once for the whole unit — but it could not be refreshed, so it
      // never gets a fresh date or a research: field.
      if (data?.status === "deprecated") continue;
      const bumped = setPageVerified(text, artifact.fetched);
      const set = setPageResearch(bumped.text, artifact.path);
      pending.set(rel, set.text);
      pageReceipts.push({
        path: rel,
        previous_verified: bumped.previous,
        research_added: set.added,
        previous_research: set.previous,
      });
    }
  }

  const receipt = { at: today, pages: pageReceipts, records: recordReceipts };
  pending.set(
    artifact.path,
    withReceipt(readPending(artifact.path), receipt),
  );
  for (const [rel, text] of pending)
    fs.writeFileSync(nodePath.join(root, rel), text);
  return { receipt, written: [...pending.keys()].sort() };
}

// The undo a verify-agent block needs, with no git involved: the receipt alone
// says what was written and what it replaced, so a blocked branch can be made
// harmless to merge before the pull request is opened.
export function revertUnit(
  root,
  artifact,
  { today = new Date().toISOString().slice(0, 10) } = {},
) {
  const receipt = artifact.stamped;
  if (receipt == null)
    throw new RefreshError(
      "refresh-no-receipt",
      "artifact carries no stamped: receipt, so there is nothing to revert",
    );
  const pending = new Map();
  const readPending = (rel) =>
    pending.has(rel)
      ? pending.get(rel)
      : fs.readFileSync(nodePath.join(root, rel), "utf8");

  for (const r of receipt.records ?? []) {
    const probe = setRecordVerified(
      readPending(r.file),
      r.key,
      r.previous_verified,
    );
    // `previous` is what was on disk a moment ago. If it is not the date this
    // receipt wrote, another unit has landed on the same file and reverting
    // would clobber its work.
    if (probe.previous !== r.new_verified)
      throw new RefreshError(
        "refresh-revert-drift",
        `record ${r.key} in ${r.file} now reads verified ${probe.previous}, not the ${r.new_verified} this receipt wrote; another unit has already changed it`,
      );
    pending.set(r.file, probe.text);
  }

  for (const p of receipt.pages ?? []) {
    const bumped = setPageVerified(readPending(p.path), p.previous_verified);
    if (bumped.previous !== artifact.fetched)
      throw new RefreshError(
        "refresh-revert-drift",
        `${p.path} now reads verified ${bumped.previous}, not the ${artifact.fetched} this receipt wrote`,
      );
    let out = bumped.text;
    if (p.research_added) out = removePageResearch(out).text;
    else if (p.previous_research != null)
      out = setPageResearch(out, p.previous_research).text;
    pending.set(p.path, out);
  }

  pending.set(
    artifact.path,
    withRevertMark(readPending(artifact.path), today),
  );
  for (const [rel, text] of pending)
    fs.writeFileSync(nodePath.join(root, rel), text);
  return { restored: [...pending.keys()].sort() };
}

