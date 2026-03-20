# LLM Usage Check

Check your Claude, Codex, and Copilot usage limits from the terminal. A Chrome extension fetches data from your authenticated browser sessions in the background, and a TypeScript renderer composes a unified output model.

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
- [`jq`](https://jqlang.github.io/jq/download/) — `brew install jq`
- Node.js 20+

## Setup

1. Open `chrome://extensions` in Chrome.
2. Enable **Developer mode** (toggle in the top right).
3. Click **Load unpacked** and select the `extension/` directory in this project.
4. Copy the **extension ID** shown under the extension name.
5. Install dependencies and build generated runtime files:

```bash
npm install
npm run build
```

6. Run the install script (it will offer to add `bin/` to your `PATH`):

```bash
./install.sh <extension-id>
```

## Usage

```bash
usage-check                # both services, human-readable
usage-check claude         # claude only
usage-check codex          # codex only
usage-check copilot        # copilot only
usage-check --json         # all services, JSON
usage-check claude --json  # claude only, JSON
usage-check --debug        # structured diagnostics JSON on stderr
```

## How It Works

1. The script triggers the Chrome extension via AppleScript (opens a 1×1 pixel window — Chrome stays in the background).
2. The extension opens tabs to `claude.ai`, `chatgpt.com`, and `github.com` inside that hidden window.
3. It runs `fetch()` inside the page context using your existing browser sessions.
4. Results are sent to a native messaging host which writes them to `.cache/`.
5. The script reads the cached JSON and outputs it.

## Files

```
bin/
  usage-check       — main script (human-readable or --json output)
  _common.sh        — shared helpers (sourced, not run directly)
extension/
  background.js     — service worker that fetches usage APIs from page context
  fetch.html/.js    — trigger page opened by the bash script
  manifest.json     — Chrome extension manifest (Manifest V3)
native-host/
  usage_cache_host.py — native messaging host, writes API responses to .cache/
src/
  cli/               — TypeScript CLI renderer and provider model
  extension/         — TypeScript extension worker and provider fetchers
  shared/            — shared types, time helpers, and typed errors
dist/
  cli/render.js      — generated CLI renderer used by bin/usage-check
install.sh          — registers the native messaging host and saves the extension ID
```

## JSON Output Shape

```bash
usage-check --json
```

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

## Troubleshooting

- **`Missing EXTENSION_ID in .env`** — Run `./install.sh <extension-id>` first.
- **`Timed out waiting for extension fetch`** — Make sure Chrome is running and you're logged in to both services.
- **Extension not working after Chrome update** — Reload at `chrome://extensions` and re-run `./install.sh`.
- **`Missing renderer: dist/cli/render.js`** — Run `npm install && npm run build`.

## Security

- `.env` and `.cache/` are gitignored.
- Cached responses contain only usage percentages, not credentials.
- The native messaging host only writes to files inside this project directory.
