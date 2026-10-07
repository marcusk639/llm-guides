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

// The CLI collapses a RefreshError into `${page} [${rule}] ${message}`, so an
// exact rule comparison means parsing the bracketed token back out. A loose
// assert.match(err, /refresh-unit-widened/) would also pass on a message that
// merely mentions the rule, and on any longer rule name containing it — two of
// the defects on this branch were tests that could not fail for exactly that
// reason.
function ruleOf(r) {
  assert.equal(
    r.err.length,
    1,
    `expected exactly one error line, got ${JSON.stringify(r.err)}`,
  );
  const m = /^(\S+) \[([^\]]+)\] /.exec(r.err[0]);
  assert.notEqual(
    m,
    null,
    `error line is not in "<path> [<rule>] <message>" form: ${r.err[0]}`,
  );
  return m[2];
}

// Snapshot everything a stamp or a revert could possibly write, so "nothing was
// written" is an assertion over the whole fixture rather than over one file.
const TOUCHABLE = [
  "guides/alpha/one.md",
  "guides/alpha/two.md",
  "guides/beta/three.md",
  "guides/beta/gone.md",
  "guides/gamma/lonely.md",
  "data/units.yaml",
];
const snapshot = (root) =>
  Object.fromEntries(
    TOUCHABLE.map((rel) => [
      rel,
      fs.readFileSync(path.join(root, rel), "utf8"),
    ]),
  );

// Rewrites an artifact's front-matter the way the refresh prompt would: `patch`
// receives the parsed front-matter and returns the filled replacement.
function rewriteArtifact(root, rel, patch) {
  const { data, body } = parseArtifact(
    fs.readFileSync(path.join(root, rel), "utf8"),
  );
  const next = patch(data);
  fs.writeFileSync(
    path.join(root, rel),
    `---\n${JSON.stringify(next, null, 2)}\n---\n${body}`,
  );
  return next;
}

const confirmEvery = (records) =>
  records.map((r) => ({
    ...r,
    verdict: "confirmed",
    url: "https://example.invalid/one",
    stated: "unchanged",
  }));

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


// C1: resolveUnit computes the REAL unit a page belongs to, but the stamp
// path used to hand stampUnit only the artifact's own self-declared
// unit_keys/unit fields, so an artifact hand-widened to claim another unit's
// record key passed every self-referential check (they only compare the
// artifact against itself) and would stamp that record's verified date while
// the unit that actually owns it was never touched. This must be caught at
// the real refreshCorpus/CLI entry point -- a unit test of stampUnit alone
// cannot see this class of bug, because stampUnit is handed the already-
// trusted data either way.
test("a unit cannot be widened by claiming another unit's record key at stamp time", () => {
  const root = sandbox();
  const skeletonRun = refreshCorpus(
    root,
    ["--page=guides/gamma/lonely.md", "--skeleton"],
    { today: "2026-09-28" },
  );
  assert.equal(skeletonRun.code, 0);
  const rel = "research/gamma/2026-09-28-lonely-refresh.md";
  const { data, body } = parseArtifact(
    fs.readFileSync(path.join(root, rel), "utf8"),
  );
  // Hand-widen: claim fix.shared.one, a record owned by the alpha/beta unit,
  // consistently in both unit_keys and records, so the artifact's own
  // self-referential checks (validateArtifact's coverage rule and
  // refresh-record-out-of-unit) see no disagreement -- exactly the shape the
  // vacuous guard let through.
  const widened = {
    ...data,
    verdict: "confirmed",
    unit_keys: [...data.unit_keys, "fix.shared.one"],
    records: [
      ...data.records.map((r) => ({
        ...r,
        verdict: "confirmed",
        url: "https://example.invalid/four",
        stated: "unchanged",
      })),
      {
        key: "fix.shared.one",
        file: "data/units.yaml",
        verdict: "confirmed",
        url: "https://example.invalid/one",
        stated: "unchanged",
        read: "2026-09-28",
      },
    ],
  };
  fs.writeFileSync(
    path.join(root, rel),
    `---\n${JSON.stringify(widened, null, 2)}\n---\n${body}`,
  );
  const before = {
    one: fs.readFileSync(path.join(root, "guides/alpha/one.md"), "utf8"),
    two: fs.readFileSync(path.join(root, "guides/alpha/two.md"), "utf8"),
    three: fs.readFileSync(path.join(root, "guides/beta/three.md"), "utf8"),
    lonely: fs.readFileSync(path.join(root, "guides/gamma/lonely.md"), "utf8"),
    data: fs.readFileSync(path.join(root, "data/units.yaml"), "utf8"),
  };
  const r = refreshCorpus(
    root,
    ["--page=guides/gamma/lonely.md", "--stamp", `--artifact=${rel}`],
    { today: "2026-09-28" },
  );
  assert.equal(r.code, 1);
  assert.match(r.err.join("\n"), /refresh-unit-widened/);
  assert.equal(
    fs.readFileSync(path.join(root, "guides/alpha/one.md"), "utf8"),
    before.one,
  );
  assert.equal(
    fs.readFileSync(path.join(root, "guides/alpha/two.md"), "utf8"),
    before.two,
  );
  assert.equal(
    fs.readFileSync(path.join(root, "guides/beta/three.md"), "utf8"),
    before.three,
  );
  assert.equal(
    fs.readFileSync(path.join(root, "guides/gamma/lonely.md"), "utf8"),
    before.lonely,
  );
  assert.equal(
    fs.readFileSync(path.join(root, "data/units.yaml"), "utf8"),
    before.data,
  );
});

