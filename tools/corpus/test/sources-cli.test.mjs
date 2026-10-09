import test from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const CLI = new URL("../cli.mjs", import.meta.url).pathname;

function run(args, cwd) {
  try {
    const out = execFileSync(process.execPath, [CLI, ...args], {
      cwd,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
    });
    return { code: 0, out, err: "" };
  } catch (e) {
    return { code: e.status, out: e.stdout ?? "", err: e.stderr ?? "" };
  }
}

function emptyCorpus() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "srccli-"));
  fs.mkdirSync(path.join(root, "data"), { recursive: true });
  fs.mkdirSync(path.join(root, "guides"), { recursive: true });
  return root;
}

test("sources exits 0 on a corpus with nothing to check", () => {
  const r = run(["sources", "."], emptyCorpus());
  assert.equal(r.code, 0);
});

test("sources --json emits parseable JSON on an empty corpus", () => {
  const r = run(["sources", "--json", "."], emptyCorpus());
  assert.equal(r.code, 0);
  const parsed = JSON.parse(r.out);
  assert.ok(parsed.counts["record-source"]);
});

test("sources exits 2 when --check is passed, like every other non-render command", () => {
  const r = run(["sources", "--check", "."], emptyCorpus());
  assert.equal(r.code, 2);
});

test("an unknown flag exits 2 and names itself", () => {
  const r = run(["sources", "--achive", "."], emptyCorpus());
  assert.equal(r.code, 2);
  // Assert on the reason line's unique prefix, never on the flag name alone:
  // the static usage block also contains flag names, so a substring match
  // would pass even with the rejection code path fully removed.
  assert.match(r.err, /^corpus: unknown flag --achive$/m);
});

test("known flags on known commands are still accepted", () => {
  assert.equal(run(["sources", "--json", "."], emptyCorpus()).code, 0);
  assert.equal(run(["lint", "."], emptyCorpus()).code, 0);
});

test("sources --archive without --artifact exits 2", () => {
  const r = run(["sources", "--archive", "."], emptyCorpus());
  assert.equal(r.code, 2);
  assert.match(r.err, /^corpus: sources --archive requires --artifact=/m);
});

test("sources --archive with a missing artifact exits 2 and names the rule", () => {
  const r = run(
    ["sources", "--archive", "--artifact=research/t/nope.md", "."],
    emptyCorpus(),
  );
  assert.equal(r.code, 2);
  assert.match(r.err, /refresh-artifact-not-found/);
});
