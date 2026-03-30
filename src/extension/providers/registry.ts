import type { ProviderId } from "../../shared/types.js";
import type { BaseExtensionProvider } from "./base.js";
import { ClaudeExtensionProvider } from "./claude.js";
import { CodexExtensionProvider } from "./codex.js";
import { CopilotExtensionProvider } from "./copilot.js";

export const extensionProviders = {
  claude: new ClaudeExtensionProvider(),
  codex: new CodexExtensionProvider(),
  copilot: new CopilotExtensionProvider(),
} as const satisfies Record<ProviderId, BaseExtensionProvider>;
