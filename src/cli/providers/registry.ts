import type { ProviderId } from "../../shared/types.js";
import { ClaudeCliProvider } from "./claude.js";
import { CodexCliProvider } from "./codex.js";
import { CopilotCliProvider } from "./copilot.js";

export const cliProviders = {
  claude: new ClaudeCliProvider(),
  codex: new CodexCliProvider(),
  copilot: new CopilotCliProvider(),
} satisfies Record<ProviderId, ClaudeCliProvider | CodexCliProvider | CopilotCliProvider>;