// Same guard, the other half: claiming an unrelated PAGE (not a record key)
// in `unit` would otherwise bump that page's verified: date and research:
// field even though it shares no record with this unit at all.
test("a unit cannot be widened by claiming another unit's page at stamp time", () => {
  const root = sandbox();
  const skeletonRun = refreshCorpus(
    root,
    ["--page=guides/gamma/lonely.md", "--skeleton"],
    { today: "2026-09-28" },
  );
  assert.equal(skeletonRun.code, 0);
  const rel = "research/gamma/2026-09-28-lonely-refresh.md";
  const { data, body } = parseArtifact(
    fs.readFileSync(path.join(root, rel), "utf8"),
  );
  const widened = {
    ...data,
    verdict: "confirmed",
    unit: [...data.unit, "guides/alpha/one.md"],
    records: data.records.map((r) => ({
      ...r,
      verdict: "confirmed",
      url: "https://example.invalid/four",
      stated: "unchanged",
    })),
  };
  fs.writeFileSync(
    path.join(root, rel),
    `---\n${JSON.stringify(widened, null, 2)}\n---\n${body}`,
  );
  const before = fs.readFileSync(
    path.join(root, "guides/alpha/one.md"),
    "utf8",
  );
  const r = refreshCorpus(
    root,
    ["--page=guides/gamma/lonely.md", "--stamp", `--artifact=${rel}`],
    { today: "2026-09-28" },
  );
  assert.equal(r.code, 1);
  assert.match(r.err.join("\n"), /refresh-unit-widened/);
  assert.equal(
    fs.readFileSync(path.join(root, "guides/alpha/one.md"), "utf8"),
    before,
  );
});

