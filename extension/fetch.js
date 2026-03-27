// Trigger page — opened by the bash script in a hidden window.
// Sends a message to the service worker which reuses this window for fetches,
// then closes the entire window when done.

const HOST_NAME = "com.llm_usage.cache_host";
const params = new URLSearchParams(window.location.search);
const services = params.get("s") || "claude,codex,copilot";
const serviceList = services.split(",");

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
        console.error("LLM Usage:", chrome.runtime.lastError.message);
      }
      window.close();
    }
  );
}

chrome.runtime.sendMessage({ action: "fetch_usage", services: serviceList }, (response) => {
  if (chrome.runtime.lastError) {
    sendFailureStatus(`runtime.sendMessage failed: ${chrome.runtime.lastError.message}`);
    return;
  }
  if (response && response.error) {
    sendFailureStatus(`fetch_usage failed: ${response.error}`);
  }
});
