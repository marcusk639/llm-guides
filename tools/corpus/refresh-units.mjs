// tools/corpus/refresh-units.mjs
// A refresh unit is a page plus every page that shares one of its records,
// closed TRANSITIVELY. If A shares r1 with B and B shares r2 with C, C joins:
// otherwise B and C would both edit r2 on two branches, which is the exact
// conflict the unit concept exists to remove. On today's corpus the closure and
// the one-hop reading give the same three units.
import fs from "node:fs";
import path from "node:path";
import yaml from "js-yaml";
import { parseFrontmatter } from "./frontmatter.mjs";
import { referencedRecordKeys } from "./verify-pages.mjs";

export class RefreshError extends Error {
  constructor(rule, message) {
    super(message);
    this.name = "RefreshError";
    this.rule = rule;
  }
}

// Same walk as cli.mjs's guidePaths: guides/ only, .md only, sorted. Nothing
// under research/ or meta/ is ever a unit member.
export function guidePages(root) {
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

export function pageFacts(root, records) {
  return guidePages(root).map((abs) => {
    const text = fs.readFileSync(abs, "utf8");
    const { data } = parseFrontmatter(text);
    return {
      path: path.relative(root, abs).split(path.sep).join("/"),
      topic: typeof data?.topic === "string" ? data.topic : null,
      status: typeof data?.status === "string" ? data.status : null,
      keys: [...referencedRecordKeys(text, records)].sort(),
    };
  });
}

export function resolveUnit(root, entry, records) {
  const facts = pageFacts(root, records);
  const start = facts.find((p) => p.path === entry);
  if (start === undefined)
    throw new RefreshError(
      "refresh-page-unknown",
      `no guide at ${entry}; --page takes a repo-root-relative path under guides/`,
    );
  const members = new Map([[start.path, start]]);
  const keys = new Set(start.keys);
  let grew = true;
  while (grew) {
    grew = false;
    for (const p of facts) {
      if (members.has(p.path)) continue;
      if (!p.keys.some((k) => keys.has(k))) continue;
      members.set(p.path, p);
      for (const k of p.keys) keys.add(k);
      grew = true;
    }
  }
  const byKey = new Map(records.map((r) => [r.key, r]));
  const pages = [...members.values()].sort((a, b) =>
    a.path.localeCompare(b.path),
  );
  const dataFiles = [
    ...new Set(
      [...keys].map((k) => byKey.get(k)?.file).filter((f) => f != null),
    ),
  ]
    .sort()
    .map((f) => `data/${f}`);
  return {
    entry,
    pages,
    keys: [...keys].sort(),
    topics: [...new Set(pages.map((p) => p.topic))].sort(),
    dataFiles,
  };
}

// Above this many pages a joined slug becomes unreadable and starts colliding
// with filesystem name limits, so it collapses to first-plus-N.
export const MAX_SLUG_PAGES = 3;

export function unitSlug(unit) {
  const names = unit.pages
    .map((p) => path.basename(p.path, ".md"))
    .sort((a, b) => a.localeCompare(b));
  if (names.length > MAX_SLUG_PAGES)
    return `${names[0]}-plus-${names.length - 1}`;
  return names.join("-");
}

// The topic of the page named on the command line, not a merge of the unit's
// topics: a cross-topic unit has no single home, and the entry page is the one
// the author asked about. `unit.topics` records the span for the artifact.
export function unitTopic(unit) {
  const entry = unit.pages.find((p) => p.path === unit.entry);
  if (
    entry === undefined ||
    typeof entry.topic !== "string" ||
    entry.topic === ""
  )
    throw new RefreshError(
      "refresh-topic-unknown",
      `${unit.entry} has no front-matter topic, so the refresh artifact has no home under research/`,
    );
  return entry.topic;
}

// `topic` is a free-text front-matter field, not a validated enum, by the time
// it reaches here (lint's frontmatter-topic rule runs separately, and refresh
// runs BEFORE re-linting). Interpolating it unchecked into a path lets a
// traversal string (`../../../tmp/evil`), a leading slash (`/etc`), or a
// typo'd/un-registered topic (`a/b`, a misspelling) write the artifact outside
// research/ or silently nest it — realistically a typo, not an attack, since
// the operator supplies the page, but the result is the same: a later
// `research:` pointer that cannot resolve. Checked here, inside the one
// function that builds the path, so it cannot be bypassed by a caller that
// skips a separate validation step.
function loadTaxonomyTopics(root) {
  const file = path.join(root, "meta", "taxonomy.yaml");
  if (!fs.existsSync(file)) return [];
  return (
    (
      yaml.load(fs.readFileSync(file, "utf8"), { schema: yaml.JSON_SCHEMA }) ??
      {}
    ).topics ?? []
  );
}

export function artifactPathFor(unit, fetched, root) {
  const topic = unitTopic(unit);
  const topics = loadTaxonomyTopics(root);
  if (!topics.includes(topic))
    throw new RefreshError(
      "refresh-topic-not-in-taxonomy",
      `${topic} is not a topic listed in meta/taxonomy.yaml, so research/${topic}/ is not a safe artifact home — check for a typo, or register the topic if it is genuinely new`,
    );
  return `research/${topic}/${fetched}-${unitSlug(unit)}-refresh.md`;
}