// Review 2 / F1. The widening guard above was one-directional, so NARROWING
// was unguarded: an operator who could not reach a source could delete that
// record from unit_keys AND from records and the rest of the unit stamped
// clean. validateArtifact's coverage rule is satisfied vacuously by the same
// deletion, which is why this has to be asserted at the refreshCorpus entry
// point — the artifact is self-consistent and only the resolved unit disagrees.
test("a unit cannot be narrowed by deleting an unreachable record from the artifact", () => {
  const root = sandbox();
  const skeletonRun = refreshCorpus(
    root,
    ["--page=guides/alpha/one.md", "--skeleton"],
    { today: "2026-09-28" },
  );
  assert.equal(skeletonRun.code, 0);
  const rel = "research/alpha/2026-09-28-gone-plus-3-refresh.md";
  const dropped = "fix.tail.three";
  rewriteArtifact(root, rel, (data) => {
    assert.equal(data.unit_keys.includes(dropped), true);
    return {
      ...data,
      verdict: "changed",
      unit_keys: data.unit_keys.filter((k) => k !== dropped),
      records: confirmEvery(data.records.filter((r) => r.key !== dropped)),
    };
  });
  const before = snapshot(root);
  const r = refreshCorpus(
    root,
    ["--page=guides/alpha/one.md", "--stamp", `--artifact=${rel}`],
    { today: "2026-09-28" },
  );
  assert.equal(r.code, 1);
  assert.equal(ruleOf(r), "refresh-unit-narrowed");
  assert.match(r.err[0], new RegExp(dropped.replace(/\./g, "\\.")));
  assert.deepEqual(snapshot(root), before);
});

// Review 2 / F1b, the sharper exploit on the same root cause: no deletion at
// all, just a one-character flip of key_scoped on a --key skeleton. The old
// refresh-key-scope-widened check only fired when key_scoped === true, so
// flipping it to false skipped that check, and 1 key is a subset of 3 so the
// one-directional widening guard passed too.
test("a key-scoped artifact cannot escape the coverage rule by flipping key_scoped to false", () => {
  const root = sandbox();
  const skeletonRun = refreshCorpus(
    root,
    ["--page=guides/alpha/one.md", "--skeleton", "--key=fix.tail.three"],
    { today: "2026-09-28" },
  );
  assert.equal(skeletonRun.code, 0);
  const rel = "research/alpha/2026-09-28-gone-plus-3-refresh.md";
  rewriteArtifact(root, rel, (data) => {
    assert.equal(data.key_scoped, true);
    assert.deepEqual(data.unit_keys, ["fix.tail.three"]);
    return {
      ...data,
      verdict: "confirmed",
      key_scoped: false,
      records: confirmEvery(data.records),
    };
  });
  const before = snapshot(root);
  const r = refreshCorpus(
    root,
    ["--page=guides/alpha/one.md", "--stamp", `--artifact=${rel}`],
    { today: "2026-09-28" },
  );
  assert.equal(r.code, 1);
  assert.equal(ruleOf(r), "refresh-unit-narrowed");
  assert.deepEqual(snapshot(root), before);
});

// Review 2 / F1c, the page half. Dropping a page from `unit:` while keeping
// every key leaves that page honestly stale while its shared records are dated
// ahead of it, and the receipt never lists it, so --revert cannot see it either.
test("a unit cannot be narrowed by deleting a page from the artifact's unit list", () => {
  const root = sandbox();
  const skeletonRun = refreshCorpus(
    root,
    ["--page=guides/alpha/one.md", "--skeleton"],
    { today: "2026-09-28" },
  );
  assert.equal(skeletonRun.code, 0);
  const rel = "research/alpha/2026-09-28-gone-plus-3-refresh.md";
  rewriteArtifact(root, rel, (data) => {
    assert.equal(data.unit.includes("guides/beta/three.md"), true);
    return {
      ...data,
      verdict: "confirmed",
      unit: data.unit.filter((p) => p !== "guides/beta/three.md"),
      records: confirmEvery(data.records),
    };
  });
  const before = snapshot(root);
  const r = refreshCorpus(
    root,
    ["--page=guides/alpha/one.md", "--stamp", `--artifact=${rel}`],
    { today: "2026-09-28" },
  );
  assert.equal(r.code, 1);
  assert.equal(ruleOf(r), "refresh-unit-narrowed");
  assert.match(r.err[0], /guides\/beta\/three\.md/);
  assert.deepEqual(snapshot(root), before);
});

