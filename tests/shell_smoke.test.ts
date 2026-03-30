import { describe, expect, it, beforeEach, afterEach } from "vitest";
import { execFileSync, execSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";

const ROOT_DIR = path.resolve(".");
const USAGE_CHECK = path.join(ROOT_DIR, "bin/usage-check");

describe("shell smoke tests", () => {
  let tmpDir: string;
  let stubDir: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "llm-usage-shell-"));
    stubDir = path.join(tmpDir, "stubs");
    fs.mkdirSync(stubDir);

    // Create a stub osascript that returns a fixture result
    const fixturePayload = JSON.stringify({
      ok: true,
      services: ["claude"],
      results: {
        claude: { five_hour: { utilization: 10, resets_at: "2026-04-01T00:00:00+00:00" } },
      },
      status: { ok: true, at: "2026-03-30T00:00:00Z", started_at: "2026-03-30T00:00:00Z", services: ["claude"] },
    });
    const encoded = encodeURIComponent(fixturePayload);
    fs.writeFileSync(
      path.join(stubDir, "osascript"),
      `#!/bin/bash\necho "chrome-extension://test/fetch.html#result=${encoded}"\n`,
    );
    fs.chmodSync(path.join(stubDir, "osascript"), 0o755);

    // Set EXTENSION_ID via env so load_env() in _common.sh won't overwrite it
    // (load_env skips already-set vars via `if [ -z "${!key+x}" ]`)
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  function runUsageCheck(args: string[] = [], extraEnv: Record<string, string> = {}): {
    stdout: string;
    stderr: string;
    status: number;
  } {
    try {
      const stdout = execFileSync("bash", [USAGE_CHECK, ...args], {
        env: {
          ...process.env,
          PATH: `${stubDir}:${process.env.PATH}`,
          LLM_USAGE_CACHE_DIR: path.join(tmpDir, "cache"),
          EXTENSION_ID: "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
          ...extraEnv,
        },
        encoding: "utf-8",
        timeout: 15000,
      });
      return { stdout, stderr: "", status: 0 };
    } catch (e: unknown) {
      const err = e as { stdout?: string; stderr?: string; status?: number };
      return { stdout: err.stdout || "", stderr: err.stderr || "", status: err.status || 1 };
    }
  }

  it("runs usage-check with default args (empty render_args)", () => {
    const result = runUsageCheck(["claude"]);
    expect(result.status).toBe(0);
    expect(result.stdout).toContain("Claude usage");
  });

  it("runs usage-check with --json flag", () => {
    const result = runUsageCheck(["claude", "--json"]);
    expect(result.status).toBe(0);
    const report = JSON.parse(result.stdout);
    expect(report).toHaveProperty("providers");
    expect(report.providers).toHaveProperty("claude");
  });

  it("runs usage-check through a symlink", () => {
    const link = path.join(tmpDir, "usage-check-link");
    fs.symlinkSync(USAGE_CHECK, link);
    try {
      const stdout = execFileSync("bash", [link, "claude"], {
        env: {
          ...process.env,
          PATH: `${stubDir}:${process.env.PATH}`,
          LLM_USAGE_CACHE_DIR: path.join(tmpDir, "cache"),
          EXTENSION_ID: "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
        },
        encoding: "utf-8",
        timeout: 15000,
      });
      expect(stdout).toContain("Claude usage");
    } catch (e: unknown) {
      const err = e as { stdout?: string; stderr?: string };
      throw new Error(`Symlink invocation failed: ${err.stderr}`);
    }
  });
});
