#!/usr/bin/env node
// tools/corpus/cli.mjs
import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
import yaml from "js-yaml";
import { parseFrontmatter } from "./frontmatter.mjs";
import { loadRecords, literalIndexForTopic, checkDataFiles } from "./data.mjs";
import {
  validateFrontmatter,
  findBareValues,
  checkExpiry,
  checkRecordLintConfig,
} from "./lint.mjs";
import {
  checkDuplicateKeys,
  checkRecordFields,
  checkLintLiteralsStale,
} from "./verify-records.mjs";
import {
  checkAppliesToShape,
  checkRelatedPaths,
  checkResearchRequired,
  checkTemplateSections,
  numberedSections,
  checkEvidenceLabels,
  evidenceSegments,
  checkRotsTable,
  referencedRecordKeys,
  checkKnownLintGapForm,
} from "./verify-pages.mjs";
import { renderText, normaliseForComparison } from "./render.mjs";
import { findBlocks } from "./markers.mjs";
import {
  derivePageVolatility,
  buildLedger,
  expiryFor,
  isValidIsoDate,
} from "./ledger.mjs";
import {
  RefreshError,
  resolveUnit,
  artifactPathFor,
} from "./refresh-units.mjs";
import { workOrder, renderWorkOrder } from "./refresh-order.mjs";
import {
  parseArtifact,
  renderArtifactSkeleton,
} from "./refresh-artifact.mjs";
import { stampUnit, revertUnit } from "./refresh-stamp.mjs";

function guidePaths(root) {
  const dir = path.join(root, "guides");
  if (!fs.existsSync(dir)) return [];
  const out = [];
  const walk = (d) => {
    for (const e of fs.readdirSync(d, { withFileTypes: true })) {
      const p = path.join(d, e.name);
      if (e.isDirectory()) walk(p);
      else if (e.name.endsWith(".md")) out.push(p);
    }
  };
  walk(dir);
  return out.sort();
}

function loadTopics(root) {
  const file = path.join(root, "meta", "taxonomy.yaml");
  if (!fs.existsSync(file)) return [];
  return (
    (
      yaml.load(fs.readFileSync(file, "utf8"), { schema: yaml.JSON_SCHEMA }) ??
      {}
    ).topics ?? []
  );
}

export function lintCorpus(
  root,
  today = new Date().toISOString().slice(0, 10),
) {
  const records = loadRecords(path.join(root, "data"));
  const indexByTopic = new Map();
  const indexFor = (topic) => {
    const k = typeof topic === "string" ? topic : null;
    if (!indexByTopic.has(k))
      indexByTopic.set(k, literalIndexForTopic(records, k));
    return indexByTopic.get(k);
  };
  const topics = loadTopics(root);
  const issues = [];
  for (const { file, ...i } of checkDataFiles(path.join(root, "data")))
    issues.push({ ...i, path: path.join("data", file) });
  for (const record of records) {
    for (const i of checkRecordLintConfig(record, topics))
      issues.push({ ...i, path: path.join("data", record.file) });
  }
  for (const file of guidePaths(root)) {
    const text = fs.readFileSync(file, "utf8");
    const { data } = parseFrontmatter(text);
    const rel = path.relative(root, file);
    for (const i of validateFrontmatter(data, topics))
      issues.push({ ...i, path: rel });
    for (const i of findBareValues(text, indexFor(data?.topic)))
      issues.push({ ...i, path: rel });
    for (const block of findBlocks(text)) {
      if (!block.unterminated) continue;
      const name = block.attrs.key ?? block.attrs.tag ?? "(no key/tag)";
      issues.push({
        rule: "marker-unterminated",
        message: `unterminated corpus:${block.kind} block (${name}) has no matching closer before the next marker or end of file`,
        line: text.slice(0, block.start).split("\n").length,
        path: rel,
      });
    }
    if (data?.status === "deprecated") continue;
    if (data?.verified && isValidIsoDate(String(data.verified))) {
      const volatility = derivePageVolatility(text, records);
      const entry = {
        path: rel,
        verified: String(data.verified),
        volatility,
        expires: expiryFor(String(data.verified), volatility),
      };
      for (const i of checkExpiry(entry, today))
        issues.push({ ...i, path: rel });
    }
  }
  return issues;
}

