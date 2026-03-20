import type { LimitWindow, ProviderOutput, ProviderUsage } from "./types.js";

export function composeLimitsByKey(limits: LimitWindow[]): ProviderOutput["limits"] {
  const out: ProviderOutput["limits"] = {};
  for (const l of limits) {
    out[l.key] = {
      used_percent: l.used_percent,
      remaining_percent: l.remaining_percent,
      resets_at: l.resets_at,
      reset_after_seconds: l.reset_after_seconds,
    };
  }
  return out;
}

export function toProviderOutput(usage: ProviderUsage): ProviderOutput {
  return {
    limits: composeLimitsByKey(usage.limits),
  };
}
