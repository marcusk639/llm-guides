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

// C1 (final review): --archive took any --artifact path, parsed it, and wrote
// dumpArtifact() back over it. Pointed at data/*.yaml it prepended "---\nnull\n---"
// and round-tripped a file whose top-of-file comments the contract requires;
// pointed at guides/ it reformatted a page's front-matter; pointed at ../ it
// wrote outside the corpus. All three exited 0 printing "archived: <path>".
function archiveCorpus(artifactRel, artifactBody, extra = {}) {
  const root = emptyCorpus();
  for (const [rel, body] of Object.entries({
    [artifactRel]: artifactBody,
    ...extra,
  })) {
    const p = path.join(root, rel);
    fs.mkdirSync(path.dirname(p), { recursive: true });
    fs.writeFileSync(p, body);
  }
  return root;
}

const DATA_YAML = `# Contract-required comment at the top of this file.
records:
  - key: a.one
    value: "1"
    volatility: high
    source: https://example.com/a
    verified: "2026-01-01"
    tags: [t]
`;

const GUIDE_MD = `---
title: One
verified: "2026-09-01"
---

body
`;

test("--archive refuses a data/ file and leaves it byte-identical", () => {
  const root = archiveCorpus("data/x.yaml", DATA_YAML);
  const r = run(["sources", "--archive", "--artifact=data/x.yaml", "."], root);
  assert.equal(r.code, 2);
  assert.equal(fs.readFileSync(path.join(root, "data/x.yaml"), "utf8"), DATA_YAML);
});

test("--archive refuses a guides/ page and leaves it byte-identical", () => {
  const root = archiveCorpus("guides/t/one.md", GUIDE_MD);
  const r = run(
    ["sources", "--archive", "--artifact=guides/t/one.md", "."],
    root,
  );
  assert.equal(r.code, 2);
  assert.equal(
    fs.readFileSync(path.join(root, "guides/t/one.md"), "utf8"),
    GUIDE_MD,
  );
});

test("--archive refuses a path that escapes the corpus root", () => {
  const root = archiveCorpus("research/t/a.md", "---\nkind: refresh\n---\n");
  const outside = path.join(root, "..", `outside-${path.basename(root)}.md`);
  fs.writeFileSync(outside, "untouched\n");
  const r = run(
    [
      "sources",
      "--archive",
      `--artifact=../${path.basename(outside)}`,
      ".",
    ],
    root,
  );
  assert.equal(r.code, 2);
  assert.equal(fs.readFileSync(outside, "utf8"), "untouched\n");
  fs.rmSync(outside);
});

test("--archive refuses a research/ file that is not kind: refresh", () => {
  const body = "---\nkind: notes\npath: research/t/a.md\n---\n\nbody\n";
  const root = archiveCorpus("research/t/a.md", body);
  const r = run(
    ["sources", "--archive", "--artifact=research/t/a.md", "."],
    root,
  );
  assert.equal(r.code, 2);
  assert.equal(
    fs.readFileSync(path.join(root, "research/t/a.md"), "utf8"),
    body,
  );
});

test("--archive refuses an artifact whose own path field disagrees", () => {
  const body = "---\nkind: refresh\npath: research/t/other.md\n---\n\nbody\n";
  const root = archiveCorpus("research/t/a.md", body);
  const r = run(
    ["sources", "--archive", "--artifact=research/t/a.md", "."],
    root,
  );
  assert.equal(r.code, 2);
  assert.equal(
    fs.readFileSync(path.join(root, "research/t/a.md"), "utf8"),
    body,
  );
});