// The Verify stage's deterministic half. Strictly read-only: it must never
// write, because it runs as a CI gate over the tree it is judging.
export function verifyCorpus(root) {
  const records = loadRecords(path.join(root, "data"));
  const issues = [];
  // Same destructuring as lintCorpus uses for checkDataFiles: `file` names the
  // data file for the issue path and does not survive onto the issue itself.
  for (const { file, ...i } of checkDuplicateKeys(records))
    issues.push({ ...i, path: path.join("data", file) });

  for (const record of records) {
    for (const i of checkRecordFields(record))
      issues.push({ ...i, path: path.join("data", record.file) });
    for (const i of checkLintLiteralsStale(record))
      issues.push({ ...i, path: path.join("data", record.file) });
  }

  const exists = (rel) => fs.existsSync(path.join(root, rel));
  for (const file of guidePaths(root)) {
    const text = fs.readFileSync(file, "utf8");
    const { data } = parseFrontmatter(text);
    const rel = path.relative(root, file);
    // A deprecated page is one that could not be refreshed. The contract keeps it
    // readable and still checks its front-matter and bare values, but must not hold
    // it to authoring rules it cannot satisfy — lintCorpus makes the same carve-out
    // for expiry. Shape rules still apply.
    const deprecated = data?.status === "deprecated";
    for (const i of [
      ...checkAppliesToShape(data),
      ...checkRelatedPaths(data, exists),
      ...checkResearchRequired(data),
      ...(deprecated ? [] : checkTemplateSections(text)),
      ...checkEvidenceLabels(text),
      ...(deprecated ? [] : checkRotsTable(text, records)),
      ...checkKnownLintGapForm(text),
    ])
      issues.push({ ...i, path: rel });
  }
  return issues;
}

// What verify actually looked at. `verify: clean` is also what a rule matching
// nothing prints, so these counts are how a reader tells a working gate from a
// silent one. Each later task adds its own counter here.
export function verifyStats(root) {
  const records = loadRecords(path.join(root, "data"));
  const recordsChecked = records.length;
  const recordsWithSource = records.filter((r) => r.source != null).length;
  return {
    records: records.length,
    guides: guidePaths(root).length,
    recordsChecked,
    recordsWithSource,
    recordsWithLintLiterals: records.filter((r) => Array.isArray(r.lint_literals))
      .length,
    lintLiteralEntries: records.reduce(
      (n, r) => n + (Array.isArray(r.lint_literals) ? r.lint_literals.length : 0),
      0,
    ),
    relatedEntries: guidePaths(root).reduce((n, f) => {
      const { data } = parseFrontmatter(fs.readFileSync(f, "utf8"));
      return n + (Array.isArray(data?.related) ? data.related.length : 0);
    }, 0),
    seedPages: guidePaths(root).filter(
      (f) => parseFrontmatter(fs.readFileSync(f, "utf8")).data?.seed === true,
    ).length,
    numberedHeadings: guidePaths(root).reduce(
      (n, f) => n + numberedSections(fs.readFileSync(f, "utf8")).length,
      0,
    ),
    evidenceLines: guidePaths(root).reduce(
      (n, f) => n + evidenceSegments(fs.readFileSync(f, "utf8")).length,
      0,
    ),
    recordReferences: guidePaths(root).reduce(
      (n, f) =>
        n + referencedRecordKeys(fs.readFileSync(f, "utf8"), records).size,
      0,
    ),
  };
}

export function renderCorpus(root, { write = false } = {}) {
  const records = loadRecords(path.join(root, "data"));
  return guidePaths(root).map((file) => {
    const before = fs.readFileSync(file, "utf8");
    const { text, issues } = renderText(before, records);
    // Compare formatter-stable forms so a formatter's table padding and blank
    // lines are not reported (or rewritten) as a pending render change.
    const changed =
      normaliseForComparison(text) !== normaliseForComparison(before);
    if (write && changed) fs.writeFileSync(file, text);
    return {
      path: path.relative(root, file),
      changed,
      issues,
    };
  });
}

