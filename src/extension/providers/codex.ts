/// <reference types="chrome" />

import { BaseExtensionProvider, unwrapScriptResult, withHiddenTab, type FetchContext, type ProviderFetchResult } from "./base.js";

export class CodexExtensionProvider extends BaseExtensionProvider {
  readonly id = "codex" as const;

  async fetch(ctx: FetchContext): Promise<ProviderFetchResult> {
    return withHiddenTab(
      ctx,
      "https://chatgpt.com/codex/settings/usage",
      null,
      async (tab) => {
        const results = await chrome.scripting.executeScript({
          target: { tabId: tab.id as number },
          func: async () => {
            try {
              const tokenResp = await fetch("/api/auth/session", { credentials: "include" });
              if (!tokenResp.ok) return { error: `session HTTP ${tokenResp.status}` };
              const session = await tokenResp.json() as { accessToken?: string };
              if (!session.accessToken) return { error: "could not get access token" };
              const usageResp = await fetch("/backend-api/wham/usage", {
                credentials: "include",
                headers: { authorization: `Bearer ${session.accessToken}` },
              });
              if (!usageResp.ok) return { error: `usage HTTP ${usageResp.status}` };
              return { data: await usageResp.json() };
            } catch (e) {
              return { error: (e as Error).message };
            }
          },
        });

        const data = unwrapScriptResult(results, (msg) => this.throwTransport(msg));
        void ctx.sendToHost({ type: "codex", cache: { codex_usage: data } }).catch(() => undefined);
        return { data };
      },
    );
  }
}
