import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import yaml from "js-yaml";
import { discoverProofs, runProof, restamp } from "../proofs.mjs";

const EXAMPLES = new URL("../../../examples/", import.meta.url).pathname;

function mkTempExamplesDir() {
  return fs.mkdtempSync(path.join(os.tmpdir(), "proofs-test-"));
}

function writeManifest(examplesDir, proofName, content) {
  const dir = path.join(examplesDir, proofName);
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, "proof.yaml"), content);
  return dir;
}

const VALID_MANIFEST = `kind: proof
claim: A claim the repo can falsify.
origin: docs/spec.md
tier: 4
command: node run.mjs
passes_when: exit code 0
last_run: 2026-09-16
result: pass
`;

test("discovers a proof manifest and ignores a non-proof sibling", () => {
  const examplesDir = mkTempExamplesDir();
  try {
    writeManifest(examplesDir, "good", VALID_MANIFEST);
    writeManifest(
      examplesDir,
      "ignored",
      `kind: example
claim: not a proof
`,
    );
    const proofs = discoverProofs(examplesDir);
    assert.equal(proofs.length, 1);
    assert.equal(proofs[0].dir.endsWith("good"), true);
    assert.equal(proofs[0].claim, "A claim the repo can falsify.");
    assert.equal(proofs[0].command, "node run.mjs");
    assert.equal(proofs[0].tier, 4);
  } finally {
    fs.rmSync(examplesDir, { recursive: true, force: true });
  }
});

test("reports a malformed manifest without skipping the rest of the directory", () => {
  const examplesDir = mkTempExamplesDir();
  try {
    writeManifest(
      examplesDir,
      "bad",
      `kind: proof
claim: [unterminated
`,
    );
    writeManifest(examplesDir, "valid", VALID_MANIFEST);
    const proofs = discoverProofs(examplesDir);
    const bad = proofs.find((p) => p.dir.endsWith("bad"));
    const valid = proofs.find((p) => p.dir.endsWith("valid"));
    assert.equal(bad.malformed, true);
    assert.equal(typeof bad.error === "string" && bad.error.length > 0, true);
    assert.equal(valid !== undefined, true);
    assert.equal(valid.malformed, undefined);
    assert.equal(valid.claim, "A claim the repo can falsify.");
  } finally {
    fs.rmSync(examplesDir, { recursive: true, force: true });
  }
});

test("runProof on a malformed proof fails without spawning", () => {
  const result = runProof({
    dir: mkTempExamplesDir(),
    malformed: true,
    error: "bad indentation",
  });
  assert.equal(result.result, "fail");
  assert.equal(result.exitCode, null);
});

test("reports fail on a non-zero exit", () => {
  const examplesDir = mkTempExamplesDir();
  try {
    const result = runProof({
      dir: examplesDir,
      command: 'node -e "process.exit(3)"',
    });
    assert.equal(result.result, "fail");
    assert.equal(result.exitCode, 3);
  } finally {
    fs.rmSync(examplesDir, { recursive: true, force: true });
  }
});

test("reports fail when the command exceeds its timeout", () => {
  const examplesDir = mkTempExamplesDir();
  try {
    const result = runProof({
      dir: examplesDir,
      command: 'node -e "setTimeout(()=>{},10000)"',
      timeout_seconds: 1,
    });
    assert.equal(result.result, "fail");
    assert.equal(result.exitCode, null);
  } finally {
    fs.rmSync(examplesDir, { recursive: true, force: true });
  }
});

test("restamp round-trips last_run and result without disturbing other fields", () => {
  const examplesDir = mkTempExamplesDir();
  try {
    const dir = writeManifest(examplesDir, "roundtrip", VALID_MANIFEST);
    restamp({ dir }, "fail", "2026-10-01");
    const reloaded = yaml.load(
      fs.readFileSync(path.join(dir, "proof.yaml"), "utf8"),
      { schema: yaml.JSON_SCHEMA },
    );
    assert.equal(reloaded.last_run, "2026-10-01");
    assert.equal(typeof reloaded.last_run, "string");
    assert.equal(reloaded.result, "fail");
    assert.equal(reloaded.kind, "proof");
    assert.equal(reloaded.claim, "A claim the repo can falsify.");
    assert.equal(reloaded.origin, "docs/spec.md");
    assert.equal(reloaded.tier, 4);
    assert.equal(reloaded.command, "node run.mjs");
    assert.equal(reloaded.passes_when, "exit code 0");
  } finally {
    fs.rmSync(examplesDir, { recursive: true, force: true });
  }
});

test("runs the shipped marker-render-idempotence proof and reports pass", () => {
  const proof = discoverProofs(EXAMPLES).find((p) =>
    p.dir.endsWith("marker-render-idempotence"),
  );
  assert.equal(runProof(proof).result, "pass");
});
