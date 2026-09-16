import yaml from "js-yaml";

const FM = /^---\r?\n([\s\S]*?)\r?\n---[ \t]*\r?\n?/;

export function parseFrontmatter(text) {
  const m = text.match(FM);
  if (!m) return { data: null, body: text, bodyOffset: 0 };
  const data = yaml.load(m[1], { schema: yaml.JSON_SCHEMA }) ?? {};
  return { data, body: text.slice(m[0].length), bodyOffset: m[0].length };
}
