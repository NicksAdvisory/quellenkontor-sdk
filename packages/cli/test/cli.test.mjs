import { test } from "node:test";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { createServer } from "node:http";
import { mkdtemp, stat, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { tabelle, csvText } from "../dist/ausgabe.js";

const QK = fileURLToPath(new URL("../dist/index.js", import.meta.url));

/** Lokaler Testserver: jede Anfrage bekommt die nächste Antwort, die letzte wiederholt sich */
async function server(antworten) {
  const anfragen = [];
  const liste = [...antworten];
  const s = createServer((req, res) => {
    anfragen.push({ url: req.url, headers: req.headers });
    const a = liste.length > 1 ? liste.shift() : liste[0];
    res.writeHead(a.status ?? 200, { "content-type": a.csv ? "text/csv" : "application/json", ...(a.headers ?? {}) });
    res.end(a.csv ?? JSON.stringify(a.body ?? {}));
  });
  await new Promise((r) => s.listen(0, "127.0.0.1", r));
  return { url: `http://127.0.0.1:${s.address().port}/v1`, anfragen, zu: () => new Promise((r) => s.close(r)) };
}

async function qk(args, { basis, stdin, env = {} } = {}) {
  const konfig = await mkdtemp(join(tmpdir(), "qk-test-"));
  const umgebung = { ...process.env, QK_CONFIG_DIR: konfig, QK_KEIN_UPDATE_HINWEIS: "1", QK_BASIS_URL: basis ?? "http://127.0.0.1:9/v1", ...env };
  delete umgebung.QK_KEY;
  if (env.QK_KEY) umgebung.QK_KEY = env.QK_KEY;
  return new Promise((ok) => {
    const p = spawn(process.execPath, [QK, ...args], { env: umgebung });
    let out = "", err = "";
    p.stdout.on("data", (d) => (out += d));
    p.stderr.on("data", (d) => (err += d));
    p.stdin.end(stdin ?? "");
    p.on("close", (code) => ok({ code, out, err, konfig }));
  });
}

const fehler = (status, code, nachricht = code) => ({ status, body: { fehler: { code, nachricht } } });

test("-h, --help, -V, --version", async () => {
  for (const a of ["-h", "--help", "hilfe"]) {
    const r = await qk([a]);
    assert.equal(r.code, 0);
    assert.match(r.out, /Exit-Codes/);
    assert.match(r.out, /QK_BASIS_URL/);
    assert.match(r.out, /--trennzeichen/);
  }
  for (const a of ["-V", "--version"]) {
    const r = await qk([a]);
    assert.equal(r.code, 0);
    assert.match(r.out.trim(), /^\d+\.\d+\.\d+$/);
  }
  const v = await qk(["version", "--json"]);
  const info = JSON.parse(v.out);
  assert.ok(info.cli && info.sdk && info.offline_datenstand);
});

test("Aufruffehler: Exit 2, als JSON bei --json", async () => {
  assert.equal((await qk(["gibtsnicht"])).code, 2);
  const doppelt = await qk(["feiertage", "--land", "HE", "--land", "BY"]);
  assert.equal(doppelt.code, 2);
  assert.match(doppelt.err, /mehrfach/);
  const unbekannt = await qk(["mindestlohn", "--foo", "1", "--json"]);
  assert.equal(unbekannt.code, 2);
  assert.equal(JSON.parse(unbekannt.err).fehler.code, "aufruf");
  assert.equal((await qk(["mindestlohn", "--datum"])).code, 2);
  assert.equal((await qk(["mindestlohn", "--format", "xml"])).code, 2);
});

test("Sandbox-Datensatz ohne Schlüssel: Anfrage ohne Authorization, Exit 0", async () => {
  const s = await server([{ body: { datensatz: "mindestlohn", mindestlohn_brutto_stunde: 13.9 } }]);
  try {
    const r = await qk(["mindestlohn", "--json"], { basis: s.url });
    assert.equal(r.code, 0);
    assert.equal(JSON.parse(r.out).mindestlohn_brutto_stunde, 13.9);
    assert.equal(s.anfragen[0].headers.authorization, undefined);
  } finally { await s.zu(); }
});

test("401: Exit 3 mit Hinweis auf qk login", async () => {
  const s = await server([fehler(401, "schluessel_fehlt", "Kein API-Schlüssel.")]);
  try {
    const r = await qk(["pausen", "--arbeitszeit-stunden", "7"], { basis: s.url });
    assert.equal(r.code, 3);
    assert.match(r.err, /qk login/);
  } finally { await s.zu(); }
});

test("429 Kontingent: Exit 4", async () => {
  const s = await server([fehler(429, "kontingent_erreicht")]);
  try {
    assert.equal((await qk(["mindestlohn"], { basis: s.url })).code, 4);
  } finally { await s.zu(); }
});

test("503 bei einem Rechner: Exit 5", async () => {
  const s = await server([fehler(503, "wartung")]);
  try {
    const r = await qk(["pausen", "--arbeitszeit-stunden", "7", "--json"], { basis: s.url, env: { QK_KEY: "qk_live_x" } });
    assert.equal(r.code, 5);
    assert.equal(JSON.parse(r.err).fehler.status, 503);
  } finally { await s.zu(); }
});

test("Ohne Verbindung: Offline-Stand mit Warnung, --no-offline gibt Exit 5", async () => {
  const r = await qk(["mindestlohn", "--datum", "2025-06-01", "--json"]);
  assert.equal(r.code, 0);
  assert.equal(JSON.parse(r.out).mindestlohn_brutto_stunde, 12.82);
  assert.match(r.err, /Offline-Stand/);
  assert.match(r.err, /QK_BASIS_URL/);
  assert.equal((await qk(["mindestlohn", "--no-offline"])).code, 5);
});

test("Ohne Verbindung: CSV aus dem Offline-Stand", async () => {
  const r = await qk(["mindestlohn", "verlauf", "--von", "2026-01-01", "--format", "csv"]);
  assert.equal(r.code, 0);
  const zeilen = r.out.trim().split("\r\n");
  assert.equal(zeilen[0], "gueltig_ab,mindestlohn_brutto_stunde,minijob_grenze_monat,stufenart,rechtsgrundlage,quelle_url");
  assert.ok(zeilen.length >= 3);
});

test("Offline: Mindestausbildungsvergütung nach Ausbildungsbeginn", async () => {
  const r = await qk(["mindestausbildungsverguetung", "--beginn", "2023-08-01", "--ausbildungsjahr", "2", "--json"]);
  assert.equal(r.code, 0);
  assert.equal(JSON.parse(r.out).mindestverguetung_monat, 731.6);
});

test("Ja/Nein-Parameter ohne Wert und negative Zahlen", async () => {
  const s = await server([{ body: {} }]);
  try {
    await qk(["kuendigungsfrist", "--eintritt", "2026-01-01", "--zugang", "2026-03-01", "--probezeit"], { basis: s.url });
    assert.match(s.anfragen[0].url, /probezeit=true/);
    await qk(["dienstwagen", "--listenpreis", "40000", "--zuzahlung-monat", "-50"], { basis: s.url });
    assert.match(s.anfragen[1].url, /zuzahlung_monat=-50/);
    await qk(["mindestlohn", "--param", "neu_param=1"], { basis: s.url });
    assert.match(s.anfragen[2].url, /neu_param=1/);
  } finally { await s.zu(); }
});

test("qk <datensatz> --help zeigt die Parameter aus dem Katalog", async () => {
  const s = await server([{ body: { datensaetze: [{ id: "mindestlohn", name: "Mindestlohn", beschreibung: "Stundenlohn", verlauf: "/v1/hr/mindestlohn/verlauf", csv: false, seite: "https://quellenkontor.dev/datensaetze/mindestlohn", parameter: [{ name: "datum", typ: "datum", pflicht: false, beschreibung: "Stichtag", werte: null, beispiel: "2027-01-15", standard: null }] }] } }]);
  try {
    const r = await qk(["mindestlohn", "--help"], { basis: s.url });
    assert.equal(r.code, 0);
    assert.match(r.out, /--datum/);
    assert.match(r.out, /Stichtag/);
  } finally { await s.zu(); }
});

test("datensaetze und status als CSV", async () => {
  const s = await server([{ body: { stand: "2026-09-25", letzte_aenderung_id: 1, datensaetze: [{ id: "mindestlohn", zuletzt_geprueft: "2026-09-23", gesichert_bis: null, erwartet: null, letzte_aenderung_id: 1 }] } }]);
  try {
    const r = await qk(["status", "--format", "csv"], { basis: s.url });
    assert.equal(r.code, 0);
    assert.match(r.out, /^id,zuletzt_geprueft/);
  } finally { await s.zu(); }
});

test("batch: eine Abfrage je Zeile, JSON-Zeilen, Exit-Code des ersten Fehlers", async () => {
  const s = await server([{ body: { ok: 1 } }, fehler(401, "schluessel_fehlt")]);
  try {
    const r = await qk(["batch"], { basis: s.url, stdin: "mindestlohn --datum 2025-01-01\n# Kommentar\n\npausen --arbeitszeit-stunden 7\n" });
    const zeilen = r.out.trim().split("\n").map((z) => JSON.parse(z));
    assert.equal(zeilen.length, 2);
    assert.deepEqual(zeilen[0].antwort, { ok: 1 });
    assert.equal(zeilen[1].fehler.code, "schluessel_fehlt");
    assert.equal(r.code, 3);
  } finally { await s.zu(); }
});

test("login --key-stdin: Datei 600, Ordner 700; logout prüft", async () => {
  const r = await qk(["login", "--key-stdin"], { stdin: "qk_live_abc\n" });
  assert.equal(r.code, 0);
  const datei = join(r.konfig, "config.json");
  assert.equal(JSON.parse(await readFile(datei, "utf8")).key, "qk_live_abc");
  if (process.platform !== "win32") {
    assert.equal((await stat(datei)).mode & 0o777, 0o600);
    assert.equal((await stat(r.konfig)).mode & 0o777, 0o700);
  }
  assert.equal((await qk(["login", "--key-stdin"], { stdin: "falsch" })).code, 2);
  const l = await qk(["logout"]);
  assert.equal(l.code, 0);
  assert.match(l.err, /kein Schlüssel gespeichert/);
});

test("completion für bash, zsh und fish", async () => {
  for (const sh of ["bash", "zsh", "fish"]) {
    const r = await qk(["completion", sh]);
    assert.equal(r.code, 0);
    assert.match(r.out, /mindestlohn/);
  }
  assert.equal((await qk(["completion", "powershell"])).code, 2);
});

test("Tabelle: ohne Terminal ungekürzt, im Terminal mit …, leere Antwort ohne -Infinity", () => {
  const lang = "x".repeat(80);
  const o = { verlauf: [{ a: lang }] };
  assert.ok(tabelle(o, false).includes(lang));
  assert.ok(tabelle(o, true).includes("…"));
  assert.equal(tabelle({}), "");
  assert.ok(!tabelle({ verlauf: [] }).includes("Infinity"));
});

test("CSV wie die API: Semikolon mit Dezimalkomma", () => {
  assert.equal(csvText([{ a: 1.5, b: "x;y" }], ";"), 'a;b\r\n1,5;"x;y"\r\n');
});
