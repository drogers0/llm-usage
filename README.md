# LLM Usage Check

Check your Claude and Codex API usage limits from the terminal. A Chrome extension fetches data from your authenticated browser sessions in the background.

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
```

## Requirements

- macOS (uses AppleScript to trigger Chrome)
- Google Chrome with an active login to `claude.ai` and `chatgpt.com`
- [`jq`](https://jqlang.github.io/jq/download/) — `brew install jq`

## Setup

1. Open `chrome://extensions` in Chrome.
2. Enable **Developer mode** (toggle in the top right).
3. Click **Load unpacked** and select the `extension/` directory in this project.
4. Copy the **extension ID** shown under the extension name.
5. Run the install script (it will offer to add `bin/` to your `PATH`):

```bash
./install.sh <extension-id>
```

## Usage

```bash
usage-check                # both services, human-readable
usage-check claude         # claude only
usage-check codex          # codex only
usage-check --json         # both services, JSON
usage-check claude --json  # claude only, JSON
```

## How It Works

1. The script triggers the Chrome extension via AppleScript (opens a 1×1 pixel window — Chrome stays in the background).
2. The extension opens tabs to `claude.ai` and `chatgpt.com` inside that hidden window.
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
install.sh          — registers the native messaging host and saves the extension ID
```

## JSON Output Shape

```bash
usage-check --json
```

```json
{
  "checked_at": "2026-03-18T01:06:14+00:00",
  "claude": {
    "five_hour": {
      "used_percent": 2,
      "remaining_percent": 98,
      "resets_at": "2026-03-18T05:59:59.681193+00:00",
      "reset_after_seconds": 17625
    },
    "seven_day": { "..." },
    "seven_day_sonnet": { "..." }
  },
  "codex": {
    "five_hour": { "..." },
    "seven_day": { "..." },
    "code_review_seven_day": { "..." }
  }
}
```

Each window contains `used_percent`, `remaining_percent`, `resets_at` (ISO 8601), and `reset_after_seconds`.

## Troubleshooting

- **`Missing EXTENSION_ID in .env`** — Run `./install.sh <extension-id>` first.
- **`Timed out waiting for extension fetch`** — Make sure Chrome is running and you're logged in to both services.
- **Extension not working after Chrome update** — Reload at `chrome://extensions` and re-run `./install.sh`.

## Security

- `.env` and `.cache/` are gitignored.
- Cached responses contain only usage percentages, not credentials.
- The native messaging host only writes to files inside this project directory.
