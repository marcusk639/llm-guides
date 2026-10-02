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

// Review 2 / F4. The drift guard is only as strong as the snapshot it compares
// against, so a hand-deleted or hand-edited snapshot must not be accepted --
// otherwise the half-stamp hole re-opens with one deletion.
test("the skeleton records the dates it read, per page and per record", () => {
  const { text } = skeleton();
  const { data } = parseArtifact(text);
  assert.deepEqual(Object.keys(data.unit_was).sort(), [...data.unit].sort());
  for (const rel of data.unit) assert.equal(data.unit_was[rel], "2026-09-16");
  for (const r of data.records) assert.equal(r.was, "2026-09-16");
});

test("a missing or non-date unit_was snapshot is refused", () => {
  const { unit_was, ...noSnapshot } = confirmed();
  assert.equal(
    validateArtifact(noSnapshot).some(
      (i) => i.rule === "refresh-artifact-field",
    ),
    true,
  );
  for (const bad of [null, "2026-09-16", []])
    assert.equal(
      validateArtifact({ ...confirmed(), unit_was: bad }).some(
        (i) => i.rule === "refresh-artifact-field",
      ),
      true,
      `expected refresh-artifact-field for unit_was ${JSON.stringify(bad)}`,
    );
  // Present, a mapping, but one page's entry deleted or spoiled.
  const dropped = confirmed();
  const victim = dropped.unit[0];
  const { [victim]: gone, ...rest } = dropped.unit_was;
  assert.equal(
    validateArtifact({ ...dropped, unit_was: rest }).some(
      (i) => i.rule === "refresh-artifact-date",
    ),
    true,
  );
  assert.equal(
    validateArtifact({
      ...dropped,
      unit_was: { ...dropped.unit_was, [victim]: "2026-02-30" },
    }).some((i) => i.rule === "refresh-artifact-date"),
    true,
  );
});

test("a missing or non-date record was snapshot is refused", () => {
  const withWas = (was) => {
    const data = confirmed();
    data.records[0] = { ...data.records[0], was };
    return validateArtifact(data).map((i) => i.rule);
  };
  for (const bad of [undefined, null, "", "28-09-2026", "2026-02-30", 20260916])
    assert.equal(
      withWas(bad).includes("refresh-artifact-date"),
      true,
      `expected refresh-artifact-date for was ${JSON.stringify(bad)}`,
    );
});

// Review 2 / F2 and F6b. `startsWith("data/")` is a string prefix test, so
// `data/../../x.yaml` passed it and nodePath.join then resolved it above the
// corpus root; stampUnit read that file, bumped it and wrote it back. F6b also
// records that the whole shape check had NO test at all, which is why the
// traversal shipped unnoticed, so every arm is pinned here.
test("a records[].file that escapes data/ is refused by containment, not by prefix", () => {
  const withFile = (file) => {
    const data = confirmed();
    data.records[0] = { ...data.records[0], file };
    return validateArtifact(data).map((i) => i.rule);
  };
  // The probed traversal: out of data/ but still inside the corpus.
  assert.equal(
    withFile("data/../outside/evil.yaml").includes(
      "refresh-record-file-escapes-data",
    ),
    true,
  );
  // The probed escape: two levels up, out of the corpus root entirely.
  assert.equal(
    withFile("data/../../ESCAPED.yaml").includes(
      "refresh-record-file-escapes-data",
    ),
    true,
  );
  // An absolute path resolves nowhere near data/ either.
  assert.equal(
    withFile("/etc/evil.yaml").includes("refresh-record-file-escapes-data"),
    true,
  );
  // A sibling of data/ whose name merely starts with the same characters:
  // "dataset/" is what a bare prefix test on "data" would have let through.
  assert.equal(
    withFile("dataset/evil.yaml").includes("refresh-record-file-escapes-data"),
    true,
  );
  // Not a .yaml file: the loader only ever reads .yaml, so nothing else is a
  // record's home.
  assert.equal(
    withFile("data/units.yml").includes("refresh-record-file-escapes-data"),
    true,
  );
  // A nested data file is legitimate and must still pass.
  assert.deepEqual(withFile("data/nested/units.yaml"), []);
  assert.deepEqual(withFile("data/units.yaml"), []);
});

test("a records[].file that is not a string is a missing-field issue, not an escape", () => {
  const withFile = (file) => {
    const data = confirmed();
    data.records[0] = { ...data.records[0], file };
    return validateArtifact(data).map((i) => i.rule);
  };
  for (const bad of [undefined, null, 42, ["data/units.yaml"], ""])
    assert.equal(
      withFile(bad).includes("refresh-artifact-field"),
      true,
      `expected refresh-artifact-field for file ${JSON.stringify(bad)}`,
    );
});

// Review 2 / F6a. The per-record verdict check is load-bearing and had no test:
// the all-or-nothing coherence rule keys off the exact string "unreachable", so
// an accepted typo'd verdict leaves refresh-verdict-incoherent silent and the
// unit stamps confirmed over a record that was never read.
test("an unknown, miscased or absent record verdict is refused by name", () => {
  const withVerdict = (verdict) => {
    const data = confirmed();
    data.records[0] = { ...data.records[0], verdict };
    return validateArtifact(data).map((i) => i.rule);
  };
  for (const bad of ["unreachabl", "Unreachable", "not-reached", undefined])
    assert.equal(
      withVerdict(bad).includes("refresh-artifact-verdict"),
      true,
      `expected refresh-artifact-verdict for ${JSON.stringify(bad)}`,
    );
  // And the near-miss does NOT satisfy the coherence rule, which is the whole
  // reason the vocabulary check has to hold.
  assert.equal(
    withVerdict("unreachabl").includes("refresh-verdict-incoherent"),
    false,
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
