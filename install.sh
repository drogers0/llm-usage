#!/usr/bin/env bash
set -euo pipefail

SELF="$0"
[ -L "$SELF" ] && SELF=$(readlink -f "$SELF")
ROOT_DIR=$(cd -- "$(dirname -- "$SELF")" && pwd)
HOST_SCRIPT="$ROOT_DIR/native-host/usage_cache_host.py"
HOST_LAUNCHER="$ROOT_DIR/native-host/usage_cache_host.sh"
HOST_NAME="com.llm_usage.cache_host"
EXT_DIR="$ROOT_DIR/extension"

# Chrome native messaging hosts directory (macOS)
CHROME_NMH_DIR="$HOME/Library/Application Support/Google/Chrome/NativeMessagingHosts"

# If called with an extension ID, skip the interactive flow
if [ $# -ge 1 ]; then
  EXT_ID="$1"
else
  echo ""
  echo "  LLM Usage Check — Setup"
  echo "  ========================"
  echo ""
  echo "  The Chrome extension needs to be loaded manually."
  echo ""
  echo "  Extension directory:"
  echo "    $EXT_DIR"
  echo ""

  read -rp "  Open Chrome extensions page? [Y/n] " answer
  if [[ ! "$answer" =~ ^[Nn]$ ]]; then
    open -a "Google Chrome" "chrome://extensions" 2>/dev/null || true
  fi

  echo ""
  echo "  Steps:"
  echo "    1. Enable Developer mode (toggle in the top right)"
  echo "    2. Click 'Load unpacked' and select the path above"
  echo "    3. Copy the extension ID shown under the extension name"
  echo ""

  read -rp "  Paste the extension ID: " EXT_ID

  if [ -z "$EXT_ID" ]; then
    echo "  No extension ID provided. Exiting."
    exit 1
  fi
fi

echo ""
echo "Installing native messaging host..."

chmod +x "$HOST_SCRIPT"
chmod +x "$HOST_LAUNCHER"

mkdir -p "$CHROME_NMH_DIR"

cat > "$CHROME_NMH_DIR/$HOST_NAME.json" <<EOF
{
  "name": "$HOST_NAME",
  "description": "Writes cached usage data for llm_usage scripts",
  "path": "$HOST_LAUNCHER",
  "type": "stdio",
  "allowed_origins": [
    "chrome-extension://$EXT_ID/"
  ]
}
EOF

echo "Installed: $CHROME_NMH_DIR/$HOST_NAME.json"

# Save extension ID to .env so the bash scripts can trigger it
ENV_FILE="$ROOT_DIR/.env"
if [ -f "$ENV_FILE" ] && grep -q "^EXTENSION_ID=" "$ENV_FILE"; then
  sed -i '' "s|^EXTENSION_ID=.*|EXTENSION_ID=$EXT_ID|" "$ENV_FILE"
else
  echo "EXTENSION_ID=$EXT_ID" >> "$ENV_FILE"
fi

echo "Saved EXTENSION_ID to .env"

echo ""
echo "Done. Run 'usage-check' to test."
