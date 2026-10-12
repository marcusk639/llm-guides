import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const contract = fs.readFileSync(
  new URL("../../../CLAUDE.md", import.meta.url),
  "utf8",
);

// Every rule name the tools can emit must be documented, or a future session
// learns the wrong mechanism from the contract. This is the check whose
// absence let `site` ship undocumented.
const RULES = [
  "record-archived-invalid",
  "citation-malformed",
  "refresh-archive-outcome",
  "refresh-archive-url",
  "refresh-archive-date",
  "refresh-record-archived-unparseable",
];

for (const rule of RULES) {
  test(`CLAUDE.md documents the ${rule} rule`, () => {
    assert.ok(contract.includes(rule), `${rule} is missing from CLAUDE.md`);
  });
}

test("CLAUDE.md's command list names every CLI subcommand", () => {
  for (const cmd of [
    "render",
    "lint",
    "verify",
    "ledger",
    "refresh",
    "site",
    "sources",
  ]) {
    assert.ok(
      contract.includes(`\`${cmd}\``) || contract.includes(`|${cmd}`),
      `${cmd} is missing from CLAUDE.md`,
    );
  }
});

test("CLAUDE.md documents the source_archived record field", () => {
  assert.ok(contract.includes("source_archived"));
});
