#!/usr/bin/env node

// src/cli/read-fetch-status.ts
import { readFileSync } from "node:fs";
function readStatus(filePath) {
  const empty = { ok: null, errors: null, request_id: null };
  if (!filePath) return empty;
  try {
    const raw = readFileSync(filePath, "utf-8");
    const data = JSON.parse(raw);
    return {
      ok: data.ok ?? null,
      errors: data.errors && typeof data.errors === "object" ? data.errors : null,
      request_id: data.request_id ?? null
    };
  } catch {
    return empty;
  }
}
function formatErrors(errors) {
  if (!errors) return "unknown extension error";
  const entries = Object.entries(errors);
  return entries.length > 0 ? entries.map(([k, v]) => `${k}: ${v}`).join("; ") : "unknown extension error";
}
function main() {
  const args = process.argv.slice(2);
  const tsv = args.includes("--tsv");
  const filePath = args.find((a) => a !== "--tsv");
  const result = readStatus(filePath);
  if (tsv) {
    process.stdout.write(`${result.ok}	${formatErrors(result.errors)}	${result.request_id}
`);
  } else {
    process.stdout.write(JSON.stringify(result));
  }
}
main();
