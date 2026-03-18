#!/usr/bin/env python3
"""Native messaging host that writes cached usage data from the Chrome extension."""

import json
import os
import struct
import sys
import tempfile

ROOT = os.path.dirname(os.path.dirname(os.path.realpath(__file__)))
CACHE_DIR = os.path.join(ROOT, ".cache")


def read_message():
    raw_length = sys.stdin.buffer.read(4)
    if len(raw_length) < 4:
        return None
    length = struct.unpack("<I", raw_length)[0]
    data = sys.stdin.buffer.read(length)
    return json.loads(data.decode("utf-8"))


def send_message(obj):
    encoded = json.dumps(obj).encode("utf-8")
    sys.stdout.buffer.write(struct.pack("<I", len(encoded)))
    sys.stdout.buffer.write(encoded)
    sys.stdout.buffer.flush()


def write_cache(cache_data):
    os.makedirs(CACHE_DIR, exist_ok=True)
    for name, data in cache_data.items():
        path = os.path.join(CACHE_DIR, f"{name}.json")
        fd, tmp_path = tempfile.mkstemp(dir=CACHE_DIR, suffix=".tmp")
        try:
            with os.fdopen(fd, "w") as f:
                json.dump(data, f)
            os.rename(tmp_path, path)
        except Exception:
            os.unlink(tmp_path)
            raise


def main():
    msg = read_message()
    if not msg:
        send_message({"ok": False, "error": "no message"})
        return

    cache_data = msg.get("cache", {})
    if not cache_data:
        send_message({"ok": False, "error": "no cache data"})
        return

    try:
        write_cache(cache_data)
        send_message({"ok": True, "updated": list(cache_data.keys())})
    except Exception as e:
        send_message({"ok": False, "error": str(e)})


if __name__ == "__main__":
    main()
