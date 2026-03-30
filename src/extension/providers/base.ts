/// <reference types="chrome" />

import { AuthError, ParseError, TransportError } from "../../shared/errors.js";
import type { ProviderId } from "../../shared/types.js";

export interface FetchContext {
  windowId: number | undefined;
  createHiddenTab: (url: string, windowId: number | undefined, timeoutMs?: number) => Promise<chrome.tabs.Tab>;
  sendToHost: (payload: Record<string, unknown>) => Promise<unknown>;
  deadlineMs?: number;
}

export interface ProviderFetchResult {
  data: unknown;
}

export type ScriptResult = { data?: unknown; error?: string };

/**
 * Unwrap a chrome.scripting.executeScript result into data or throw.
 */
export function unwrapScriptResult(
  results: chrome.scripting.InjectionResult[] | undefined,
  throwError: (msg: string) => never,
): unknown {
  const result = results?.[0]?.result as ScriptResult | undefined;
  if (!result || result.error) {
    throwError(result?.error || "script returned no result");
  }
  return result.data;
}

/**
 * Run a provider fetch with managed tab lifecycle.
 * The helper takes single ownership of tab cleanup — callers must not remove the tab.
 */
export async function withHiddenTab<T>(
  ctx: FetchContext,
  url: string,
  preFetch: (() => Promise<void>) | null,
  execute: (tab: chrome.tabs.Tab) => Promise<T>,
): Promise<T> {
  if (preFetch) await preFetch();
  const remaining = ctx.deadlineMs ? Math.max(1000, ctx.deadlineMs - Date.now()) : undefined;
  const tab = await ctx.createHiddenTab(url, ctx.windowId, remaining);
  try {
    return await execute(tab);
  } finally {
    chrome.tabs.remove(tab.id as number).catch(() => undefined);
  }
}

export abstract class BaseExtensionProvider {
  abstract readonly id: ProviderId;
  abstract fetch(ctx: FetchContext): Promise<ProviderFetchResult>;

  protected throwAuth(msg: string): never {
    throw new AuthError(msg);
  }

  protected throwParse(msg: string): never {
    throw new ParseError(msg);
  }

  protected throwTransport(msg: string): never {
    throw new TransportError(msg);
  }
}
