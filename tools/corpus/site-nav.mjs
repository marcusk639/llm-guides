// tools/corpus/site-nav.mjs
import fs from "node:fs";
import path from "node:path";
import yaml from "js-yaml";

// Casing a slug cannot imply. Kept deliberately small: meta/taxonomy.yaml is
// contract-governed and presentation metadata is not worth changing it for.
const EXCEPTIONS = {
  "claude-code": "Claude Code",
};

export function topicLabel(slug) {
  if (EXCEPTIONS[slug]) return EXCEPTIONS[slug];
  return slug
    .split("-")
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(" ");
}

export function loadTopics(root) {
  const file = path.join(root, "meta", "taxonomy.yaml");
  if (!fs.existsSync(file)) return [];
  const doc = yaml.load(fs.readFileSync(file, "utf8"), {
    schema: yaml.JSON_SCHEMA,
  });
  return Array.isArray(doc?.topics) ? doc.topics : [];
}

// Only populated topics, in taxonomy order. An empty topic is omitted
// entirely rather than rendered as a dead menu entry.
export function navTopics(models, topics) {
  return topics
    .map((slug) => ({
      slug,
      label: topicLabel(slug),
      pages: models
        .filter((m) => m.topic === slug)
        .sort((a, b) => a.path.localeCompare(b.path)),
    }))
    .filter((t) => t.pages.length > 0);
}