// Review 2 / F12 (SK1). The artifact path is deterministic, so a second
// --skeleton on the same unit on the same day used to overwrite the operator's
// filled-in verdicts, urls and stated figures and exit 0.
test("--skeleton refuses to overwrite an existing artifact", () => {
  const root = sandbox();
  const rel = skeletonFor(
    root,
    "guides/alpha/one.md",
    "research/alpha/2026-09-28-gone-plus-3-refresh.md",
  );
  rewriteArtifact(root, rel, (data) => ({
    ...data,
    verdict: "confirmed",
    records: confirmEvery(data.records).map((r) => ({
      ...r,
      stated: "the figure I actually read",
    })),
  }));
  const filled = fs.readFileSync(path.join(root, rel), "utf8");
  const r = refreshCorpus(
    root,
    ["--page=guides/alpha/one.md", "--skeleton"],
    { today: "2026-09-28" },
  );
  assert.equal(r.code, 1);
  assert.equal(ruleOf(r), "refresh-skeleton-exists");
  assert.equal(fs.readFileSync(path.join(root, rel), "utf8"), filled);
});

// Review 2 / F12 (SK2), the serious half. Re-running --skeleton after a
// successful stamp deleted the receipt while leaving every bumped date on disk,
// which is exactly the unrecoverable half-stamp state — produced not by a
// partial write failure but by an ordinary, exit-0, successful command.
test("--skeleton refuses unconditionally when the artifact carries a receipt", () => {
  const root = sandbox();
  const rel = skeletonFor(
    root,
    "guides/alpha/one.md",
    "research/alpha/2026-09-28-gone-plus-3-refresh.md",
  );
  rewriteArtifact(root, rel, (data) => ({
    ...data,
    verdict: "confirmed",
    records: confirmEvery(data.records),
  }));
  const stamped = refreshCorpus(
    root,
    ["--page=guides/alpha/one.md", "--stamp", `--artifact=${rel}`],
    { today: "2026-09-28" },
  );
  assert.equal(stamped.code, 0);
  const receiptBefore = parseArtifact(
    fs.readFileSync(path.join(root, rel), "utf8"),
  ).data.stamped;
  assert.notEqual(receiptBefore, undefined);
  const r = refreshCorpus(
    root,
    ["--page=guides/alpha/one.md", "--skeleton"],
    { today: "2026-09-28" },
  );
  assert.equal(r.code, 1);
  assert.equal(ruleOf(r), "refresh-skeleton-would-destroy-receipt");
  // The receipt survives, so --revert is still available: the whole point.
  assert.deepEqual(
    parseArtifact(fs.readFileSync(path.join(root, rel), "utf8")).data.stamped,
    receiptBefore,
  );
  const reverted = refreshCorpus(
    root,
    ["--page=guides/alpha/one.md", "--revert", `--artifact=${rel}`],
    { today: "2026-09-29" },
  );
  assert.equal(reverted.code, 0);
});

// Review 2 / F3. --revert used to validate nothing: it never called
// validateArtifact, applied no date check and carried no unit guard, on the
// premise that it works only from a machine-written receipt. A `stamped:`
// mapping is ordinary YAML in the one file the pipeline is designed to have
// hand-edited, so that premise is the thing that fails. All four probes drive
// the real refreshCorpus entry point.
function skeletonFor(root, page, rel) {
  const r = refreshCorpus(root, [`--page=${page}`, "--skeleton"], {
    today: "2026-09-28",
  });
  assert.equal(r.code, 0);
  assert.equal(fs.existsSync(path.join(root, rel)), true);
  return rel;
}

