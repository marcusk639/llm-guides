import { CITATION_CLASSES } from "./citations.mjs";

export function summarise(results, issues) {
  const counts = {};
  for (const cls of CITATION_CLASSES) {
    counts[cls] = { resolves: 0, redirects: 0, dead: 0, total: 0 };
  }
  for (const r of results) {
    const row = (counts[r.class] ??= {
      resolves: 0,
      redirects: 0,
      dead: 0,
      total: 0,
    });
    row[r.outcome] += 1;
    row.total += 1;
  }
  return {
    counts,
    findings: results.filter((r) => r.outcome !== "resolves"),
    malformed: issues,
  };
}

export function formatText(summary) {
  const lines = [];
  for (const cls of CITATION_CLASSES) {
    const c = summary.counts[cls];
    lines.push(
      `${cls}: ${c.total} checked, ${c.redirects} redirected, ${c.dead} dead`,
    );
    for (const f of summary.findings.filter((x) => x.class === cls)) {
      const detail = f.error
        ? f.error
        : f.finalUrl && f.finalUrl !== f.url
          ? `-> ${f.finalUrl}`
          : "";
      lines.push(
        `  [${f.outcome}] ${f.origin}: ${f.url} ${f.status ?? ""} ${detail}`.trimEnd(),
      );
    }
  }
  for (const m of summary.malformed) {
    lines.push(`  [${m.rule}] ${m.origin}: ${m.message}`);
  }
  return lines.join("\n");
}

export function formatJson(summary) {
  return JSON.stringify(summary, null, 2);
}
