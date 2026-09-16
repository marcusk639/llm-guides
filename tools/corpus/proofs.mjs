import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import yaml from "js-yaml";

export const DEFAULT_PROOF_TIMEOUT_SECONDS = 60;

export function discoverProofs(examplesDir) {
  if (!fs.existsSync(examplesDir)) return [];
  const proofs = [];
  for (const entry of fs.readdirSync(examplesDir, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue;
    const dir = path.join(examplesDir, entry.name);
    const manifest = path.join(dir, "proof.yaml");
    if (!fs.existsSync(manifest)) continue;
    let doc;
    try {
      doc =
        yaml.load(fs.readFileSync(manifest, "utf8"), {
          schema: yaml.JSON_SCHEMA,
        }) ?? {};
    } catch (err) {
      proofs.push({ dir, malformed: true, error: err.message });
      continue;
    }
    if (doc.kind !== "proof") continue;
    proofs.push({ ...doc, dir });
  }
  return proofs;
}

export function runProof(proof) {
  if (proof.malformed) {
    return { result: "fail", exitCode: null, error: proof.error };
  }
  const timeoutSeconds = proof.timeout_seconds ?? DEFAULT_PROOF_TIMEOUT_SECONDS;
  const r = spawnSync(proof.command, {
    cwd: proof.dir,
    shell: true,
    encoding: "utf8",
    timeout: timeoutSeconds * 1000,
  });
  return {
    result: r.status === 0 ? "pass" : "fail",
    exitCode: r.status,
    stdout: r.stdout,
    stderr: r.stderr,
    ...(r.error ? { error: r.error.message } : {}),
  };
}

export function restamp(
  proof,
  result,
  today = new Date().toISOString().slice(0, 10),
) {
  const manifest = path.join(proof.dir, "proof.yaml");
  const doc = yaml.load(fs.readFileSync(manifest, "utf8"), {
    schema: yaml.JSON_SCHEMA,
  });
  doc.last_run = today;
  doc.result = result;
  fs.writeFileSync(manifest, yaml.dump(doc));
}