// V1: a receipt on a never-stamped artifact, naming a page and a record of a
// DIFFERENT unit. The drift check cannot see this — a fabricated receipt simply
// sets new_verified to whatever is already on disk, which is what this does.
test("--revert refuses a receipt naming a page outside the unit", () => {
  const root = sandbox();
  const rel = skeletonFor(
    root,
    "guides/alpha/one.md",
    "research/alpha/2026-09-28-gone-plus-3-refresh.md",
  );
  rewriteArtifact(root, rel, (data) => ({
    ...data,
    verdict: "confirmed",
    records: confirmEvery(data.records),
    stamped: {
      at: "2026-09-28",
      pages: [
        {
          path: "guides/gamma/lonely.md",
          previous_verified: "1999-01-01",
          research_added: false,
          previous_research: null,
        },
      ],
      records: [],
    },
  }));
  const before = snapshot(root);
  const r = refreshCorpus(
    root,
    ["--page=guides/alpha/one.md", "--revert", `--artifact=${rel}`],
    { today: "2026-09-29" },
  );
  assert.equal(r.code, 1);
  assert.equal(ruleOf(r), "refresh-unit-widened");
  assert.deepEqual(snapshot(root), before);
});

test("--revert refuses a receipt naming a record outside the unit", () => {
  const root = sandbox();
  const rel = skeletonFor(
    root,
    "guides/alpha/one.md",
    "research/alpha/2026-09-28-gone-plus-3-refresh.md",
  );
  rewriteArtifact(root, rel, (data) => ({
    ...data,
    verdict: "confirmed",
    records: confirmEvery(data.records),
    stamped: {
      at: "2026-09-28",
      pages: [],
      records: [
        {
          key: "fix.alone.four",
          file: "data/units.yaml",
          previous_verified: "1999-01-01",
          new_verified: "2026-09-16",
        },
      ],
    },
  }));
  const before = snapshot(root);
  const r = refreshCorpus(
    root,
    ["--page=guides/alpha/one.md", "--revert", `--artifact=${rel}`],
    { today: "2026-09-29" },
  );
  assert.equal(r.code, 1);
  assert.equal(ruleOf(r), "refresh-unit-widened");
  assert.deepEqual(snapshot(root), before);
});

// V2: an artifact whose whole front-matter is path, fetched and stamped. The
// scope guard reaches it first — it has no `unit` at all — which is the right
// refusal, so this pins which rule claims the case.
test("--revert refuses a structurally empty artifact carrying a receipt", () => {
  const root = sandbox();
  const rel = skeletonFor(
    root,
    "guides/alpha/one.md",
    "research/alpha/2026-09-28-gone-plus-3-refresh.md",
  );
  rewriteArtifact(root, rel, (data) => ({
    path: data.path,
    fetched: data.fetched,
    stamped: {
      at: "2026-09-28",
      pages: [
        {
          path: "guides/alpha/one.md",
          previous_verified: "2026-09-16",
          research_added: false,
          previous_research: null,
        },
      ],
      records: [],
    },
  }));
  const before = snapshot(root);
  const r = refreshCorpus(
    root,
    ["--page=guides/alpha/one.md", "--revert", `--artifact=${rel}`],
    { today: "2026-09-29" },
  );
  assert.equal(r.code, 1);
  assert.equal(ruleOf(r), "refresh-unit-narrowed");
  assert.deepEqual(snapshot(root), before);
});

// The same point, where only validateArtifact can make it: `unit` and
// `unit_keys` are intact, so the scope guard passes and the refusal has to come
// from revertUnit's own validation pass — which this path did not have.
test("--revert runs validateArtifact: a scope-clean artifact with no kind is refused", () => {
  const root = sandbox();
  const rel = skeletonFor(
    root,
    "guides/alpha/one.md",
    "research/alpha/2026-09-28-gone-plus-3-refresh.md",
  );
  rewriteArtifact(root, rel, (data) => {
    const { kind, ...rest } = data;
    assert.equal(kind, "refresh");
    return {
      ...rest,
      verdict: "confirmed",
      records: confirmEvery(data.records),
      stamped: {
        at: "2026-09-28",
        pages: [
          {
            path: "guides/alpha/one.md",
            previous_verified: "2026-09-16",
            research_added: false,
            previous_research: null,
          },
        ],
        records: [],
      },
    };
  });
  const before = snapshot(root);
  const r = refreshCorpus(
    root,
    ["--page=guides/alpha/one.md", "--revert", `--artifact=${rel}`],
    { today: "2026-09-29" },
  );
  assert.equal(r.code, 1);
  assert.equal(ruleOf(r), "refresh-artifact-kind");
  assert.deepEqual(snapshot(root), before);
});

