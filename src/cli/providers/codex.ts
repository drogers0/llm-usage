import { BaseCliProvider } from "./base.js";
import { unixToIso } from "../../shared/time.js";
import type { LimitWindow } from "../../shared/types.js";

type CodexWindow = {
  used_percent?: number;
  reset_at?: number;
  reset_after_seconds?: number;
};

type CodexRaw = {
  rate_limit?: {
    primary_window?: CodexWindow;
    secondary_window?: CodexWindow;
  };
  code_review_rate_limit?: {
    primary_window?: CodexWindow;
  };
};

export class CodexCliProvider extends BaseCliProvider<CodexRaw> {
  readonly id = "codex" as const;

  protected cacheFile(): string {
    return "codex_usage.json";
  }

  protected toLimits(raw: CodexRaw): LimitWindow[] {
    const map: Array<{ key: string; label: string; window?: CodexWindow }> = [
      { key: "five_hour", label: "5-hour", window: raw.rate_limit?.primary_window },
      { key: "seven_day", label: "7-day", window: raw.rate_limit?.secondary_window },
      { key: "code_review_seven_day", label: "Code review 7-day", window: raw.code_review_rate_limit?.primary_window },
    ];

    return map.map(({ key, label, window }) => {
      const used = typeof window?.used_percent === "number" ? window.used_percent : null;
      return {
        key,
        label,
        used_percent: used,
        remaining_percent: used == null ? null : 100 - used,
        resets_at: unixToIso(window?.reset_at ?? null),
        reset_after_seconds: window?.reset_after_seconds ?? null,
      };
    });
  }
}
