#!/usr/bin/env bash
set -euo pipefail

SELF="$0"
[ -L "$SELF" ] && SELF=$(readlink -f "$SELF")
ROOT_DIR=$(cd -- "$(dirname -- "$SELF")" && pwd)
HOST_SCRIPT="$ROOT_DIR/native-host/usage_cache_host.py"
HOST_LAUNCHER="$ROOT_DIR/native-host/usage_cache_host.sh"
HOST_NAME="com.llm_usage.cache_host"
EXT_DIR="$ROOT_DIR/extension"
EXT_MANIFEST="$EXT_DIR/manifest.json"

# Chrome native messaging hosts directory (macOS)
CHROME_NMH_DIR="$HOME/Library/Application Support/Google/Chrome/NativeMessagingHosts"

derive_extension_id() {
  node -e "
    const fs = require('fs');
    const crypto = require('crypto');
    try {
      const manifest = JSON.parse(fs.readFileSync(process.argv[1], 'utf8'));
      if (!manifest.key || typeof manifest.key !== 'string') process.exit(2);
      const der = Buffer.from(manifest.key, 'base64');
      const hash = crypto.createHash('sha256').update(der).digest();
      const alphabet = 'abcdefghijklmnop';
      let id = '';
      for (let i = 0; i < 16; i++) {
        const b = hash[i];
        id += alphabet[(b >> 4) & 0x0f] + alphabet[b & 0x0f];
      }
      console.log(id);
    } catch {
      process.exit(2);
    }
  " "$EXT_MANIFEST" 2>/dev/null || true
}

DERIVED_EXT_ID="$(derive_extension_id)"

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
  if [ -n "$DERIVED_EXT_ID" ]; then
    echo "    3. Confirm extension ID is: $DERIVED_EXT_ID"
    echo ""
    EXT_ID="$DERIVED_EXT_ID"
  else
    echo "    3. Copy the extension ID shown under the extension name"
    echo ""
    read -rp "  Paste the extension ID: " EXT_ID
    if [ -z "$EXT_ID" ]; then
      echo "  No extension ID provided. Exiting."
      exit 1
    fi
  fi
fi

if ! [[ "$EXT_ID" =~ ^[a-p]{32}$ ]]; then
  echo "Invalid extension ID: $EXT_ID" >&2
  echo "Action: use the 32-character lowercase ID from chrome://extensions." >&2
  exit 1
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
  "path": "$HOST_SCRIPT",
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
