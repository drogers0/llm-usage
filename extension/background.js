// src/shared/errors.ts
var UsageError = class extends Error {
  constructor(message, code) {
    super(message);
    this.code = code;
    this.name = this.constructor.name;
  }
};
var ParseError = class extends UsageError {
  constructor(message) {
    super(message, "parse_error");
  }
};
var AuthError = class extends UsageError {
  constructor(message) {
    super(message, "auth_error");
  }
};
var TransportError = class extends UsageError {
  constructor(message) {
    super(message, "transport_error");
  }
};

// src/extension/providers/base.ts
var BaseExtensionProvider = class {
  throwAuth(msg) {
    throw new AuthError(msg);
  }
  throwParse(msg) {
    throw new ParseError(msg);
  }
  throwTransport(msg) {
    throw new TransportError(msg);
  }
};

// src/extension/providers/claude.ts
var ClaudeExtensionProvider = class extends BaseExtensionProvider {
  id = "claude";
  async fetch(ctx) {
    const cookies = await chrome.cookies.getAll({ domain: ".claude.ai" });
    const orgCookie = cookies.find((c) => c.name === "lastActiveOrg");
    if (!orgCookie) this.throwAuth("lastActiveOrg cookie not found \u2014 log in to claude.ai first");
    const tab = await ctx.createHiddenTab("https://claude.ai/settings/usage", ctx.windowId);
    try {
      const results = await chrome.scripting.executeScript({
        target: { tabId: tab.id },
        func: async (orgId) => {
          const resp = await fetch(`/api/organizations/${orgId}/usage`, {
            credentials: "include"
          });
          if (!resp.ok) return { error: `HTTP ${resp.status}` };
          return { data: await resp.json() };
        },
        args: [orgCookie.value]
      });
      const result = results?.[0]?.result;
      if (!result || result.error) this.throwTransport(result?.error || "script returned no result");
      ctx.sendToHost({ type: "claude", cache: { claude_usage: result.data } });
      return { ok: true };
    } finally {
      chrome.tabs.remove(tab.id).catch(() => void 0);
    }
  }
};

// src/extension/providers/codex.ts
var CodexExtensionProvider = class extends BaseExtensionProvider {
  id = "codex";
  async fetch(ctx) {
    const tab = await ctx.createHiddenTab("https://chatgpt.com/codex/settings/usage", ctx.windowId);
    try {
      const results = await chrome.scripting.executeScript({
        target: { tabId: tab.id },
        func: async () => {
          try {
            const tokenResp = await fetch("/api/auth/session", { credentials: "include" });
            if (!tokenResp.ok) return { error: `session HTTP ${tokenResp.status}` };
            const session = await tokenResp.json();
            if (!session.accessToken) return { error: "could not get access token" };
            const usageResp = await fetch("/backend-api/wham/usage", {
              credentials: "include",
              headers: { authorization: `Bearer ${session.accessToken}` }
            });
            if (!usageResp.ok) return { error: `usage HTTP ${usageResp.status}` };
            return { data: await usageResp.json() };
          } catch (e) {
            return { error: e.message };
          }
        }
      });
      const result = results?.[0]?.result;
      if (!result || result.error) this.throwTransport(result?.error || "script returned no result");
      ctx.sendToHost({ type: "codex", cache: { codex_usage: result.data } });
      return { ok: true };
    } finally {
      chrome.tabs.remove(tab.id).catch(() => void 0);
    }
  }
};

// src/extension/providers/copilot.ts
var CopilotExtensionProvider = class extends BaseExtensionProvider {
  id = "copilot";
  async fetch(ctx) {
    const tab = await ctx.createHiddenTab("https://github.com/settings/copilot/features", ctx.windowId);
    try {
      const results = await chrome.scripting.executeScript({
        target: { tabId: tab.id },
        func: async () => {
          const root = document.body;
          if (!root) return { error: "missing document body" };
          const text = root.innerText;
          const percentEl = Array.from(document.querySelectorAll("*")).find((el) => /%/.test(el.textContent || "") && /used|usage|premium/i.test(el.textContent || ""));
          let usedPercent = null;
          let remainingPercent = null;
          if (percentEl?.textContent) {
            const m = percentEl.textContent.match(/([0-9]+(?:\.[0-9]+)?)\s*%/);
            if (m) {
              usedPercent = Number(m[1]);
              if (Number.isFinite(usedPercent)) {
                remainingPercent = Number((100 - usedPercent).toFixed(1));
              }
            }
          }
          if (usedPercent == null) {
            const slash = text.match(/([0-9][0-9,]*)\s*\/\s*([0-9][0-9,]*)/);
            if (slash) {
              const used = Number(slash[1].replace(/,/g, ""));
              const total = Number(slash[2].replace(/,/g, ""));
              if (Number.isFinite(used) && Number.isFinite(total) && total > 0) {
                usedPercent = Number((used / total * 100).toFixed(1));
                remainingPercent = Number((100 - usedPercent).toFixed(1));
              }
            }
          }
          if (usedPercent == null || remainingPercent == null) {
            return { error: "could not parse Copilot usage from DOM" };
          }
          return { data: { used_percent: usedPercent, remaining_percent: remainingPercent } };
        }
      });
      const result = results?.[0]?.result;
      if (!result || result.error) this.throwParse(result?.error || "script returned no result");
      ctx.sendToHost({ type: "copilot", cache: { copilot_usage: result.data } });
      return { ok: true };
    } finally {
      chrome.tabs.remove(tab.id).catch(() => void 0);
    }
  }
};

// src/extension/providers/registry.ts
var extensionProviders = {
  claude: new ClaudeExtensionProvider(),
  codex: new CodexExtensionProvider(),
  copilot: new CopilotExtensionProvider()
};

// src/extension/background.ts
var HOST_NAME = "com.llm_usage.cache_host";
chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  const message = msg;
  if (message.action !== "fetch_usage") return;
  const windowId = sender.tab?.windowId;
  const services = Array.isArray(message.services) ? message.services : ["claude", "codex", "copilot"];
  handleFetchRequest(services, windowId).then((result) => sendResponse(result)).catch((e) => sendResponse({ error: e.message }));
  return true;
});
async function handleFetchRequest(services, windowId) {
  const startedAt = (/* @__PURE__ */ new Date()).toISOString();
  const errors = {};
  const results = {};
  for (const service of services) {
    const providerId = service;
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
        errors[service] = err.message;
      }
    }
  }
  const status = {
    ok: Object.keys(errors).length === 0,
    at: (/* @__PURE__ */ new Date()).toISOString(),
    started_at: startedAt,
    services,
    ...Object.keys(errors).length > 0 ? { errors } : {}
  };
  sendToHost({ type: "status", cache: { fetch_status: status } });
  if (windowId) {
    chrome.windows.remove(windowId).catch(() => void 0);
  }
  return results;
}
async function createHiddenTab(url, windowId) {
  const tab = await chrome.tabs.create({ url, windowId, active: false });
  try {
    await waitForTab(tab.id);
    return tab;
  } catch (e) {
    chrome.tabs.remove(tab.id).catch(() => void 0);
    throw e;
  }
}
function waitForTab(tabId) {
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => {
      chrome.webNavigation.onCompleted.removeListener(listener);
      reject(new Error("tab load timed out"));
    }, 3e4);
    function listener(details) {
      if (details.tabId === tabId && details.frameId === 0) {
        clearTimeout(timeout);
        chrome.webNavigation.onCompleted.removeListener(listener);
        setTimeout(resolve, 1e3);
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
      console.log("LLM Usage:", response);
    }
  });
}
