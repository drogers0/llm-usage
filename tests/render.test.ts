import { describe, expect, it, beforeEach, afterEach } from "vitest";
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { readFileSync } from "node:fs";

function fixture(name: string): unknown {
  return JSON.parse(readFileSync(new URL(`./fixtures/${name}`, import.meta.url), "utf-8"));
}

const RENDER_JS = path.resolve("dist/cli/render.js");

describe("render", () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "llm-usage-render-"));
    // Write provider cache files from fixtures
    fs.writeFileSync(path.join(tmpDir, "claude_usage.json"), JSON.stringify(fixture("claude.json")));
    fs.writeFileSync(path.join(tmpDir, "codex_usage.json"), JSON.stringify(fixture("codex.json")));
    fs.writeFileSync(path.join(tmpDir, "copilot_usage.json"), JSON.stringify(fixture("copilot.json")));
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  function render(...args: string[]): { stdout: string; stderr: string; status: number } {
    try {
      const stdout = execFileSync("node", [RENDER_JS, ...args], {
        env: { ...process.env, CACHE_DIR: tmpDir },
        encoding: "utf-8",
      });
      return { stdout, stderr: "", status: 0 };
    } catch (e: unknown) {
      const err = e as { stdout?: string; stderr?: string; status?: number };
      return { stdout: err.stdout || "", stderr: err.stderr || "", status: err.status || 1 };
    }
  }

  describe("text mode", () => {
    it("renders all providers by default", () => {
      const result = render();
      expect(result.status).toBe(0);
      expect(result.stdout).toContain("Claude usage");
      expect(result.stdout).toContain("Codex usage");
      expect(result.stdout).toContain("Copilot usage");
    });

    it("renders single provider", () => {
      const result = render("claude");
      expect(result.status).toBe(0);
      expect(result.stdout).toContain("Claude usage");
      expect(result.stdout).not.toContain("Codex usage");
    });

    it("renders usage percentages", () => {
      const result = render("claude");
      expect(result.status).toBe(0);
      expect(result.stdout).toContain("12.5%");
      expect(result.stdout).toContain("5-hour");
    });

    it("renders copilot month window", () => {
      const result = render("copilot");
      expect(result.status).toBe(0);
      expect(result.stdout).toContain("13.2%");
      expect(result.stdout).toContain("month");
    });
  });

  describe("json mode", () => {
    it("outputs valid JSON with provider keys", () => {
      const result = render("--json");
      expect(result.status).toBe(0);
      const report = JSON.parse(result.stdout);
      expect(report).toHaveProperty("checked_at");
      expect(report).toHaveProperty("providers");
      expect(report.providers).toHaveProperty("claude");
      expect(report.providers).toHaveProperty("codex");
      expect(report.providers).toHaveProperty("copilot");
    });

    it("outputs single provider JSON", () => {
      const result = render("claude", "--json");
      expect(result.status).toBe(0);
      const report = JSON.parse(result.stdout);
      expect(report.providers).toHaveProperty("claude");
      expect(report.providers).not.toHaveProperty("codex");
    });

    it("includes limit windows with expected fields", () => {
      const result = render("claude", "--json");
      expect(result.status).toBe(0);
      const report = JSON.parse(result.stdout);
      const limits = report.providers.claude.limits;
      expect(limits).toHaveProperty("five_hour");
      expect(limits.five_hour).toHaveProperty("used_percent");
      expect(limits.five_hour).toHaveProperty("remaining_percent");
      expect(limits.five_hour).toHaveProperty("resets_at");
      expect(limits.five_hour).toHaveProperty("reset_after_seconds");
    });
  });

  describe("null/partial limit values", () => {
    it("renders n/a for null used_percent", () => {
      // Write a copilot cache with null values
      fs.writeFileSync(path.join(tmpDir, "copilot_usage.json"), JSON.stringify({
        used_percent: null,
        remaining_percent: null,
      }));
      const result = render("copilot");
      expect(result.status).toBe(0);
      expect(result.stdout).toContain("n/a");
    });
  });

  describe("missing cache", () => {
    it("fails when cache file is missing", () => {
      fs.unlinkSync(path.join(tmpDir, "claude_usage.json"));
      const result = render("claude");
      expect(result.status).not.toBe(0);
      expect(result.stderr).toContain("Missing cache file");
    });
  });
});