export function ledgerCorpus(root, { write = false } = {}) {
  const records = loadRecords(path.join(root, "data"));
  const pages = [];
  for (const file of guidePaths(root)) {
    const text = fs.readFileSync(file, "utf8");
    const { data } = parseFrontmatter(text);
    if (!data?.verified || !isValidIsoDate(String(data.verified)))
      continue;
    pages.push({
      path: path.relative(root, file),
      verified: String(data.verified),
      volatility: derivePageVolatility(text, records),
      status: data.status,
    });
  }
  const ledger = buildLedger(pages);
  if (write)
    fs.writeFileSync(path.join(root, "meta", "ledger.yaml"), yaml.dump(ledger));
  return ledger;
}

// The artifact's own `unit`/`unit_keys` must be EXACTLY the unit --page
// resolves to, checked in both directions. Widening lets one unit stamp another
// unit's records; narrowing is the quieter half and the more dangerous one,
// because an operator who cannot reach a source can delete that record from
// `unit_keys` and from `records` and the rest of the unit then stamps clean —
// precisely the move refresh-blocked and refresh-verdict-incoherent exist to
// stop, one deletion away in the one file the pipeline is designed to have
// hand-edited. Freshness is all-or-nothing: a page's `verified` asserts its
// WHOLE section 6 was worked, so a unit refreshes as a whole or not at all.
function assertUnitScope(page, unit, data) {
  const artifactPages = Array.isArray(data.unit) ? data.unit : [];
  const artifactKeys = Array.isArray(data.unit_keys) ? data.unit_keys : [];
  for (const rel of artifactPages)
    if (!unit.pages.some((p) => p.path === rel))
      throw new RefreshError(
        "refresh-unit-widened",
        `${rel} is not a page of this unit`,
      );
  for (const k of artifactKeys)
    if (!unit.keys.includes(k))
      throw new RefreshError(
        "refresh-unit-widened",
        `${k} is not referenced by the unit rooted at ${page}`,
      );
  // The page list is the same in both scopes. `--key` narrows which RECORDS are
  // re-read, never which pages belong to the unit, and renderArtifactSkeleton
  // emits the full list either way, so page containment is bidirectional
  // regardless of key_scoped.
  for (const p of unit.pages)
    if (!artifactPages.includes(p.path))
      throw new RefreshError(
        "refresh-unit-narrowed",
        `${p.path} is a page of the unit rooted at ${page} but is absent from the artifact's unit list; a unit refreshes as a whole`,
      );
  // The record-coverage obligation is stated here in full for BOTH scopes
  // rather than inferred from `key_scoped` — a boolean the artifact supplies
  // and a one-character edit can flip. A key-scoped artifact is the one shape
  // allowed to carry fewer records than its unit, and its licence to do so is
  // exactly one record, so that claim is checked against the resolved unit;
  // every other artifact must cover the unit's records exhaustively.
  if (data.key_scoped === true) {
    if (artifactKeys.length !== 1)
      throw new RefreshError(
        "refresh-key-scope-widened",
        `a key_scoped artifact must carry exactly one of the unit's ${unit.keys.length} records, got ${artifactKeys.length}; --key narrows a unit to one record, so this artifact was widened by hand after --skeleton`,
      );
    return;
  }
  for (const k of unit.keys)
    if (!artifactKeys.includes(k))
      throw new RefreshError(
        "refresh-unit-narrowed",
        `${k} is referenced by the unit rooted at ${page} but is absent from the artifact's unit_keys; an unreachable record forces verdict: blocked, it is not dropped`,
      );
}

