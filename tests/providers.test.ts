import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { nextMonthResetUtc } from "../src/shared/time.js";
import { ClaudeCliProvider } from "../src/cli/providers/claude.js";
import { CodexCliProvider } from "../src/cli/providers/codex.js";
import { CopilotCliProvider } from "../src/cli/providers/copilot.js";
import { composeLimitsByKey } from "../src/shared/compose.js";

function fixture(name: string): unknown {
  return JSON.parse(readFileSync(new URL(`./fixtures/${name}`, import.meta.url), "utf-8"));
}

describe("provider normalization", () => {
  it("normalizes claude windows", () => {
    const p = new ClaudeCliProvider();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const limits = (p as any).toLimits(fixture("claude.json"));
    expect(limits).toHaveLength(3);
    expect(limits[0].key).toBe("five_hour");
    expect(limits[0].used_percent).toBe(12.5);
    expect(limits[0].remaining_percent).toBe(87.5);
  });

  it("normalizes codex windows", () => {
    const p = new CodexCliProvider();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const limits = (p as any).toLimits(fixture("codex.json"));
    expect(limits).toHaveLength(3);
    expect(limits[1].key).toBe("seven_day");
    expect(limits[1].used_percent).toBe(40);
    expect(limits[1].remaining_percent).toBe(60);
  });

  it("normalizes copilot month with shared reset policy", () => {
    const p = new CopilotCliProvider();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const limits = (p as any).toLimits(fixture("copilot.json"));
    expect(limits).toHaveLength(1);
    expect(limits[0].key).toBe("month");
    expect(limits[0].used_percent).toBe(13.2);

    const policy = nextMonthResetUtc();
    expect(limits[0].resets_at).toBe(policy.resetsAt);
  });

  it("composes list into keyed dictionary", () => {
    const keyed = composeLimitsByKey([
      {
        key: "month",
        label: "month",
        used_percent: 10,
        remaining_percent: 90,
        resets_at: "2026-04-01T00:00:00+00:00",
        reset_after_seconds: 123,
      },
    ]);

    expect(Object.keys(keyed)).toEqual(["month"]);
    expect(keyed.month.used_percent).toBe(10);
  });
});
