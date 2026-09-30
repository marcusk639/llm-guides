// tools/corpus/test/refresh-units.test.mjs
import test from "node:test";
import assert from "node:assert/strict";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { loadRecords } from "../data.mjs";
import { RefreshError, pageFacts, resolveUnit } from "../refresh-units.mjs";

import {
  MAX_SLUG_PAGES,
  unitSlug,
  unitTopic,
  artifactPathFor,
} from "../refresh-units.mjs";

const FIX = fileURLToPath(new URL("./fixtures/refresh/", import.meta.url));
const REPO = fileURLToPath(new URL("../../../", import.meta.url));
const fixRecords = () => loadRecords(path.join(FIX, "data"));
const repoRecords = () => loadRecords(path.join(REPO, "data"));

test("pageFacts reports repo-relative paths, topic, status and keys", () => {
  const facts = pageFacts(FIX, fixRecords());
  const byPath = new Map(facts.map((f) => [f.path, f]));
  assert.equal(byPath.get("guides/alpha/one.md").topic, "alpha");
  assert.equal(byPath.get("guides/beta/gone.md").status, "deprecated");
  assert.deepEqual(byPath.get("guides/alpha/one.md").keys, ["fix.shared.one"]);
});

test("a unit is the transitive closure over shared records, not one hop", () => {
  const unit = resolveUnit(FIX, "guides/alpha/one.md", fixRecords());
  assert.deepEqual(
    unit.pages.map((p) => p.path),
    [
      "guides/alpha/one.md",
      "guides/alpha/two.md",
      "guides/beta/gone.md",
      "guides/beta/three.md",
    ],
  );
  assert.deepEqual(unit.keys, [
    "fix.bridge.two",
    "fix.shared.one",
    "fix.tail.three",
  ]);
});

// Review Focus 4: a deprecated page belongs to the unit. It is excluded from
// the date bump later, in stampUnit, never from membership — its records are
// shared and must be fetched once for the whole unit.
test("a deprecated page is a unit member", () => {
  const unit = resolveUnit(FIX, "guides/alpha/one.md", fixRecords());
  const gone = unit.pages.find((p) => p.path === "guides/beta/gone.md");
  assert.equal(gone.status, "deprecated");
});

test("a page sharing no record is a unit of one", () => {
  const unit = resolveUnit(FIX, "guides/gamma/lonely.md", fixRecords());
  assert.deepEqual(
    unit.pages.map((p) => p.path),
    ["guides/gamma/lonely.md"],
  );
  assert.deepEqual(unit.dataFiles, ["data/units.yaml"]);
});

test("an unknown entry page raises rather than returning an empty unit", () => {
  assert.throws(
    () => resolveUnit(FIX, "guides/alpha/nope.md", fixRecords()),
    (err) => err instanceof RefreshError && err.rule === "refresh-page-unknown",
  );
});

// One live assertion, pinning the spec invariant by name: "The two model pages
// are therefore one unit, refreshed on one branch, in one pull request."
test("the live model pages resolve to one unit", () => {
  const unit = resolveUnit(
    REPO,
    "guides/models/claude-models.md",
    repoRecords(),
  );
  assert.equal(
    unit.pages.some((p) => p.path === "guides/models/comparison.md"),
    true,
  );
  assert.deepEqual(unit.dataFiles, [
    "data/models-other.yaml",
    "data/models.yaml",
  ]);
});

test("a slug joins sorted basenames", () => {
  const unit = resolveUnit(FIX, "guides/gamma/lonely.md", fixRecords());
  assert.equal(unitSlug(unit), "lonely");
  const live = resolveUnit(
    REPO,
    "guides/models/claude-models.md",
    repoRecords(),
  );
  assert.equal(unitSlug(live), "claude-models-comparison");
});

test("a slug above MAX_SLUG_PAGES collapses to first-plus-N", () => {
  const unit = resolveUnit(FIX, "guides/alpha/one.md", fixRecords());
  assert.equal(unit.pages.length, 4);
  assert.equal(unit.pages.length > MAX_SLUG_PAGES, true);
  assert.equal(unitSlug(unit), "gone-plus-3");
});

// Review Focus 5, first half: the fixture unit spans alpha and beta, and the
// live corpus spans context and domains. The artifact files under the topic of
// the page NAMED ON THE COMMAND LINE, so the same unit entered from either end
// files under either topic — which is intended: the entry page is the one the
// author asked about.
test("a cross-topic unit files under the entry page's topic", () => {
  const fromAlpha = resolveUnit(FIX, "guides/alpha/one.md", fixRecords());
  assert.deepEqual(fromAlpha.topics, ["alpha", "beta"]);
  assert.equal(unitTopic(fromAlpha), "alpha");
  assert.equal(
    artifactPathFor(fromAlpha, "2026-09-28"),
    "research/alpha/2026-09-28-gone-plus-3-refresh.md",
  );
  const fromBeta = resolveUnit(FIX, "guides/beta/three.md", fixRecords());
  assert.deepEqual(fromBeta.topics, ["alpha", "beta"]);
  assert.equal(unitTopic(fromBeta), "beta");
});

test("the live cross-topic unit really spans two topics", () => {
  const unit = resolveUnit(
    REPO,
    "guides/context/context-management.md",
    repoRecords(),
  );
  assert.deepEqual(unit.topics, ["context", "domains"]);
  assert.equal(unitTopic(unit), "context");
});

test("an entry page with no topic cannot name an artifact home", () => {
  const unit = {
    entry: "guides/x/y.md",
    pages: [{ path: "guides/x/y.md", topic: null, status: null, keys: [] }],
    keys: [],
    topics: [null],
    dataFiles: [],
  };
  assert.throws(
    () => artifactPathFor(unit, "2026-09-28"),
    (err) =>
      err instanceof RefreshError && err.rule === "refresh-topic-unknown",
  );
});
