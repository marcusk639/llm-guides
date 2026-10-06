// tools/corpus/site-template.mjs
import { renderMarkdown } from "./site-markdown.mjs";
import { annotateBody, injectProvenance } from "./site-provenance.mjs";

const esc = (s) =>
  String(s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");

// Matches the slug marked generates for an ATX heading: lowercase, spaces to
// hyphens, punctuation dropped. "## 6. Where this rots" -> "6-where-this-rots".
export function headingSlug(text) {
  return text
    .toLowerCase()
    .replace(/[^\w\s-]/g, "")
    .trim()
    .replace(/\s+/g, "-");
}

export function numberedHeadings(body) {
  const out = [];
  let inFence = false;
  for (const line of body.split("\n")) {
    if (/^\s*```/.test(line)) {
      inFence = !inFence;
      continue;
    }
    if (inFence) continue;
    const m = line.match(/^##\s+(\d+\.\s+.*)$/);
    if (m) out.push({ text: m[1], slug: headingSlug(m[1]) });
  }
  return out;
}

// Marker comments are HTML comments, so marked passes them straight through
// into the output as invisible-but-present comments. The provenance pass
// (site-provenance.mjs) consumes their information; the comments themselves
// must not ship.
export function stripMarkerComments(body) {
  return body.replace(/<!--\s*\/?corpus:(data|table)[^>]*-->\n?/g, "");
}

export function renderPage(model, byKey = new Map(), records = []) {
  const headings = numberedHeadings(model.body);
  const { body: annotated } = annotateBody(model.body, byKey, records);
  const article = injectProvenance(
    renderMarkdown(stripMarkerComments(annotated)),
    model,
    byKey,
    records,
  );
  const nav = headings
    .map((h) => `<li><a href="#${esc(h.slug)}">${esc(h.text)}</a></li>`)
    .join("\n      ");
  const appliesTo = model.appliesTo
    .map((a) => `<li>${esc(a)}</li>`)
    .join("\n      ");
  const sources = model.sources
    .map((s) => `<li><a href="${esc(s)}">${esc(s)}</a></li>`)
    .join("\n      ");
  const related = model.related
    .map((r) => `<li>${esc(r)}</li>`)
    .join("\n      ");

  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(model.title)}</title>
<meta name="description" content="${esc(model.summary)}">
</head>
<body>
<main>
  <h1>${esc(model.title)}</h1>
  <p class="summary">${esc(model.summary)}</p>
  <!-- banner -->
  <section class="applies-to">
    <h2>Applies to</h2>
    <ul>
      ${appliesTo}
    </ul>
  </section>
  <nav class="tiers" aria-label="Sections">
    <ul>
      ${nav}
    </ul>
  </nav>
  <article>
${article}
  </article>
  <section class="sources">
    <h2>Sources</h2>
    <ul>
      ${sources}
    </ul>
  </section>
  <section class="related">
    <h2>Related</h2>
    <ul>
      ${related}
    </ul>
  </section>
</main>
</body>
</html>
`;
}
