// tools/corpus/test/refresh-review.test.mjs
import test from "node:test";
import assert from "node:assert/strict";
import { RefreshError } from "../refresh-units.mjs";
import {
  REVIEW_PATHSPECS,
  reviewPacket,
  sourcesFor,
} from "../refresh-review.mjs";

const ok = (stdout) => () => ({ status: 0, stdout, stderr: "" });

test("the packet's pathspecs are exactly guides and data", () => {
  assert.deepEqual([...REVIEW_PATHSPECS], ["guides", "data"]);
});

// The agent must not be shown the refresh's own reasoning, and the artifact is
// the refresh's own reasoning.
test("research/ never reaches the agent through the diff", () => {
  const packet = reviewPacket("/repo", "master", { run: ok("diff bytes") });
  assert.deepEqual(packet.pathspecs, ["guides", "data"]);
  assert.equal(
    packet.argv.some((a) => a.includes("research")),
    false,
  );
  assert.deepEqual(packet.argv, [
    "git",
    "-C",
    "/repo",
    "diff",
    "master",
    "--",
    "guides",
    "data",
  ]);
  assert.equal(packet.diff, "diff bytes");
});

test("a failing git diff raises rather than returning an empty packet", () => {
  assert.throws(
    () =>
      reviewPacket("/repo", "master", {
        run: () => ({ status: 128, stdout: "", stderr: "bad revision" }),
      }),
    (err) =>
      err instanceof RefreshError &&
      err.rule === "refresh-review-diff-failed",
  );
});

test("sourcesFor hands over the cited urls and stated figures, nothing else", () => {
  const artifact = {
    records: [
      {
        key: "a.b",
        url: "https://example.invalid/a",
        stated: "$5 / MTok",
        verdict: "confirmed",
      },
      { key: "c.d", url: "", stated: "", verdict: "unreachable" },
    ],
  };
  assert.deepEqual(sourcesFor(artifact), [
    { key: "a.b", url: "https://example.invalid/a", stated: "$5 / MTok" },
  ]);
});
