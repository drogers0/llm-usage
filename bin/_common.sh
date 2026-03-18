#!/usr/bin/env bash
# Shared helpers for usage-check scripts.

SCRIPT_DIR=$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)
ROOT_DIR=$(cd -- "$SCRIPT_DIR/.." && pwd)
ENV_FILE="$ROOT_DIR/.env"
CACHE_DIR="$ROOT_DIR/.cache"

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

# Convert unix timestamp to ISO 8601 UTC
iso_from_unix() {
  [ "$1" = "null" ] || [ -z "$1" ] && return
  date -u -r "$1" +"%Y-%m-%dT%H:%M:%S+00:00" 2>/dev/null
}

# Seconds until an ISO 8601 timestamp
seconds_until_iso() {
  [ -z "$1" ] || [ "$1" = "null" ] && return
  local reset_epoch now_epoch delta
  reset_epoch=$(date -juf "%Y-%m-%dT%H:%M:%S" "${1%%.*}" +%s 2>/dev/null) \
    || reset_epoch=$(date -juf "%Y-%m-%dT%H:%M:%S%z" "${1%+*}${1##*+}" +%s 2>/dev/null) \
    || return
  now_epoch=$(date +%s)
  delta=$(( reset_epoch - now_epoch ))
  [ "$delta" -lt 0 ] && delta=0
  echo "$delta"
}

# Build a normalized JSON window from Claude API fields
claude_window_json() {
  local payload="$1" key="$2"

  local window
  window=$(echo "$payload" | jq -r ".$key // empty")
  [ -z "$window" ] && { echo "null"; return; }

  local resets_at reset_secs
  resets_at=$(echo "$window" | jq -r '.resets_at // empty')
  reset_secs=$(seconds_until_iso "$resets_at")

  echo "$window" | jq \
    --argjson reset_secs "${reset_secs:-null}" \
    '{used_percent: .utilization, remaining_percent: (100 - .utilization), resets_at: .resets_at, reset_after_seconds: $reset_secs}'
}

# Build a normalized JSON window from Codex API fields
codex_window_json() {
  local window="$1"
  [ -z "$window" ] || [ "$window" = "null" ] && { echo "null"; return; }

  local reset_at reset_at_iso
  reset_at=$(echo "$window" | jq -r '.reset_at // empty')
  reset_at_iso=$(iso_from_unix "$reset_at")

  echo "$window" | jq \
    --arg resets_at "${reset_at_iso:-null}" \
    'if $resets_at == "null" then {used_percent: .used_percent, remaining_percent: (100 - .used_percent), resets_at: null, reset_after_seconds: .reset_after_seconds}
     else {used_percent: .used_percent, remaining_percent: (100 - .used_percent), resets_at: $resets_at, reset_after_seconds: .reset_after_seconds} end'
}

# Trigger the Chrome extension to fetch usage data and write to cache
extension_fetch() {
  local services="$1" max_wait="${2:-30}"

  if [ -z "${EXTENSION_ID:-}" ]; then
    echo "Missing EXTENSION_ID in .env — run install.sh first" >&2
    exit 1
  fi

  # Record cache mtimes before triggering
  local claude_mtime="0" codex_mtime="0"
  [ -f "$CACHE_DIR/claude_usage.json" ] && claude_mtime=$(stat -f %m "$CACHE_DIR/claude_usage.json")
  [ -f "$CACHE_DIR/codex_usage.json" ] && codex_mtime=$(stat -f %m "$CACHE_DIR/codex_usage.json")

  # Start a local cache server and get its port
  local server_pid server_port port_file
  port_file=$(mktemp)
  python3 "$ROOT_DIR/native-host/cache_server.py" > "$port_file" &
  server_pid=$!
  local pw=0
  while [ "$pw" -lt 10 ]; do
    sleep 0.2
    server_port=$(head -1 "$port_file" 2>/dev/null)
    [ -n "$server_port" ] && break
    pw=$((pw + 1))
  done
  rm -f "$port_file"

  if [ -z "$server_port" ]; then
    echo "Failed to start cache server" >&2
    kill $server_pid 2>/dev/null
    return 1
  fi

  # Open the extension's fetch page in a hidden window
  local front_app
  front_app=$(osascript -e 'tell application "System Events" to get name of first application process whose frontmost is true' 2>/dev/null)

  osascript -e "
    tell application \"Google Chrome\"
      set w to make new window
      set bounds of w to {0, 0, 1, 1}
      set URL of active tab of w to \"chrome-extension://${EXTENSION_ID}/fetch.html?s=${services}&port=${server_port}\"
    end tell
    tell application \"${front_app}\" to activate
  " 2>/dev/null

  # Wait for cache files to be updated
  local elapsed=0
  local need_claude=false need_codex=false
  [[ "$services" == *claude* ]] && need_claude=true
  [[ "$services" == *codex* ]] && need_codex=true

  while [ "$elapsed" -lt "$max_wait" ]; do
    sleep 1
    local claude_ok=true codex_ok=true

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

    $claude_ok && $codex_ok && { kill $server_pid 2>/dev/null; return 0; }
    elapsed=$((elapsed + 1))
  done
  kill $server_pid 2>/dev/null
  echo "Timed out waiting for extension fetch." >&2
  return 1
}
