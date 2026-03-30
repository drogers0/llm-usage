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

// Keep a startup/install event registered so Chrome wakes this MV3 worker early.
chrome.runtime.onStartup.addListener(() => {});
chrome.runtime.onInstalled.addListener(() => {});

chrome.runtime.onMessage.addListener((msg: unknown, sender: chrome.runtime.MessageSender, sendResponse: (response?: unknown) => void) => {
  const message = msg as { action?: string; services?: unknown };
  if (message.action !== "fetch_usage") return;
  const windowId = sender.tab?.windowId;
  const keepWindow = Boolean(sender.tab?.url && sender.tab.url.includes("keep=1"));
  const services: string[] = Array.isArray(message.services) ? (message.services as string[]) : ["claude", "codex", "copilot"];

  handleFetchRequest(services, windowId, keepWindow)
    .then((result) => sendResponse(result))
    .catch((e) => sendResponse({ error: (e as Error).message }));

  return true;
});

async function handleFetchRequest(services: string[], windowId: number | undefined, keepWindow = false) {
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
      results[service] = (await provider.fetch({ windowId, createHiddenTab, sendToHost })).data;
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

  void sendToHost({ type: "status", cache: { fetch_status: status } }).catch(() => undefined);

  if (windowId && !keepWindow) {
    chrome.windows.remove(windowId).catch(() => undefined);
  }

  return { results, status };
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
    const done = () => {
      clearTimeout(timeout);
      chrome.tabs.onUpdated.removeListener(onUpdated);
      setTimeout(resolve, 1000);
    };

    const timeout = setTimeout(() => {
      chrome.tabs.onUpdated.removeListener(onUpdated);
      reject(new Error("tab load timed out"));
    }, 30000);

    function onUpdated(updatedTabId: number, info: chrome.tabs.TabChangeInfo) {
      if (updatedTabId === tabId && info.status === "complete") {
        done();
      }
    }

    chrome.tabs.onUpdated.addListener(onUpdated);

    // Avoid a race where the tab completes before the listener is attached.
    chrome.tabs.get(tabId)
      .then((tab) => {
        if (tab.status === "complete") {
          done();
        }
      })
      .catch(() => {
        clearTimeout(timeout);
        chrome.tabs.onUpdated.removeListener(onUpdated);
        reject(new Error("tab no longer exists"));
      });
  });
}

function sendToHost(payload: Record<string, unknown>): Promise<unknown> {
  return new Promise((resolve, reject) => {
    chrome.runtime.sendNativeMessage(HOST_NAME, payload, (response: unknown) => {
      if (chrome.runtime.lastError) {
        const message = chrome.runtime.lastError.message;
        console.error("LLM Usage:", message);
        reject(new Error(message));
        return;
      }

      console.log("LLM Usage:", response);
      resolve(response);
    });
  });
}