// V2, second half: the receipt's own dates were never checked either, so a
// non-date was written straight into a page's front-matter.
test("--revert refuses a receipt whose previous_verified is not a date", () => {
  const root = sandbox();
  const rel = skeletonFor(
    root,
    "guides/alpha/one.md",
    "research/alpha/2026-09-28-gone-plus-3-refresh.md",
  );
  rewriteArtifact(root, rel, (data) => ({
    ...data,
    verdict: "confirmed",
    records: confirmEvery(data.records),
    stamped: {
      at: "2026-09-28",
      pages: [
        {
          path: "guides/alpha/one.md",
          previous_verified: "NOT-A-DATE",
          research_added: false,
          previous_research: null,
        },
      ],
      records: [],
    },
  }));
  const before = snapshot(root);
  const r = refreshCorpus(
    root,
    ["--page=guides/alpha/one.md", "--revert", `--artifact=${rel}`],
    { today: "2026-09-29" },
  );
  assert.equal(r.code, 1);
  assert.equal(ruleOf(r), "refresh-receipt-shape");
  assert.deepEqual(snapshot(root), before);
});

// D1, the one that mattered most: 2099-12-31 is a real calendar date, so
// frontmatter-date passes, expires = verified + cadence puts the page 73 years
// past the `expired` rule, and lint reports CLEAN. Unlike every other defect
// on this branch, nothing downstream reports it.
test("--revert refuses a receipt date after today, page side and record side", () => {
  for (const which of ["page", "record"]) {
    const root = sandbox();
    const rel = skeletonFor(
      root,
      "guides/alpha/one.md",
      "research/alpha/2026-09-28-gone-plus-3-refresh.md",
    );
    rewriteArtifact(root, rel, (data) => ({
      ...data,
      verdict: "confirmed",
      records: confirmEvery(data.records),
      stamped: {
        at: "2026-09-28",
        pages:
          which === "page"
            ? [
                {
                  path: "guides/alpha/one.md",
                  previous_verified: "2099-12-31",
                  research_added: false,
                  previous_research: null,
                },
              ]
            : [],
        records:
          which === "record"
            ? [
                {
                  key: "fix.shared.one",
                  file: "data/units.yaml",
                  previous_verified: "2099-12-31",
                  new_verified: "2026-09-16",
                },
              ]
            : [],
      },
    }));
    const before = snapshot(root);
    const r = refreshCorpus(
      root,
      ["--page=guides/alpha/one.md", "--revert", `--artifact=${rel}`],
      { today: "2026-09-29" },
    );
    assert.equal(r.code, 1, `${which}: expected exit 1`);
    assert.equal(ruleOf(r), "refresh-date-in-future");
    assert.deepEqual(snapshot(root), before);
  }
});

// The containment check is independent on the revert side, not inherited from
// stamp-time validation: validateArtifact checks `records[].file`, but the
// receipt's `records[].file` is a separate list it never looks at.
test("--revert refuses a receipt record file that escapes data/", () => {
  const root = sandbox();
  const rel = skeletonFor(
    root,
    "guides/alpha/one.md",
    "research/alpha/2026-09-28-gone-plus-3-refresh.md",
  );
  rewriteArtifact(root, rel, (data) => ({
    ...data,
    verdict: "confirmed",
    records: confirmEvery(data.records),
    stamped: {
      at: "2026-09-28",
      pages: [],
      records: [
        {
          key: "fix.shared.one",
          file: "data/../../ESCAPED.yaml",
          previous_verified: "2026-09-16",
          new_verified: "2026-09-28",
        },
      ],
    },
  }));
  const before = snapshot(root);
  const r = refreshCorpus(
    root,
    ["--page=guides/alpha/one.md", "--revert", `--artifact=${rel}`],
    { today: "2026-09-29" },
  );
  assert.equal(r.code, 1);
  assert.equal(ruleOf(r), "refresh-record-file-escapes-data");
  assert.deepEqual(snapshot(root), before);
});

