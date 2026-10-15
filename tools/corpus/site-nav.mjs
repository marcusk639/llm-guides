// tools/corpus/site-nav.mjs
import { loadTopics } from "./taxonomy.mjs";

export { loadTopics };

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
