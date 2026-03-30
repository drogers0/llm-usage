// src/cli/ingest_extension_result.ts
import fs from "node:fs";
import path from "node:path";

// src/shared/fetch-status.ts
function validateEnvelope(raw) {
  if (typeof raw !== "object" || raw === null) {
    throw new Error("envelope is not an object");
  }
  const obj = raw;
  if (typeof obj.ok !== "boolean") {
    throw new Error("envelope missing boolean 'ok' field");
  }
  if (obj.services !== void 0 && !Array.isArray(obj.services)) {
    throw new Error("envelope 'services' must be an array");
  }
  if (obj.results !== void 0 && (typeof obj.results !== "object" || obj.results === null)) {
    throw new Error("envelope 'results' must be an object");
  }
  return raw;
}

// src/cli/ingest_extension_result.ts
function decodeEnvelope(encoded) {
  const raw = JSON.parse(decodeURIComponent(encoded));
  return validateEnvelope(raw);
}
function writeJson(cacheDir, name, data) {
  const target = path.join(cacheDir, `${name}.json`);
  fs.writeFileSync(target, JSON.stringify(data));
}
function writeCacheFromEnvelope(cacheDir, payload) {
  if (!payload.ok) {
    throw new Error(payload.error || "unknown extension error");
  }
  if (payload.status && !payload.status.ok) {
    const errors = payload.status.errors ? Object.entries(payload.status.errors).map(([k, v]) => `${k}: ${v}`).join("; ") : "unknown error";
    throw new Error(`status reports failure: ${errors}`);
  }
  const requestedServices = payload.services || [];
  if (requestedServices.length > 0 && payload.results) {
    const missing = requestedServices.filter((s) => !(s in payload.results));
    if (missing.length > 0) {
      throw new Error(`missing results for requested providers: ${missing.join(", ")}`);
    }
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
