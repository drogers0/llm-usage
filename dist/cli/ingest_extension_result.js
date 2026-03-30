// src/cli/ingest_extension_result.ts
import fs from "node:fs";
import path from "node:path";
function decodeEnvelope(encoded) {
  return JSON.parse(decodeURIComponent(encoded));
}
function writeJson(cacheDir, name, data) {
  const target = path.join(cacheDir, `${name}.json`);
  fs.writeFileSync(target, JSON.stringify(data));
}
function writeCacheFromEnvelope(cacheDir, payload) {
  if (!payload.ok) {
    throw new Error(payload.error || "unknown extension error");
  }
  fs.mkdirSync(cacheDir, { recursive: true });
  if (payload.results && typeof payload.results === "object") {
    if (payload.results.claude !== void 0) writeJson(cacheDir, "claude_usage", payload.results.claude);
    if (payload.results.codex !== void 0) writeJson(cacheDir, "codex_usage", payload.results.codex);
    if (payload.results.copilot !== void 0) writeJson(cacheDir, "copilot_usage", payload.results.copilot);
  }
  if (payload.status) {
    writeJson(cacheDir, "fetch_status", payload.status);
  }
}
function main() {
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
