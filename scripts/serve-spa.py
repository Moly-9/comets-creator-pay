#!/usr/bin/env python3
import argparse
import os
from functools import partial
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from urllib.parse import urlsplit


class SpaRequestHandler(SimpleHTTPRequestHandler):
    def send_head(self):
        path = urlsplit(self.path).path
        requested_file = self.translate_path(path)

        if path != "/" and not os.path.exists(requested_file):
            if path.startswith("/assets/"):
                self.send_error(404, "File not found")
                return None
            self.path = "/index.html"

        return super().send_head()


def main():
    parser = argparse.ArgumentParser(description="Serve a static SPA.")
    parser.add_argument("--directory", required=True)
    parser.add_argument("--host", default="127.0.0.1")
    parser.add_argument("--port", type=int, required=True)
    args = parser.parse_args()

    directory = os.path.abspath(args.directory)
    if not os.path.isfile(os.path.join(directory, "index.html")):
        raise SystemExit(f"Missing index.html in {directory}")

    handler = partial(SpaRequestHandler, directory=directory)
    server = ThreadingHTTPServer((args.host, args.port), handler)
    print(f"Serving {directory} at http://{args.host}:{args.port}", flush=True)
    server.serve_forever()


if __name__ == "__main__":
    main()
