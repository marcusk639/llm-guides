// tools/corpus/site-markdown.mjs
//
// marked is the only markdown dependency, chosen because it ships GFM tables
// and preserves raw HTML by DEFAULT. That second property is not cosmetic:
// render.mjs:6 writes literal <br> into generated table cells, and a renderer
// that escapes raw HTML mangles every multi-line generated cell. No options
// object is needed — both behaviours are default.
import { marked } from "marked";

export function renderMarkdown(md) {
  return marked.parse(md);
}
