import { describe, expect, it, vi, beforeEach } from "vitest";
import { unwrapScriptResult, withHiddenTab, type FetchContext } from "../src/extension/providers/base.js";

// Mock chrome APIs
const mockRemove = vi.fn().mockResolvedValue(undefined);
vi.stubGlobal("chrome", {
  tabs: {
    remove: mockRemove,
  },
});

describe("unwrapScriptResult", () => {
  const throwError = (msg: string): never => {
    throw new Error(msg);
  };

  it("returns data on success", () => {
    const results = [{ result: { data: { foo: "bar" } }, documentId: "", frameId: 0 }];
    expect(unwrapScriptResult(results, throwError)).toEqual({ foo: "bar" });
  });

  it("throws on error result", () => {
    const results = [{ result: { error: "something broke" }, documentId: "", frameId: 0 }];
    expect(() => unwrapScriptResult(results, throwError)).toThrow("something broke");
  });

  it("throws on undefined results", () => {
    expect(() => unwrapScriptResult(undefined, throwError)).toThrow("script returned no result");
  });

  it("throws on empty results array", () => {
    expect(() => unwrapScriptResult([], throwError)).toThrow("script returned no result");
  });

  it("throws on null result in array", () => {
    const results = [{ result: null, documentId: "", frameId: 0 }];
    expect(() => unwrapScriptResult(results as unknown as chrome.scripting.InjectionResult[], throwError)).toThrow("script returned no result");
  });
});

describe("withHiddenTab", () => {
  let ctx: FetchContext;
  const mockTab = { id: 42 } as chrome.tabs.Tab;

  beforeEach(() => {
    vi.clearAllMocks();
    ctx = {
      windowId: 1,
      createHiddenTab: vi.fn().mockResolvedValue(mockTab),
      sendToHost: vi.fn().mockResolvedValue(undefined),
    };
  });

  it("creates tab, runs execute, and cleans up", async () => {
    const result = await withHiddenTab(ctx, "https://example.com", null, async () => "done");
    expect(result).toBe("done");
    expect(ctx.createHiddenTab).toHaveBeenCalledWith("https://example.com", 1, undefined);
    expect(mockRemove).toHaveBeenCalledWith(42);
  });

  it("runs preFetch before creating tab", async () => {
    const order: string[] = [];
    const preFetch = vi.fn(async () => { order.push("pre"); });
    (ctx.createHiddenTab as ReturnType<typeof vi.fn>).mockImplementation(async () => {
      order.push("tab");
      return mockTab;
    });

    await withHiddenTab(ctx, "https://example.com", preFetch, async () => {
      order.push("exec");
      return null;
    });

    expect(order).toEqual(["pre", "tab", "exec"]);
  });

  it("cleans up tab even when execute throws", async () => {
    await expect(
      withHiddenTab(ctx, "https://example.com", null, async () => {
        throw new Error("boom");
      }),
    ).rejects.toThrow("boom");
    expect(mockRemove).toHaveBeenCalledWith(42);
  });

  it("does not create tab if preFetch throws", async () => {
    await expect(
      withHiddenTab(ctx, "https://example.com", async () => { throw new Error("auth failed"); }, async () => "ok"),
    ).rejects.toThrow("auth failed");
    expect(ctx.createHiddenTab).not.toHaveBeenCalled();
    expect(mockRemove).not.toHaveBeenCalled();
  });

  // MV3 wake path regression tests (implemented from Step 4 it.todo)
  it("handles createHiddenTab failure gracefully", async () => {
    (ctx.createHiddenTab as ReturnType<typeof vi.fn>).mockRejectedValue(new Error("tab creation failed"));
    await expect(
      withHiddenTab(ctx, "https://example.com", null, async () => "ok"),
    ).rejects.toThrow("tab creation failed");
    // Tab was never created, so no cleanup needed
    expect(mockRemove).not.toHaveBeenCalled();
  });
});
