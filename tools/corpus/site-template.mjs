// tools/corpus/site-template.mjs
import { headingSlug, renderMarkdown, safeHref } from "./site-markdown.mjs";
import { navTopics, loadTopics } from "./site-nav.mjs";
import { searchScript } from "./site-search.mjs";
import { annotateBody, injectProvenance } from "./site-provenance.mjs";
import { clientScript, freshnessFacts, renderBanner } from "./site-freshness.mjs";

const esc = (s) =>
  String(s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");

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

// A page at guides/<topic>/<name>.html reaches the front page two levels up.
// renderPage is never given the topic list, so site-wide navigation is a home
// link rather than a menu.
function depthPrefix(mdPath) {
  return "../".repeat(Math.max(0, String(mdPath).split("/").length - 1));
}

export function homeHref(mdPath) {
  return depthPrefix(mdPath) + "index.html";
}

// dist/style.css sits at the deploy root, so a guide two directories deep
// reaches it the same way it reaches the front page.
export function assetHref(mdPath, name) {
  return depthPrefix(mdPath) + name;
}

// A guide body opens with its own `# Title`, which the template already renders
// from front-matter. Without this the page shows its title twice and ships two
// <h1> elements. Only a LEADING h1 is removed; one later in the body is content.
export function stripLeadingTitle(html) {
  return html.replace(/^\s*<h1[^>]*>[\s\S]*?<\/h1>\s*/, "");
}

// marked emits a bare <table>; sticky-first-column needs an element to scroll.
export function wrapTables(html) {
  return html.replace(
    /<table>([\s\S]*?)<\/table>/g,
    '<div class="table-scroll"><table>$1</table></div>',
  );
}

export function renderPage(model, byKey = new Map(), records = []) {
  const headings = numberedHeadings(model.body);
  const facts = freshnessFacts(model);
  const { body: annotated } = annotateBody(model.body, byKey, records);
  const article = wrapTables(
    stripLeadingTitle(
      injectProvenance(
      renderMarkdown(stripMarkerComments(annotated)),
      model,
        byKey,
        records,
      ),
    ),
  );
  const nav = headings
    .map((h) => `<li><a href="#${esc(h.slug)}">${esc(h.text)}</a></li>`)
    .join("\n      ");
  const appliesTo = model.appliesTo
    .map((a) => `<li>${esc(a)}</li>`)
    .join("\n      ");
  const sources = model.sources
    .map((s) => {
      const href = safeHref(s);
      return href === null
        ? `<li>${esc(s)}</li>`
        : `<li><a href="${esc(href)}">${esc(s)}</a></li>`;
    })
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
<link rel="stylesheet" href="${esc(assetHref(model.path, "style.css"))}">
</head>
<body>
<main>
  <nav class="site" aria-label="Site"><a href="${esc(homeHref(model.path))}">All guides</a></nav>
  <h1>${esc(model.title)}</h1>
  <p class="summary">${esc(model.summary)}</p>
  ${renderBanner(facts)}
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
${facts ? clientScript() : ""}
</body>
</html>
`;
}


export function renderFrontPage(models, topics) {
  const nav = navTopics(models, topics);
  const sections = nav
    .map(
      (t) => `    <section class="topic">
      <h3>${esc(t.label)}</h3>
      <ul>
${t.pages.map((p) => `        <li><a href="${esc(htmlPathFor(p.path))}">${esc(p.title)}</a></li>`).join("\n")}
      </ul>
    </section>`,
    )
    .join("\n");

  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>LLM guides</title>
<meta name="description" content="A reference corpus on effective LLM use, where every page and every figure carries a verification date.">
<link rel="stylesheet" href="style.css">
</head>
<body>
<main>
  <h1>LLM guides</h1>
  <p class="tagline">A reference corpus on effective LLM use, where every page and every figure carries a verification date.</p>
  <form class="search" role="search" onsubmit="return false"><label for="q">Search the corpus</label> <input id="q" type="search" data-search autocomplete="off"></form>
  <ul data-search-results></ul>
  <section class="method">
    <h2>How claims here earn their confidence</h2>
    <p>Every volatile value — a model id, a price, a context limit — lives in a
    record carrying the URL it was read from and the date it was read. Figures
    on a page show that date and link that source, independently of when the
    page itself was last checked.</p>
    <p>Claims are labelled. <strong>Verified</strong> means a runnable proof
    ships in the repository. <strong>Documented</strong> means a vendor or
    peer-reviewed source states it, linked, with the date it was read.
    <strong>Plausible</strong> means practitioner inference, and is never
    written as confident prose.</p>
    <p>Every page states when it was last checked and when it goes stale. A
    page past its expiry says so, in its banner, before its content.</p>
  </section>
  <section class="topics">
    <h2>Guides</h2>
${sections}
  </section>
</main>
${searchScript()}
</body>
</html>
`;
}

// guides/models/comparison.md -> guides/models/comparison.html
export function htmlPathFor(mdPath) {
  return mdPath.replace(/\.md$/, ".html");
}
