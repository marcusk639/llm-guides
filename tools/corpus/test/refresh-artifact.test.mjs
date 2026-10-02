// tools/corpus/test/refresh-artifact.test.mjs
import test from "node:test";
import assert from "node:assert/strict";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { loadRecords } from "../data.mjs";
import { resolveUnit, artifactPathFor } from "../refresh-units.mjs";
import { workOrder } from "../refresh-order.mjs";
import {
  UNIT_VERDICTS,
  RECORD_VERDICTS,
  parseArtifact,
  dumpArtifact,
  renderArtifactSkeleton,
  validateArtifact,
  withReceipt,
  withRevertMark,
} from "../refresh-artifact.mjs";

const FIX = fileURLToPath(new URL("./fixtures/refresh/", import.meta.url));
const fixRecords = () => loadRecords(path.join(FIX, "data"));

function skeleton() {
  const unit = resolveUnit(FIX, "guides/alpha/one.md", fixRecords());
  const order = workOrder(FIX, unit, fixRecords());
  const artifactPath = artifactPathFor(unit, "2026-09-28", FIX);
  return {
    artifactPath,
    text: renderArtifactSkeleton(order, { fetched: "2026-09-28", artifactPath }),
  };
}

test("the vocabularies are the two the contract names", () => {
  assert.deepEqual([...UNIT_VERDICTS], ["confirmed", "changed", "blocked"]);
  assert.deepEqual(
    [...RECORD_VERDICTS],
    ["confirmed", "corrected", "unreachable"],
  );
});

// Fail-closed: a skeleton nobody filled in cannot be stamped.
test("a fresh skeleton is blocked with every record unreachable", () => {
  const { text, artifactPath } = skeleton();
  const { data, body } = parseArtifact(text);
  assert.equal(data.kind, "refresh");
  assert.equal(data.verdict, "blocked");
  assert.equal(data.path, artifactPath);
  assert.equal(data.entry, "guides/alpha/one.md");
  assert.deepEqual(data.topics, ["alpha", "beta"]);
  assert.equal(
    data.records.every((r) => r.verdict === "unreachable"),
    true,
  );
  assert.equal(data.key_scoped, false);
  assert.match(body, /Narrative belongs in the pull request body/);
});

// Review Focus 3(b): the artifact must carry the narrowing, or stampUnit cannot
// know not to sweep the unit's pages.
test("a --key skeleton is marked key_scoped and covers only that record", () => {
  const unit = resolveUnit(FIX, "guides/alpha/one.md", fixRecords());
  const order = workOrder(FIX, unit, fixRecords(), { key: "fix.tail.three" });
  const artifactPath = artifactPathFor(unit, "2026-09-28", FIX);
  const { data } = parseArtifact(
    renderArtifactSkeleton(order, { fetched: "2026-09-28", artifactPath }),
  );
  assert.equal(data.key_scoped, true);
  assert.deepEqual(data.unit_keys, ["fix.tail.three"]);
  // The unit is still recorded in full, so a reader can see what was NOT swept.
  assert.equal(data.unit.length, 4);
});

test("a skeleton round-trips through parse and dump", () => {
  const { text } = skeleton();
  const { data, body } = parseArtifact(text);
  assert.equal(dumpArtifact(data, body), text);
});

test("a skeleton covers every record in the unit", () => {
  const { text } = skeleton();
  const { data } = parseArtifact(text);
  assert.deepEqual(
    data.records.map((r) => r.key).sort(),
    [...data.unit_keys].sort(),
  );
  assert.equal(
    data.records.every((r) => r.file === "data/units.yaml"),
    true,
  );
});

function confirmed() {
  const { text } = skeleton();
  const { data } = parseArtifact(text);
  return {
    ...data,
    verdict: "confirmed",
    records: data.records.map((r) => ({
      ...r,
      verdict: "confirmed",
      url: "https://example.invalid/one",
      stated: "unchanged",
      read: "2026-09-28",
    })),
  };
}

test("a filled-in confirmed artifact validates clean", () => {
  assert.deepEqual(validateArtifact(confirmed()), []);
});

