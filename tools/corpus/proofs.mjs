import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import yaml from "js-yaml";

export function discoverProofs(examplesDir) {
  if (!fs.existsSync(examplesDir)) return [];
  const proofs = [];
  for (const entry of fs.readdirSync(examplesDir, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue;
    const manifest = path.join(examplesDir, entry.name, "proof.yaml");
    if (!fs.existsSync(manifest)) continue;
    const doc =
      yaml.load(fs.readFileSync(manifest, "utf8"), {
        schema: yaml.JSON_SCHEMA,
      }) ?? {};
    if (doc.kind !== "proof") continue;
    proofs.push({ ...doc, dir: path.join(examplesDir, entry.name) });
  }
  return proofs;
}

export function runProof(proof) {
  const r = spawnSync(proof.command, {
    cwd: proof.dir,
    shell: true,
    encoding: "utf8",
  });
  return {
    result: r.status === 0 ? "pass" : "fail",
    exitCode: r.status,
    stdout: r.stdout,
    stderr: r.stderr,
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
