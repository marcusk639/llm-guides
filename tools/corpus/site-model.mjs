// tools/corpus/site-model.mjs
import path from "node:path";
import { guidePages } from "./refresh-units.mjs";

export function collectPages(root, records) {
  const pages = guidePages(root).map((abs) => ({
    path: path.relative(root, abs).split(path.sep).join("/"),
  }));
  return { pages, issues: [] };
}
