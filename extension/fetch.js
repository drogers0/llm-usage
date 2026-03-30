// Trigger page — opened by the bash script in a hidden window.
// Sends a message to the service worker which reuses this window for fetches,
// then closes the entire window when done.

const HOST_NAME = "com.llm_usage.cache_host";
const params = new URLSearchParams(window.location.search);
const services = params.get("s") || "claude,codex,copilot";
const serviceList = services.split(",");
const keepWindow = params.get("keep") === "1";
const returnResults = params.get("return") === "1";
let finished = false;

document.title = "LLM Usage Fetch: init";

function publishResult(payload) {
  const encoded = encodeURIComponent(JSON.stringify(payload));
  history.replaceState(null, "", `${location.pathname}${location.search}#result=${encoded}`);
}

function finishWithFailure(message) {
  if (finished) return;
  finished = true;
  const compact = String(message).replace(/\s+/g, " ").slice(0, 80);
  document.title = `LLM Usage Fetch: failed ${compact}`;
  if (returnResults) {
    publishResult({ ok: false, error: String(message), services: serviceList });
    if (!keepWindow) {
      setTimeout(() => window.close(), 1500);
    }
    return;
  }
  sendFailureStatus(message);
}

function sendFailureStatus(message) {
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
          errors: { extension: message },
        },
      },
    },
    () => {
      if (chrome.runtime.lastError) {
        const msg = chrome.runtime.lastError.message;
        document.title = `LLM Usage Fetch: native ${msg.slice(0, 80)}`;
        console.error("LLM Usage:", msg);
      }
      if (!keepWindow) {
        window.close();
      }
    }
  );
}

// If sendMessage never returns (worker not waking/responding), emit a concrete status.
const messageTimeout = setTimeout(() => {
  document.title = "LLM Usage Fetch: timeout";
  finishWithFailure("runtime.sendMessage timed out waiting for service worker response");
}, 10000);

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
chrome.runtime.sendMessage({ action: "fetch_usage", services: serviceList }, (response) => {
  clearTimeout(messageTimeout);
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
    publishResult({ ok: true, ...(response || {}) });
  }

  document.title = "LLM Usage Fetch: ok";

  if (returnResults && !keepWindow) {
    setTimeout(() => window.close(), 1500);
  }
});
