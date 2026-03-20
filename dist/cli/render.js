#!/usr/bin/env node

// src/cli/render.ts
import { stderr, stdout } from "node:process";

// src/shared/compose.ts
function composeLimitsByKey(limits) {
  const out = {};
  for (const l of limits) {
    out[l.key] = {
      used_percent: l.used_percent,
      remaining_percent: l.remaining_percent,
      resets_at: l.resets_at,
      reset_after_seconds: l.reset_after_seconds
    };
  }
  return out;
}
function toProviderOutput(usage) {
  return {
    limits: composeLimitsByKey(usage.limits)
  };
}

// src/cli/providers/base.ts
import { readFile } from "node:fs/promises";

// src/shared/errors.ts
var UsageError = class extends Error {
  constructor(message, code) {
    super(message);
    this.code = code;
    this.name = this.constructor.name;
  }
};
var ConfigError = class extends UsageError {
  constructor(message) {
    super(message, "config_error");
  }
};
var ParseError = class extends UsageError {
  constructor(message) {
    super(message, "parse_error");
  }
};

// src/cli/providers/base.ts
var BaseCliProvider = class {
  async load(cacheDir) {
    const path = `${cacheDir}/${this.cacheFile()}`;
    let rawText;
    try {
      rawText = await readFile(path, "utf-8");
    } catch {
      throw new ConfigError(`Missing cache file for ${this.id}: ${path}`);
    }
    let raw;
    try {
      raw = JSON.parse(rawText);
    } catch {
      throw new ParseError(`Invalid JSON in cache file for ${this.id}: ${path}`);
    }
    return {
      limits: this.toLimits(raw)
    };
  }
};

// src/shared/time.ts
function secondsUntilIso(iso) {
  if (!iso) return null;
  const target = Date.parse(iso);
  if (Number.isNaN(target)) return null;
  const now = Date.now();
  const delta = Math.floor((target - now) / 1e3);
  return delta > 0 ? delta : 0;
}
function unixToIso(unix) {
  if (unix == null) return null;
  const d = new Date(unix * 1e3);
  if (Number.isNaN(d.getTime())) return null;
  return d.toISOString().replace(".000Z", "+00:00");
}
function nextMonthResetUtc(now = /* @__PURE__ */ new Date()) {
  const year = now.getUTCFullYear();
  const month = now.getUTCMonth();
  const reset = new Date(Date.UTC(year, month + 1, 1, 0, 0, 0));
  const resetAfterSeconds = Math.max(0, Math.floor((reset.getTime() - now.getTime()) / 1e3));
  const resetsAt = reset.toISOString().replace(".000Z", "+00:00");
  return { resetsAt, resetAfterSeconds };
}

// src/cli/providers/claude.ts
var ClaudeCliProvider = class extends BaseCliProvider {
  id = "claude";
  cacheFile() {
    return "claude_usage.json";
  }
  toLimits(raw) {
    const keys = [
      ["five_hour", "5-hour"],
      ["seven_day", "7-day"],
      ["seven_day_sonnet", "7-day sonnet"]
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
        reset_after_seconds: secondsUntilIso(w.resets_at ?? null)
      };
    });
  }
};

// src/cli/providers/codex.ts
var CodexCliProvider = class extends BaseCliProvider {
  id = "codex";
  cacheFile() {
    return "codex_usage.json";
  }
  toLimits(raw) {
    const map = [
      { key: "five_hour", label: "5-hour", window: raw.rate_limit?.primary_window },
      { key: "seven_day", label: "7-day", window: raw.rate_limit?.secondary_window },
      { key: "code_review_seven_day", label: "Code review 7-day", window: raw.code_review_rate_limit?.primary_window }
    ];
    return map.map(({ key, label, window }) => {
      const used = typeof window?.used_percent === "number" ? window.used_percent : null;
      return {
        key,
        label,
        used_percent: used,
        remaining_percent: used == null ? null : 100 - used,
        resets_at: unixToIso(window?.reset_at ?? null),
        reset_after_seconds: window?.reset_after_seconds ?? null
      };
    });
  }
};

// src/cli/providers/copilot.ts
var CopilotCliProvider = class extends BaseCliProvider {
  id = "copilot";
  cacheFile() {
    return "copilot_usage.json";
  }
  toLimits(raw) {
    const used = typeof raw.used_percent === "number" ? raw.used_percent : null;
    const remaining = typeof raw.remaining_percent === "number" ? raw.remaining_percent : used == null ? null : 100 - used;
    const { resetsAt, resetAfterSeconds } = nextMonthResetUtc();
    return [
      {
        key: "month",
        label: "month",
        used_percent: used,
        remaining_percent: remaining,
        resets_at: resetsAt,
        reset_after_seconds: resetAfterSeconds
      }
    ];
  }
};

// src/cli/providers/registry.ts
var cliProviders = {
  claude: new ClaudeCliProvider(),
  codex: new CodexCliProvider(),
  copilot: new CopilotCliProvider()
};

// src/cli/render.ts
function parseArgs(argv) {
  let service = "all";
  let format = "text";
  for (const arg of argv) {
    if (arg === "--json") {
      format = "json";
      continue;
    }
    if (arg === "claude" || arg === "codex" || arg === "copilot") {
      service = arg;
      continue;
    }
  }
  const cacheDir = process.env.CACHE_DIR;
  if (!cacheDir) {
    throw new Error("CACHE_DIR not set");
  }
  return { service, format, cacheDir };
}
function selectedProviders(service) {
  if (service === "all") return ["claude", "codex", "copilot"];
  return [service];
}
function renderText(report, selected) {
  const sections = [];
  const labels = {
    claude: {
      five_hour: "5-hour",
      seven_day: "7-day",
      seven_day_sonnet: "7-day sonnet"
    },
    codex: {
      five_hour: "5-hour",
      seven_day: "7-day",
      code_review_seven_day: "Code review 7-day"
    },
    copilot: {
      month: "month"
    }
  };
  for (const providerId of selected) {
    const provider = report.providers[providerId];
    if (!provider) continue;
    const title = `${providerId.charAt(0).toUpperCase()}${providerId.slice(1)} usage`;
    sections.push(title);
    const orderedKeys = Object.keys(provider.limits);
    for (const key of orderedKeys) {
      const win = provider.limits[key];
      const value = typeof win.used_percent === "number" ? win.used_percent.toFixed(1) : "n/a";
      sections.push(`- ${labels[providerId][key] ?? key}: ${value}%`);
    }
    sections.push("");
  }
  return sections.join("\n").trimEnd();
}
async function main() {
  const options = parseArgs(process.argv.slice(2));
  const selected = selectedProviders(options.service);
  const providers = {};
  for (const providerId of selected) {
    const usage = await cliProviders[providerId].load(options.cacheDir);
    providers[providerId] = toProviderOutput(usage);
  }
  const report = {
    checked_at: (/* @__PURE__ */ new Date()).toISOString().replace(/\.\d{3}Z$/, "+00:00"),
    providers
  };
  if (options.format === "json") {
    stdout.write(`${JSON.stringify(report, null, 2)}
`);
    return;
  }
  stdout.write(`${renderText(report, selected)}
`);
}
main().catch((err) => {
  stderr.write(`${err.message}
`);
  process.exit(1);
});
