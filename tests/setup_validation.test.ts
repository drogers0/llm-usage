import { describe, expect, it, beforeEach, afterEach } from "vitest";
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";

const ROOT_DIR = path.resolve(".");
const INSTALL_SH = path.join(ROOT_DIR, "install.sh");
const KNOWN_EXT_ID = "laekandkmcnacdhdmaajkclbabgncafd";

describe("setup validation", () => {
  let tmpDir: string;
  let nmhDir: string;
  let savedEnv: string | null = null;
  const envPath = path.join(ROOT_DIR, ".env");

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "llm-usage-setup-"));
    nmhDir = path.join(tmpDir, "nmh");
    fs.mkdirSync(nmhDir, { recursive: true });
    // Save existing .env to restore after test
    try { savedEnv = fs.readFileSync(envPath, "utf-8"); } catch { savedEnv = null; }
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
    // Restore original .env
    if (savedEnv !== null) {
      fs.writeFileSync(envPath, savedEnv);
    } else {
      try { fs.unlinkSync(envPath); } catch { /* noop */ }
    }
  });

  function runSetup(scriptPath: string): { stdout: string; stderr: string; status: number } {
    try {
      const stdout = execFileSync("bash", [scriptPath, "--non-interactive", KNOWN_EXT_ID], {
        env: {
          ...process.env,
          LLM_USAGE_NMH_DIR: nmhDir,
          HOME: tmpDir,
        },
        encoding: "utf-8",
        cwd: ROOT_DIR,
        timeout: 15000,
      });
      return { stdout, stderr: "", status: 0 };
    } catch (e: unknown) {
      const err = e as { stdout?: string; stderr?: string; status?: number };
      return { stdout: err.stdout || "", stderr: err.stderr || "", status: err.status || 1 };
    }
  }

  it("generates a valid native-messaging manifest (direct invocation)", () => {
    const result = runSetup(INSTALL_SH);
    expect(result.status).toBe(0);

    const manifestPath = path.join(nmhDir, "com.llm_usage.cache_host.json");
    expect(fs.existsSync(manifestPath)).toBe(true);

    const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf-8"));
    expect(manifest.name).toBe("com.llm_usage.cache_host");
    expect(manifest.type).toBe("stdio");
    expect(manifest.path).toContain("usage_cache_host.py");
    expect(manifest.allowed_origins).toContain(`chrome-extension://${KNOWN_EXT_ID}/`);

    // Verify the path exists and is executable
    expect(fs.existsSync(manifest.path)).toBe(true);
    const stats = fs.statSync(manifest.path);
    expect(stats.mode & 0o111).toBeGreaterThan(0);
  });

  it("generates a valid manifest via symlink", () => {
    const link = path.join(tmpDir, "setup-link");
    fs.symlinkSync(INSTALL_SH, link);

    const result = runSetup(link);
    expect(result.status).toBe(0);

    const manifestPath = path.join(nmhDir, "com.llm_usage.cache_host.json");
    expect(fs.existsSync(manifestPath)).toBe(true);

    const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf-8"));
    expect(manifest.path).toContain("usage_cache_host.py");
    expect(fs.existsSync(manifest.path)).toBe(true);
  });

  it("writes EXTENSION_ID to .env", () => {
    runSetup(INSTALL_SH);
    const envPath = path.join(ROOT_DIR, ".env");
    const envContent = fs.readFileSync(envPath, "utf-8");
    expect(envContent).toContain(`EXTENSION_ID=${KNOWN_EXT_ID}`);
  });

  it("rejects invalid extension IDs", () => {
    const result = (() => {
      try {
        execFileSync("bash", [INSTALL_SH, "--non-interactive", "invalid-id"], {
          env: { ...process.env, LLM_USAGE_NMH_DIR: nmhDir, HOME: tmpDir },
          encoding: "utf-8",
          timeout: 10000,
        });
        return { status: 0 };
      } catch (e: unknown) {
        return { status: (e as { status?: number }).status || 1 };
      }
    })();
    expect(result.status).not.toBe(0);
  });
});
