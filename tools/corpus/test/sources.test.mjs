import test from "node:test";
import assert from "node:assert/strict";
import {
  classifyResponse,
  probe,
  auditCitations,
  DEFAULT_TIMEOUT_MS,
} from "../sources.mjs";

test("classifyResponse maps status and redirection to the three outcomes", () => {
  assert.equal(classifyResponse({ status: 200, redirected: false }), "resolves");
  assert.equal(classifyResponse({ status: 204, redirected: false }), "resolves");
  assert.equal(classifyResponse({ status: 200, redirected: true }), "redirects");
  assert.equal(classifyResponse({ status: 301, redirected: false }), "redirects");
  assert.equal(classifyResponse({ status: 404, redirected: false }), "dead");
  assert.equal(classifyResponse({ status: 500, redirected: false }), "dead");
  assert.equal(classifyResponse({ status: 403, redirected: true }), "dead");
});

test("probe reports a resolving URL", async () => {
  const fetchImpl = async (url) => ({
    status: 200,
    redirected: false,
    url,
    body: null,
  });
  const r = await probe("https://example.com/a", { fetchImpl });
  assert.equal(r.outcome, "resolves");
  assert.equal(r.status, 200);
  assert.equal(r.error, null);
});

test("probe reports a network error as dead without throwing", async () => {
  const fetchImpl = async () => {
    throw new TypeError("getaddrinfo ENOTFOUND");
  };
  const r = await probe("https://nope.invalid/a", { fetchImpl });
  assert.equal(r.outcome, "dead");
  assert.match(r.error, /ENOTFOUND/);
});

// Review Focus 3: a hanging host must not stall the run forever.
test("probe times out and classifies the hang as dead", async () => {
  const fetchImpl = (url, opts) =>
    new Promise((_resolve, reject) => {
      opts.signal.addEventListener("abort", () =>
        reject(Object.assign(new Error("aborted"), { name: "AbortError" })),
      );
    });
  const r = await probe("https://slow.example/a", { fetchImpl, timeoutMs: 20 });
  assert.equal(r.outcome, "dead");
  assert.match(r.error, /timeout|abort/i);
});

test("DEFAULT_TIMEOUT_MS is a bounded positive number", () => {
  assert.ok(Number.isFinite(DEFAULT_TIMEOUT_MS) && DEFAULT_TIMEOUT_MS > 0);
});

test("auditCitations preserves citation fields and adds an outcome per URL", async () => {
  const citations = [
    { url: "https://example.com/a", class: "record-source", origin: "a.one" },
    {
      url: "https://example.com/b",
      class: "page-body",
      origin: "guides/t/p.md",
    },
  ];
  const fetchImpl = async (url) => ({
    status: url.endsWith("/b") ? 404 : 200,
    redirected: false,
    url,
  });
  const results = await auditCitations(citations, { fetchImpl });
  assert.equal(results.length, 2);
  const byUrl = Object.fromEntries(results.map((r) => [r.url, r]));
  assert.equal(byUrl["https://example.com/a"].outcome, "resolves");
  assert.equal(byUrl["https://example.com/a"].class, "record-source");
  assert.equal(byUrl["https://example.com/b"].outcome, "dead");
  assert.equal(byUrl["https://example.com/b"].origin, "guides/t/p.md");
});

test("auditCitations fetches each distinct URL once even across classes", async () => {
  let calls = 0;
  const fetchImpl = async (url) => {
    calls += 1;
    return { status: 200, redirected: false, url };
  };
  const citations = [
    {
      url: "https://example.com/same",
      class: "record-source",
      origin: "a.one",
    },
    {
      url: "https://example.com/same",
      class: "page-body",
      origin: "guides/t/p.md",
    },
  ];
  const results = await auditCitations(citations, { fetchImpl });
  assert.equal(calls, 1);
  assert.equal(results.length, 2);
  assert.ok(results.every((r) => r.outcome === "resolves"));
});
