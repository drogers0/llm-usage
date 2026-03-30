#!/usr/bin/python3
"""Native messaging host that writes cached usage data from the Chrome extension."""

import json
import os
import signal
import struct
import sys
import tempfile
from datetime import datetime, timezone

ROOT = os.path.dirname(os.path.dirname(os.path.realpath(__file__)))
CACHE_DIR = os.environ.get("LLM_USAGE_CACHE_DIR", os.path.join(ROOT, ".cache"))
LOG_FILE = os.path.join(os.path.expanduser("~"), "Library", "Logs", "llm_usage_native_host.log")

# Exit cleanly if Chrome closes the native messaging pipe.
signal.signal(signal.SIGPIPE, signal.SIG_DFL)


def log(message):
    os.makedirs(os.path.dirname(LOG_FILE), exist_ok=True)
    timestamp = datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")
    with open(LOG_FILE, "a", encoding="utf-8") as f:
        f.write(f"[{timestamp}] host: {message}\n")


def read_message():
    raw_length = sys.stdin.buffer.read(4)
    if len(raw_length) < 4:
        log("read_message: no/short length prefix")
        return None
    length = struct.unpack("<I", raw_length)[0]
    data = sys.stdin.buffer.read(length)
    log(f"read_message: payload_length={length} bytes_read={len(data)}")
    return json.loads(data.decode("utf-8"))


def send_message(obj):
    encoded = json.dumps(obj).encode("utf-8")
    try:
        sys.stdout.buffer.write(struct.pack("<I", len(encoded)))
        sys.stdout.buffer.write(encoded)
        sys.stdout.buffer.flush()
        log(f"send_message: ok bytes={len(encoded)}")
    except BrokenPipeError:
        # Chrome may close the pipe immediately after receiving a response.
        log("send_message: broken pipe")
        return


def write_cache(cache_data):
    os.makedirs(CACHE_DIR, exist_ok=True)
    for name, data in cache_data.items():
        path = os.path.join(CACHE_DIR, f"{name}.json")
        fd, tmp_path = tempfile.mkstemp(dir=CACHE_DIR, suffix=".tmp")
        try:
            with os.fdopen(fd, "w") as f:
                json.dump(data, f)
            os.rename(tmp_path, path)
            log(f"write_cache: updated {name}.json")
        except Exception:
            os.unlink(tmp_path)
            log(f"write_cache: failed {name}.json")
            raise


def main():
    log("main: start")
    msg = read_message()
    if not msg:
        log("main: empty message")
        send_message({"ok": False, "error": "no message"})
        return

    cache_data = msg.get("cache", {})
    if not cache_data:
        log("main: missing cache data")
        send_message({"ok": False, "error": "no cache data"})
        return

    try:
        log(f"main: cache keys={','.join(cache_data.keys())}")
        write_cache(cache_data)
        send_message({"ok": True, "updated": list(cache_data.keys())})
    except Exception as e:
        log(f"main: exception {e}")
        try:
            send_message({"ok": False, "error": str(e)})
        except BrokenPipeError:
            return


if __name__ == "__main__":
    main()
