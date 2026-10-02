// tools/corpus/test/refresh-proof.test.mjs
// npm test globs tools/corpus/test/**/*.test.mjs only, so without this the
// refresh-idempotence proof runs once by hand and its `result: pass` then sits
// in the manifest unchallenged while the code it guards keeps changing. This is
// the minimum that stops that: spawn the manifest's command in the proof's own
// directory and require exit 0. It does not read or rewrite the manifest —
// re-stamping `last_run` and `result` across every proof is proofs.mjs#restamp,
// which belongs to the scheduled audit and is not re-implemented here.
import test from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const DIR = fileURLToPath(
  new URL("../../../examples/refresh-idempotence/", import.meta.url),
);

test("the refresh-idempotence proof still passes", () => {
  const r = spawnSync(process.execPath, ["run.mjs"], {
    cwd: DIR,
    encoding: "utf8",
  });
  assert.equal(
    r.status,
    0,
    `proof failed:\n${r.stdout}\n${r.stderr}`,
  );
  assert.match(r.stdout, /^PASS: an unchanged refresh unit diffs only in dates$/m);
});
