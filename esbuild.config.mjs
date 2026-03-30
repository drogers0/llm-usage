import { build } from "esbuild";

await build({
  bundle: true,
  format: "esm",
  target: "node20",
  platform: "node",
  sourcemap: false,
  logLevel: "info",
  entryPoints: ["src/cli/render.ts"],
  outfile: "dist/cli/render.js",
});

await build({
  bundle: true,
  format: "esm",
  target: "node20",
  platform: "node",
  sourcemap: false,
  logLevel: "info",
  entryPoints: ["src/cli/ingest_extension_result.ts"],
  outfile: "dist/cli/ingest_extension_result.js",
});

await build({
  bundle: true,
  format: "esm",
  target: "node20",
  platform: "node",
  sourcemap: false,
  logLevel: "info",
  entryPoints: ["src/cli/read-fetch-status.ts"],
  outfile: "dist/cli/read-fetch-status.js",
});

await build({
  bundle: true,
  format: "iife",
  target: "chrome120",
  platform: "browser",
  sourcemap: false,
  logLevel: "info",
  entryPoints: ["src/extension/background.ts"],
  outfile: "extension/background.js",
});

await build({
  bundle: true,
  format: "iife",
  target: "chrome120",
  platform: "browser",
  sourcemap: false,
  logLevel: "info",
  entryPoints: ["src/extension/fetch.ts"],
  outfile: "extension/fetch.js",
});
