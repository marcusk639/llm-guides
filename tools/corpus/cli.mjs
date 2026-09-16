#!/usr/bin/env node
// tools/corpus/cli.mjs
import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
import yaml from "js-yaml";
import { parseFrontmatter } from "./frontmatter.mjs";
import { loadRecords, literalIndexForTopic } from "./data.mjs";
import { validateFrontmatter, findBareValues, checkExpiry } from "./lint.mjs";
import { renderText } from "./render.mjs";
import { findBlocks } from "./markers.mjs";
import { derivePageVolatility, buildLedger, expiryFor } from "./ledger.mjs";

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
    if (data?.verified && /^\d{4}-\d{2}-\d{2}$/.test(String(data.verified))) {
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

export function renderCorpus(root, { write = false } = {}) {
  const records = loadRecords(path.join(root, "data"));
  return guidePaths(root).map((file) => {
    const before = fs.readFileSync(file, "utf8");
    const { text, issues } = renderText(before, records);
    if (write && text !== before) fs.writeFileSync(file, text);
    return {
      path: path.relative(root, file),
      changed: text !== before,
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
    if (!data?.verified || !/^\d{4}-\d{2}-\d{2}$/.test(String(data.verified)))
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

function main(argv) {
  const [command, ...rest] = argv;
  const write = rest.includes("--write");
  const root = rest.find((a) => !a.startsWith("--")) ?? process.cwd();
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
  } else if (command === "render") {
    let hasIssues = false;
    for (const r of renderCorpus(root, { write })) {
      for (const i of r.issues) {
        console.error(`${r.path} [${i.rule}] ${i.message}`);
        hasIssues = true;
      }
      if (r.changed)
        console.log(`${write ? "rendered" : "would render"}: ${r.path}`);
    }
    process.exit(hasIssues ? 1 : 0);
  } else if (command === "ledger") {
    const ledger = ledgerCorpus(root, { write });
    console.log(
      `ledger: ${ledger.entries.length} entries${write ? " written" : ""}`,
    );
  } else {
    console.error("usage: corpus <render|lint|ledger> [--write] [dir]");
    process.exit(2);
  }
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(fs.realpathSync(process.argv[1])).href
)
  main(process.argv.slice(2));
