import fs from "node:fs";
import path from "node:path";
import { validateEnvelope } from "../shared/fetch-status.js";
import type { FetchEnvelope } from "../shared/fetch-status.js";

function decodeEnvelope(encoded: string): FetchEnvelope {
  const raw = JSON.parse(decodeURIComponent(encoded));
  return validateEnvelope(raw);
}

function writeJson(cacheDir: string, name: string, data: unknown): void {
  const target = path.join(cacheDir, `${name}.json`);
  fs.writeFileSync(target, JSON.stringify(data));
}

function writeCacheFromEnvelope(cacheDir: string, payload: FetchEnvelope): void {
  if (!payload.ok) {
    throw new Error(payload.error || "unknown extension error");
  }

  // Reject if the status reports failure despite top-level ok
  if (payload.status && !payload.status.ok) {
    const errors = payload.status.errors
      ? Object.entries(payload.status.errors).map(([k, v]) => `${k}: ${v}`).join("; ")
      : "unknown error";
    throw new Error(`status reports failure: ${errors}`);
  }

  // Reject if any requested service is missing from results (unless zero services requested)
  const requestedServices = payload.services || [];
  if (requestedServices.length > 0 && payload.results) {
    const missing = requestedServices.filter((s) => !(s in payload.results!));
    if (missing.length > 0) {
      throw new Error(`missing results for requested providers: ${missing.join(", ")}`);
    }
  }

  fs.mkdirSync(cacheDir, { recursive: true });

  if (payload.results && typeof payload.results === "object") {
    if (payload.results.claude !== undefined) writeJson(cacheDir, "claude_usage", payload.results.claude);
    if (payload.results.codex !== undefined) writeJson(cacheDir, "codex_usage", payload.results.codex);
    if (payload.results.copilot !== undefined) writeJson(cacheDir, "copilot_usage", payload.results.copilot);
  }

  if (payload.status) {
    writeJson(cacheDir, "fetch_status", payload.status);
  }
}

function main(): void {
  const mode = process.argv[2];
  const encoded = process.env.RESULT_URL || "";

  if (!encoded) {
    console.error("missing RESULT_URL");
    process.exit(2);
  }

  const payload = decodeEnvelope(encoded);

  if (mode === "--error") {
    process.stdout.write(payload.error || "unknown extension error");
    return;
  }

  if (mode !== "--write") {
    console.error("usage: ingest_extension_result.js [--write|--error]");
    process.exit(2);
  }

  const cacheDir = process.env.CACHE_DIR || "";
  if (!cacheDir) {
    console.error("missing CACHE_DIR");
    process.exit(2);
  }

  writeCacheFromEnvelope(cacheDir, payload);
}

main();
