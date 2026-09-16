import test from "node:test";
import assert from "node:assert/strict";
import { discoverProofs, runProof } from "../proofs.mjs";

const EXAMPLES = new URL("../../../examples/", import.meta.url).pathname;

test("discovers proof manifests and ignores plain examples", () => {
  const proofs = discoverProofs(EXAMPLES);
  assert.equal(proofs.length >= 1, true);
  assert.equal(
    proofs.every((p) => p.claim && p.command && p.tier != null),
    true,
  );
});

test("runs a proof and reports pass", () => {
  const proof = discoverProofs(EXAMPLES).find((p) =>
    p.dir.endsWith("marker-render-idempotence"),
  );
  assert.equal(runProof(proof).result, "pass");
});

test("reports fail on a non-zero exit", () => {
  const result = runProof({
    dir: EXAMPLES,
    command: 'node -e "process.exit(3)"',
  });
  assert.equal(result.result, "fail");
  assert.equal(result.exitCode, 3);
});
