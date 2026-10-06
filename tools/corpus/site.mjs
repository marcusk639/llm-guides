// tools/corpus/site.mjs
import path from "node:path";
import { loadRecords } from "./data.mjs";
import { collectPages } from "./site-model.mjs";

export function siteCorpus(root, { write = false } = {}) {
  const records = loadRecords(path.join(root, "data"));
  const { pages, issues } = collectPages(root, records);
  return { pages, issues, write };
}
