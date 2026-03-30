#!/usr/bin/env bash
# Shared helpers for usage-check scripts.

SCRIPT_DIR=$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)
ROOT_DIR=$(cd -- "$SCRIPT_DIR/.." && pwd)
ENV_FILE="$ROOT_DIR/.env"
CACHE_DIR="${LLM_USAGE_CACHE_DIR:-$ROOT_DIR/.cache}"
INGEST_RESULT_JS="$ROOT_DIR/dist/cli/ingest_extension_result.js"
READ_STATUS_JS="$ROOT_DIR/dist/cli/read-fetch-status.js"

# Read fetch_status.json and output tab-separated: ok\terrors_string\trequest_id
read_fetch_status() {
  local status_file="$CACHE_DIR/fetch_status.json"
  [ -f "$status_file" ] || { printf 'null\tunknown extension error\tnull\n'; return; }
  node "$READ_STATUS_JS" --tsv "$status_file" 2>/dev/null || printf 'null\tunknown extension error\tnull\n'
}

# Load EXTENSION_ID from .env
load_env() {
  [ -f "$ENV_FILE" ] || return 0
  while IFS= read -r line || [ -n "$line" ]; do
    line="${line#"${line%%[![:space:]]*}"}"
    [[ -z "$line" || "$line" == \#* || "$line" != *=* ]] && continue
    key="${line%%=*}"
    value="${line#*=}"
    key="${key#"${key%%[![:space:]]*}"}"
    key="${key%"${key##*[![:space:]]}"}"
    value="${value#"${value%%[![:space:]]*}"}"
    value="${value%"${value##*[![:space:]]}"}"
    if [[ ${#value} -ge 2 ]]; then
      case "$value" in
        \"*\"|\'*\') value="${value:1:${#value}-2}" ;;
      esac
    fi
    if [ -z "${!key+x}" ]; then
      export "$key=$value"
    fi
  done < "$ENV_FILE"
}

# Trigger the Chrome extension to fetch usage data and write to cache
extension_fetch() {
  local services="$1" max_wait="${2:-30}"
  local request_id
  request_id=$(uuidgen | tr '[:upper:]' '[:lower:]')
  local deadline_ms
  deadline_ms=$(( $(date +%s) * 1000 + max_wait * 1000 ))
  local applescript_wait=$(( max_wait + 3 ))

  if [ -z "${EXTENSION_ID:-}" ]; then
    echo "Missing EXTENSION_ID in .env — run usage-check-setup first" >&2
    exit 1
  fi

  # Record cache mtimes before triggering
  local claude_mtime="0" codex_mtime="0" copilot_mtime="0" status_mtime="0"
  [ -f "$CACHE_DIR/claude_usage.json" ] && claude_mtime=$(stat -f %m "$CACHE_DIR/claude_usage.json")
  [ -f "$CACHE_DIR/codex_usage.json" ] && codex_mtime=$(stat -f %m "$CACHE_DIR/codex_usage.json")
  [ -f "$CACHE_DIR/copilot_usage.json" ] && copilot_mtime=$(stat -f %m "$CACHE_DIR/copilot_usage.json")
  [ -f "$CACHE_DIR/fetch_status.json" ] && status_mtime=$(stat -f %m "$CACHE_DIR/fetch_status.json")

  # Open the extension's fetch page in a hidden window and poll for direct results.
  local front_app
  front_app=$(osascript -e 'tell application "System Events" to get name of first application process whose frontmost is true' 2>/dev/null)

  local result_url=""
  result_url=$(osascript <<OSA 2>/dev/null || true
    tell application "Google Chrome"
      set w to make new window
      set bounds of w to {0, 0, 1, 1}
      set URL of active tab of w to "chrome-extension://${EXTENSION_ID}/fetch.html?s=${services}&return=1&keep=1&request_id=${request_id}&deadline_ms=${deadline_ms}"
    end tell
    tell application "${front_app}" to activate

    repeat with i from 1 to ${applescript_wait}
      delay 1
      tell application "Google Chrome"
        try
          set currentUrl to URL of active tab of w
          if currentUrl contains "#result=" then
            return currentUrl
          end if
        on error
          return "__WINDOW_CLOSED__"
        end try
      end tell
    end repeat

    return "__TIMEOUT__"
OSA
  )

  if [[ "$result_url" == *"#result="* ]]; then
    local encoded_payload="${result_url#*#result=}"
    if [ ! -f "$INGEST_RESULT_JS" ]; then
      echo "Missing helper: $INGEST_RESULT_JS" >&2
      echo "Action: run 'npm install' and 'npm run build' in $ROOT_DIR" >&2
      return 1
    fi

    if RESULT_URL="$encoded_payload" CACHE_DIR="$CACHE_DIR" node "$INGEST_RESULT_JS" --write
    then
      return 0
    else
      echo "Extension fetch failed: $(RESULT_URL="$encoded_payload" node "$INGEST_RESULT_JS" --error 2>/dev/null || echo "unknown extension error")" >&2
      return 1
    fi
  fi

  # Wait for cache files to be updated
  local elapsed=0
  local need_claude=false need_codex=false need_copilot=false
  [[ "$services" == *claude* ]] && need_claude=true
  [[ "$services" == *codex* ]] && need_codex=true
  [[ "$services" == *copilot* ]] && need_copilot=true

  while [ "$elapsed" -lt "$max_wait" ]; do
    sleep 1
    local claude_ok=true codex_ok=true copilot_ok=true

    if [ -f "$CACHE_DIR/fetch_status.json" ]; then
      local sm
      sm=$(stat -f %m "$CACHE_DIR/fetch_status.json")
      if [ "$sm" != "$status_mtime" ]; then
        status_mtime="$sm"
        local status_line
        status_line=$(read_fetch_status)
        local status_ok status_err status_rid
        IFS=$'\t' read -r status_ok status_err status_rid <<< "$status_line"
        # Skip stale status from a different request
        if [ "$status_rid" != "null" ] && [ "$status_rid" != "$request_id" ]; then
          continue
        fi
        if [ "$status_ok" = "false" ]; then
          echo "Extension fetch failed: $status_err" >&2
          echo "Action: open chrome://extensions -> LLM Usage Fetcher -> service worker, then run usage-check again to inspect errors." >&2
          return 1
        fi
      fi
    fi

    if $need_claude; then
      claude_ok=false
      if [ -f "$CACHE_DIR/claude_usage.json" ]; then
        local m; m=$(stat -f %m "$CACHE_DIR/claude_usage.json")
        [ "$m" != "$claude_mtime" ] && claude_ok=true
      fi
    fi

    if $need_codex; then
      codex_ok=false
      if [ -f "$CACHE_DIR/codex_usage.json" ]; then
        local m; m=$(stat -f %m "$CACHE_DIR/codex_usage.json")
        [ "$m" != "$codex_mtime" ] && codex_ok=true
      fi
    fi

    if $need_copilot; then
      copilot_ok=false
      if [ -f "$CACHE_DIR/copilot_usage.json" ]; then
        local m; m=$(stat -f %m "$CACHE_DIR/copilot_usage.json")
        [ "$m" != "$copilot_mtime" ] && copilot_ok=true
      fi
    fi

    $claude_ok && $codex_ok && $copilot_ok && return 0
    elapsed=$((elapsed + 1))
  done

  if [ -f "$CACHE_DIR/fetch_status.json" ]; then
    local latest_line
    latest_line=$(read_fetch_status)
    local latest_ok latest_err latest_rid
    IFS=$'\t' read -r latest_ok latest_err latest_rid <<< "$latest_line"
    if [ "$latest_ok" = "false" ]; then
      echo "Extension fetch failed: $latest_err" >&2
      return 1
    fi

    if [ "$latest_ok" = "true" ]; then
      if [[ "$services" == *copilot* ]] && [ ! -f "$CACHE_DIR/copilot_usage.json" ]; then
        echo "Timed out waiting for Copilot cache update; extension may be stale." >&2
        echo "Action: reload the unpacked extension at chrome://extensions and retry." >&2
      fi
    fi
  fi

  if [ -f "$HOME/Library/Logs/llm_usage_native_host.log" ]; then
    echo "Timed out waiting for extension fetch. Native host launch log tail:" >&2
    tail -n 3 "$HOME/Library/Logs/llm_usage_native_host.log" >&2 || true
  else
    echo "Timed out waiting for extension fetch. Native host did not report a launch." >&2
  fi
  echo "Action: verify extension is loaded, then inspect chrome://extensions -> LLM Usage Fetcher -> service worker errors." >&2
  return 1
}

# Print diagnostics helpful for triaging fetch failures.
debug_dump() {
  local host_log="$HOME/Library/Logs/llm_usage_native_host.log"

  node -e "
    const fs = require('fs');
    const read = (p) => { try { return fs.readFileSync(p, 'utf8'); } catch { return null; } };
    const stat = (p) => { try { return fs.statSync(p).mtimeMs / 1000 | 0; } catch { return null; } };
    const fetchStatus = read('$CACHE_DIR/fetch_status.json');
    const hostLog = read('$host_log');
    console.log(JSON.stringify({
      timestamp: new Date().toISOString(),
      root_dir: '$ROOT_DIR',
      cache_dir: '$CACHE_DIR',
      extension_id: '${EXTENSION_ID:-<unset>}',
      cache_mtimes: {
        claude_usage: stat('$CACHE_DIR/claude_usage.json'),
        codex_usage: stat('$CACHE_DIR/codex_usage.json'),
        copilot_usage: stat('$CACHE_DIR/copilot_usage.json'),
        fetch_status: stat('$CACHE_DIR/fetch_status.json'),
      },
      fetch_status: fetchStatus ? JSON.parse(fetchStatus) : null,
      host_log_tail: hostLog ? hostLog.split('\n').filter(Boolean).slice(-20) : [],
    }, null, 2));
  " >&2
}
