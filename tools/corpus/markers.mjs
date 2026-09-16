const OPEN = /<!--\s*corpus:(data|table)\s+([\s\S]*?)-->/g;

export function parseAttrs(source) {
  const attrs = {};
  for (const m of source.matchAll(/([\w-]+)=("[^"]*"|'[^']*'|\S+)/g)) {
    attrs[m[1]] = m[2].replace(/^["']|["']$/g, "");
  }
  return attrs;
}

export function findBlocks(text) {
  const blocks = [];
  const re = new RegExp(OPEN.source, "g");
  let m;
  while ((m = re.exec(text)) !== null) {
    const kind = m[1];
    const close = `<!-- /corpus:${kind} -->`;
    const contentStart = m.index + m[0].length;
    const closeIndex = text.indexOf(close, contentStart);
    if (closeIndex === -1) {
      blocks.push({
        kind,
        attrs: parseAttrs(m[2]),
        start: m.index,
        contentStart,
        content: "",
        end: contentStart,
        unterminated: true,
      });
      continue;
    }
    blocks.push({
      kind,
      attrs: parseAttrs(m[2]),
      start: m.index,
      contentStart,
      content: text.slice(contentStart, closeIndex),
      end: closeIndex + close.length,
      unterminated: false,
    });
    re.lastIndex = closeIndex + close.length;
  }
  return blocks;
}

export function coveredRanges(blocks) {
  return blocks.filter((b) => !b.unterminated).map((b) => [b.start, b.end]);
}