// Returns its output rather than printing it, so the whole command is testable
// without spawning a process. main() does the printing and the exiting.
//
// Every option is a --flag=value, never a positional: main() resolves the
// corpus root as the first argument that does not start with "--", so a bare
// page path would be swallowed as the root and silently point the command at a
// directory that is not a corpus.
export function refreshCorpus(
  root,
  argv,
  { today = new Date().toISOString().slice(0, 10) } = {},
) {
  const out = [];
  const err = [];
  const flag = (name) => {
    const hit = argv.find(
      (a) => a === `--${name}` || a.startsWith(`--${name}=`),
    );
    if (hit === undefined) return undefined;
    const eq = hit.indexOf("=");
    return eq === -1 ? true : hit.slice(eq + 1);
  };
  // Every usage exit says which rule was broken. main() prints `err` above the
  // generic usage block; none of the refresh rules can be emitted for a usage
  // error, so this reason line is the only channel a user has.
  const usageError = (reason) => {
    err.push(`refresh: ${reason}`);
    return { code: 2, out, err };
  };
  const page = flag("page");
  const modes = ["order", "skeleton", "stamp", "revert"].filter(
    (m) => flag(m) !== undefined,
  );
  if (typeof page !== "string" || page === "")
    return usageError(
      "--page=<guides/topic/page.md> is required, and takes a value; it is a flag, never a positional, because the first non-flag argument is the corpus root",
    );
  if (modes.length > 1)
    return usageError(
      `pass one mode, not ${modes.length}: --order, --skeleton, --stamp or --revert (got ${modes.map((m) => `--${m}`).join(" ")})`,
    );
  if (flag("write") !== undefined || flag("check") !== undefined)
    return usageError(
      "--write and --check belong to render, not to refresh; refresh writes when the mode says so",
    );
  const mode = modes[0] ?? "order";
  const key = typeof flag("key") === "string" ? flag("key") : null;
  const artifactRel =
    typeof flag("artifact") === "string" ? flag("artifact") : null;
  if ((mode === "stamp" || mode === "revert") && artifactRel === null)
    return usageError(
      `--${mode} needs --artifact=<research/topic/...-refresh.md>: the artifact is what carries the verdicts and the receipt`,
    );

  try {
    const records = loadRecords(path.join(root, "data"));
    const unit = resolveUnit(root, page, records);
    if (mode === "order" || mode === "skeleton") {
      const order = workOrder(root, unit, records, { key });
      if (mode === "order") out.push(renderWorkOrder(order));
      for (const b of order.blocking)
        err.push(`${b.path} [${b.rule}] ${b.message}`);
      if (order.blocking.length > 0) return { code: 1, out, err };
      if (mode === "skeleton") {
        const rel = artifactPathFor(unit, today, root);
        // The artifact path is deterministic, so every --skeleton run on the
        // same unit on the same day targets the same file — and re-running
        // --skeleton is ordinary: regenerating the work order, or restarting
        // the pipeline after a review block, both do it. Overwriting silently
        // destroys either the operator's filled-in evidence or, worse, a live
        // receipt: that converts a revertible stamp into the half-stamp state
        // CLAUDE.md describes as having no recovery except restoring the prior
        // tree from version control, and does it on an exit-0 success path.
        // unitSlug also collapses any unit above MAX_SLUG_PAGES to
        // `<first>-plus-N`, so two distinct units can collide on one path.
        const abs = path.join(root, rel);
        if (fs.existsSync(abs)) {
          const prior = parseArtifact(fs.readFileSync(abs, "utf8")).data;
          // Unconditional, with no --force escape: there is no legitimate
          // reason to discard a receipt that still describes live on-disk
          // changes, because --revert is the only thing that can undo them.
          if (prior?.stamped != null)
            throw new RefreshError(
              "refresh-skeleton-would-destroy-receipt",
              `${rel} already carries a stamped: receipt; overwriting it would make --revert impossible while leaving the bumped dates on disk — --revert it first, or restore the tree from version control`,
            );
          throw new RefreshError(
            "refresh-skeleton-exists",
            `${rel} already exists; fill it in, or delete it deliberately before regenerating`,
          );
        }
        fs.mkdirSync(path.join(root, path.dirname(rel)), { recursive: true });
        fs.writeFileSync(
          path.join(root, rel),
          renderArtifactSkeleton(order, {
            fetched: today,
            artifactPath: rel,
          }),
        );
        out.push(`refresh: wrote ${rel}`);
      }
      return { code: 0, out, err };
    }

    const artifactAbs = path.join(root, artifactRel);
    if (!fs.existsSync(artifactAbs))
      throw new RefreshError(
        "refresh-artifact-not-found",
        `--artifact=${artifactRel} does not exist`,
      );
    const { data } = parseArtifact(fs.readFileSync(artifactAbs, "utf8"));
    if (data?.path !== artifactRel)
      throw new RefreshError(
        "refresh-artifact-path-mismatch",
        `--artifact=${artifactRel} but the artifact's own path field says ${JSON.stringify(data?.path)}`,
      );
    assertUnitScope(page, unit, data);
    if (mode === "stamp") {
      const { receipt, written } = stampUnit(root, data, { today });
      for (const w of written) out.push(`refresh: stamped ${w}`);
      out.push(`refresh: receipt at ${receipt.at}`);
    } else {
      // --page is required on --revert and used to be discarded on this path,
      // so a receipt could name a page and a record of a DIFFERENT unit and
      // revert would write to both. The receipt's own footprint is checked
      // against the resolved unit for the same reason assertUnitScope checks
      // the artifact's: one unit, one branch, one set of files.
      for (const p of data.stamped?.pages ?? [])
        if (!unit.pages.some((q) => q.path === p?.path))
          throw new RefreshError(
            "refresh-unit-widened",
            `the receipt names ${JSON.stringify(p?.path)}, which is not a page of the unit rooted at ${page}`,
          );
      for (const r of data.stamped?.records ?? [])
        if (!unit.keys.includes(r?.key))
          throw new RefreshError(
            "refresh-unit-widened",
            `the receipt names record ${JSON.stringify(r?.key)}, which is not referenced by the unit rooted at ${page}`,
          );
      const { restored } = revertUnit(root, data, { today });
      for (const r of restored) out.push(`refresh: reverted ${r}`);
    }
    // refresh never regenerates meta/ledger.yaml. One file, one writer: the
    // ledger is rebuilt on master after a merge, which is what lets corpus
    // verify be a strictly read-only CI gate.
    return { code: 0, out, err };
  } catch (e) {
    if (!(e instanceof RefreshError)) throw e;
    err.push(`${page} [${e.rule}] ${e.message}`);
    return { code: 1, out, err };
  }
}

