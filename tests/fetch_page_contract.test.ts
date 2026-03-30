import { describe, expect, it } from "vitest";
import {
  buildFetchEnvelope,
  buildFetchStatus,
  encodeEnvelopeForFragment,
  MAX_FRAGMENT_BYTES,
} from "../src/shared/fetch-status.js";
import type { FetchUsageResponse } from "../src/shared/fetch-status.js";

describe("fetch page envelope contract", () => {
  const startedAt = "2026-03-20T17:59:55.000Z";
  const completedAt = "2026-03-20T18:00:00.000Z";

  function makeResponse(errors?: Record<string, string>): FetchUsageResponse {
    return {
      results: { claude: { five_hour: { utilization: 10 } } },
      status: buildFetchStatus(["claude"], errors || {}, startedAt, completedAt),
    };
  }

  it("derives ok from status.ok when worker succeeds", () => {
    const envelope = buildFetchEnvelope(makeResponse(), "req-1", ["claude"]);
    expect(envelope.ok).toBe(true);
  });

  it("derives ok:false from status.ok when worker has errors", () => {
    const envelope = buildFetchEnvelope(
      makeResponse({ claude: "auth_error: not logged in" }),
      "req-1",
      ["claude"],
    );
    expect(envelope.ok).toBe(false);
  });

  it("defaults to ok:false when response is undefined", () => {
    const envelope = buildFetchEnvelope(undefined, "req-1", ["claude"]);
    expect(envelope.ok).toBe(false);
  });

  it("includes request_id and services in envelope", () => {
    const envelope = buildFetchEnvelope(makeResponse(), "req-123", ["claude", "codex"]);
    expect(envelope.request_id).toBe("req-123");
    expect(envelope.services).toEqual(["claude", "codex"]);
  });

  it("encoded payload stays under fragment budget", () => {
    const response: FetchUsageResponse = {
      results: {
        claude: { five_hour: { utilization: 10, resets_at: "2026-04-01T00:00:00+00:00" } },
        codex: { rate_limit: { primary_window: { used_percent: 15 } } },
        copilot: { used_percent: 13.2, remaining_percent: 86.8 },
      },
      status: buildFetchStatus(
        ["claude", "codex", "copilot"],
        {},
        startedAt,
        completedAt,
        "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee",
      ),
    };
    const envelope = buildFetchEnvelope(response, "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee", ["claude", "codex", "copilot"]);
    const encoded = encodeEnvelopeForFragment(envelope);
    expect(encoded.length).toBeLessThanOrEqual(MAX_FRAGMENT_BYTES);
  });

  it("throws when encoded payload exceeds fragment budget", () => {
    const hugeResults: Record<string, unknown> = {};
    for (let i = 0; i < 50; i++) {
      hugeResults[`key_${i}`] = { data: "x".repeat(100) };
    }
    const response: FetchUsageResponse = {
      results: hugeResults,
      status: buildFetchStatus(["claude"], {}, startedAt, completedAt),
    };
    const envelope = buildFetchEnvelope(response, "req-1", ["claude"]);
    expect(() => encodeEnvelopeForFragment(envelope)).toThrow("exceeds");
  });

  it("never reports success when worker status is failed", () => {
    const errors = { claude: "auth_error: cookie missing" };
    const response = makeResponse(errors);
    const envelope = buildFetchEnvelope(response, "req-1", ["claude"]);
    expect(envelope.ok).toBe(false);
    expect(envelope.status?.ok).toBe(false);
    expect(envelope.ok).toBe(envelope.status?.ok);
  });

  // MV3 wake path regression — deferred to Step 5 for Chrome mock implementation
  it.todo("handles fetch_usage messages before worker is initialized gracefully");
  it.todo("responds with structured error when worker initialization fails");
});
