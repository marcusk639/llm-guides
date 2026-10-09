import { DEFAULT_TIMEOUT_MS } from "./sources.mjs";
import { parseArtifact, dumpArtifact } from "./refresh-artifact.mjs";

// The archive service lives in exactly one place so adopting a different one
// is a configuration change, not a contract change. See Decision 3.
export const ARCHIVE_SUBMIT_URL = "https://web.archive.org/save/";

export async function captureOne(url, options = {}) {
  const { submitImpl = globalThis.fetch, timeoutMs = DEFAULT_TIMEOUT_MS } =
    options;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await submitImpl(`${ARCHIVE_SUBMIT_URL}${url}`, {
      method: "GET",
      redirect: "follow",
      signal: controller.signal,
    });
    const status = res.status ?? 0;
    if (
      status >= 200 &&
      status < 300 &&
      typeof res.url === "string" &&
      res.url
    ) {
      return {
        url,
        archived: res.url,
        archive_outcome: "captured",
        error: null,
      };
    }
    // 403/404 is the service declining this URL (robots.txt opt-out,
    // blocklist): a durable fact. 429 is rate limiting and 5xx is the service
    // being unavailable: both are transient. Recording either as `refused`
    // would write a false permanence claim into the artifact and stop Task 10
    // writing a record whose source archives perfectly well.
    const refused = status === 403 || status === 404;
    return {
      url,
      archived: null,
      archive_outcome: refused ? "refused" : "failed",
      error: `archive service returned ${status}`,
    };
  } catch (e) {
    const timedOut = e?.name === "AbortError";
    return {
      url,
      archived: null,
      archive_outcome: "failed",
      error: timedOut
        ? `timeout after ${timeoutMs}ms`
        : String(e?.message ?? e),
    };
  } finally {
    clearTimeout(timer);
  }
}

export function applyCaptures(artifactText, captures, { today }) {
  const { data, body } = parseArtifact(artifactText);
  const entries = data?.records ?? [];
  for (const c of captures) {
    const entry = entries.find((e) => e?.key === c.key);
    if (!entry) {
      throw new Error(
        `applyCaptures: the artifact carries no record entry for ${c.key}`,
      );
    }
    if (c.archived != null) entry.archived = c.archived;
    entry.archive_outcome = c.archive_outcome;
    entry.archive_read = today;
  }
  return dumpArtifact(data, body);
}
