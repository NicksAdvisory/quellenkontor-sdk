// Lokaler Testserver: jede Anfrage bekommt die nächste Antwort aus einer Liste
import { createServer } from "node:http";

export async function testServer(antworten) {
  const anfragen = [];
  const liste = [...antworten];
  const server = createServer((req, res) => {
    anfragen.push({ url: req.url, headers: req.headers });
    const a = liste.length > 1 ? liste.shift() : liste[0];
    if (typeof a === "function") return a(req, res);
    res.writeHead(a.status ?? 200, { "content-type": a.csv ? "text/csv" : "application/json", ...(a.headers ?? {}) });
    res.end(a.csv ?? (a.body === undefined ? "" : JSON.stringify(a.body)));
  });
  await new Promise((r) => server.listen(0, "127.0.0.1", r));
  const basisUrl = `http://127.0.0.1:${server.address().port}/v1`;
  return { basisUrl, anfragen, schliessen: () => new Promise((r) => server.close(r)) };
}

/** Adresse, an der sicher niemand lauscht: Server kurz öffnen und wieder schließen */
export async function toteAdresse() {
  const s = await testServer([{ body: {} }]);
  await s.schliessen();
  return s.basisUrl;
}

export const fehler = (status, code, nachricht = code, headers) => ({ status, headers, body: { fehler: { code, nachricht } } });
