const HOST_NAME = "com.llm_usage.cache_host";

function sendStatus(status) {
  sendToHost({ type: "status", cache: { fetch_status: status } });
}

// Handle fetch requests from the trigger page
chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (msg.action !== "fetch_usage") return;
  // Use the sender's window — it's already hidden by AppleScript
  const windowId = sender.tab?.windowId;
  handleFetchRequest(msg.services || ["claude", "codex", "copilot"], windowId)
    .then((result) => sendResponse(result))
    .catch((e) => sendResponse({ error: e.message }));
  return true;
});

async function handleFetchRequest(services, windowId) {
  const startedAt = new Date().toISOString();
  const results = {};
  const errors = {};

  if (services.includes("claude")) {
    results.claude = await fetchClaude(windowId);
    if (results.claude?.error) {
      errors.claude = results.claude.error;
    }
  }
  if (services.includes("codex")) {
    results.codex = await fetchCodex(windowId);
    if (results.codex?.error) {
      errors.codex = results.codex.error;
    }
  }
  if (services.includes("copilot")) {
    results.copilot = await fetchCopilot(windowId);
    if (results.copilot?.error) {
      errors.copilot = results.copilot.error;
    }
  }

  const failedServices = Object.keys(errors);
  if (failedServices.length > 0) {
    sendStatus({
      ok: false,
      at: new Date().toISOString(),
      started_at: startedAt,
      services,
      errors,
    });
  } else {
    sendStatus({
      ok: true,
      at: new Date().toISOString(),
      started_at: startedAt,
      services,
    });
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

async function fetchClaude(windowId) {
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

    sendToHost({ type: "claude", cache: { claude_usage: result.data } });
    return { ok: true };
  } finally {
    chrome.tabs.remove(tab.id).catch(() => {});
  }
}

async function fetchCodex(windowId) {
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

    sendToHost({ type: "codex", cache: { codex_usage: result.data } });
    return { ok: true };
  } finally {
    chrome.tabs.remove(tab.id).catch(() => {});
  }
}

async function fetchCopilot(windowId) {
  const tab = await createHiddenTab("https://github.com/settings/copilot/features", windowId);

  try {
    const results = await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      func: async () => {
        try {
          const text = document.body?.innerText || "";
          const lines = text.split("\n").map((l) => l.trim()).filter(Boolean);

          const contextLines = lines
            .filter((l) => /copilot|premium|request|usage|remaining|reset|renew/i.test(l))
            .slice(0, 20);

          const parseIntSafe = (s) => {
            if (!s) return null;
            const n = Number(String(s).replace(/,/g, ""));
            return Number.isFinite(n) ? n : null;
          };

          let used = null;
          let total = null;
          let usedPercent = null;
          let remainingPercent = null;

          const usedTotalMatch = text.match(/([0-9][0-9,]*)\s*\/\s*([0-9][0-9,]*)/);
          if (usedTotalMatch) {
            used = parseIntSafe(usedTotalMatch[1]);
            total = parseIntSafe(usedTotalMatch[2]);
            if (total && total > 0) {
              usedPercent = Number(((used / total) * 100).toFixed(1));
              remainingPercent = Number((100 - usedPercent).toFixed(1));
            }
          }

          if (usedPercent == null) {
            const percentMatch = text.match(/([0-9]+(?:\.[0-9]+)?)\s*%\s*(?:used|of\s+limit)?/i);
            if (percentMatch) {
              usedPercent = Number(percentMatch[1]);
              if (Number.isFinite(usedPercent)) {
                remainingPercent = Number((100 - usedPercent).toFixed(1));
              }
            }
          }

          const resetMatch = text.match(/(?:resets?|renews?)\s+(?:on\s+)?([A-Za-z]{3,9}\s+\d{1,2},\s+\d{4})/i);
          const resetText = resetMatch ? resetMatch[1] : null;

          if (usedPercent == null && used == null && total == null) {
            return {
              error: "could not parse Copilot usage from GitHub page",
              parse_context: contextLines,
            };
          }

          return {
            data: {
              source: "github/settings/copilot/features",
              fetched_at: new Date().toISOString(),
              used,
              total,
              used_percent: usedPercent,
              remaining_percent: remainingPercent,
              reset_text: resetText,
              parse_context: contextLines,
            },
          };
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

    sendToHost({ type: "copilot", cache: { copilot_usage: result.data } });
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

function sendToHost(payload) {
  chrome.runtime.sendNativeMessage(HOST_NAME, payload, (response) => {
    if (chrome.runtime.lastError) {
      console.error("LLM Usage:", chrome.runtime.lastError.message);
    } else {
      console.log("LLM Usage:", payload.type, response);
    }
  });
}
