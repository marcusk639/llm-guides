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
