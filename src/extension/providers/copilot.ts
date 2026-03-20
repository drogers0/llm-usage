/// <reference types="chrome" />

import { BaseExtensionProvider, type FetchContext, type ProviderFetchResult } from "./base.js";

export class CopilotExtensionProvider extends BaseExtensionProvider {
  readonly id = "copilot" as const;

  async fetch(ctx: FetchContext): Promise<ProviderFetchResult> {
    const tab = await ctx.createHiddenTab("https://github.com/settings/copilot/features", ctx.windowId);
    try {
      const results = await chrome.scripting.executeScript({
        target: { tabId: tab.id as number },
        func: async () => {
          const root = document.body;
          if (!root) return { error: "missing document body" };

          const text = root.innerText;
          const percentEl = Array.from(document.querySelectorAll("*"))
            .find((el) => /%/.test(el.textContent || "") && /used|usage|premium/i.test(el.textContent || ""));

          let usedPercent: number | null = null;
          let remainingPercent: number | null = null;

          if (percentEl?.textContent) {
            const m = percentEl.textContent.match(/([0-9]+(?:\.[0-9]+)?)\s*%/);
            if (m) {
              usedPercent = Number(m[1]);
              if (Number.isFinite(usedPercent)) {
                remainingPercent = Number((100 - usedPercent).toFixed(1));
              }
            }
          }

          if (usedPercent == null) {
            const slash = text.match(/([0-9][0-9,]*)\s*\/\s*([0-9][0-9,]*)/);
            if (slash) {
              const used = Number(slash[1].replace(/,/g, ""));
              const total = Number(slash[2].replace(/,/g, ""));
              if (Number.isFinite(used) && Number.isFinite(total) && total > 0) {
                usedPercent = Number(((used / total) * 100).toFixed(1));
                remainingPercent = Number((100 - usedPercent).toFixed(1));
              }
            }
          }

          if (usedPercent == null || remainingPercent == null) {
            return { error: "could not parse Copilot usage from DOM" };
          }

          return { data: { used_percent: usedPercent, remaining_percent: remainingPercent } };
        },
      });

      const result = results?.[0]?.result as { data?: unknown; error?: string } | undefined;
      if (!result || result.error) this.throwParse(result?.error || "script returned no result");

      ctx.sendToHost({ type: "copilot", cache: { copilot_usage: result.data } });
      return { ok: true };
    } finally {
      chrome.tabs.remove(tab.id as number).catch(() => undefined);
    }
  }
}
