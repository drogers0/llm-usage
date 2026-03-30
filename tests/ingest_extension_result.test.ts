import { describe, expect, it, beforeEach, afterEach } from "vitest";
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { readFileSync } from "node:fs";

function fixture(name: string): unknown {
  return JSON.parse(readFileSync(new URL(`./fixtures/${name}`, import.meta.url), "utf-8"));
}

function encodeEnvelope(payload: unknown): string {
  return encodeURIComponent(JSON.stringify(payload));
}

const INGEST_JS = path.resolve("dist/cli/ingest_extension_result.js");

describe("ingest_extension_result", () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "llm-usage-test-"));
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  function run(mode: string, envelope: unknown): { stdout: string; stderr: string; status: number } {
    const encoded = encodeEnvelope(envelope);
    try {
      const stdout = execFileSync("node", [INGEST_JS, mode], {
        env: { ...process.env, RESULT_URL: encoded, CACHE_DIR: tmpDir },
        encoding: "utf-8",
      });
      return { stdout, stderr: "", status: 0 };
    } catch (e: unknown) {
      const err = e as { stdout?: string; stderr?: string; status?: number };
      return { stdout: err.stdout || "", stderr: err.stderr || "", status: err.status || 1 };
    }
  }

  describe("--write mode", () => {
    it("writes all provider cache files on success", () => {
      const envelope = fixture("envelope-success.json");
      const result = run("--write", envelope);
      expect(result.status).toBe(0);

      expect(fs.existsSync(path.join(tmpDir, "claude_usage.json"))).toBe(true);
      expect(fs.existsSync(path.join(tmpDir, "codex_usage.json"))).toBe(true);
      expect(fs.existsSync(path.join(tmpDir, "copilot_usage.json"))).toBe(true);
      expect(fs.existsSync(path.join(tmpDir, "fetch_status.json"))).toBe(true);
    });

    it("throws on failed envelope (ok: false)", () => {
      const envelope = fixture("envelope-failed.json");
      const result = run("--write", envelope);
      expect(result.status).not.toBe(0);
      expect(result.stderr).toContain("lastActiveOrg cookie not found");
    });

    it("throws on malformed envelope (missing ok field)", () => {
      const envelope = fixture("envelope-malformed.json");
      const result = run("--write", envelope);
      expect(result.status).not.toBe(0);
      expect(result.stderr).toContain("envelope missing boolean 'ok' field");
    });

    it("rejects envelope where ok:true but status reports failure", () => {
      const envelope = fixture("envelope-partial.json");
      const result = run("--write", envelope);
      expect(result.status).not.toBe(0);
      expect(result.stderr).toContain("status reports failure");
    });

    it("rejects envelope where ok:true but requested providers are missing", () => {
      const result = run("--write", {
        ok: true,
        services: ["claude", "codex"],
        results: { claude: { five_hour: { utilization: 10 } } },
        status: { ok: true, at: "2026-03-20T18:00:00Z", started_at: "2026-03-20T17:59:55Z", services: ["claude", "codex"] },
      });
      expect(result.status).not.toBe(0);
      expect(result.stderr).toContain("missing results for requested providers: codex");
    });

    it("accepts valid-but-empty envelope with zero services", () => {
      const result = run("--write", {
        ok: true,
        services: [],
        results: {},
        status: { ok: true, at: "2026-03-20T18:00:00Z", started_at: "2026-03-20T17:59:55Z", services: [] },
      });
      expect(result.status).toBe(0);
    });
  });

  describe("--error mode", () => {
    it("outputs error from failed envelope", () => {
      const envelope = fixture("envelope-failed.json");
      const result = run("--error", envelope);
      expect(result.status).toBe(0);
      expect(result.stdout).toContain("lastActiveOrg cookie not found");
    });

    it("outputs fallback when error field is absent", () => {
      const result = run("--error", { ok: false });
      expect(result.status).toBe(0);
      expect(result.stdout).toBe("unknown extension error");
    });

    it("outputs error field even when ok:true (documents current behavior)", () => {
      const result = run("--error", { ok: true, error: "some error" });
      expect(result.status).toBe(0);
      expect(result.stdout).toBe("some error");
    });
  });
});
