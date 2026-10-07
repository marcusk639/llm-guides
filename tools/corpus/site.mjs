// tools/corpus/site.mjs
import fs from "node:fs";
import path from "node:path";
import { loadRecords, recordsByKey } from "./data.mjs";
import { collectPages } from "./site-model.mjs";
import { renderPage, renderFrontPage, htmlPathFor } from "./site-template.mjs";
import { loadTopics } from "./site-nav.mjs";
import { buildSearchIndex } from "./site-search.mjs";
import { annotateBody } from "./site-provenance.mjs";
import { styleSheet } from "./site-style.mjs";

export function siteCorpus(root, { write = false } = {}) {
  const records = loadRecords(path.join(root, "data"));
  const byKey = recordsByKey(records);
  const { pages, issues } = collectPages(root, records);
  const topics = loadTopics(root);

  // The provenance pass is the only place a renamed or removed record surfaces.
  // renderPage discards its copy of these, and they must be reported whether or
  // not this run writes, so `site .` is a real check and not just a dry build.
  for (const page of pages)
    for (const issue of annotateBody(page.body, byKey, records).issues)
      issues.push({ path: page.path, ...issue });

  if (write) {
    const out = path.join(root, "dist");
    // A guide that was renamed or deleted would otherwise leave its stale .html
    // published forever on the manual build path.
    fs.rmSync(out, { recursive: true, force: true });
    for (const page of pages) {
      const dest = path.join(out, htmlPathFor(page.path));
      fs.mkdirSync(path.dirname(dest), { recursive: true });
      fs.writeFileSync(dest, renderPage(page, byKey, records));
    }
    fs.mkdirSync(out, { recursive: true });
    fs.writeFileSync(path.join(out, "index.html"), renderFrontPage(pages, topics));
    fs.writeFileSync(path.join(out, "style.css"), styleSheet());
    fs.writeFileSync(
      path.join(out, "search-index.json"),
      JSON.stringify(buildSearchIndex(pages)),
    );
  }

  return { pages, issues };
}
