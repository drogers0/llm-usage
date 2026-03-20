# LLM Usage Check

Check your Claude, Codex, and Copilot usage limits from the terminal.

```
$ usage-check
Claude usage
- 5-hour: 2.0%
- 7-day: 21.0%
- 7-day sonnet: 0.0%

Codex usage
- 5-hour: 0.0%
- 7-day: 11.0%
- Code review 7-day: 0.0%

Copilot usage
- month: 4.0%
```

## Requirements

- macOS (uses AppleScript to trigger Chrome)
- Google Chrome with an active login to `claude.ai`, `chatgpt.com`, and `github.com`
- Node.js 20+

## Setup

```bash
npm install -g https://github.com/drogers0/llm-usage/releases/download/v0.0.1/llm-usage-0.0.1.tgz
usage-check-setup
```

The setup command walks you through loading the Chrome extension and registering the native messaging host.

## Usage

```bash
usage-check                # all services, human-readable
usage-check claude         # claude only
usage-check codex          # codex only
usage-check copilot        # copilot only
usage-check --json         # all services, JSON
usage-check claude --json  # claude only, JSON
usage-check --debug        # diagnostics on stderr
```

## JSON Output

```json
{
  "checked_at": "2026-03-18T01:06:14+00:00",
  "providers": {
    "claude": {
      "limits": {
        "five_hour": {
          "used_percent": 2,
          "remaining_percent": 98,
          "resets_at": "2026-03-18T05:59:59+00:00",
          "reset_after_seconds": 17625
        },
        "seven_day": { "..." },
        "seven_day_sonnet": { "..." }
      }
    },
    "codex": {
      "limits": {
        "five_hour": { "..." },
        "seven_day": { "..." },
        "code_review_seven_day": { "..." }
      }
    },
    "copilot": {
      "limits": {
        "month": {
          "used_percent": 4,
          "remaining_percent": 96,
          "resets_at": "2026-04-01T00:00:00+00:00",
          "reset_after_seconds": 1065600
        }
      }
    }
  }
}
```

Each limit window contains `used_percent`, `remaining_percent`, `resets_at` (ISO 8601), and `reset_after_seconds`.

## How It Works

1. `usage-check` triggers the Chrome extension via AppleScript (opens a 1×1 pixel window — Chrome stays in the background).
2. The extension opens tabs to `claude.ai`, `chatgpt.com`, and `github.com` inside that hidden window.
3. It runs `fetch()` inside the page context using your existing browser sessions.
4. Results are sent to a native messaging host which writes them to `.cache/`.
5. The CLI reads the cached JSON and renders it.

## Troubleshooting

- **`Missing EXTENSION_ID in .env`** — Run `usage-check-setup <extension-id>`.
- **`Timed out waiting for extension fetch`** — Make sure Chrome is running and you're logged in to the services.
- **Extension not working after Chrome update** — Reload at `chrome://extensions` and re-run `usage-check-setup`.
- **`Missing renderer: dist/cli/render.js`** — Run `npm run build`.

## Security

- `.env` and `.cache/` are gitignored.
- Cached responses contain only usage percentages, not credentials.
- The native messaging host only writes to files inside this project directory.
