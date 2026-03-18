// Trigger page — opened by the bash script in a hidden window.
// Sends a message to the service worker which reuses this window for fetches,
// then closes the entire window when done.

const params = new URLSearchParams(window.location.search);
const services = params.get("s") || "claude,codex";
const port = params.get("port") || "";

chrome.runtime.sendMessage({ action: "fetch_usage", services: services.split(","), port });
