/// <reference types="chrome" />

import { UsageError } from "../shared/errors.js";
import type { ProviderId } from "../shared/types.js";
import { extensionProviders } from "./providers/registry.js";

const HOST_NAME = "com.llm_usage.cache_host";

type FetchStatus = {
  ok: boolean;
  at: string;
  started_at: string;
  services: string[];
  errors?: Record<string, string>;
};

chrome.runtime.onMessage.addListener((msg: unknown, sender: chrome.runtime.MessageSender, sendResponse: (response?: unknown) => void) => {
  const message = msg as { action?: string; services?: unknown };
  if (message.action !== "fetch_usage") return;
  const windowId = sender.tab?.windowId;
  const services: string[] = Array.isArray(message.services) ? (message.services as string[]) : ["claude", "codex", "copilot"];

  handleFetchRequest(services, windowId)
    .then((result) => sendResponse(result))
    .catch((e) => sendResponse({ error: (e as Error).message }));

  return true;
});

async function handleFetchRequest(services: string[], windowId: number | undefined) {
  const startedAt = new Date().toISOString();
  const errors: Record<string, string> = {};
  const results: Record<string, unknown> = {};

  for (const service of services) {
    const providerId = service as ProviderId;
    const provider = extensionProviders[providerId];
    if (!provider) {
      errors[service] = `unknown provider: ${service}`;
      continue;
    }

    try {
      results[service] = await provider.fetch({ windowId, createHiddenTab, sendToHost });
    } catch (err) {
      if (err instanceof UsageError) {
        errors[service] = `${err.code}: ${err.message}`;
      } else {
        errors[service] = (err as Error).message;
      }
    }
  }

  const status: FetchStatus = {
    ok: Object.keys(errors).length === 0,
    at: new Date().toISOString(),
    started_at: startedAt,
    services,
    ...(Object.keys(errors).length > 0 ? { errors } : {}),
  };

  sendToHost({ type: "status", cache: { fetch_status: status } });

  if (windowId) {
    chrome.windows.remove(windowId).catch(() => undefined);
  }

  return results;
}

async function createHiddenTab(url: string, windowId: number | undefined): Promise<chrome.tabs.Tab> {
  const tab = await chrome.tabs.create({ url, windowId, active: false });
  try {
    await waitForTab(tab.id as number);
    return tab;
  } catch (e) {
    chrome.tabs.remove(tab.id as number).catch(() => undefined);
    throw e;
  }
}

function waitForTab(tabId: number): Promise<void> {
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => {
      chrome.webNavigation.onCompleted.removeListener(listener);
      reject(new Error("tab load timed out"));
    }, 30000);

    function listener(details: chrome.webNavigation.WebNavigationFramedCallbackDetails) {
      if (details.tabId === tabId && details.frameId === 0) {
        clearTimeout(timeout);
        chrome.webNavigation.onCompleted.removeListener(listener);
        setTimeout(resolve, 1000);
      }
    }

    chrome.webNavigation.onCompleted.addListener(listener);
  });
}

function sendToHost(payload: Record<string, unknown>) {
  chrome.runtime.sendNativeMessage(HOST_NAME, payload, (response: unknown) => {
    if (chrome.runtime.lastError) {
      console.error("LLM Usage:", chrome.runtime.lastError.message);
    } else {
      console.log("LLM Usage:", response);
    }
  });
}
