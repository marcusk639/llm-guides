// tools/corpus/site.mjs
import fs from "node:fs";
import path from "node:path";
import { loadRecords, recordsByKey } from "./data.mjs";
import { collectPages } from "./site-model.mjs";
import { renderPage, renderFrontPage, htmlPathFor } from "./site-template.mjs";
import { loadTopics } from "./site-nav.mjs";
import { buildSearchIndex } from "./site-search.mjs";

export function siteCorpus(root, { write = false } = {}) {
  const records = loadRecords(path.join(root, "data"));
  const byKey = recordsByKey(records);
  const { pages, issues } = collectPages(root, records);
  const topics = loadTopics(root);

  if (write) {
    const out = path.join(root, "dist");
    for (const page of pages) {
      const dest = path.join(out, htmlPathFor(page.path));
      fs.mkdirSync(path.dirname(dest), { recursive: true });
      fs.writeFileSync(dest, renderPage(page, byKey, records));
    }
    fs.mkdirSync(out, { recursive: true });
    fs.writeFileSync(path.join(out, "index.html"), renderFrontPage(pages, topics));
    fs.writeFileSync(
      path.join(out, "search-index.json"),
      JSON.stringify(buildSearchIndex(pages)),
    );
  }

  return { pages, issues };
}
