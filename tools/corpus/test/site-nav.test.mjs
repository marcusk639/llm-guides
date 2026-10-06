// tools/corpus/test/site-nav.test.mjs
import test from "node:test";
import assert from "node:assert/strict";
import { topicLabel, navTopics, loadTopics } from "../site-nav.mjs";

const ROOT = new URL("./fixtures/corpus/", import.meta.url).pathname;

test("a slug becomes a title-cased label", () => {
  assert.equal(topicLabel("models"), "Models");
  assert.equal(topicLabel("foundations"), "Foundations");
});

test("the exceptions map supplies casing a slug cannot imply", () => {
  assert.equal(topicLabel("claude-code"), "Claude Code");
});

test("an unknown multi-word slug still produces a readable label", () => {
  assert.equal(topicLabel("some-new-topic"), "Some New Topic");
});

test("only populated topics appear, in taxonomy order", () => {
  const models = [
    { path: "guides/clean.md", topic: "models", title: "A" },
    { path: "guides/hooks.md", topic: "claude-code", title: "B" },
  ];
  const nav = navTopics(models, loadTopics(ROOT));
  assert.deepEqual(
    nav.map((t) => t.slug),
    ["claude-code", "models"],
  );
});

test("an empty topic is absent from navigation entirely", () => {
  const models = [{ path: "guides/clean.md", topic: "models", title: "A" }];
  const nav = navTopics(models, ["claude-code", "models"]);
  assert.deepEqual(
    nav.map((t) => t.slug),
    ["models"],
  );
  assert.equal(JSON.stringify(nav).includes("claude-code"), false);
});