// Review Focus 3: an unreachable record forces blocked.
test("an unreachable record with a confirmed unit verdict is incoherent", () => {
  const data = confirmed();
  data.records[0] = { ...data.records[0], verdict: "unreachable" };
  const rules = validateArtifact(data).map((i) => i.rule);
  assert.equal(rules.includes("refresh-verdict-incoherent"), true);
  data.verdict = "blocked";
  assert.deepEqual(
    validateArtifact(data).filter(
      (i) => i.rule === "refresh-verdict-incoherent",
    ),
    [],
  );
});

test("a record in the unit with no verdict entry is a coverage gap", () => {
  const data = confirmed();
  data.records = data.records.slice(1);
  const issue = validateArtifact(data).find(
    (i) => i.rule === "refresh-artifact-coverage",
  );
  assert.match(issue.message, /has no verdict entry/);
});

test("kind, required fields, verdicts and dates are all checked", () => {
  assert.equal(
    validateArtifact({ ...confirmed(), kind: "research" }).some(
      (i) => i.rule === "refresh-artifact-kind",
    ),
    true,
  );
  const { fetched, ...noFetched } = confirmed();
  assert.equal(
    validateArtifact(noFetched).some((i) => i.rule === "refresh-artifact-field"),
    true,
  );
  assert.equal(
    validateArtifact({ ...confirmed(), verdict: "ok" }).some(
      (i) => i.rule === "refresh-artifact-verdict",
    ),
    true,
  );
  assert.equal(
    validateArtifact({ ...confirmed(), fetched: "2026-02-30" }).some(
      (i) => i.rule === "refresh-artifact-date",
    ),
    true,
  );
  const badRead = confirmed();
  badRead.records[0] = { ...badRead.records[0], read: "28-09-2026" };
  assert.equal(
    validateArtifact(badRead).some((i) => i.rule === "refresh-artifact-date"),
    true,
  );
  assert.deepEqual(validateArtifact("not a mapping"), [
    {
      rule: "refresh-artifact-shape",
      message: "artifact front-matter is not a mapping",
    },
  ]);
});

test("key_scoped must be a boolean", () => {
  assert.equal(
    validateArtifact({ ...confirmed(), key_scoped: "yes" }).some(
      (i) => i.rule === "refresh-artifact-field",
    ),
    true,
  );
  const { key_scoped, ...noScope } = confirmed();
  assert.equal(
    validateArtifact(noScope).some((i) => i.rule === "refresh-artifact-field"),
    true,
  );
});

test("a confirmed record must cite the url it was read from", () => {
  const data = confirmed();
  data.records[0] = { ...data.records[0], url: "" };
  assert.equal(
    validateArtifact(data).some((i) => i.rule === "refresh-artifact-field"),
    true,
  );
});

const RECEIPT = {
  at: "2026-09-28",
  pages: [
    {
      path: "guides/alpha/one.md",
      previous_verified: "2026-09-16",
      research_added: true,
      previous_research: null,
    },
  ],
  records: [
    {
      key: "fix.shared.one",
      file: "data/units.yaml",
      previous_verified: "2026-09-16",
      new_verified: "2026-09-28",
    },
  ],
};

test("a receipt is written into and read back out of the artifact", () => {
  const { text } = skeleton();
  const stamped = withReceipt(text, RECEIPT);
  assert.deepEqual(parseArtifact(stamped).data.stamped, RECEIPT);
  assert.equal(parseArtifact(stamped).body, parseArtifact(text).body);
});

test("a revert moves the receipt to reverted: and forces verdict blocked", () => {
  const { text } = skeleton();
  const { data, body } = parseArtifact(text);
  const stamped = withReceipt(
    dumpArtifact({ ...data, verdict: "confirmed" }, body),
    RECEIPT,
  );
  const reverted = parseArtifact(withRevertMark(stamped, "2026-09-29")).data;
  assert.equal("stamped" in reverted, false);
  assert.equal(reverted.verdict, "blocked");
  // The revert date, not the stamp date. RECEIPT.at is "2026-09-28"; a
  // `{ at, ...stamped }` spread would silently put that back here.
  assert.equal(reverted.reverted.at, "2026-09-29");
  assert.equal(reverted.reverted.stamped_at, "2026-09-28");
  assert.equal("at" in RECEIPT, true);
  assert.deepEqual(reverted.reverted.records, RECEIPT.records);
  assert.deepEqual(reverted.reverted.pages, RECEIPT.pages);
});
