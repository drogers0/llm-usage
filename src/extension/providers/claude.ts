/// <reference types="chrome" />

import { BaseExtensionProvider, unwrapScriptResult, withHiddenTab, type FetchContext, type ProviderFetchResult } from "./base.js";

export class ClaudeExtensionProvider extends BaseExtensionProvider {
  readonly id = "claude" as const;

  async fetch(ctx: FetchContext): Promise<ProviderFetchResult> {
    let orgId: string;

    return withHiddenTab(
      ctx,
      "https://claude.ai/settings/usage",
      async () => {
        const cookies = await chrome.cookies.getAll({ domain: ".claude.ai" });
        const orgCookie = cookies.find((c) => c.name === "lastActiveOrg");
        if (!orgCookie) this.throwAuth("lastActiveOrg cookie not found — log in to claude.ai first");
        orgId = orgCookie.value;
      },
      async (tab) => {
        const results = await chrome.scripting.executeScript({
          target: { tabId: tab.id as number },
          func: async (orgId: string) => {
            const resp = await fetch(`/api/organizations/${orgId}/usage`, { credentials: "include" });
            if (!resp.ok) return { error: `HTTP ${resp.status}` };
            return { data: await resp.json() };
          },
          args: [orgId!],
        });

        const data = unwrapScriptResult(results, (msg) => this.throwTransport(msg));
        void ctx.sendToHost({ type: "claude", cache: { claude_usage: data } }).catch(() => undefined);
        return { data };
      },
    );
  }
}
