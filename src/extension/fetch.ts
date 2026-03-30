/// <reference types="chrome" />

import { buildFetchEnvelope, encodeEnvelopeForFragment, MAX_FRAGMENT_BYTES } from "../shared/fetch-status.js";
import type { FetchUsageMessage, FetchUsageResponse } from "../shared/fetch-status.js";

const HOST_NAME = "com.llm_usage.cache_host";
const params = new URLSearchParams(window.location.search);
const services = params.get("s") || "claude,codex,copilot";
const serviceList = services.split(",");
const keepWindow = params.get("keep") === "1";
const returnResults = params.get("return") === "1";
const requestId = params.get("request_id") || undefined;
const deadlineParam = params.get("deadline_ms");
const deadlineMs = deadlineParam ? Number(deadlineParam) : undefined;

let finished = false;

document.title = "LLM Usage Fetch: init";

function publishEncodedResult(encoded: string): void {
  history.replaceState(null, "", `${location.pathname}${location.search}#result=${encoded}`);
}

function finishWithFailure(message: string): void {
  if (finished) return;
  finished = true;
  const compact = String(message).replace(/\s+/g, " ").slice(0, 80);
  document.title = `LLM Usage Fetch: failed ${compact}`;
  if (returnResults) {
    const failEnvelope = { ok: false as const, error: String(message), services: serviceList, request_id: requestId };
    try {
      publishEncodedResult(encodeEnvelopeForFragment(failEnvelope));
    } catch {
      // If even the failure payload is too large, publish a minimal one
      publishEncodedResult(encodeURIComponent(JSON.stringify({ ok: false, error: "payload too large" })));
    }
    if (!keepWindow) {
      setTimeout(() => window.close(), 1500);
    }
    return;
  }
  sendFailureStatus(message);
}

function sendFailureStatus(message: string): void {
  const now = new Date().toISOString();
  chrome.runtime.sendNativeMessage(
    HOST_NAME,
    {
      type: "status",
      cache: {
        fetch_status: {
          ok: false,
          at: now,
          started_at: now,
          services: serviceList,
          ...(requestId ? { request_id: requestId } : {}),
          errors: { extension: message },
        },
      },
    },
    () => {
      if (chrome.runtime.lastError) {
        const msg = chrome.runtime.lastError.message;
        document.title = `LLM Usage Fetch: native ${msg?.slice(0, 80)}`;
        console.error("LLM Usage:", msg);
      }
      if (!keepWindow) {
        window.close();
      }
    },
  );
}

// Compute the message timeout from the deadline if available, otherwise default to 10s.
const remainingBudget = deadlineMs ? Math.max(1000, deadlineMs - Date.now()) : 10000;

const messageTimeout = setTimeout(() => {
  document.title = "LLM Usage Fetch: timeout";
  finishWithFailure("runtime.sendMessage timed out waiting for service worker response");
}, remainingBudget);

window.addEventListener("error", (event) => {
  const msg = event?.error?.message || event?.message || "unknown window error";
  finishWithFailure(`fetch page error: ${msg}`);
});

window.addEventListener("unhandledrejection", (event) => {
  const reason = event?.reason;
  const msg = reason?.message || String(reason || "unknown rejection");
  finishWithFailure(`fetch page rejection: ${msg}`);
});

document.title = "LLM Usage Fetch: send";

const message: FetchUsageMessage = {
  action: "fetch_usage",
  services: serviceList,
  ...(requestId ? { request_id: requestId } : {}),
  ...(deadlineMs ? { deadline_ms: deadlineMs } : {}),
};

chrome.runtime.sendMessage(message, (response: FetchUsageResponse | undefined) => {
  clearTimeout(messageTimeout);
  if (finished) return;
  finished = true;
  document.title = "LLM Usage Fetch: callback";
  if (chrome.runtime.lastError) {
    finishWithFailure(`runtime.sendMessage failed: ${chrome.runtime.lastError.message}`);
    return;
  }
  if (response && response.error) {
    finishWithFailure(`fetch_usage failed: ${response.error}`);
    return;
  }

  if (returnResults) {
    const envelope = buildFetchEnvelope(response, requestId, serviceList);
    try {
      publishEncodedResult(encodeEnvelopeForFragment(envelope));
    } catch {
      // Payload too large for fragment — publish a minimal redirect to native host path
      const minimal = { ok: envelope.ok, request_id: requestId, error: "payload too large, data written via native host" };
      publishEncodedResult(encodeURIComponent(JSON.stringify(minimal)));
    }
  }

  document.title = "LLM Usage Fetch: ok";

  if (returnResults && !keepWindow) {
    setTimeout(() => window.close(), 1500);
  }
});
