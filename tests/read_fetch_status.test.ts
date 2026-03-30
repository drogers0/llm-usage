import { describe, expect, it, beforeEach, afterEach } from "vitest";
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";

const READ_STATUS_JS = path.resolve("dist/cli/read-fetch-status.js");

describe("read-fetch-status", () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "llm-usage-status-"));
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  function run(filePath?: string): { ok: boolean | null; errors: Record<string, string> | null; request_id: string | null } {
    const args = [READ_STATUS_JS];
    if (filePath) args.push(filePath);
    const stdout = execFileSync("node", args, { encoding: "utf-8" });
    return JSON.parse(stdout);
  }

  it("reads valid fetch_status.json", () => {
    const statusFile = path.join(tmpDir, "fetch_status.json");
    fs.writeFileSync(statusFile, JSON.stringify({
      ok: true,
      at: "2026-03-20T18:00:00Z",
      started_at: "2026-03-20T17:59:55Z",
      services: ["claude"],
      request_id: "test-id-123",
    }));

    const result = run(statusFile);
    expect(result.ok).toBe(true);
    expect(result.errors).toBeNull();
    expect(result.request_id).toBe("test-id-123");
  });

  it("reads failed status with errors", () => {
    const statusFile = path.join(tmpDir, "fetch_status.json");
    fs.writeFileSync(statusFile, JSON.stringify({
      ok: false,
      errors: { claude: "auth_error: not logged in" },
    }));

    const result = run(statusFile);
    expect(result.ok).toBe(false);
    expect(result.errors).toEqual({ claude: "auth_error: not logged in" });
  });

  it("returns nulls for missing file", () => {
    const result = run(path.join(tmpDir, "nonexistent.json"));
    expect(result.ok).toBeNull();
    expect(result.errors).toBeNull();
    expect(result.request_id).toBeNull();
  });

  it("returns nulls when no path argument given", () => {
    const result = run();
    expect(result.ok).toBeNull();
  });

  it("returns nulls for malformed JSON", () => {
    const statusFile = path.join(tmpDir, "fetch_status.json");
    fs.writeFileSync(statusFile, "not valid json{{{");
    const result = run(statusFile);
    expect(result.ok).toBeNull();
  });
});
