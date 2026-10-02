// tools/corpus/test/refresh-prompts.test.mjs
// The prompts carry the procedure; the code carries the schema. These tests
// exist so the two vocabularies cannot drift apart silently — a renamed verdict
// or mode that the prompt still uses under its old name would produce artifacts
// that validateArtifact rejects, at fetch time, after the network work is done.
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { fileURLToPath } from "node:url";
import {
  UNIT_VERDICTS,
  RECORD_VERDICTS,
  ARTIFACT_FIELDS,
} from "../refresh-artifact.mjs";
import { REVIEW_PATHSPECS } from "../refresh-review.mjs";
import { VALID_LABELS } from "../verify-pages.mjs";

const REPO = fileURLToPath(new URL("../../../", import.meta.url));
const read = (rel) => fs.readFileSync(new URL(rel, `file://${REPO}`), "utf8");

test("the refresh prompt names every verdict the schema accepts", () => {
  const prompt = read("meta/prompts/refresh.md");
  for (const v of [...UNIT_VERDICTS, ...RECORD_VERDICTS])
    assert.match(prompt, new RegExp(`\\b${v}\\b`), `prompt omits verdict ${v}`);
});

test("the refresh prompt names every artifact field it must fill", () => {
  const prompt = read("meta/prompts/refresh.md");
  for (const f of ["verdict", "url", "stated", "read", "fetched"])
    assert.match(prompt, new RegExp(`\`${f}\``), `prompt omits field ${f}`);
  // The fields the CLI fills are named so a reader knows not to hand-edit them.
  for (const f of ["unit_keys", "slug", "path"])
    assert.equal(ARTIFACT_FIELDS.includes(f), true);
});

test("the refresh prompt names every CLI mode", () => {
  const prompt = read("meta/prompts/refresh.md");
  for (const mode of ["--order", "--skeleton", "--stamp", "--revert", "--key"])
    assert.match(prompt, new RegExp(mode.replace(/-/g, "\\-")), `prompt omits ${mode}`);
});

// `key_scoped` and `refresh-key-scope-widened` are the two names the --key path
// adds to the vocabulary: the field renderArtifactSkeleton writes, and the rule
// stampUnit refuses a hand-widened artifact with. Both are enforced in code
// (Tasks 5 and 6); this pins only that the prompt spells them the way the code
// does, so a reader who hits the rule can find it in the procedure.
test("the refresh prompt names the key-scoped field and its guard rule", () => {
  const prompt = read("meta/prompts/refresh.md");
  assert.equal(ARTIFACT_FIELDS.includes("key_scoped"), true);
  assert.match(prompt, /`key_scoped`/, "prompt omits field key_scoped");
  assert.match(
    prompt,
    /`refresh-key-scope-widened`/,
    "prompt omits rule refresh-key-scope-widened",
  );
});

// C4's path has to live in the prompt, not only in Task 14, or the procedure and
// the hand-driven run disagree about the most likely outcome of the first run.
test("the refresh prompt distinguishes a rotted URL from a withdrawn figure", () => {
  const prompt = read("meta/prompts/refresh.md");
  assert.match(prompt, /rotted/i);
  assert.match(prompt, /withdrawn/i);
  // A repointed source is a `changed` outcome, not a `blocked` one.
  assert.match(prompt, /repoint/i);
});

test("the refresh prompt states the rules a refresh must not break", () => {
  const prompt = read("meta/prompts/refresh.md");
  assert.match(prompt, /seed: true/);
  assert.match(prompt, /meta\/ledger\.yaml/);
  assert.match(prompt, /never write a value from memory/i);
});

test("the verify agent rubric covers all six open-world checks", () => {
  const rubric = read("meta/prompts/verify-agent.md");
  for (const probe of [
    /figure in prose that reads like a value but has no record/i,
    /no `lint_literals` entry covers/i,
    /formatting variants/i,
    /source tier/i,
    /still "runs"/i,
    /privacy/i,
  ])
    assert.match(rubric, probe);
});

test("the verify agent rubric names every evidence label", () => {
  const rubric = read("meta/prompts/verify-agent.md");
  for (const label of VALID_LABELS)
    assert.match(rubric, new RegExp(`\\*\\*${label}\\*\\*`));
});

test("the verify agent rubric states what it is and is not shown", () => {
  const rubric = read("meta/prompts/verify-agent.md");
  for (const spec of REVIEW_PATHSPECS)
    assert.match(rubric, new RegExp(`\`${spec}\``));
  assert.match(rubric, /research\//);
  assert.match(rubric, /--revert/);
  assert.match(rubric, /draft/i);
});