function main(argv) {
  const [command, ...rest] = argv;
  const write = rest.includes("--write");
  const check = rest.includes("--check");
  const root = rest.find((a) => !a.startsWith("--")) ?? process.cwd();
  const usage = () => {
    console.error(
      "usage: corpus <render|lint|verify|ledger|refresh> [--write] [dir]",
    );
    console.error("       corpus render --check [dir]");
    console.error(
      "       corpus refresh --page=<guides/...> [--order|--skeleton|--stamp|--revert] [--artifact=<research/...>] [--key=<record.key>] [dir]",
    );
    process.exit(2);
  };
  if (check && (command !== "render" || write)) usage();
  if (command === "lint") {
    const issues = lintCorpus(root);
    for (const i of issues)
      console.error(
        `${i.path}${i.line ? `:${i.line}` : ""} [${i.rule}] ${i.message}`,
      );
    console.log(
      issues.length === 0 ? "lint: clean" : `lint: ${issues.length} issue(s)`,
    );
    process.exit(issues.length === 0 ? 0 : 1);
  } else if (command === "verify") {
    if (write) usage();
    if (rest.includes("--stats")) {
      for (const [k, v] of Object.entries(verifyStats(root)))
        console.log(`${k}: ${v}`);
      process.exit(0);
    }
    const issues = verifyCorpus(root);
    for (const i of issues)
      console.error(
        `${i.path}${i.line ? `:${i.line}` : ""} [${i.rule}] ${i.message}`,
      );
    console.log(
      issues.length === 0
        ? "verify: clean"
        : `verify: ${issues.length} issue(s)`,
    );
    process.exit(issues.length === 0 ? 0 : 1);
  } else if (command === "render") {
    let hasIssues = false;
    let pending = false;
    for (const r of renderCorpus(root, { write })) {
      for (const i of r.issues) {
        console.error(`${r.path} [${i.rule}] ${i.message}`);
        hasIssues = true;
      }
      if (r.changed) {
        console.log(`${write ? "rendered" : "would render"}: ${r.path}`);
        pending = true;
      }
    }
    // --check is the gate: a page whose marker blocks are out of date (for
    // example a refreshed record that was never re-rendered) fails it.
    process.exit(hasIssues || (check && pending) ? 1 : 0);
  } else if (command === "ledger") {
    const ledger = ledgerCorpus(root, { write });
    console.log(
      `ledger: ${ledger.entries.length} entries${write ? " written" : ""}`,
    );
  } else if (command === "refresh") {
    const { code, out, err: errs } = refreshCorpus(root, rest);
    // A usage error prints its reason ABOVE the usage block, not instead of it:
    // usage() exits 2 itself, so the reason has to be written first.
    if (code === 2) {
      for (const line of errs) console.error(line);
      usage();
    }
    for (const line of out) console.log(line);
    for (const line of errs) console.error(line);
    process.exit(code);
  } else {
    usage();
  }
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(fs.realpathSync(process.argv[1])).href
)
  main(process.argv.slice(2));
