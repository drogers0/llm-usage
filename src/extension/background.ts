/// <reference types="chrome" />

import { UsageError } from "../shared/errors.js";
import { buildFetchStatus } from "../shared/fetch-status.js";
import type { FetchUsageMessage } from "../shared/fetch-status.js";
import type { ProviderId } from "../shared/types.js";
import { extensionProviders } from "./providers/registry.js";

const HOST_NAME = "com.llm_usage.cache_host";

// Keep a startup/install event registered so Chrome wakes this MV3 worker early.
chrome.runtime.onStartup.addListener(() => {});
chrome.runtime.onInstalled.addListener(() => {});

chrome.runtime.onMessage.addListener((msg: unknown, sender: chrome.runtime.MessageSender, sendResponse: (response?: unknown) => void) => {
  const message = msg as FetchUsageMessage;
  if (message.action !== "fetch_usage") return;
  const windowId = sender.tab?.windowId;
  const keepWindow = Boolean(sender.tab?.url && sender.tab.url.includes("keep=1"));
  const services: string[] = Array.isArray(message.services) ? message.services : ["claude", "codex", "copilot"];
  const requestId = message.request_id;
  const deadlineMs = message.deadline_ms;

  handleFetchRequest(services, windowId, keepWindow, requestId, deadlineMs)
    .then((result) => sendResponse(result))
    .catch((e) => sendResponse({ error: (e as Error).message }));

  return true;
});

async function handleFetchRequest(
  services: string[],
  windowId: number | undefined,
  keepWindow = false,
  requestId?: string,
  deadlineMs?: number,
) {
  const startedAt = new Date().toISOString();
  const errors: Record<string, string> = {};
  const results: Record<string, unknown> = {};

  for (const service of services) {
    // Check remaining time budget before each provider
    if (deadlineMs) {
      const remaining = deadlineMs - Date.now();
      if (remaining <= 0) {
        errors[service] = "deadline exceeded";
        continue;
      }
    }

    const providerId = service as ProviderId;
    const provider = extensionProviders[providerId];
    if (!provider) {
      errors[service] = `unknown provider: ${service}`;
      continue;
    }

    try {
      results[service] = (await provider.fetch({ windowId, createHiddenTab, sendToHost, deadlineMs })).data;
    } catch (err) {
      if (err instanceof UsageError) {
        errors[service] = `${err.code}: ${err.message}`;
      } else {
        errors[service] = (err as Error).message;
      }
    }
  }

  const status = buildFetchStatus(services, errors, startedAt, new Date().toISOString(), requestId);

  void sendToHost({ type: "status", cache: { fetch_status: status } }).catch(() => undefined);

  if (windowId && !keepWindow) {
    chrome.windows.remove(windowId).catch(() => undefined);
  }

  return { results, status };
}

async function createHiddenTab(url: string, windowId: number | undefined, timeoutMs = 30000): Promise<chrome.tabs.Tab> {
  const tab = await chrome.tabs.create({ url, windowId, active: false });
  // Do not remove the tab on failure — withHiddenTab owns cleanup.
  await waitForTab(tab.id as number, timeoutMs);
  return tab;
}

function waitForTab(tabId: number, timeoutMs = 30000): Promise<void> {
  return new Promise((resolve, reject) => {
    const done = () => {
      clearTimeout(timeout);
      chrome.tabs.onUpdated.removeListener(onUpdated);
      setTimeout(resolve, 1000);
    };

    const timeout = setTimeout(() => {
      chrome.tabs.onUpdated.removeListener(onUpdated);
      reject(new Error("tab load timed out"));
    }, timeoutMs);

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
