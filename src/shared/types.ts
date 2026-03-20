export type ProviderId = "claude" | "codex" | "copilot";

export interface LimitWindow {
  key: string;
  label: string;
  used_percent: number | null;
  remaining_percent: number | null;
  resets_at: string | null;
  reset_after_seconds: number | null;
}

export interface ProviderUsage {
  limits: LimitWindow[];
}

export interface ProviderOutput {
  limits: Record<string, Omit<LimitWindow, "key" | "label">>;
}

export interface UnifiedUsageReport {
  checked_at: string;
  providers: Partial<Record<ProviderId, ProviderOutput>>;
}

export interface CliOptions {
  service: ProviderId | "all";
  format: "text" | "json";
  cacheDir: string;
}
