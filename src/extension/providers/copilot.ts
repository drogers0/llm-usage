/// <reference types="chrome" />

import { BaseExtensionProvider, unwrapScriptResult, withHiddenTab, type FetchContext, type ProviderFetchResult } from "./base.js";

export interface ParsedCopilotUsage {
  used_percent: number;
  remaining_percent: number;
}

/**
 * Pure parsing function for Copilot usage data.
 * @param candidateText - textContent of the first DOM element matching /%/ + /used|usage|premium/i
 * @param bodyText - full innerText of the page body (fallback for slash-notation parsing)
 * @returns parsed usage or null if parsing fails
 */
export function parseCopilotUsage(candidateText: string | null, bodyText: string): ParsedCopilotUsage | null {
  if (candidateText) {
    const m = candidateText.match(/([0-9]+(?:\.[0-9]+)?)\s*%/);
    if (m) {
      const usedPercent = Number(m[1]);
      if (Number.isFinite(usedPercent)) {
        return {
          used_percent: usedPercent,
          remaining_percent: Number((100 - usedPercent).toFixed(1)),
        };
      }
    }
  }

  const slash = bodyText.match(/([0-9][0-9,]*)\s*\/\s*([0-9][0-9,]*)/);
  if (slash) {
    const used = Number(slash[1].replace(/,/g, ""));
    const total = Number(slash[2].replace(/,/g, ""));
    if (Number.isFinite(used) && Number.isFinite(total) && total > 0) {
      const usedPercent = Number(((used / total) * 100).toFixed(1));
      return {
        used_percent: usedPercent,
        remaining_percent: Number((100 - usedPercent).toFixed(1)),
      };
    }
  }

  return null;
}

export class CopilotExtensionProvider extends BaseExtensionProvider {
  readonly id = "copilot" as const;

  async fetch(ctx: FetchContext): Promise<ProviderFetchResult> {
    return withHiddenTab(
      ctx,
      "https://github.com/settings/copilot/features",
      null,
      async (tab) => {
        // Injected script extracts raw text from the DOM; parsing happens in extension context.
        const results = await chrome.scripting.executeScript({
          target: { tabId: tab.id as number },
          func: () => {
            const root = document.body;
            if (!root) return { error: "missing document body" };

            const bodyText = root.innerText;
            const percentEl = Array.from(document.querySelectorAll("*"))
              .find((el) => /%/.test(el.textContent || "") && /used|usage|premium/i.test(el.textContent || ""));

            return { data: { candidateText: percentEl?.textContent || null, bodyText } };
          },
        });

        const raw = unwrapScriptResult(results, (msg) => this.throwParse(msg)) as {
          candidateText: string | null;
          bodyText: string;
        };

        const parsed = parseCopilotUsage(raw.candidateText, raw.bodyText);
        if (!parsed) this.throwParse("could not parse Copilot usage from DOM");

        void ctx.sendToHost({ type: "copilot", cache: { copilot_usage: parsed } }).catch(() => undefined);
        return { data: parsed };
      },
    );
  }
}
