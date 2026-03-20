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
  target: "chrome120",
  platform: "browser",
  sourcemap: false,
  logLevel: "info",
  entryPoints: ["src/extension/background.ts"],
  outfile: "extension/background.js",
});
