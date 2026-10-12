import fs from "node:fs";
import path from "node:path";
import { DEFAULT_TIMEOUT_MS } from "./sources.mjs";
import { RefreshError } from "./refresh-units.mjs";
import { isAbsoluteHttpUrl } from "./paths.mjs";
import {
  parseArtifact,
  dumpArtifact,
  validateArtifact,
} from "./refresh-artifact.mjs";

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
    // The outcome owns the URL. Leaving an earlier run's `archived` beside a
    // `failed` outcome makes stampUnit write nothing (it gates on the outcome)
    // while the artifact still shows a snapshot, and validateArtifact calls
    // that clean -- a stale URL beside a failure is worse than no URL.
    if (c.archive_outcome === "captured" && c.archived != null) {
      entry.archived = c.archived;
    } else {
      delete entry.archived;
    }
    entry.archive_outcome = c.archive_outcome;
    entry.archive_read = today;
  }
  return dumpArtifact(data, body);
}

// The whole --archive flow, out of cli.mjs so every guard on it is testable
// offline. It previously called captureOne() with no injectable impl, which is
// why its containment, kind/path and missing-url guards all shipped untested.
// Throws RefreshError for a usage-level refusal; the caller maps that to exit 2.
export async function archiveArtifact(root, artifactRel, options = {}) {
  const {
    submitImpl = globalThis.fetch,
    today = new Date().toISOString().slice(0, 10),
    writeImpl = fs.writeFileSync,
    onProgress = () => {},
  } = options;

  const artifactPath = path.join(root, artifactRel);
  // Containment by RESOLUTION, not a startsWith on the given string:
  // "research/../data/x.yaml" passes a prefix test while resolving out.
  const researchDir = path.resolve(root, "research");
  if (!path.resolve(artifactPath).startsWith(researchDir + path.sep))
    throw new RefreshError(
      "refresh-artifact-outside-research",
      `${artifactRel}: --archive writes refresh artifacts under research/ only, never data/ or guides/`,
    );
  if (!fs.existsSync(artifactPath))
    throw new RefreshError(
      "refresh-artifact-not-found",
      `${artifactRel}: no such file`,
    );

  const text = fs.readFileSync(artifactPath, "utf8");
  const { data } = parseArtifact(text);
  // Validate BEFORE the capture loop: an invalid target should not cost a
  // round of third-party submissions, and must never reach the write.
  if (data?.kind !== "refresh")
    throw new RefreshError(
      "refresh-artifact-kind",
      `${artifactRel}: kind must be "refresh", got ${JSON.stringify(data?.kind)}`,
    );
  if (data.path !== artifactRel)
    throw new RefreshError(
      "refresh-artifact-path-mismatch",
      `${artifactRel}: but the artifact's own path field says ${JSON.stringify(data.path)}`,
    );
  const issues = validateArtifact(data);
  if (issues.length > 0)
    throw new RefreshError(
      issues[0].rule,
      `${artifactRel}: ${issues.map((i) => `[${i.rule}] ${i.message}`).join("; ")}`,
    );

  const captures = [];
  for (const entry of data.records ?? []) {
    // A blocked artifact's `unreachable` record carries no url, and
    // validateArtifact requires one only for reachable records. Submitting
    // captureOne(undefined) sent the literal "undefined" to the archive
    // service and recorded the result as `captured`, so the evidence record
    // asserted a snapshot for the one record that reached nothing.
    const c = isAbsoluteHttpUrl(entry.url)
      ? await captureOne(entry.url, { submitImpl })
      : {
          url: entry.url ?? null,
          archived: null,
          archive_outcome: "failed",
          error: "no url to capture",
        };
    captures.push({ key: entry.key, ...c });
    onProgress(entry.key, c);
  }

  const next = applyCaptures(text, captures, { today });
  // A failed write is a fact about this machine, not about a third party.
  try {
    writeImpl(artifactPath, next);
  } catch (e) {
    throw new RefreshError(
      "refresh-artifact-write-failed",
      `could not write ${artifactRel}: ${e.message}`,
    );
  }
  return { captures, written: true };
}
