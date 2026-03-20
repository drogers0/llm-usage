/// <reference types="chrome" />

import { BaseExtensionProvider, type FetchContext, type ProviderFetchResult } from "./base.js";

export class ClaudeExtensionProvider extends BaseExtensionProvider {
  readonly id = "claude" as const;

  async fetch(ctx: FetchContext): Promise<ProviderFetchResult> {
    const cookies = await chrome.cookies.getAll({ domain: ".claude.ai" });
    const orgCookie = cookies.find((c) => c.name === "lastActiveOrg");
    if (!orgCookie) this.throwAuth("lastActiveOrg cookie not found — log in to claude.ai first");

    const tab = await ctx.createHiddenTab("https://claude.ai/settings/usage", ctx.windowId);
    try {
      const results = await chrome.scripting.executeScript({
        target: { tabId: tab.id as number },
        func: async (orgId: string) => {
          const resp = await fetch(`/api/organizations/${orgId}/usage`, {
            credentials: "include",
          });
          if (!resp.ok) return { error: `HTTP ${resp.status}` };
          return { data: await resp.json() };
        },
        args: [orgCookie.value],
      });

      const result = results?.[0]?.result as { data?: unknown; error?: string } | undefined;
      if (!result || result.error) this.throwTransport(result?.error || "script returned no result");

      ctx.sendToHost({ type: "claude", cache: { claude_usage: result.data } });
      return { ok: true };
    } finally {
      chrome.tabs.remove(tab.id as number).catch(() => undefined);
    }
  }
}
