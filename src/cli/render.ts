#!/usr/bin/env node
import { stderr, stdout } from "node:process";
import { toProviderOutput } from "../shared/compose.js";
import type { CliOptions, ProviderId, UnifiedUsageReport } from "../shared/types.js";
import { cliProviders } from "./providers/registry.js";

function parseArgs(argv: string[]): CliOptions {
  let service: ProviderId | "all" = "all";
  let format: "text" | "json" = "text";

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

function selectedProviders(service: ProviderId | "all"): ProviderId[] {
  if (service === "all") return ["claude", "codex", "copilot"];
  return [service];
}

function renderText(report: UnifiedUsageReport, selected: ProviderId[]): string {
  const sections: string[] = [];
  const labels: Record<ProviderId, Record<string, string>> = {
    claude: {
      five_hour: "5-hour",
      seven_day: "7-day",
      seven_day_sonnet: "7-day sonnet",
    },
    codex: {
      five_hour: "5-hour",
      seven_day: "7-day",
      code_review_seven_day: "Code review 7-day",
    },
    copilot: {
      month: "month",
    },
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

async function main(): Promise<void> {
  const options = parseArgs(process.argv.slice(2));
  const selected = selectedProviders(options.service);

  const providers: UnifiedUsageReport["providers"] = {};
  for (const providerId of selected) {
    const usage = await cliProviders[providerId].load(options.cacheDir);
    providers[providerId] = toProviderOutput(usage);
  }

  const report: UnifiedUsageReport = {
    checked_at: new Date().toISOString().replace(/\.\d{3}Z$/, "+00:00"),
    providers,
  };

  if (options.format === "json") {
    stdout.write(`${JSON.stringify(report, null, 2)}\n`);
    return;
  }

  stdout.write(`${renderText(report, selected)}\n`);
}

main().catch((err) => {
  stderr.write(`${err.message}\n`);
  process.exit(1);
});
