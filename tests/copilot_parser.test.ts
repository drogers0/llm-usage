import { describe, expect, it } from "vitest";
import { parseCopilotUsage } from "../src/extension/providers/copilot.js";

describe("parseCopilotUsage", () => {
  describe("percent-based parsing", () => {
    it("parses integer percent", () => {
      const result = parseCopilotUsage("75% of premium requests used", "");
      expect(result).toEqual({ used_percent: 75, remaining_percent: 25 });
    });

    it("parses decimal percent", () => {
      const result = parseCopilotUsage("13.2% usage of premium quota", "");
      expect(result).toEqual({ used_percent: 13.2, remaining_percent: 86.8 });
    });

    it("parses 0%", () => {
      const result = parseCopilotUsage("0% used", "");
      expect(result).toEqual({ used_percent: 0, remaining_percent: 100 });
    });

    it("parses 100%", () => {
      const result = parseCopilotUsage("100% premium used", "");
      expect(result).toEqual({ used_percent: 100, remaining_percent: 0 });
    });
  });

  describe("slash-notation parsing", () => {
    it("parses used / total", () => {
      const result = parseCopilotUsage(null, "You have used 150 / 300 premium requests");
      expect(result).toEqual({ used_percent: 50, remaining_percent: 50 });
    });

    it("parses with commas", () => {
      const result = parseCopilotUsage(null, "1,000 / 10,000 requests used");
      expect(result).toEqual({ used_percent: 10, remaining_percent: 90 });
    });

    it("falls back to slash when candidate has no percent", () => {
      const result = parseCopilotUsage("no percent here", "50 / 200 premium requests");
      expect(result).toEqual({ used_percent: 25, remaining_percent: 75 });
    });
  });

  describe("parse failures", () => {
    it("returns null when no data available", () => {
      expect(parseCopilotUsage(null, "")).toBeNull();
    });

    it("returns null when text has no recognizable pattern", () => {
      expect(parseCopilotUsage(null, "Welcome to GitHub Copilot settings")).toBeNull();
    });

    it("returns null when candidate text has no percent match", () => {
      expect(parseCopilotUsage("premium requests", "no numbers here")).toBeNull();
    });
  });
});
