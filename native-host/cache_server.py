#!/usr/bin/env python3
"""One-shot HTTP server that accepts usage data from the Chrome extension."""

import json
import os
import sys
import tempfile
from http.server import HTTPServer, BaseHTTPRequestHandler

ROOT = os.path.dirname(os.path.dirname(os.path.realpath(__file__)))
CACHE_DIR = os.path.join(ROOT, ".cache")


class Handler(BaseHTTPRequestHandler):
    def do_POST(self):
        length = int(self.headers.get("Content-Length", 0))
        body = json.loads(self.rfile.read(length)) if length else {}
        cache_data = body.get("cache", {})
        if not cache_data:
            self._respond(400, {"ok": False, "error": "no cache data"})
            return
        os.makedirs(CACHE_DIR, exist_ok=True)
        for name, data in cache_data.items():
            path = os.path.join(CACHE_DIR, f"{name}.json")
            fd, tmp = tempfile.mkstemp(dir=CACHE_DIR, suffix=".tmp")
            try:
                with os.fdopen(fd, "w") as f:
                    json.dump(data, f)
                os.rename(tmp, path)
            except Exception:
                os.unlink(tmp)
                raise
        self._respond(200, {"ok": True, "updated": list(cache_data.keys())})

    def do_OPTIONS(self):
        self.send_response(204)
        self._cors_headers()
        self.end_headers()

    def _cors_headers(self):
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Access-Control-Allow-Methods", "POST, OPTIONS")
        self.send_header("Access-Control-Allow-Headers", "Content-Type")

    def _respond(self, code, obj):
        self.send_response(code)
        self._cors_headers()
        self.send_header("Content-Type", "application/json")
        self.end_headers()
        self.wfile.write(json.dumps(obj).encode())

    def log_message(self, *args):
        pass  # silence logs


def main():
    server = HTTPServer(("127.0.0.1", 0), Handler)
    port = server.server_address[1]
    # Print port so the bash script can read it
    print(port, flush=True)
    # Handle requests until the bash script kills us
    server.serve_forever()


if __name__ == "__main__":
    main()
