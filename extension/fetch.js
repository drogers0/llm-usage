"use strict";
(() => {
  // src/shared/fetch-status.ts
  var MAX_FRAGMENT_BYTES = 2e3;
  function buildFetchEnvelope(response, requestId2, services2) {
    const ok = response?.status?.ok ?? false;
    return {
      ok,
      ...response ? { results: response.results, status: response.status } : {},
      ...services2 ? { services: services2 } : {},
      ...requestId2 ? { request_id: requestId2 } : {}
    };
  }
  function encodeEnvelopeForFragment(envelope) {
    const encoded = encodeURIComponent(JSON.stringify(envelope));
    if (encoded.length > MAX_FRAGMENT_BYTES) {
      throw new Error(`encoded payload ${encoded.length} bytes exceeds ${MAX_FRAGMENT_BYTES} byte limit`);
    }
    return encoded;
  }

  // src/extension/fetch.ts
  var HOST_NAME = "com.llm_usage.cache_host";
  var params = new URLSearchParams(window.location.search);
  var services = params.get("s") || "claude,codex,copilot";
  var serviceList = services.split(",");
  var keepWindow = params.get("keep") === "1";
  var returnResults = params.get("return") === "1";
  var requestId = params.get("request_id") || void 0;
  var deadlineParam = params.get("deadline_ms");
  var deadlineMs = deadlineParam ? Number(deadlineParam) : void 0;
  var finished = false;
  document.title = "LLM Usage Fetch: init";
  function publishEncodedResult(encoded) {
    history.replaceState(null, "", `${location.pathname}${location.search}#result=${encoded}`);
  }
  function finishWithFailure(message2) {
    if (finished) return;
    finished = true;
    const compact = String(message2).replace(/\s+/g, " ").slice(0, 80);
    document.title = `LLM Usage Fetch: failed ${compact}`;
    if (returnResults) {
      const failEnvelope = { ok: false, error: String(message2), services: serviceList, request_id: requestId };
      try {
        publishEncodedResult(encodeEnvelopeForFragment(failEnvelope));
      } catch {
        publishEncodedResult(encodeURIComponent(JSON.stringify({ ok: false, error: "payload too large" })));
      }
      if (!keepWindow) {
        setTimeout(() => window.close(), 1500);
      }
      return;
    }
    sendFailureStatus(message2);
  }
  function sendFailureStatus(message2) {
    const now = (/* @__PURE__ */ new Date()).toISOString();
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
            ...requestId ? { request_id: requestId } : {},
            errors: { extension: message2 }
          }
        }
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
      }
    );
  }
  var remainingBudget = deadlineMs ? Math.max(1e3, deadlineMs - Date.now()) : 1e4;
  var messageTimeout = setTimeout(() => {
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
  var message = {
    action: "fetch_usage",
    services: serviceList,
    ...requestId ? { request_id: requestId } : {},
    ...deadlineMs ? { deadline_ms: deadlineMs } : {}
  };
  chrome.runtime.sendMessage(message, (response) => {
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
        const minimal = { ok: envelope.ok, request_id: requestId, error: "payload too large, data written via native host" };
        publishEncodedResult(encodeURIComponent(JSON.stringify(minimal)));
      }
    }
    document.title = "LLM Usage Fetch: ok";
    if (returnResults && !keepWindow) {
      setTimeout(() => window.close(), 1500);
    }
  });
})();