// Review 2 / F2, the probed T2 escape, end to end. The decoy sits two levels
// above the corpus root and already holds the `- key:`/`verified:` pair the
// surgical edit needs, so the only thing standing between the artifact and an
// out-of-root write is the containment check.
test("a records[].file pointing above the corpus root writes nothing and names the escape", () => {
  const root = sandbox();
  // One level above the sandbox, which is os.tmpdir() and writable everywhere.
  // Two levels up is os.tmpdir()'s own parent — on Linux that is "/", so this
  // test died with EACCES the first time CI ran it on a non-macOS runner.
  // dataFileRel's containment check is lexical and never writes outside the
  // base, so the decoy only has to exist; it is the rule and the unchanged
  // snapshot below that carry the assertion.
  const outside = path.join(root, "..", "ESCAPED.yaml");
  const decoy = [
    "records:",
    "  - key: fix.shared.one",
    '    value: "shared-one"',
    "    volatility: high",
    "    source: https://example.invalid/one",
    '    verified: "1999-01-01"',
    "",
  ].join("\n");
  fs.writeFileSync(outside, decoy);
  try {
    const skeletonRun = refreshCorpus(
      root,
      ["--page=guides/alpha/one.md", "--skeleton"],
      { today: "2026-09-28" },
    );
    assert.equal(skeletonRun.code, 0);
    const rel = "research/alpha/2026-09-28-gone-plus-3-refresh.md";
    rewriteArtifact(root, rel, (data) => ({
      ...data,
      verdict: "confirmed",
      records: confirmEvery(data.records).map((r) =>
        r.key === "fix.shared.one"
          ? { ...r, file: "data/../../ESCAPED.yaml" }
          : r,
      ),
    }));
    const before = snapshot(root);
    const r = refreshCorpus(
      root,
      ["--page=guides/alpha/one.md", "--stamp", `--artifact=${rel}`],
      { today: "2026-09-28" },
    );
    assert.equal(r.code, 1);
    assert.equal(ruleOf(r), "refresh-record-file-escapes-data");
    assert.equal(fs.readFileSync(outside, "utf8"), decoy);
    assert.deepEqual(snapshot(root), before);
  } finally {
    fs.rmSync(outside, { force: true });
  }
});

// The key-scope claim is checked against the RESOLVED unit, not taken on the
// artifact's word: claiming key_scoped on a full-unit artifact would otherwise
// buy an exemption from the narrowing rule for free.
test("claiming key_scoped on a full-unit artifact is refused against the resolved unit", () => {
  const root = sandbox();
  const skeletonRun = refreshCorpus(
    root,
    ["--page=guides/alpha/one.md", "--skeleton"],
    { today: "2026-09-28" },
  );
  assert.equal(skeletonRun.code, 0);
  const rel = "research/alpha/2026-09-28-gone-plus-3-refresh.md";
  rewriteArtifact(root, rel, (data) => {
    assert.equal(data.unit_keys.length > 1, true);
    return {
      ...data,
      verdict: "confirmed",
      key_scoped: true,
      records: confirmEvery(data.records),
    };
  });
  const before = snapshot(root);
  const r = refreshCorpus(
    root,
    ["--page=guides/alpha/one.md", "--stamp", `--artifact=${rel}`],
    { today: "2026-09-28" },
  );
  assert.equal(r.code, 1);
  assert.equal(ruleOf(r), "refresh-key-scope-widened");
  assert.deepEqual(snapshot(root), before);
});
