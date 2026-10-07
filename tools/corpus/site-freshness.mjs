// tools/corpus/site-freshness.mjs
//
// Facts are rendered at build time; the state label is computed in the browser
// at view time. stateLabel is serialised into the client script with
// toString() so there is exactly ONE implementation of the thresholds — the
// same function the tests drive with an injected date.
import { CADENCE_DAYS, addDays, expiryFor, isValidIsoDate } from "./ledger.mjs";

export function freshnessFacts(model) {
  // A deprecated page is excluded from the ledger and from expiry entirely,
  // so there is no freshness claim to make and no banner to render.
  if (model.status === "deprecated") return null;
  if (!model.verified || !isValidIsoDate(model.verified)) {
    return {
      verified: model.verified ?? null,
      volatility: model.volatility ?? null,
      cadenceDays: null,
      expires: null,
      hardFail: null,
      seed: model.seed === true,
      unreadableDate: true,
    };
  }
  const cadenceDays = CADENCE_DAYS[model.volatility ?? "low"];
  const expires = expiryFor(model.verified, model.volatility);
  return {
    verified: model.verified,
    volatility: model.volatility ?? null,
    cadenceDays,
    expires,
    hardFail: addDays(expires, cadenceDays),
    seed: model.seed === true,
    unreadableDate: false,
  };
}

// Pure, and intentionally string-comparison only: ISO dates sort
// lexicographically, which is what lint.mjs relies on too.
export function stateLabel(facts, todayIso) {
  if (!facts || !facts.expires) return null;
  if (todayIso <= facts.expires) return "fresh";
  if (todayIso <= facts.hardFail) return "due";
  return "expired";
}

// The browser runs the SAME stateLabel the tests drive. Serialising it with
// toString() is what keeps one implementation: writing the thresholds twice is
// how a build-time test and a view-time banner silently diverge.
//
// The viewer's LOCAL calendar date is used, not toISOString(), which returns a
// UTC date — at 19:00 in UTC-7 that is already tomorrow, which would show a
// reader "due" a day early. This is the client-side twin of the Date-parsing
// bug the spec documents for front-matter.
export function clientScript() {
  return `<script>
(function () {
  var stateLabel = ${stateLabel.toString()};
  function localToday(d) {
    var y = d.getFullYear();
    var m = String(d.getMonth() + 1).padStart(2, "0");
    var day = String(d.getDate()).padStart(2, "0");
    return y + "-" + m + "-" + day;
  }
  var el = document.querySelector("[data-freshness]");
  if (!el) return;
  var facts = JSON.parse(el.getAttribute("data-freshness"));
  var state = stateLabel(facts, localToday(new Date()));
  if (!state) return;
  var badge = document.createElement("span");
  badge.className = "badge badge-" + state;
  badge.textContent = state;
  el.appendChild(badge);
})();
</script>`;
}

const esc = (s) =>
  String(s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");

export function renderBanner(facts) {
  if (!facts) return "";
  const seedNote = facts.seed
    ? `<p class="seed-note">This page was authored before the refresh pipeline existed, so its verified date records when it was last checked by hand rather than a pipeline run.</p>`
    : "";
  if (facts.unreadableDate) {
    return `<aside class="freshness freshness-unknown">
    <p>This page states no readable verified date, so its freshness cannot be computed.</p>
    ${seedNote}
  </aside>`;
  }
  // The facts render server-side and are complete without JavaScript; the
  // badge is appended by clientScript() at view time.
  return `<aside class="freshness" data-freshness="${esc(JSON.stringify({ expires: facts.expires, hardFail: facts.hardFail }))}">
    <p>Verified ${esc(facts.verified)} · re-check every ${esc(facts.cadenceDays)} days · expires ${esc(facts.expires)}</p>
    ${seedNote}
  </aside>`;
}
