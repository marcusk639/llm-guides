// tools/corpus/test/site-model.test.mjs
import test from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import { loadRecords } from "../data.mjs";
import { collectPages } from "../site-model.mjs";

const ROOT = new URL("./fixtures/corpus/", import.meta.url).pathname;
const records = loadRecords(path.join(ROOT, "data"));

test("a page model carries front-matter fields under stable names", () => {
  const { pages } = collectPages(ROOT, records);
  const clean = pages.find((p) => p.path === "guides/clean.md");
  assert.equal(typeof clean.title, "string");
  assert.equal(typeof clean.summary, "string");
  assert.equal(clean.topic, "models");
  assert.equal(typeof clean.body, "string");
});

test("verified is a string, never a Date", () => {
  const { pages } = collectPages(ROOT, records);
  const clean = pages.find((p) => p.path === "guides/clean.md");
  assert.equal(typeof clean.verified, "string");
  assert.match(clean.verified, /^\d{4}-\d{2}-\d{2}$/);
});

test("volatility is derived from the records the page references", () => {
  const { pages } = collectPages(ROOT, records);
  const clean = pages.find((p) => p.path === "guides/clean.md");
  assert.equal(clean.volatility, "high");
  assert.equal(Array.isArray(clean.keys), true);
});

test("a deprecated page carries its status", () => {
  const { pages } = collectPages(ROOT, records);
  const dep = pages.find((p) => p.path === "guides/verify/deprecated.md");
  assert.equal(dep.status, "deprecated");
});
