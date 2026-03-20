import { BaseCliProvider } from "./base.js";
import { secondsUntilIso } from "../../shared/time.js";
import type { LimitWindow } from "../../shared/types.js";

type ClaudeWindow = {
  utilization?: number;
  resets_at?: string;
};

type ClaudeRaw = {
  five_hour?: ClaudeWindow;
  seven_day?: ClaudeWindow;
  seven_day_sonnet?: ClaudeWindow;
};

export class ClaudeCliProvider extends BaseCliProvider<ClaudeRaw> {
  readonly id = "claude" as const;

  protected cacheFile(): string {
    return "claude_usage.json";
  }

  protected toLimits(raw: ClaudeRaw): LimitWindow[] {
    const keys: Array<[keyof ClaudeRaw, string]> = [
      ["five_hour", "5-hour"],
      ["seven_day", "7-day"],
      ["seven_day_sonnet", "7-day sonnet"],
    ];

    return keys.map(([key, label]) => {
      const w = raw[key] ?? {};
      const used = typeof w.utilization === "number" ? w.utilization : null;
      return {
        key,
        label,
        used_percent: used,
        remaining_percent: used == null ? null : 100 - used,
        resets_at: w.resets_at ?? null,
        reset_after_seconds: secondsUntilIso(w.resets_at ?? null),
      };
    });
  }
}
