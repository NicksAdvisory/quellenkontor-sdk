"""Lokaler Testserver: jede Anfrage bekommt die nächste Antwort aus einer Liste, die letzte wiederholt sich."""
import json
import threading
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

import pytest


class _Server:
    def __init__(self, antworten):
        self.antworten = list(antworten)
        self.anfragen = []
        server = self

        class Handler(BaseHTTPRequestHandler):
            def do_GET(self):  # noqa: N802
                server.anfragen.append({"pfad": self.path, "koepfe": dict(self.headers)})
                a = server.antworten.pop(0) if len(server.antworten) > 1 else server.antworten[0]
                if callable(a):
                    return a(self)
                koerper = a.get("csv", json.dumps(a.get("body", {})) if a.get("status", 200) != 304 else "").encode("utf-8")
                self.send_response(a.get("status", 200))
                self.send_header("Content-Type", "text/csv" if "csv" in a else "application/json")
                for k, v in a.get("headers", {}).items():
                    self.send_header(k, v)
                self.send_header("Content-Length", str(len(koerper)))
                self.end_headers()
                self.wfile.write(koerper)

            def log_message(self, *args):
                pass

        self._httpd = ThreadingHTTPServer(("127.0.0.1", 0), Handler)
        self.basis_url = f"http://127.0.0.1:{self._httpd.server_address[1]}/v1"
        threading.Thread(target=self._httpd.serve_forever, daemon=True).start()

    def schliessen(self):
        self._httpd.shutdown()
        self._httpd.server_close()


@pytest.fixture
def server():
    offen = []

    def starten(*antworten):
        s = _Server(antworten)
        offen.append(s)
        return s

    yield starten
    for s in offen:
        s.schliessen()


@pytest.fixture
def tote_adresse():
    s = _Server([{"body": {}}])
    url = s.basis_url
    s.schliessen()
    return url


def fehler(status, code, nachricht=None, headers=None):
    return {"status": status, "headers": headers or {}, "body": {"fehler": {"code": code, "nachricht": nachricht or code}}}
