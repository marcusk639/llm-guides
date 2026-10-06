// tools/corpus/site-search.mjs
//
// A build-time index and a client script, no search library. The index format
// is the contract: the build emits a file, the client reads it, and nothing
// else in the site depends on how matching works — so a real index can replace
// the matching later without touching anything but this file.
import { numberedHeadings } from "./site-template.mjs";
import { freshnessFacts } from "./site-freshness.mjs";

export function sectionTexts(body) {
  const headings = numberedHeadings(body);
  const lines = body.split("\n");
  const out = [];
  let current = null;
  let inFence = false;
  for (const line of lines) {
    if (/^\s*```/.test(line)) {
      inFence = !inFence;
      if (current) current.text.push(line);
      continue;
    }
    const m = !inFence && line.match(/^##\s+(\d+\.\s+.*)$/);
    if (m) {
      if (current) out.push(current);
      current = { heading: m[1], text: [] };
      continue;
    }
    if (current) current.text.push(line);
  }
  if (current) out.push(current);
  return out
    .filter((s) => headings.some((h) => h.text === s.heading))
    .map((s) => ({ heading: s.heading, text: s.text.join("\n").trim() }));
}

export function buildSearchIndex(models) {
  return models.map((m) => {
    const facts = freshnessFacts(m);
    return {
      path: m.path,
      title: m.title,
      summary: m.summary,
      topic: m.topic,
      sections: sectionTexts(m.body),
      freshness: facts
        ? { expires: facts.expires, hardFail: facts.hardFail }
        : null,
    };
  });
}

// The index is the largest asset the site ships, so it is fetched on FIRST
// INTERACTION with the field, never on page load. Eager-loading it would spend
// more bytes than the avoided search library saves.
export function searchScript() {
  return `<script>
(function () {
  var field = document.querySelector("[data-search]");
  if (!field) return;
  var index = null;
  var loading = false;
  function load() {
    if (index || loading) return Promise.resolve();
    loading = true;
    return fetch("search-index.json")
      .then(function (r) { return r.json(); })
      .then(function (data) { index = data; loading = false; });
  }
  field.addEventListener("focus", load, { once: true });
  field.addEventListener("input", function () {
    load().then(function () {
      if (!index) return;
      var q = field.value.toLowerCase().trim();
      var out = document.querySelector("[data-search-results]");
      if (!out) return;
      out.innerHTML = "";
      if (q.length < 2) return;
      index.forEach(function (page) {
        page.sections.forEach(function (s) {
          if ((s.heading + " " + s.text).toLowerCase().indexOf(q) === -1) return;
          var li = document.createElement("li");
          var a = document.createElement("a");
          a.href = page.path.replace(/\\.md$/, ".html");
          a.textContent = page.title + " — " + s.heading;
          li.appendChild(a);
          out.appendChild(li);
        });
      });
    });
  });
})();
</script>`;
}
