import { BaseCliProvider } from "./base.js";
import { nextMonthResetUtc } from "../../shared/time.js";
import type { LimitWindow } from "../../shared/types.js";

type CopilotRaw = {
  used_percent?: number;
  remaining_percent?: number;
};

export class CopilotCliProvider extends BaseCliProvider<CopilotRaw> {
  readonly id = "copilot" as const;

  protected cacheFile(): string {
    return "copilot_usage.json";
  }

  protected toLimits(raw: CopilotRaw): LimitWindow[] {
    const used = typeof raw.used_percent === "number" ? raw.used_percent : null;
    const remaining = typeof raw.remaining_percent === "number"
      ? raw.remaining_percent
      : used == null ? null : 100 - used;

    const { resetsAt, resetAfterSeconds } = nextMonthResetUtc();

    return [
      {
        key: "month",
        label: "month",
        used_percent: used,
        remaining_percent: remaining,
        resets_at: resetsAt,
        reset_after_seconds: resetAfterSeconds,
      },
    ];
  }
}
