import fs from "node:fs";
import path from "node:path";
import yaml from "js-yaml";

// The one reader of meta/taxonomy.yaml. There were three copies of this, two of
// which returned `.topics ?? []` -- so a `topics:` written as a string was
// handed back as a string and every `topics.includes(...)` downstream silently
// became a SUBSTRING test. That turned lint's topic check permissive and let
// refresh's path-traversal guard pass a topic the taxonomy merely contained.
// Failing closed on a shape nothing in the corpus defines is the safe half, and
// one copy is what keeps it that way.
export function loadTopics(root) {
  const file = path.join(root, "meta", "taxonomy.yaml");
  if (!fs.existsSync(file)) return [];
  const doc = yaml.load(fs.readFileSync(file, "utf8"), {
    schema: yaml.JSON_SCHEMA,
  });
  return Array.isArray(doc?.topics) ? doc.topics : [];
}
