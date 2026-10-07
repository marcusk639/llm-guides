// tools/corpus/site-markdown.mjs
//
// marked is the only markdown dependency, chosen because it ships GFM tables
// and preserves raw HTML by DEFAULT. That second property is not cosmetic:
// render.mjs:6 writes literal <br> into generated table cells, and a renderer
// that escapes raw HTML mangles every multi-line generated cell. No options
// object is needed — both behaviours are default.
import { marked } from "marked";

// marked 18 removed headerIds, so a heading renders WITHOUT an id and every
// in-page anchor the template writes points at nothing. The slug lives here,
// beside the renderer that has to agree with it, so the two cannot drift.
// "## 6. Where this rots" -> "6-where-this-rots".
export function headingSlug(text) {
  return text
    .toLowerCase()
    .replace(/[^\w\s-]/g, "")
    .trim()
    .replace(/\s+/g, "-");
}

const headingIds = {
  renderer: {
    heading({ tokens, depth }) {
      const text = this.parser.parseInline(tokens);
      const slug = headingSlug(this.parser.parseInline(tokens, this.parser.textRenderer));
      return `<h${depth} id="${slug}">${text}</h${depth}>\n`;
    },
  },
};

marked.use(headingIds);

export function renderMarkdown(md) {
  return marked.parse(md);
}

// Only these schemes become a live href. Content is authored in-repo, so the
// reach of a javascript:/data: URL here is self-XSS rather than an attack path,
// but a figure's attribution should never be executable. A rejected URL is
// still shown as text, so nothing disappears from the page.
const SAFE_SCHEME = /^(https?:|mailto:)/i;

export function safeHref(url) {
  const u = String(url).trim();
  return SAFE_SCHEME.test(u) || u.startsWith("/") || u.startsWith("./") || u.startsWith("../")
    ? u
    : null;
}
