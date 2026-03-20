#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR=$(cd -- "$(dirname -- "$0")" && pwd)
HOST_SCRIPT="$ROOT_DIR/native-host/usage_cache_host.py"
HOST_LAUNCHER="$ROOT_DIR/native-host/usage_cache_host.sh"
HOST_NAME="com.llm_usage.cache_host"

# Chrome native messaging hosts directory (macOS)
CHROME_NMH_DIR="$HOME/Library/Application Support/Google/Chrome/NativeMessagingHosts"

if [ $# -lt 1 ]; then
  echo "Usage: $0 <chrome-extension-id>"
  echo ""
  echo "To find your extension ID:"
  echo "  1. Open chrome://extensions"
  echo "  2. Enable Developer mode"
  echo "  3. Click 'Load unpacked' and select: $ROOT_DIR/extension"
  echo "  4. Copy the extension ID shown under the extension name"
  echo "  5. Run: $0 <that-id>"
  exit 1
fi

EXT_ID="$1"

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

# Optionally add bin/ to PATH
BIN_DIR="$ROOT_DIR/bin"
SHELL_RC=""
case "$(basename "$SHELL")" in
  zsh)  SHELL_RC="$HOME/.zshrc" ;;
  bash) SHELL_RC="$HOME/.bashrc" ;;
esac

if [ -n "$SHELL_RC" ] && ! echo "$PATH" | tr ':' '\n' | grep -qx "$BIN_DIR"; then
  echo ""
  read -rp "Add $BIN_DIR to PATH in $(basename "$SHELL_RC")? [y/N] " answer
  if [[ "$answer" =~ ^[Yy]$ ]]; then
    echo "export PATH=\"$BIN_DIR:\$PATH\"" >> "$SHELL_RC"
    echo "Added to $SHELL_RC — restart your shell or run: source $SHELL_RC"
  fi
fi

echo ""
echo "Done. Run 'usage-check' to test."
