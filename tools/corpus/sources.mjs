// The audit is the only network code in the corpus tooling outside the
// browser-side site search. It is deliberately NOT one of the four gates:
// see Decision 1 in docs/superpowers/specs/2026-10-07-source-durability-design.md.
export const DEFAULT_TIMEOUT_MS = 15000;
const DEFAULT_CONCURRENCY = 6;

export function classifyResponse({ status, redirected }) {
  const ok = status >= 200 && status < 300;
  if (ok) return redirected ? "redirects" : "resolves";
  if (status >= 300 && status < 400) return "redirects";
  return "dead";
}

export async function probe(url, options = {}) {
  const { fetchImpl = globalThis.fetch, timeoutMs = DEFAULT_TIMEOUT_MS } =
    options;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetchImpl(url, {
      method: "GET",
      redirect: "follow",
      signal: controller.signal,
    });
    // Only the status line matters. An unconsumed body holds the connection
    // open, and this loop runs over every citation in the corpus.
    try {
      await res.body?.cancel?.();
    } catch {
      /* a fixture response has no body; nothing to release */
    }
    return {
      url,
      outcome: classifyResponse(res),
      status: res.status ?? null,
      finalUrl: res.url ?? null,
      error: null,
    };
  } catch (e) {
    const timedOut = e?.name === "AbortError";
    return {
      url,
      outcome: "dead",
      status: null,
      finalUrl: null,
      error: timedOut
        ? `timeout after ${timeoutMs}ms`
        : String(e?.message ?? e),
    };
  } finally {
    clearTimeout(timer);
  }
}

export async function auditCitations(citations, options = {}) {
  const { concurrency = DEFAULT_CONCURRENCY } = options;
  const distinct = [...new Set(citations.map((c) => c.url))];
  const probed = new Map();
  let next = 0;
  const worker = async () => {
    while (next < distinct.length) {
      const url = distinct[next++];
      probed.set(url, await probe(url, options));
    }
  };
  await Promise.all(
    Array.from({ length: Math.min(concurrency, distinct.length) }, worker),
  );
  return citations.map((c) => {
    const { outcome, status, finalUrl, error } = probed.get(c.url);
    return { ...c, outcome, status, finalUrl, error };
  });
}
