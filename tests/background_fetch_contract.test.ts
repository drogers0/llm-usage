import { describe, expect, it } from "vitest";
import { buildFetchStatus } from "../src/shared/fetch-status.js";

describe("buildFetchStatus", () => {
  const startedAt = "2026-03-20T17:59:55.000Z";
  const completedAt = "2026-03-20T18:00:00.000Z";

  it("returns ok:true when no errors", () => {
    const status = buildFetchStatus(["claude", "codex"], {}, startedAt, completedAt);
    expect(status.ok).toBe(true);
    expect(status.services).toEqual(["claude", "codex"]);
    expect(status.at).toBe(completedAt);
    expect(status.started_at).toBe(startedAt);
    expect(status.errors).toBeUndefined();
  });

  it("returns ok:false when errors is non-empty", () => {
    const errors = { codex: "auth_error: could not get access token" };
    const status = buildFetchStatus(["claude", "codex"], errors, startedAt, completedAt);
    expect(status.ok).toBe(false);
    expect(status.errors).toEqual(errors);
  });

  it("returns ok:false with partial provider failure", () => {
    const errors = { copilot: "parse_error: could not parse DOM" };
    const status = buildFetchStatus(["claude", "codex", "copilot"], errors, startedAt, completedAt);
    expect(status.ok).toBe(false);
    expect(status.services).toEqual(["claude", "codex", "copilot"]);
    expect(status.errors).toEqual(errors);
  });

  it("includes all services even when unknown provider errors", () => {
    const errors = { unknown: "unknown provider: unknown" };
    const status = buildFetchStatus(["unknown"], errors, startedAt, completedAt);
    expect(status.ok).toBe(false);
    expect(status.services).toEqual(["unknown"]);
    expect(status.errors?.unknown).toContain("unknown provider");
  });

  it("omits errors field entirely when no errors", () => {
    const status = buildFetchStatus(["claude"], {}, startedAt, completedAt);
    expect("errors" in status).toBe(false);
  });
});
