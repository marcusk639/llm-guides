// tools/corpus/refresh-artifact.mjs
// The evidence artifact is MACHINE-READABLE: verdicts, URLs, stated figures and
// dates in front-matter. Narrative belongs in the pull request body, not here —
// conflating a refresh log with a grounding research artifact would make
// research-required satisfiable by a log rather than by real grounding.
//
// This is also the one file refresh round-trips through YAML. It is generated
// and carries no comments, so dumpArtifact is safe on it; data/*.yaml and
// guides/**.md get single-line surgical edits instead.
import yaml from "js-yaml";
import { parseFrontmatter } from "./frontmatter.mjs";
import { isValidIsoDate } from "./ledger.mjs";
import { RefreshError } from "./refresh-units.mjs";

// Two axes, not one: a record is corrected or could not be read; a unit shipped
// or did not.
export const UNIT_VERDICTS = Object.freeze([
  "confirmed",
  "changed",
  "blocked",
]);
export const RECORD_VERDICTS = Object.freeze([
  "confirmed",
  "corrected",
  "unreachable",
]);

export const ARTIFACT_FIELDS = Object.freeze([
  "kind",
  "unit",
  "entry",
  "topic",
  "topics",
  "slug",
  "path",
  "fetched",
  "verdict",
  "key_scoped",
  "unit_keys",
  "records",
]);

export function parseArtifact(text) {
  const { data, body } = parseFrontmatter(text);
  return { data, body };
}

export function dumpArtifact(data, body) {
  return `---\n${yaml.dump(data)}---\n${body}`;
}

export function renderArtifactSkeleton(order, { fetched, artifactPath }) {
  const data = {
    kind: "refresh",
    unit: order.unit.pages.map((p) => p.path),
    entry: order.unit.entry,
    topic: order.topic,
    topics: order.unit.topics.map((t) => (t == null ? "" : t)),
    slug: order.slug,
    path: artifactPath,
    fetched,
    // Fail closed. A skeleton nobody filled in must not be stampable.
    verdict: "blocked",
    // Carried from the order. stampUnit reads it to decide whether any page is
    // touched: a key-scoped refresh stamps records only.
    key_scoped: order.key !== null,
    unit_keys: order.records.map((r) => r.key),
    records: order.records.map((r) => ({
      key: r.key,
      file: r.file,
      verdict: "unreachable",
      url: r.source ?? "",
      stated: "",
      read: fetched,
    })),
  };
  const body = [
    `# Refresh: ${order.slug} (${fetched})`,
    "",
    "Verdicts, URLs and the figures the sources actually stated live in the front-matter above. Narrative belongs in the pull request body, not here.",
    "",
    ...(order.key === null
      ? []
      : [
          `Scope: \`--key=${order.key}\` — records only. No page's \`verified\` moves and no \`research:\` is set, because a page's date asserts its whole section 6 was worked and this run worked one record.`,
          "",
        ]),
    ...order.pages.flatMap((p) => [
      `## ${p.path}`,
      "",
      "Section 6 as executed:",
      "",
      // FOUR backticks. Section 6 is copied verbatim and a section 6 that
      // itself contains a three-backtick fence would otherwise close this one
      // early and corrupt the artifact's markdown. No section 6 on the live
      // corpus carries a fence today; this costs nothing and stops the first
      // one that does from being a silent corruption.
      "````",
      p.sectionSix ?? "(no section 6)",
      "````",
      "",
      "- Identifiers re-checked against `applies_to`, safety-relevant first:",
      "- Values lint cannot guard, checked by hand:",
      "- Dated studies, citation still resolves:",
      "",
    ]),
  ].join("\n");
  return dumpArtifact(data, body);
}

