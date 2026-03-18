// Handle fetch requests from the trigger page
chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (msg.action !== "fetch_usage") return;
  // Use the sender's window — it's already hidden by AppleScript
  const windowId = sender.tab?.windowId;
  handleFetchRequest(msg.services || ["claude", "codex"], windowId, msg.port)
    .then((result) => sendResponse(result))
    .catch((e) => sendResponse({ error: e.message }));
  return true;
});

async function handleFetchRequest(services, windowId, port) {
  const results = {};

  if (services.includes("claude")) {
    results.claude = await fetchClaude(windowId, port);
  }
  if (services.includes("codex")) {
    results.codex = await fetchCodex(windowId, port);
  }

  // Close the hidden window when done
  if (windowId) {
    chrome.windows.remove(windowId).catch(() => {});
  }

  return results;
}

// Create a tab in the existing hidden window, fetch, then close the tab
async function createHiddenTab(url, windowId) {
  const tab = await chrome.tabs.create({ url, windowId, active: false });
  try {
    await waitForTab(tab.id);
    return tab;
  } catch (e) {
    chrome.tabs.remove(tab.id).catch(() => {});
    throw e;
  }
}

async function fetchClaude(windowId, port) {
  const cookies = await chrome.cookies.getAll({ domain: ".claude.ai" });
  const orgCookie = cookies.find((c) => c.name === "lastActiveOrg");
  if (!orgCookie) {
    return { error: "lastActiveOrg cookie not found — log in to claude.ai first" };
  }
  const orgId = orgCookie.value;

  const tab = await createHiddenTab("https://claude.ai/settings/usage", windowId);

  try {
    const results = await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      func: async (orgId) => {
        const resp = await fetch(`/api/organizations/${orgId}/usage`, {
          credentials: "include",
        });
        if (!resp.ok) return { error: `HTTP ${resp.status}` };
        return { data: await resp.json() };
      },
      args: [orgId],
    });

    const result = results?.[0]?.result;
    if (!result || result.error) {
      return { error: result?.error || "script returned no result" };
    }

    await sendToHost({ type: "claude", cache: { claude_usage: result.data } }, port);
    return { ok: true };
  } finally {
    chrome.tabs.remove(tab.id).catch(() => {});
  }
}

async function fetchCodex(windowId, port) {
  const tab = await createHiddenTab("https://chatgpt.com/codex/settings/usage", windowId);

  try {
    const results = await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      func: async () => {
        try {
          const tokenResp = await fetch("/api/auth/session", {
            credentials: "include",
          });
          if (tokenResp.ok) {
            const session = await tokenResp.json();
            const token = session.accessToken;
            if (token) {
              const resp = await fetch("/backend-api/wham/usage", {
                credentials: "include",
                headers: { authorization: `Bearer ${token}` },
              });
              if (resp.ok) return { data: await resp.json() };
              return { error: `usage HTTP ${resp.status}` };
            }
          }
          return { error: "could not get access token" };
        } catch (e) {
          return { error: e.message };
        }
      },
      args: [],
    });

    const result = results?.[0]?.result;
    if (!result || result.error) {
      return { error: result?.error || "script returned no result" };
    }

    await sendToHost({ type: "codex", cache: { codex_usage: result.data } }, port);
    return { ok: true };
  } finally {
    chrome.tabs.remove(tab.id).catch(() => {});
  }
}

function waitForTab(tabId) {
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => {
      chrome.webNavigation.onCompleted.removeListener(listener);
      reject(new Error("tab load timed out"));
    }, 30000);

    function listener(details) {
      if (details.tabId === tabId && details.frameId === 0) {
        clearTimeout(timeout);
        chrome.webNavigation.onCompleted.removeListener(listener);
        setTimeout(resolve, 1000);
      }
    }
    chrome.webNavigation.onCompleted.addListener(listener);
  });
}

async function sendToHost(payload, port) {
  try {
    const resp = await fetch(`http://127.0.0.1:${port}/`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    const result = await resp.json();
    console.log("LLM Usage:", payload.type, result);
  } catch (e) {
    console.error("LLM Usage: local server error:", e.message);
  }
}
