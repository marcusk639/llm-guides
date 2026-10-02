// tools/corpus/test/refresh-cli.test.mjs
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { refreshCorpus } from "../cli.mjs";
import { parseArtifact } from "../refresh-artifact.mjs";

const FIXTURE = fileURLToPath(new URL("./fixtures/refresh/", import.meta.url));
const CLI = fileURLToPath(new URL("../cli.mjs", import.meta.url));

function sandbox() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "refresh-cli-"));
  fs.cpSync(FIXTURE, dir, { recursive: true });
  return dir;
}

test("the default mode prints the work order and exits 0 for a clean unit", () => {
  const root = sandbox();
  const r = refreshCorpus(root, ["--page=guides/alpha/one.md"], {
    today: "2026-09-28",
  });
  assert.equal(r.code, 0);
  assert.match(r.out.join("\n"), /^# Refresh work order: gone-plus-3$/m);
});

test("a unit with a blocking issue exits 1 and names the rule", () => {
  const root = sandbox();
  const r = refreshCorpus(root, ["--page=guides/gamma/nosix.md"], {
    today: "2026-09-28",
  });
  assert.equal(r.code, 1);
  assert.match(r.err.join("\n"), /refresh-section-six-missing/);
});

test("--skeleton writes a fail-closed artifact under research/<topic>/", () => {
  const root = sandbox();
  const r = refreshCorpus(
    root,
    ["--page=guides/alpha/one.md", "--skeleton"],
    { today: "2026-09-28" },
  );
  assert.equal(r.code, 0);
  const rel = "research/alpha/2026-09-28-gone-plus-3-refresh.md";
  assert.match(r.out.join("\n"), new RegExp(`wrote ${rel.replace(/\//g, "\\/")}`));
  const { data } = parseArtifact(fs.readFileSync(path.join(root, rel), "utf8"));
  assert.equal(data.verdict, "blocked");
  assert.equal(data.path, rel);
});

test("--skeleton refuses to write for a unit with a blocking issue", () => {
  const root = sandbox();
  const r = refreshCorpus(
    root,
    ["--page=guides/gamma/nosix.md", "--skeleton"],
    { today: "2026-09-28" },
  );
  assert.equal(r.code, 1);
  assert.equal(fs.existsSync(path.join(root, "research")), false);
});

test("--stamp then --revert leaves guides/ and data/ byte-exact", () => {
  const root = sandbox();
  const rel = "research/alpha/2026-09-28-gone-plus-3-refresh.md";
  const before = fs.readFileSync(path.join(root, "data/units.yaml"), "utf8");
  refreshCorpus(root, ["--page=guides/alpha/one.md", "--skeleton"], {
    today: "2026-09-28",
  });
  // Fill the skeleton in the way the refresh prompt would.
  const { data, body } = parseArtifact(
    fs.readFileSync(path.join(root, rel), "utf8"),
  );
  fs.writeFileSync(
    path.join(root, rel),
    `---\n${JSON.stringify(
      {
        ...data,
        verdict: "confirmed",
        records: data.records.map((e) => ({
          ...e,
          verdict: "confirmed",
          url: "https://example.invalid/one",
          stated: "unchanged",
        })),
      },
      null,
      2,
    )}\n---\n${body}`,
  );
  const stamped = refreshCorpus(
    root,
    ["--page=guides/alpha/one.md", "--stamp", `--artifact=${rel}`],
    { today: "2026-09-28" },
  );
  assert.equal(stamped.code, 0);
  assert.notEqual(
    fs.readFileSync(path.join(root, "data/units.yaml"), "utf8"),
    before,
  );
  const reverted = refreshCorpus(
    root,
    ["--page=guides/alpha/one.md", "--revert", `--artifact=${rel}`],
    { today: "2026-09-29" },
  );
  assert.equal(reverted.code, 0);
  assert.equal(
    fs.readFileSync(path.join(root, "data/units.yaml"), "utf8"),
    before,
  );
});

// Review Focus 3(b), end to end. This is the assertion the whole --key decision
// exists for: the record's date moves and not one page's does.
test("--key stamps the record and moves no page verified and adds no research:", () => {
  const root = sandbox();
  const rel = "research/alpha/2026-09-28-gone-plus-3-refresh.md";
  const pages = [
    "guides/alpha/one.md",
    "guides/alpha/two.md",
    "guides/beta/three.md",
    "guides/beta/gone.md",
  ];
  const before = Object.fromEntries(
    pages.map((p) => [p, fs.readFileSync(path.join(root, p), "utf8")]),
  );
  const skeleton = refreshCorpus(
    root,
    [
      "--page=guides/alpha/one.md",
      "--skeleton",
      "--key=fix.tail.three",
    ],
    { today: "2026-09-28" },
  );
  assert.equal(skeleton.code, 0);
  const { data, body } = parseArtifact(
    fs.readFileSync(path.join(root, rel), "utf8"),
  );
  assert.equal(data.key_scoped, true);
  assert.deepEqual(data.unit_keys, ["fix.tail.three"]);
  fs.writeFileSync(
    path.join(root, rel),
    `---\n${JSON.stringify(
      {
        ...data,
        verdict: "confirmed",
        records: data.records.map((e) => ({
          ...e,
          verdict: "confirmed",
          url: "https://example.invalid/three",
          stated: "unchanged",
        })),
      },
      null,
      2,
    )}\n---\n${body}`,
  );
  const stamped = refreshCorpus(
    root,
    ["--page=guides/alpha/one.md", "--stamp", `--artifact=${rel}`],
    { today: "2026-09-28" },
  );
  assert.equal(stamped.code, 0);
  // The record moved — `fix.tail.three` specifically, and nothing else in the
  // file. A whole-file substring search for the date would pass just as happily
  // if some other record had been stamped instead, which is the one thing a
  // --key run must never do.
  const unitBlocks = fs
    .readFileSync(path.join(root, "data/units.yaml"), "utf8")
    .split(/^ {2}- key: /m);
  const blockFor = (k) => unitBlocks.find((b) => b.startsWith(`${k}\n`)) ?? "";
  assert.match(
    blockFor("fix.tail.three"),
    /^ {4}verified: "2026-09-28"$/m,
    "fix.tail.three must carry the stamped date",
  );
  for (const other of ["fix.shared.one", "fix.bridge.two", "fix.alone.four"])
    assert.match(
      blockFor(other),
      /^ {4}verified: "2026-09-16"$/m,
      `${other} must keep its own date on a --key run`,
    );
  // No page did, and no page gained a research: it did not already have.
  for (const p of pages)
    assert.equal(
      fs.readFileSync(path.join(root, p), "utf8"),
      before[p],
      `${p} must not move on a --key run`,
    );
});

// One file, one writer. refresh must never touch the ledger.
test("no refresh mode regenerates meta/ledger.yaml", () => {
  const root = sandbox();
  const ledger = path.join(root, "meta", "ledger.yaml");
  fs.writeFileSync(ledger, "generated: 1970-01-01\nentries: []\n");
  const before = fs.readFileSync(ledger, "utf8");
  refreshCorpus(root, ["--page=guides/alpha/one.md"], { today: "2026-09-28" });
  refreshCorpus(root, ["--page=guides/alpha/one.md", "--skeleton"], {
    today: "2026-09-28",
  });
  assert.equal(fs.readFileSync(ledger, "utf8"), before);
});

test("an artifact path that disagrees with the artifact's own path is refused", () => {
  const root = sandbox();
  refreshCorpus(root, ["--page=guides/alpha/one.md", "--skeleton"], {
    today: "2026-09-28",
  });
  const r = refreshCorpus(
    root,
    [
      "--page=guides/alpha/one.md",
      "--stamp",
      "--artifact=research/alpha/wrong.md",
    ],
    { today: "2026-09-28" },
  );
  assert.equal(r.code, 1);
});

test("a missing --page, two modes, or --write is a usage error that says which", () => {
  const root = sandbox();
  const noPage = refreshCorpus(root, []);
  assert.equal(noPage.code, 2);
  assert.match(noPage.err.join("\n"), /--page=/);
  const twoModes = refreshCorpus(root, [
    "--page=guides/alpha/one.md",
    "--stamp",
    "--revert",
  ]);
  assert.equal(twoModes.code, 2);
  assert.match(twoModes.err.join("\n"), /one mode/);
  const write = refreshCorpus(root, [
    "--page=guides/alpha/one.md",
    "--write",
  ]);
  assert.equal(write.code, 2);
  assert.match(write.err.join("\n"), /--write/);
  // --stamp and --revert both need an artifact to work from.
  const noArtifact = refreshCorpus(root, [
    "--page=guides/alpha/one.md",
    "--stamp",
  ]);
  assert.equal(noArtifact.code, 2);
  assert.match(noArtifact.err.join("\n"), /--artifact=/);
});

// --page must be a flag: main()'s "first non-flag arg is root" rule would
// otherwise swallow the page path as the corpus root.
test("the spawned CLI takes the page as a flag and the root as the positional", () => {
  const root = sandbox();
  const r = spawnSync(
    process.execPath,
    [CLI, "refresh", "--page=guides/alpha/one.md", root],
    { encoding: "utf8" },
  );
  assert.equal(r.status, 0);
  assert.match(r.stdout, /# Refresh work order: gone-plus-3/);
});

test("usage names the refresh command", () => {
  const r = spawnSync(process.execPath, [CLI, "nonsense"], {
    encoding: "utf8",
  });
  assert.equal(r.status, 2);
  assert.match(r.stderr, /refresh/);
});

// A usage error prints the reason ABOVE the usage block, not instead of it.
test("the spawned CLI prints the reason for a refresh usage error", () => {
  // The static usage block itself contains the literal text "--page=" (it
  // documents the flag), so asserting /--page=/ against stderr as a whole
  // would still pass even if refreshCorpus's usage-error reason were never
  // printed at all. Pin down the reason line specifically — it is the only
  // stderr line prefixed "refresh: " — and that it appears above the usage
  // block, not instead of it.
  const root = sandbox();
  const r = spawnSync(process.execPath, [CLI, "refresh", root], {
    encoding: "utf8",
  });
  assert.equal(r.status, 2);
  assert.match(r.stderr, /^refresh: --page=.*is required/m);
  assert.match(r.stderr, /usage: corpus/);
  assert.ok(
    r.stderr.indexOf("refresh: --page=") < r.stderr.indexOf("usage: corpus"),
    "reason line must print above the usage block",
  );
});