export function validateArtifact(data) {
  if (data == null || typeof data !== "object" || Array.isArray(data))
    return [
      {
        rule: "refresh-artifact-shape",
        message: "artifact front-matter is not a mapping",
      },
    ];
  const issues = [];
  if (data.kind !== "refresh")
    issues.push({
      rule: "refresh-artifact-kind",
      message: `kind must be "refresh", got ${JSON.stringify(data.kind)}`,
    });
  for (const f of ARTIFACT_FIELDS)
    if (!(f in data))
      issues.push({
        rule: "refresh-artifact-field",
        message: `missing required field: ${f}`,
      });
  if (!UNIT_VERDICTS.includes(data.verdict))
    issues.push({
      rule: "refresh-artifact-verdict",
      message: `verdict must be one of ${UNIT_VERDICTS.join(", ")}, got ${JSON.stringify(data.verdict)}`,
    });
  if (typeof data.fetched !== "string" || !isValidIsoDate(data.fetched))
    issues.push({
      rule: "refresh-artifact-date",
      message: `fetched must be a real date written YYYY-MM-DD, got ${JSON.stringify(data.fetched)}`,
    });
  if (typeof data.key_scoped !== "boolean")
    issues.push({
      rule: "refresh-artifact-field",
      message: `key_scoped must be true or false, got ${JSON.stringify(data.key_scoped)}; it decides whether any page verified moves`,
    });
  if (!Array.isArray(data.records))
    issues.push({
      rule: "refresh-artifact-field",
      message: "records must be a list",
    });
  const entries = Array.isArray(data.records) ? data.records : [];
  const seen = new Set();
  for (const e of entries) {
    const key = e?.key;
    seen.add(key);
    if (!RECORD_VERDICTS.includes(e?.verdict))
      issues.push({
        rule: "refresh-artifact-verdict",
        message: `record ${key}: verdict must be one of ${RECORD_VERDICTS.join(", ")}, got ${JSON.stringify(e?.verdict)}`,
      });
    if (typeof e?.read !== "string" || !isValidIsoDate(e.read))
      issues.push({
        rule: "refresh-artifact-date",
        message: `record ${key}: read must be a real date written YYYY-MM-DD, got ${JSON.stringify(e?.read)}`,
      });
    // A record that could not be reached has no url to cite; every other
    // verdict asserts a figure was read somewhere, so it must say where.
    if (
      e?.verdict !== "unreachable" &&
      (typeof e?.url !== "string" || e.url.trim() === "")
    )
      issues.push({
        rule: "refresh-artifact-field",
        message: `record ${key}: url is required unless the verdict is unreachable`,
      });
    if (typeof e?.file !== "string" || !e.file.startsWith("data/"))
      issues.push({
        rule: "refresh-artifact-field",
        message: `record ${key}: file must name the data/ file the record lives in`,
      });
  }
  if (
    entries.some((e) => e?.verdict === "unreachable") &&
    data.verdict !== "blocked"
  )
    issues.push({
      rule: "refresh-verdict-incoherent",
      message:
        'a record verdict of "unreachable" forces the unit verdict "blocked"; a refresh that could not reach a source must not bump verified',
    });
  for (const k of Array.isArray(data.unit_keys) ? data.unit_keys : [])
    if (!seen.has(k))
      issues.push({
        rule: "refresh-artifact-coverage",
        message: `record ${k} is in the unit but has no verdict entry; refresh would leave it unchecked under a fresh page date`,
      });
  return issues;
}

export function withReceipt(artifactText, receipt) {
  const { data, body } = parseArtifact(artifactText);
  if (data == null)
    throw new RefreshError(
      "refresh-artifact-frontmatter",
      "artifact has no --- front-matter to carry a receipt",
    );
  return dumpArtifact({ ...data, stamped: receipt }, body);
}

// A blocked branch must be harmless to merge, and the artifact must say so: the
// receipt moves to `reverted:` so the next attempt can read what was checked,
// and the verdict goes back to blocked.
export function withRevertMark(artifactText, at) {
  const { data, body } = parseArtifact(artifactText);
  if (data == null)
    throw new RefreshError(
      "refresh-artifact-frontmatter",
      "artifact has no --- front-matter to mark reverted",
    );
  const { stamped, ...rest } = data;
  // The receipt carries its own `at` — the stamp date. Spreading it AFTER `at`
  // would overwrite the revert date with the stamp date, because a later spread
  // wins; spreading it BEFORE would lose the stamp date entirely. So the
  // receipt's date is re-keyed to `stamped_at` and both survive: the audit needs
  // to know when a block happened, not only when the stamp did.
  const { at: stampedAt, ...receiptRest } = stamped ?? {};
  return dumpArtifact(
    {
      ...rest,
      verdict: "blocked",
      reverted: {
        stamped_at: stampedAt ?? null,
        at,
        ...receiptRest,
      },
    },
    body,
  );
}
