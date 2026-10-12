import test from "node:test";
import assert from "node:assert/strict";
import { captureOne, applyCaptures, ARCHIVE_SUBMIT_URL } from "../archive.mjs";
import { parseArtifact } from "../refresh-artifact.mjs";

test("ARCHIVE_SUBMIT_URL is an absolute https URL", () => {
  const u = new URL(ARCHIVE_SUBMIT_URL);
  assert.equal(u.protocol, "https:");
});

test("captureOne reports a successful capture", async () => {
  const submitImpl = async () => ({
    status: 200,
    redirected: false,
    url: "https://archive.example/w/20261008/https://e.com/a",
  });
  const r = await captureOne("https://e.com/a", { submitImpl });
  assert.equal(r.archive_outcome, "captured");
  assert.match(r.archived, /^https:\/\/archive\.example\//);
  assert.equal(r.error, null);
});

test("captureOne reports a service refusal as refused, with no URL", async () => {
  const submitImpl = async () => ({
    status: 403,
    redirected: false,
    url: null,
  });
  const r = await captureOne("https://e.com/no-robots", { submitImpl });
  assert.equal(r.archive_outcome, "refused");
  assert.equal(r.archived, null);
});

test("captureOne reports a network error or timeout as failed", async () => {
  const boom = async () => {
    throw new Error("ECONNRESET");
  };
  const r = await captureOne("https://e.com/a", { submitImpl: boom });
  assert.equal(r.archive_outcome, "failed");
  assert.equal(r.archived, null);
  assert.match(r.error, /ECONNRESET/);
});

// Asserting only "the outcome is one of the three strings" passes whatever
// the mapping is, so it cannot detect a transient 429 being recorded as a
// durable refusal. Pin each status to its exact outcome instead.
test("captureOne maps each status to its exact outcome", async () => {
  const cases = [
    [200, "captured"],
    [299, "captured"],
    [403, "refused"],
    [404, "refused"],
    [429, "failed"],
    [500, "failed"],
    [503, "failed"],
  ];
  for (const [status, expected] of cases) {
    const submitImpl = async () => ({
      status,
      redirected: false,
      url: "https://archive.example/x",
    });
    const r = await captureOne("https://e.com/a", { submitImpl });
    assert.equal(r.archive_outcome, expected, `status ${status}`);
  }
});

test("a rate-limited capture is never recorded as refused", async () => {
  const submitImpl = async () => ({
    status: 429,
    redirected: false,
    url: null,
  });
  const r = await captureOne("https://e.com/a", { submitImpl });
  assert.notEqual(r.archive_outcome, "refused");
  assert.equal(r.archive_outcome, "failed");
});

const ARTIFACT = `---
kind: refresh
unit: [guides/t/p.md]
entry: guides/t/p.md
topic: t
fetched: "2026-10-08"
verdict: changed
unit_keys: [a.one, a.two]
records:
  - key: a.one
    file: data/x.yaml
    verdict: confirmed
    url: https://e.com/a
    read: "2026-10-08"
    was: "2026-01-01"
  - key: a.two
    file: data/x.yaml
    verdict: confirmed
    url: https://e.com/b
    read: "2026-10-08"
    was: "2026-01-01"
---

body
`;

test("applyCaptures writes the three fields onto the matching entry only", () => {
  const out = applyCaptures(
    ARTIFACT,
    [
      {
        key: "a.one",
        archived: "https://archive.example/s1",
        archive_outcome: "captured",
        error: null,
      },
    ],
    { today: "2026-10-08" },
  );
  const { data } = parseArtifact(out);
  assert.equal(data.records[0].archived, "https://archive.example/s1");
  assert.equal(data.records[0].archive_outcome, "captured");
  assert.equal(data.records[0].archive_read, "2026-10-08");
  assert.equal(data.records[1].archived, undefined);
  assert.equal(data.records[1].archive_outcome, undefined);
});

test("applyCaptures records a refusal with an outcome and date but no URL", () => {
  const out = applyCaptures(
    ARTIFACT,
    [{ key: "a.two", archived: null, archive_outcome: "refused", error: null }],
    { today: "2026-10-08" },
  );
  const { data } = parseArtifact(out);
  assert.equal(data.records[1].archive_outcome, "refused");
  assert.equal(data.records[1].archive_read, "2026-10-08");
  assert.ok(!("archived" in data.records[1]));
});

test("applyCaptures throws for a key the artifact does not carry", () => {
  assert.throws(() =>
    applyCaptures(
      ARTIFACT,
      [
        {
          key: "not.in.unit",
          archived: "https://archive.example/x",
          archive_outcome: "captured",
          error: null,
        },
      ],
      { today: "2026-10-08" },
    ),
  );
});

// I4 (final review): a second --archive run that hits a 429 set
// archive_outcome: failed but LEFT the first run's good URL in `archived`.
// stampUnit gates on the outcome, so it then wrote no source_archived at all
// despite a valid snapshot sitting right there, and validateArtifact called the
// entry clean. A stale URL beside a failure is worse than no URL.
test("applyCaptures clears a stale archived when the outcome is not captured", () => {
  const withPrior = ARTIFACT.replace(
    "    was: \"2026-01-01\"\n  - key: a.two",
    "    was: \"2026-01-01\"\n    archived: https://archive.example/FIRST-RUN\n    archive_outcome: captured\n    archive_read: \"2026-10-01\"\n  - key: a.two",
  );
  const out = applyCaptures(
    withPrior,
    [
      {
        key: "a.one",
        archived: null,
        archive_outcome: "failed",
        error: "archive service returned 429",
      },
    ],
    { today: "2026-10-12" },
  );
  const { data } = parseArtifact(out);
  assert.equal(data.records[0].archive_outcome, "failed");
  assert.ok(
    !("archived" in data.records[0]),
    "a failed re-run must not leave the earlier run's URL behind",
  );
});

test("applyCaptures keeps archived when the outcome is captured", () => {
  const out = applyCaptures(
    ARTIFACT,
    [
      {
        key: "a.one",
        archived: "https://archive.example/s1",
        archive_outcome: "captured",
        error: null,
      },
    ],
    { today: "2026-10-12" },
  );
  const { data } = parseArtifact(out);
  assert.equal(data.records[0].archived, "https://archive.example/s1");
});

// I6 (final review): the whole --archive flow lived inline in cli.mjs calling
// captureOne() with no injectable impl, so none of it could be tested offline.
// That untestability was the structural cause of C1, I2 and I3 -- and of C1's
// own fix shipping untested. Extracted here so every guard is an offline test.
import { archiveArtifact } from "../archive.mjs";
import fs from "node:fs";
import os from "node:os";
import nodePath from "node:path";

const OK_SUBMIT = async (url) => ({
  status: 200,
  redirected: false,
  url: "https://archive.example/w/1/" + url,
});

function corpusWith(rel, body) {
  const root = fs.mkdtempSync(nodePath.join(os.tmpdir(), "arch-"));
  const p = nodePath.join(root, rel);
  fs.mkdirSync(nodePath.dirname(p), { recursive: true });
  fs.writeFileSync(p, body);
  return root;
}

const VALID = `---
kind: refresh
unit: [guides/t/p.md]
entry: guides/t/p.md
topic: t
topics: [t]
slug: p
path: research/t/a.md
fetched: "2026-10-12"
verdict: changed
key_scoped: false
unit_keys: [a.one]
unit_was:
  guides/t/p.md: "2026-01-01"
records:
  - key: a.one
    file: data/units.yaml
    verdict: confirmed
    url: https://example.com/a
    stated: "one"
    read: "2026-10-12"
    was: "2026-01-01"
---

body
`;

// I2: a blocked artifact's unreachable record has no `url`. captureOne(undefined)
// submitted the literal string "undefined" to the archive service and recorded
// the result as `captured` -- the evidence record then asserted a snapshot for
// the one record whose whole point is that nothing could be reached.
const BLOCKED = VALID.replace("verdict: changed", "verdict: blocked")
  .replace("    verdict: confirmed\n    url: https://example.com/a\n", "    verdict: unreachable\n");

test("archiveArtifact never submits a record that has no url", async () => {
  const seen = [];
  const root = corpusWith("research/t/a.md", BLOCKED);
  const r = await archiveArtifact(root, "research/t/a.md", {
    submitImpl: async (u) => {
      seen.push(u);
      return OK_SUBMIT(u);
    },
    today: "2026-10-12",
  });
  assert.deepEqual(seen, [], "nothing should have been submitted");
  assert.equal(r.captures[0].archive_outcome, "failed");
  assert.match(r.captures[0].error, /no url/i);
  const after = fs.readFileSync(nodePath.join(root, "research/t/a.md"), "utf8");
  assert.ok(!after.includes("undefined"));
  assert.ok(!/archive_outcome: captured/.test(after));
});

test("archiveArtifact captures a reachable record and writes the artifact", async () => {
  const root = corpusWith("research/t/a.md", VALID);
  const r = await archiveArtifact(root, "research/t/a.md", {
    submitImpl: OK_SUBMIT,
    today: "2026-10-12",
  });
  assert.equal(r.written, true);
  assert.equal(r.captures[0].archive_outcome, "captured");
  const after = fs.readFileSync(nodePath.join(root, "research/t/a.md"), "utf8");
  assert.match(after, /archive_outcome: captured/);
  assert.match(after, /archive_read: '2026-10-12'/);
});

test("archiveArtifact refuses targets outside research/ and bad artifacts", async () => {
  const cases = [
    ["data/x.yaml", "records: []\n", "refresh-artifact-outside-research"],
    ["research/t/a.md", VALID.replace("kind: refresh", "kind: notes"), "refresh-artifact-kind"],
    [
      "research/t/a.md",
      VALID.replace("path: research/t/a.md", "path: research/t/other.md"),
      "refresh-artifact-path-mismatch",
    ],
  ];
  for (const [rel, body, rule] of cases) {
    const root = corpusWith(rel, body);
    const before = fs.readFileSync(nodePath.join(root, rel), "utf8");
    await assert.rejects(
      () => archiveArtifact(root, rel, { submitImpl: OK_SUBMIT, today: "2026-10-12" }),
      (e) => e.rule === rule,
      `expected ${rule} for ${rel}`,
    );
    assert.equal(fs.readFileSync(nodePath.join(root, rel), "utf8"), before);
  }
});

test("archiveArtifact surfaces a write failure rather than swallowing it", async () => {
  const root = corpusWith("research/t/a.md", VALID);
  const target = nodePath.join(root, "research/t/a.md");
  await assert.rejects(
    () =>
      archiveArtifact(root, "research/t/a.md", {
        submitImpl: OK_SUBMIT,
        today: "2026-10-12",
        writeImpl: () => {
          throw new Error("EACCES: permission denied");
        },
      }),
    (e) => e.rule === "refresh-artifact-write-failed",
  );
  assert.ok(fs.existsSync(target));
});
