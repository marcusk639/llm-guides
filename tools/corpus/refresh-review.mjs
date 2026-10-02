// tools/corpus/refresh-review.mjs
// What the verify agent is shown, and deliberately what it is not. A reviewer
// handed the reasoning it is meant to audit tends to ratify it, so the packet
// is the branch diff over guides/ and data/ only. research/ — which is where
// the refresh's own verdicts live — is excluded entirely. The artifact still
// lands on the branch for the human reviewer.
import { spawnSync } from "node:child_process";
import { RefreshError } from "./refresh-units.mjs";

export const REVIEW_PATHSPECS = Object.freeze(["guides", "data"]);

const defaultRun = (cmd, args) => spawnSync(cmd, args, { encoding: "utf8" });

export function reviewPacket(root, baseRef, { run = defaultRun } = {}) {
  const args = ["-C", root, "diff", baseRef, "--", ...REVIEW_PATHSPECS];
  const r = run("git", args);
  if (r.status !== 0)
    throw new RefreshError(
      "refresh-review-diff-failed",
      `git diff ${baseRef} failed: ${r.stderr ?? ""}`,
    );
  return {
    pathspecs: [...REVIEW_PATHSPECS],
    argv: ["git", ...args],
    diff: r.stdout,
  };
}

// The URLs the refresh says it read, so the agent can read them itself. Not the
// verdicts, not the reasoning — an unreachable record contributes nothing.
export function sourcesFor(artifact) {
  return (artifact.records ?? [])
    .filter((e) => typeof e.url === "string" && e.url.trim() !== "")
    .map((e) => ({ key: e.key, url: e.url, stated: e.stated ?? "" }));
}
