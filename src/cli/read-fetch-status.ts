#!/usr/bin/env node
/**
 * Reads and parses fetch_status.json.
 * Usage: node read-fetch-status.js [--tsv] <path-to-fetch_status.json>
 * Default output: JSON {"ok":..., "errors":..., "request_id":...}
 * TSV output: ok\terrors_string\trequest_id (for direct bash consumption)
 */
import { readFileSync } from "node:fs";

interface StatusResult {
  ok: boolean | null;
  errors: Record<string, string> | null;
  request_id: string | null;
}

function readStatus(filePath: string | undefined): StatusResult {
  const empty: StatusResult = { ok: null, errors: null, request_id: null };
  if (!filePath) return empty;

  try {
    const raw = readFileSync(filePath, "utf-8");
    const data = JSON.parse(raw) as { ok?: boolean; errors?: Record<string, string>; request_id?: string };
    return {
      ok: data.ok ?? null,
      errors: data.errors && typeof data.errors === "object" ? data.errors : null,
      request_id: data.request_id ?? null,
    };
  } catch {
    return empty;
  }
}

function formatErrors(errors: Record<string, string> | null): string {
  if (!errors) return "unknown extension error";
  const entries = Object.entries(errors);
  return entries.length > 0
    ? entries.map(([k, v]) => `${k}: ${v}`).join("; ")
    : "unknown extension error";
}

function main(): void {
  const args = process.argv.slice(2);
  const tsv = args.includes("--tsv");
  const filePath = args.find((a) => a !== "--tsv");

  const result = readStatus(filePath);

  if (tsv) {
    process.stdout.write(`${result.ok}\t${formatErrors(result.errors)}\t${result.request_id}\n`);
  } else {
    process.stdout.write(JSON.stringify(result));
  }
}

main();
