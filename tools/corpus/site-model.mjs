// tools/corpus/site-model.mjs
import fs from "node:fs";
import path from "node:path";
import { guidePages } from "./refresh-units.mjs";
import { parseFrontmatter } from "./frontmatter.mjs";
import { referencedRecordKeys } from "./verify-pages.mjs";
import { derivePageVolatility } from "./ledger.mjs";

const list = (v) => (Array.isArray(v) ? v : []);
const str = (v) => (typeof v === "string" ? v : null);

export function collectPages(root, records) {
  const issues = [];
  const pages = guidePages(root).map((abs) => {
    const text = fs.readFileSync(abs, "utf8");
    const { data, body } = parseFrontmatter(text);
    const rel = path.relative(root, abs).split(path.sep).join("/");
    return {
      path: rel,
      title: str(data?.title) ?? rel,
      summary: str(data?.summary) ?? "",
      topic: str(data?.topic),
      verified: data?.verified == null ? null : String(data.verified),
      status: str(data?.status),
      seed: data?.seed === true,
      appliesTo: list(data?.applies_to),
      sources: list(data?.sources),
      related: list(data?.related),
      body,
      keys: [...referencedRecordKeys(text, records)].sort(),
      volatility: derivePageVolatility(text, records),
    };
  });
  return { pages, issues };
}
