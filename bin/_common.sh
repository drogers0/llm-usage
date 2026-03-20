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

# Trigger the Chrome extension to fetch usage data and write to cache
extension_fetch() {
  local services="$1" max_wait="${2:-30}"

  if [ -z "${EXTENSION_ID:-}" ]; then
    echo "Missing EXTENSION_ID in .env — run install.sh first" >&2
    exit 1
  fi

  # Record cache mtimes before triggering
  local claude_mtime="0" codex_mtime="0" copilot_mtime="0" status_mtime="0"
  [ -f "$CACHE_DIR/claude_usage.json" ] && claude_mtime=$(stat -f %m "$CACHE_DIR/claude_usage.json")
  [ -f "$CACHE_DIR/codex_usage.json" ] && codex_mtime=$(stat -f %m "$CACHE_DIR/codex_usage.json")
  [ -f "$CACHE_DIR/copilot_usage.json" ] && copilot_mtime=$(stat -f %m "$CACHE_DIR/copilot_usage.json")
  [ -f "$CACHE_DIR/fetch_status.json" ] && status_mtime=$(stat -f %m "$CACHE_DIR/fetch_status.json")

  # Open the extension's fetch page in a hidden window
  local front_app
  front_app=$(osascript -e 'tell application "System Events" to get name of first application process whose frontmost is true' 2>/dev/null)

  osascript -e "
    tell application \"Google Chrome\"
      set w to make new window
      set bounds of w to {0, 0, 1, 1}
      set URL of active tab of w to \"chrome-extension://${EXTENSION_ID}/fetch.html?s=${services}\"
    end tell
    tell application \"${front_app}\" to activate
  " 2>/dev/null

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
        local status_ok
        status_ok=$(jq -r '.ok // empty' "$CACHE_DIR/fetch_status.json" 2>/dev/null || true)
        if [ "$status_ok" = "false" ]; then
          local status_err
          status_err=$(jq -r '
            if (.errors | type) == "object" then
              (.errors | to_entries | map("\(.key): \(.value)") | join("; "))
            else
              "unknown extension error"
            end
          ' "$CACHE_DIR/fetch_status.json" 2>/dev/null || echo "unknown extension error")
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
    local latest_ok
    latest_ok=$(jq -r '.ok // empty' "$CACHE_DIR/fetch_status.json" 2>/dev/null || true)
    if [ "$latest_ok" = "false" ]; then
      local latest_err
      latest_err=$(jq -r '
        if (.errors | type) == "object" then
          (.errors | to_entries | map("\(.key): \(.value)") | join("; "))
        else
          "unknown extension error"
        end
      ' "$CACHE_DIR/fetch_status.json" 2>/dev/null || echo "unknown extension error")
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
  local fetch_status="null"
  local host_tail="[]"

  if [ -f "$CACHE_DIR/fetch_status.json" ]; then
    fetch_status=$(cat "$CACHE_DIR/fetch_status.json" 2>/dev/null || echo "null")
  fi

  if [ -f "$host_log" ]; then
    host_tail=$(tail -n 20 "$host_log" 2>/dev/null | jq -R -s 'split("\n")[:-1]' 2>/dev/null || echo "[]")
  fi

  jq -n \
    --arg root_dir "$ROOT_DIR" \
    --arg cache_dir "$CACHE_DIR" \
    --arg extension_id "${EXTENSION_ID:-<unset>}" \
    --argjson claude_mtime "$( [ -f "$CACHE_DIR/claude_usage.json" ] && stat -f %m "$CACHE_DIR/claude_usage.json" || echo null )" \
    --argjson codex_mtime "$( [ -f "$CACHE_DIR/codex_usage.json" ] && stat -f %m "$CACHE_DIR/codex_usage.json" || echo null )" \
    --argjson copilot_mtime "$( [ -f "$CACHE_DIR/copilot_usage.json" ] && stat -f %m "$CACHE_DIR/copilot_usage.json" || echo null )" \
    --argjson status_mtime "$( [ -f "$CACHE_DIR/fetch_status.json" ] && stat -f %m "$CACHE_DIR/fetch_status.json" || echo null )" \
    --argjson fetch_status "$fetch_status" \
    --argjson host_log_tail "$host_tail" \
    '{
      timestamp: (now | todateiso8601),
      root_dir: $root_dir,
      cache_dir: $cache_dir,
      extension_id: $extension_id,
      cache_mtimes: {
        claude_usage: $claude_mtime,
        codex_usage: $codex_mtime,
        copilot_usage: $copilot_mtime,
        fetch_status: $status_mtime
      },
      fetch_status: $fetch_status,
      host_log_tail: $host_log_tail
    }' >&2
}
