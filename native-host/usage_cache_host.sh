#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR=$(cd -- "$(dirname -- "$0")" && pwd)
HOST_PY="$SCRIPT_DIR/usage_cache_host.py"
LOG_FILE="$HOME/Library/Logs/llm_usage_native_host.log"

mkdir -p "$(dirname -- "$LOG_FILE")"
printf '[%s] launching native host pid=%s\n' "$(date -u +"%Y-%m-%dT%H:%M:%SZ")" "$$" >> "$LOG_FILE"

# Use an absolute interpreter path so launch does not depend on Chrome's PATH.
exec /usr/bin/python3 "$HOST_PY" 2>> "$LOG_FILE"